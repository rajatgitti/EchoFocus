"""EchoFocus Inference & Research Server.
Built on the VANTA target speaker extraction foundation (Komalpreet Kaur).

Endpoints:
    GET  /health                         - Model health & status
    POST /extract?include_residue=true   - Run VANTA extraction + Multilingual Whisper ASR
    POST /transcribe                     - Re-transcribe with specific language (Auto, Hindi, English, Urdu)
    GET  /library                        - List persistent session history
    GET  /library/<id>/audio/<track>     - Serve saved audio (extracted, residue, mixture, reference)
    DELETE /library/<id>                 - Remove a session record

Usage:
    python server.py [--port 8000] [--host 0.0.0.0]
"""

from __future__ import annotations

import argparse
import base64
import gc
import io
import json
import os
import sqlite3
import sys
import tempfile
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
from flask import Flask, jsonify, request, send_file, Response

from vanta.config import CHECKPOINTS_DIR, SAMPLE_RATE
from vanta.inference import VantaInference

# On CPU containers (e.g. Render 512MB RAM), restrict thread counts to prevent memory bloat
if not torch.cuda.is_available():
    torch.set_num_threads(1)

# Configuration
PORT = int(os.environ.get("PORT", "8000"))
BACKEND = os.environ.get("ECHOFOCUS_BACKEND", "trained").lower()
CHECKPOINT_PATH = Path(os.environ.get("ECHOFOCUS_CHECKPOINT", str(CHECKPOINTS_DIR / "fully_ours" / "best.pt")))
SPK_ENCODER = str(CHECKPOINTS_DIR / "spk_encoder" / "best.pt")
REPEATS = int(os.environ.get("ECHOFOCUS_REPEATS", "3"))
MAX_UPLOAD_BYTES = int(os.environ.get("ECHOFOCUS_MAX_UPLOAD_BYTES", 25 * 1024 * 1024))  # 25 MB

DB_PATH = Path("echofocus.db")
STORAGE_DIR = Path("library_storage")
STORAGE_DIR.mkdir(parents=True, exist_ok=True)

app = Flask("EchoFocus")

# Global locks and models
_inference: VantaInference | None = None
_whisper_model = None
_model_lock = threading.Lock()
_init_error: str | None = None


