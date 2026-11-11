"""Output post-processing for the extracted voice.

Applied after the model and the least-squares alignment in `vanta.inference`,
in this order:

suppress_residual_noise
    A gentle residue-guided Wiener gain. The model's own residue (mixture minus
    voice) is a per-frequency estimate of what *isn't* the target; bins where it
    dominates the voice are turned down by at most a few dB. This removes the
    hiss-like leftover inside and between words. Tuned on held-out mixtures:
    stronger settings raise PESQ further but start to cost SI-SDR.

suppress_pauses
    A downward expander. The separator leaves a low residual floor (leaked
    noise / interference) where the target is silent — measured at ~30 dB below
    the speech, which is audible as static in the gaps. The expander tracks the
    voice's own frame level and smoothly attenuates frames that sit far below
    its speech level. It is a *time* gain (same for all frequencies), so speech
    frames pass untouched and nothing is filtered spectrally; a look-ahead and a
    fast attack keep word onsets intact, a slower release keeps word tails.

normalize_loudness
    Brings a track to a consistent speech level instead of always pushing the
    peak to full scale, which boosted quiet clips — and their noise floor — far
    more than loud ones. A peak ceiling still prevents clipping.
"""

from __future__ import annotations

import numpy as np
from scipy.ndimage import maximum_filter1d, uniform_filter
from scipy.signal import istft, stft

EPS = 1e-10

# Settings chosen on a held-out tuning set (datasets/vanta/tune), verified on a
# separate one. See README "Results".
DEFAULT_SPECTRAL = dict(beta=0.4, gmin_db=-4.5)
DEFAULT_GATE = dict(floor_db=-12.0, lo_db=-35.0, hi_db=-20.0, release_ms=300.0)


def suppress_residual_noise(
    voice: np.ndarray,
    mixture: np.ndarray,
    sr: int = 16000,
    beta: float = 0.4,
    gmin_db: float = -4.5,
    smooth_frames: int = 3,
) -> np.ndarray:
    """Turn down time-frequency bins where the residue dominates the voice.

    gain = max(gmin, |V|^2 / (|V|^2 + beta * |R|^2)),  R = mixture - voice.
    `voice` must already be in the mixture's scale (after LS alignment).
    """
    voice = np.asarray(voice, dtype=np.float32)
    n = len(voice)
    if n < 512:
        return voice
    residue = np.asarray(mixture[:n], dtype=np.float32) - voice
    kw = dict(fs=sr, nperseg=512, noverlap=384)
    _, _, V = stft(voice, **kw)
    _, _, R = stft(residue, **kw)
    pv, pr = np.abs(V) ** 2, np.abs(R) ** 2
    if smooth_frames > 1:  # light temporal smoothing avoids "musical noise"
        pv = uniform_filter(pv, size=(1, smooth_frames))
        pr = uniform_filter(pr, size=(1, smooth_frames))
    gain = np.maximum(10 ** (gmin_db / 20), pv / (pv + beta * pr + EPS))
    _, out = istft(V * gain, **kw)
    out = out[:n]
    if len(out) < n:
        out = np.pad(out, (0, n - len(out)))
    return out.astype(np.float32)


def clean_voice(voice: np.ndarray, mixture: np.ndarray, sr: int = 16000) -> np.ndarray:
    """Full default chain: residual-noise suppression, then pause suppression."""
    return suppress_pauses(suppress_residual_noise(voice, mixture, sr, **DEFAULT_SPECTRAL), sr, **DEFAULT_GATE)


def _frame_energy(wav: np.ndarray, win: int, hop: int) -> np.ndarray:
    if len(wav) < win:
        wav = np.pad(wav, (0, win - len(wav)))
    n = 1 + (len(wav) - win) // hop
    idx = np.arange(win)[None, :] + hop * np.arange(n)[:, None]
    return (wav[idx] ** 2).mean(axis=1)


def suppress_pauses(
    wav: np.ndarray,
    sr: int = 16000,
    floor_db: float = -25.0,
    lo_db: float = -45.0,
    hi_db: float = -30.0,
    lookahead_ms: float = 20.0,
    attack_ms: float = 5.0,
    release_ms: float = 150.0,
    win_ms: float = 32.0,
    hop_ms: float = 8.0,
) -> np.ndarray:
    """Attenuate low-level stretches of `wav` relative to its speech level.

    Frames at least `hi_db` below the speech level keep full gain until they
    fall to `lo_db`; below that they are attenuated by `floor_db`, with a
    linear-in-dB transition between. Speech level is the 95th percentile frame
    energy, so it tracks the voice, not occasional peaks.
    """
    wav = np.asarray(wav, dtype=np.float32)
    if wav.size == 0 or floor_db >= 0:
        return wav

    win = max(1, int(sr * win_ms / 1000))
    hop = max(1, int(sr * hop_ms / 1000))
    energy = _frame_energy(wav, win, hop)
    ref = np.percentile(energy, 95)
    if ref <= EPS:
        return wav
    rel = 10 * np.log10(energy / ref + EPS)

    # static gain curve (dB): 0 above hi, floor below lo, linear between
    t = np.clip((rel - lo_db) / max(hi_db - lo_db, EPS), 0.0, 1.0)
    g = floor_db * (1.0 - t)

    # look-ahead: open the gate slightly before an onset
    la = max(1, int(round(lookahead_ms / hop_ms)))
    if la > 1:
        g = maximum_filter1d(g, size=la, origin=-(la // 2))

    # asymmetric one-pole smoothing: fast attack (gain rising), slow release
    a_att = np.exp(-hop_ms / max(attack_ms, EPS))
    a_rel = np.exp(-hop_ms / max(release_ms, EPS))
    sm = np.empty_like(g)
    prev = g[0]
    for i, x in enumerate(g):
        a = a_att if x > prev else a_rel
        prev = a * prev + (1 - a) * x
        sm[i] = prev

    # frame centres -> per-sample gain
    centres = np.arange(len(sm)) * hop + win / 2
    gain_db = np.interp(np.arange(len(wav)), centres, sm)
    return (wav * 10 ** (gain_db / 20)).astype(np.float32)


def normalize_loudness(
    wav: np.ndarray,
    sr: int = 16000,
    target_dbfs: float = -20.0,
    peak: float = 0.95,
) -> np.ndarray:
    """Scale so the active (speech) RMS is `target_dbfs`, never exceeding `peak`."""
    wav = np.asarray(wav, dtype=np.float32)
    max_abs = float(np.max(np.abs(wav))) if wav.size else 0.0
    if max_abs < 1e-6:
        return wav
    win = max(1, int(sr * 0.032))
    energy = _frame_energy(wav, win, win // 2)
    active = energy[energy > energy.max() * 10 ** (-40 / 10)]
    rms = float(np.sqrt(active.mean())) if active.size else float(np.sqrt(energy.mean()))
    gain = min(10 ** (target_dbfs / 20) / max(rms, EPS), peak / max_abs)
    return (wav * gain).astype(np.float32)
