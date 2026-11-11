#!/usr/bin/env bash
# EchoFocus — one-command launcher for the full platform.
#
#   bash run.sh            # set up anything missing, then start backend + frontend
#   bash run.sh --setup    # set up only, don't start
#
# Works on Linux, macOS and Windows (Git Bash). On first run it:
#   1. creates .venv and installs PyTorch (CUDA build if an NVIDIA GPU is found)
#   2. installs requirements.txt
#   3. downloads the trained checkpoints (~110 MB)
#   4. runs `npm install` in web/
# Later runs skip whatever is already done. Ctrl+C stops both servers.
#
# Env overrides: BACKEND_PORT (8000), FRONTEND_PORT (3000), PYTHON (interpreter
# used to create the venv), TORCH_INDEX (pip index URL for torch).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
SETUP_ONLY=0
[[ "${1:-}" == "--setup" ]] && SETUP_ONLY=1

log()  { printf '\033[1;34m[echofocus]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[echofocus]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[echofocus]\033[0m %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- platform
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) IS_WINDOWS=1 ;;
  *) IS_WINDOWS=0 ;;
esac

if [[ $IS_WINDOWS == 1 ]]; then
  VENV_PY="$ROOT/.venv/Scripts/python.exe"
  # winget installs Node here but already-open shells may not have it on PATH
  [[ -d "/c/Program Files/nodejs" ]] && export PATH="/c/Program Files/nodejs:$PATH"
else
  VENV_PY="$ROOT/.venv/bin/python"
fi

# ---------------------------------------------------------------- python
pick_python() {
  if [[ -n "${PYTHON:-}" ]]; then echo "$PYTHON"; return; fi
  # torch / whisper / speechbrain wheels lag new Python releases; prefer 3.11–3.13
  if command -v py >/dev/null 2>&1; then
    for v in 3.13 3.12 3.11; do
      if py -"$v" -c "" >/dev/null 2>&1; then echo "py -$v"; return; fi
    done
  fi
  for c in python3.13 python3.12 python3.11 python3 python; do
    if command -v "$c" >/dev/null 2>&1; then echo "$c"; return; fi
  done
  die "Python 3.11–3.13 not found. Install it, or set PYTHON=/path/to/python."
}

if [[ ! -x "$VENV_PY" ]]; then
  PY_CMD="$(pick_python)"
  log "Creating virtualenv with: $PY_CMD"
  $PY_CMD -m venv .venv
  "$VENV_PY" -m pip install --quiet --upgrade pip
fi

if ! "$VENV_PY" -c "import torch" >/dev/null 2>&1; then
  if [[ -n "${TORCH_INDEX:-}" ]]; then
    idx="$TORCH_INDEX"
  elif command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi >/dev/null 2>&1; then
    idx="https://download.pytorch.org/whl/cu126"
  else
    idx="https://download.pytorch.org/whl/cpu"
  fi
  log "Installing PyTorch from $idx (large download, one time)..."
  "$VENV_PY" -m pip install torch torchaudio --index-url "$idx"
fi

# Re-install requirements only when requirements.txt changes.
REQ_STAMP="$ROOT/.venv/.requirements.sha"
req_hash="$("$VENV_PY" -c "import hashlib;print(hashlib.sha256(open('requirements.txt','rb').read()).hexdigest())")"
if [[ ! -f "$REQ_STAMP" || "$(cat "$REQ_STAMP")" != "$req_hash" ]]; then
  log "Installing Python requirements..."
  "$VENV_PY" -m pip install -r requirements.txt
  echo "$req_hash" > "$REQ_STAMP"
fi