def init_db() -> None:
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                timestamp TEXT,
                mixture_filename TEXT,
                reference_filename TEXT,
                input_seconds REAL,
                output_seconds REAL,
                status TEXT,
                transcript TEXT,
                confidence REAL,
                words_json TEXT,
                mixture_path TEXT,
                reference_path TEXT,
                extracted_path TEXT,
                residue_path TEXT,
                detected_language TEXT
            )
            """
        )
        conn.commit()


def trim_memory() -> None:
    """Force release unused memory back to the OS (crucial for Linux containers)."""
    gc.collect()
    try:
        import ctypes
        ctypes.CDLL("libc.so.6").malloc_trim(0)
    except Exception:
        pass


def load_models() -> None:
    global _inference, _init_error
    print("[EchoFocus] Loading VANTA target speaker extraction model...")
    try:
        if not CHECKPOINT_PATH.exists() or not Path(SPK_ENCODER).exists():
            print(f"[EchoFocus] Checkpoints missing: {CHECKPOINT_PATH} / {SPK_ENCODER}")
            _init_error = "Checkpoints missing. Run scripts/download_weights.py"
            return

        device = "cuda" if torch.cuda.is_available() else "cpu"
        _inference = VantaInference(
            CHECKPOINT_PATH,
            repeats=REPEATS,
            device=device,
            speaker_encoder_ckpt=SPK_ENCODER,
        )
        trim_memory()
        print(f"[EchoFocus] VANTA model loaded successfully on device: {_inference.device}")
    except Exception as e:
        _init_error = f"Extraction model error: {type(e).__name__}: {e}"
        print(f"[EchoFocus] Failed to load VANTA model: {_init_error}")


def run_whisper_asr(audio_path: str | Path, language: str | None = None) -> dict:
    """Run Whisper Multilingual ASR with memory-efficient transient lifecycle."""
    lang_arg = language if language in ("hi", "en", "ur") else None
    use_fp16 = torch.cuda.is_available()

    model = None
    try:
        import whisper
        device = "cuda" if use_fp16 else "cpu"
        model = whisper.load_model("tiny", device=device)

        with _model_lock:
            with torch.inference_mode():
                # Avoid word_timestamps=True on CPU to eliminate heavy DTW cross-attention memory allocations
                asr_result = model.transcribe(
                    str(audio_path),
                    language=lang_arg,
                    word_timestamps=use_fp16,
                    task="transcribe",
                    fp16=use_fp16,
                    temperature=0.0,
                )

        transcript_text = asr_result.get("text", "").strip()
        detected_lang = asr_result.get("language", lang_arg or "en")

        probs = []
        words_data = []
        for seg in asr_result.get("segments", []):
            seg_words = seg.get("words", [])
            seg_prob = float(np.exp(seg.get("avg_logprob", -0.3)))
            seg_prob = max(0.0, min(1.0, seg_prob))

            if seg_words:
                for w in seg_words:
                    p = float(w.get("probability", seg_prob))
                    probs.append(p)
                    words_data.append({
                        "word": w.get("word", ""),
                        "start": round(float(w.get("start", 0.0)), 2),
                        "end": round(float(w.get("end", 0.0)), 2),
                        "probability": round(p, 3),
                    })
            else:
                # Interpolate word timings from segment when word_timestamps is disabled for CPU efficiency
                text_words = seg.get("text", "").strip().split()
                if text_words:
                    start_t = float(seg.get("start", 0.0))
                    end_t = float(seg.get("end", start_t + 1.0))
                    dur = max(0.1, end_t - start_t)
                    w_dur = dur / len(text_words)
                    for i, tw in enumerate(text_words):
                        probs.append(seg_prob)
                        words_data.append({
                            "word": " " + tw if i > 0 else tw,
                            "start": round(start_t + i * w_dur, 2),
                            "end": round(start_t + (i + 1) * w_dur, 2),
                            "probability": round(seg_prob, 3),
                        })

        mean_confidence = float(np.mean(probs)) if probs else (0.85 if transcript_text else 0.0)

        return {
            "transcript": transcript_text,
            "confidence": round(mean_confidence, 3),
            "detected_language": detected_lang,
            "words": words_data,
            "language": lang_arg or "auto",
        }
    except Exception as e:
        print(f"[EchoFocus] Whisper transcription error: {e}")
        return {
            "transcript": f"[Transcription error: {e}]",
            "confidence": 0.0,
            "detected_language": lang_arg or "unknown",
            "words": [],
            "error": str(e),
        }
    finally:
        # Crucial for low-memory CPU containers (Render 512MB RAM):
        # Explicitly unload Whisper after execution so container drops back to baseline ~250MB
        if model is not None and not torch.cuda.is_available():
            del model
        trim_memory()


# CORS handler
@app.after_request
def after_request(response: Response) -> Response:
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, DELETE, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With"
    response.headers["Access-Control-Expose-Headers"] = "X-Sample-Rate, X-Output-Seconds, X-Truncated, Content-Disposition"
    return response


@app.route("/health", methods=["GET"])
def health():
    ok = _inference is not None
    info = {
        "status": "ok" if ok else "model_not_loaded",
        "app": "EchoFocus",
        "tagline": "Focus on the Voice That Matters.",
        "backend": BACKEND,
        "device": str(_inference.device) if _inference else None,
        "checkpoint": str(CHECKPOINT_PATH),
        "speaker_encoder": str(SPK_ENCODER),
        "whisper_asr": "transient_on_demand",
        "version": "v1.3-transient-asr",
        "error": _init_error,
    }
    return jsonify(info), 200 if ok else 503


@app.route("/extract", methods=["POST", "OPTIONS"])
def extract_audio():
    if request.method == "OPTIONS":
        return "", 200

    if _inference is None:
        return jsonify({"detail": "Model not loaded. Please verify checkpoints."}), 503

    if "mixture" not in request.files or "enrollment" not in request.files:
        return jsonify({"detail": "Both mixture and enrollment audio files are required."}), 400

    mix_file = request.files["mixture"]
    enr_file = request.files["enrollment"]

    mix_name = mix_file.filename or "mixture.wav"
    enr_name = enr_file.filename or "reference.wav"

    mix_bytes = mix_file.read()
    enr_bytes = enr_file.read()

    if len(mix_bytes) > MAX_UPLOAD_BYTES or len(enr_bytes) > MAX_UPLOAD_BYTES:
        return jsonify({"detail": f"File too large (max {MAX_UPLOAD_BYTES // (1024*1024)} MB)"}), 413

    if not mix_bytes or not enr_bytes:
        return jsonify({"detail": "Received empty audio file."}), 400

    include_residue = request.args.get("include_residue", "false").lower() in ("true", "1", "yes")
    requested_lang = request.args.get("language") or request.form.get("language") or "auto"

    session_id = str(uuid.uuid4())[:12]
    session_dir = STORAGE_DIR / session_id
    session_dir.mkdir(parents=True, exist_ok=True)

    try:
        with _model_lock:
            with torch.inference_mode():
                extracted_bytes, residue_bytes, meta = _inference.extract(mix_bytes, enr_bytes)
        trim_memory()
    except Exception as e:
        print(f"[EchoFocus] Extraction failed: {type(e).__name__}: {e}")
        trim_memory()
        return jsonify({
            "detail": "Could not process audio. Ensure files are valid WAV, MP3, M4A, or FLAC recordings."
        }), 400

    # Save audio files to persistent storage
    mix_path = session_dir / "mixture.wav"
    ref_path = session_dir / "reference.wav"
    ext_path = session_dir / "extracted.wav"
    res_path = session_dir / "residue.wav"

    mix_path.write_bytes(mix_bytes)
    ref_path.write_bytes(enr_bytes)
    ext_path.write_bytes(extracted_bytes)
    res_path.write_bytes(residue_bytes)

    # Run Multilingual Whisper ASR on extracted target voice
    asr_res = {
        "transcript": "",
        "confidence": 0.0,
        "detected_language": "en",
        "words": [],
    }
    try:
        asr_res = run_whisper_asr(ext_path, language=requested_lang)
        trim_memory()
    except Exception as e:
        print(f"[EchoFocus] ASR execution warning: {e}")
        trim_memory()

    # Save to SQLite database
    iso_time = datetime.now(timezone.utc).isoformat()
    try:
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute(
                """
                INSERT INTO sessions (
                    id, timestamp, mixture_filename, reference_filename,
                    input_seconds, output_seconds, status, transcript,
                    confidence, words_json, mixture_path, reference_path,
                    extracted_path, residue_path, detected_language
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    session_id,
                    iso_time,
                    mix_name,
                    enr_name,
                    meta.get("input_seconds", 0.0),
                    meta.get("output_seconds", 0.0),
                    "completed",
                    asr_res.get("transcript", ""),
                    asr_res.get("confidence", 0.0),
                    json.dumps(asr_res.get("words", [])),
                    str(mix_path),
                    str(ref_path),
                    str(ext_path),
                    str(res_path),
                    asr_res.get("detected_language", "en"),
                ),
            )
            conn.commit()
    except Exception as e:
        print(f"[EchoFocus] DB save warning: {e}")

    # If residue not requested, return raw WAV
    if not include_residue:
        resp = Response(extracted_bytes, mimetype="audio/wav")
        resp.headers["Content-Disposition"] = 'attachment; filename="echofocus_extracted.wav"'
        resp.headers["X-Sample-Rate"] = str(meta["sample_rate"])
        resp.headers["X-Output-Seconds"] = f"{meta['output_seconds']:.3f}"
        resp.headers["X-Truncated"] = "1" if meta["truncated"] else "0"
        return resp

    # Return full JSON payload
    return jsonify({
        "extracted_wav_b64": base64.b64encode(extracted_bytes).decode("ascii"),
        "residue_wav_b64": base64.b64encode(residue_bytes).decode("ascii"),
        "transcript": asr_res.get("transcript", ""),
        "confidence": asr_res.get("confidence", 0.0),
        "detected_language": asr_res.get("detected_language", "en"),
        "words": asr_res.get("words", []),
        "session_id": session_id,
        "created_at": iso_time,
        **meta,
    })


