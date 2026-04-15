"""FastAPI microservice for ML inference.

Usage:
    python scripts/serve_ml.py --ckpt checkpoints/best.pt
    python scripts/serve_ml.py --ckpt checkpoints/best.pt --port 8000
"""

from __future__ import annotations

import argparse
import shutil
import tempfile
import uuid
from pathlib import Path
from typing import Any

import uvicorn
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="MusicML Inference API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global state (initialized at startup)
_cfg: dict[str, Any] = {}
_ckpt_path: str = ""
_device: str = ""
_temp_dir: Path = Path(tempfile.mkdtemp(prefix="musicml_serve_"))

ALLOWED_EXTENSIONS = {".mp3", ".wav", ".flac", ".ogg", ".m4a", ".wma"}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "device": _device}


@app.post("/spectrogram")
async def spectrogram(file: UploadFile = File(...)) -> dict[str, Any]:
    """Compute log-mel spectrogram of uploaded audio, return as 2D array.

    Output is downsampled to at most ~512 frames along time axis for front-end rendering.
    """
    import librosa
    import numpy as np
    from musicml.features import compute_log_mel, load_audio

    ext = Path(file.filename or "audio.wav").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported format: {ext}")

    job_id = str(uuid.uuid4())
    audio_path = _temp_dir / f"{job_id}{ext}"

    with open(audio_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    try:
        sr = int(_cfg.get("audio", {}).get("sr", 22050))
        n_mels = int(_cfg.get("features", {}).get("n_mels", 128))
        hop_length = int(_cfg.get("features", {}).get("hop_length", 512))
        audio, sr_loaded = load_audio(str(audio_path), sr=sr)
        mel = compute_log_mel(
            audio,
            sr=sr_loaded,
            n_mels=n_mels,
            hop_length=hop_length,
        )  # (n_mels, T)

        duration_sec = float(len(audio) / sr_loaded)
        hop_seconds = hop_length / sr_loaded

        # Downsample T → max 512 frames for payload size
        max_frames = 512
        T = mel.shape[1]
        if T > max_frames:
            step = T / max_frames
            idx = (np.arange(max_frames) * step).astype(int)
            mel = mel[:, idx]
            hop_seconds *= step

        # Normalize to 0..1
        mmin = float(mel.min())
        mmax = float(mel.max())
        if mmax > mmin:
            mel_norm = (mel - mmin) / (mmax - mmin)
        else:
            mel_norm = np.zeros_like(mel)

        # Return as list of lists (freq low → high); round to 3 decimals
        mel_list = np.round(mel_norm, 3).tolist()

        # Mel filterbank center frequencies (Hz) — one per mel bin, so the
        # frontend can render a frequency axis without duplicating librosa's
        # conversion logic.
        fmax = float(sr_loaded) / 2.0
        mel_freqs = librosa.mel_frequencies(n_mels=n_mels, fmin=0.0, fmax=fmax)
        mel_freqs_list = [round(float(f), 1) for f in mel_freqs.tolist()]

        return {
            "n_mels": n_mels,
            "n_frames": mel.shape[1],
            "hop_seconds": hop_seconds,
            "duration_sec": duration_sec,
            "sr": int(sr_loaded),
            "fmin": 0.0,
            "fmax": fmax,
            "mel_freqs": mel_freqs_list,
            "mel": mel_list,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Spectrogram failed: {exc}")
    finally:
        audio_path.unlink(missing_ok=True)


@app.post("/analyze")
async def analyze(file: UploadFile = File(...)) -> dict[str, Any]:
    """Accept audio file, run inference, return timeline JSON."""
    from musicml.infer import run_inference

    ext = Path(file.filename or "audio.wav").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format: {ext}",
        )

    job_id = str(uuid.uuid4())
    audio_path = _temp_dir / f"{job_id}{ext}"

    with open(audio_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    try:
        timeline = run_inference(
            audio_path=str(audio_path),
            ckpt_path=_ckpt_path,
            cfg=_cfg,
            device=_device,
            include_audio_features=True,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Inference failed: {exc}",
        )
    finally:
        audio_path.unlink(missing_ok=True)

    return {"job_id": job_id, "timeline": timeline}


def main() -> None:
    parser = argparse.ArgumentParser(description="MusicML Inference API")
    parser.add_argument(
        "--ckpt", default="checkpoints/best.pt",
        help="Path to model checkpoint",
    )
    parser.add_argument(
        "--config", default="configs/default.yaml",
        help="Path to config YAML",
    )
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--host", default="0.0.0.0")
    args = parser.parse_args()

    from musicml.infer import load_model
    from musicml.utils import get_device, load_config

    global _cfg, _ckpt_path, _device
    _cfg = load_config(args.config)
    _ckpt_path = args.ckpt
    _device = get_device()

    architecture = _cfg.get("architecture", "cnn")
    print(f"Loading {architecture} model from {args.ckpt} on {_device}...")
    model = load_model(
        args.ckpt, _cfg["model"], device=_device, architecture=architecture,
    )
    print(f"Model loaded ({model.count_params():,} params)")
    print(f"Starting server on {args.host}:{args.port}")

    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