# ---------------------------------------------------------------- ffmpeg
# Whisper shells out to a binary literally named `ffmpeg`. If none is on PATH,
# expose the one bundled with imageio-ffmpeg under that name.
if ! command -v ffmpeg >/dev/null 2>&1; then
  FF_DIR="$ROOT/.venv/ffmpeg-bin"
  FF_NAME="ffmpeg"; [[ $IS_WINDOWS == 1 ]] && FF_NAME="ffmpeg.exe"
  if [[ ! -x "$FF_DIR/$FF_NAME" ]]; then
    ff_src="$("$VENV_PY" -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())" | tr -d '\r')"
    [[ -n "$ff_src" ]] || die "No ffmpeg found. Install ffmpeg and re-run."
    mkdir -p "$FF_DIR"
    cp "$ff_src" "$FF_DIR/$FF_NAME"
    chmod +x "$FF_DIR/$FF_NAME"
    log "Using bundled ffmpeg for Whisper ($FF_DIR)"
  fi
  export PATH="$FF_DIR:$PATH"
fi

# ---------------------------------------------------------------- weights
if [[ ! -f checkpoints/fully_ours/best.pt || ! -f checkpoints/spk_encoder/best.pt ]]; then
  log "Downloading trained checkpoints..."
  "$VENV_PY" scripts/download_weights.py
fi

# ---------------------------------------------------------------- frontend
command -v node >/dev/null 2>&1 || die "Node.js not found. Install Node 20+ (https://nodejs.org)."
if [[ ! -d web/node_modules ]]; then
  log "Installing frontend dependencies..."
  (cd web && npm install --no-fund --no-audit)
fi

if [[ $SETUP_ONLY == 1 ]]; then
  log "Setup complete. Run 'bash run.sh' to start."
  exit 0
fi

# ---------------------------------------------------------------- launch
port_busy() {
  "$VENV_PY" -c "import socket,sys;s=socket.socket();sys.exit(0 if s.connect_ex(('127.0.0.1',$1))==0 else 1)"
}
port_busy "$BACKEND_PORT"  && die "Port $BACKEND_PORT is already in use (set BACKEND_PORT=...)."
port_busy "$FRONTEND_PORT" && die "Port $FRONTEND_PORT is already in use (set FRONTEND_PORT=...)."

PIDS=()
cleanup() {
  trap - INT TERM EXIT
  log "Shutting down..."
  for pid in "${PIDS[@]:-}"; do
    [[ -z "$pid" ]] && continue
    if [[ $IS_WINDOWS == 1 ]]; then
      # kill the whole tree (npm -> node -> next) on Windows
      taskkill //F //T //PID "$(cat /proc/$pid/winpid 2>/dev/null || echo $pid)" >/dev/null 2>&1 || kill "$pid" 2>/dev/null || true
    else
      pkill -P "$pid" 2>/dev/null || true
      kill "$pid" 2>/dev/null || true
    fi
  done
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

export PYTHONUNBUFFERED=1
# Output goes through process substitution (not a pipe) so that $! is the
# server's own PID, not the log-prefixing sed's — otherwise cleanup kills sed
# and leaves the servers running.
log "Starting backend on http://127.0.0.1:$BACKEND_PORT ..."
"$VENV_PY" server.py --host 127.0.0.1 --port "$BACKEND_PORT" > >(sed -u 's/^/[backend]  /') 2>&1 &
PIDS+=($!)

log "Starting frontend on http://localhost:$FRONTEND_PORT ..."
cd web
NEXT_PUBLIC_ECHOFOCUS_API="http://127.0.0.1:$BACKEND_PORT" npx next dev -p "$FRONTEND_PORT" > >(sed -u 's/^/[frontend] /') 2>&1 &
PIDS+=($!)
cd "$ROOT"

# Wait for the model to load (first start can take a minute).
for _ in $(seq 1 180); do
  if "$VENV_PY" -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:$BACKEND_PORT/health',timeout=2)" >/dev/null 2>&1; then
    log "Backend healthy."
    break
  fi
  sleep 1
done

log "EchoFocus is running → http://localhost:$FRONTEND_PORT   (Ctrl+C to stop)"
wait -n 2>/dev/null || wait