@app.route("/transcribe", methods=["POST", "OPTIONS"])
def retranscribe_audio():
    """Re-transcribe extracted speech with a specific language (Auto, Hindi, English, Urdu)."""
    if request.method == "OPTIONS":
        return "", 200

    session_id = request.form.get("session_id") or request.args.get("session_id")
    language = request.form.get("language") or request.args.get("language") or "auto"

    ext_path = None
    tmp_path = None

    if session_id:
        candidate = STORAGE_DIR / session_id / "extracted.wav"
        if candidate.exists():
            ext_path = candidate

    if ext_path is None and "audio" in request.files:
        audio_file = request.files["audio"]
        fd, tmp_file = tempfile.mkstemp(suffix=".wav")
        os.close(fd)
        audio_file.save(tmp_file)
        ext_path = Path(tmp_file)
        tmp_path = ext_path

    if ext_path is None:
        return jsonify({"detail": "Valid session_id or audio file required"}), 400

    try:
        asr_res = run_whisper_asr(ext_path, language=language)

        if session_id:
            try:
                with sqlite3.connect(DB_PATH) as conn:
                    conn.execute(
                        """
                        UPDATE sessions 
                        SET transcript = ?, confidence = ?, words_json = ?, detected_language = ?
                        WHERE id = ?
                        """,
                        (
                            asr_res["transcript"],
                            asr_res["confidence"],
                            json.dumps(asr_res["words"]),
                            asr_res["detected_language"],
                            session_id,
                        ),
                    )
                    conn.commit()
            except Exception as e:
                print(f"[EchoFocus] DB update warning: {e}")

        return jsonify({
            "status": "ok",
            "session_id": session_id,
            **asr_res,
        })
    finally:
        if tmp_path and tmp_path.exists():
            tmp_path.unlink(missing_ok=True)


@app.route("/library", methods=["GET"])
def get_library():
    try:
        with sqlite3.connect(DB_PATH) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                """
                SELECT id, timestamp, mixture_filename, reference_filename,
                       input_seconds, output_seconds, status, transcript, confidence
                FROM sessions
                ORDER BY timestamp DESC
                LIMIT 50
                """
            ).fetchall()
            return jsonify([dict(r) for r in rows])
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/library/<session_id>/audio/<track>", methods=["GET"])
def get_session_audio(session_id: str, track: str):
    if track not in ("extracted", "residue", "mixture", "reference"):
        return jsonify({"detail": "Invalid track"}), 400

    target = STORAGE_DIR / session_id / f"{track}.wav"
    if not target.exists():
        return jsonify({"detail": "Audio track not found"}), 404

    return send_file(target, mimetype="audio/wav")


@app.route("/library/<session_id>", methods=["DELETE"])
def delete_session(session_id: str):
    try:
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
            conn.commit()
        session_dir = STORAGE_DIR / session_id
        if session_dir.exists():
            import shutil
            shutil.rmtree(session_dir, ignore_errors=True)
        return jsonify({"status": "deleted", "id": session_id})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


def main():
    p = argparse.ArgumentParser(description="EchoFocus Inference Server")
    p.add_argument("--port", type=int, default=PORT, help="Port to listen on")
    p.add_argument("--host", type=str, default="0.0.0.0", help="Host interface")
    args = p.parse_args()

    init_db()
    load_models()

    print(f"\n==================================================")
    print(f" EchoFocus Server running at http://{args.host}:{args.port}")
    print(f" Built on VANTA extraction foundation")
    print(f" Tagline: Focus on the Voice That Matters.")
    print(f"==================================================\n")
    app.run(host=args.host, port=args.port, debug=False, threaded=True)


if __name__ == "__main__":
    main()
