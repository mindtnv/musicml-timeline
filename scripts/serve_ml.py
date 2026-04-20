"""FastAPI microservice for ML inference.

Usage:
    python scripts/serve_ml.py \\
        --ckpt checkpoints/ast_v3/best.pt --config configs/ast.yaml
    python scripts/serve_ml.py \\
        --ckpt checkpoints/cnn_v3/best.pt --config configs/cnn_v3.yaml \\
        --port 8000

Environment variables (all optional, override CLI defaults):
    MUSICML_CKPT      — path to checkpoint
    MUSICML_CONFIG    — path to config yaml
    MUSICML_CACHE_DIR — cache dir for timeline JSON keyed by audio SHA256
    MUSICML_PORT, MUSICML_HOST
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
import shutil
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any

import uvicorn
from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="MusicML Inference API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Populated at startup.
_cfg: dict[str, Any] = {}
_ckpt_path: str = ""
_device: str = ""
_architecture: str = ""
_model: Any = None
_cache_dir: Path = Path("cache")
_temp_dir: Path = Path(tempfile.mkdtemp(prefix="musicml_serve_"))

# Only one heavy inference at a time — AST eats ~2.5 GB RSS on CPU, two
# parallel forwards will OOM a 4 GB VPS.
_infer_semaphore: asyncio.Semaphore = asyncio.Semaphore(1)

# In-memory job registry. Keys are job_ids, values are dicts with
# {"status", "sha", "result"|"error", "started_at", "finished_at"}.
# Bounded to last N entries via FIFO trimming on write.
_jobs: dict[str, dict[str, Any]] = {}
_MAX_JOBS = 100

ALLOWED_EXTENSIONS = {".mp3", ".wav", ".flac", ".ogg", ".m4a", ".wma"}


def _sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _cache_path_for(sha: str) -> Path:
    return _cache_dir / f"{sha}.json"


def _trim_jobs() -> None:
    if len(_jobs) <= _MAX_JOBS:
        return
    # Drop oldest finished jobs first.
    finished = [
        (jid, j) for jid, j in _jobs.items()
        if j.get("status") in ("done", "error")
    ]
    finished.sort(key=lambda kv: kv[1].get("finished_at", 0.0))
    for jid, _ in finished[: len(_jobs) - _MAX_JOBS]:
        _jobs.pop(jid, None)


@app.on_event("startup")
async def _startup() -> None:
    """Warmup: load model once, run one fake forward to prime CPU kernels."""
    global _model
    if _model is None:
        return  # Will be loaded by main() for CLI runs; no-op for import-time.


@app.get("/health")
def health() -> dict[str, Any]:
    cached = (
        len(list(_cache_dir.glob("*.json"))) if _cache_dir.exists() else 0
    )
    return {
        "status": "ok",
        "device": _device,
        "architecture": _architecture,
        "model_loaded": _model is not None,
        "cache_dir": str(_cache_dir),
        "cached_tracks": cached,
    }


@app.post("/spectrogram")
async def spectrogram(file: UploadFile = File(...)) -> dict[str, Any]:
    """Compute log-mel spectrogram of uploaded audio, return as 2D array.

    Output is downsampled to at most ~512 frames along the time axis for
    front-end rendering.
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
        )

        duration_sec = float(len(audio) / sr_loaded)
        hop_seconds = hop_length / sr_loaded

        max_frames = 512
        T = mel.shape[1]
        if T > max_frames:
            step = T / max_frames
            idx = (np.arange(max_frames) * step).astype(int)
            mel = mel[:, idx]
            hop_seconds *= step

        mmin = float(mel.min())
        mmax = float(mel.max())
        if mmax > mmin:
            mel_norm = (mel - mmin) / (mmax - mmin)
        else:
            mel_norm = np.zeros_like(mel)

        mel_list = np.round(mel_norm, 3).tolist()

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


def _run_infer_sync(audio_path: Path, sha: str, job_id: str) -> None:
    """Blocking inference — runs in a thread via asyncio.to_thread."""
    from musicml.infer import run_inference

    _jobs[job_id]["status"] = "running"
    try:
        timeline = run_inference(
            audio_path=str(audio_path),
            cfg=_cfg,
            device=_device,
            model=_model,
            include_audio_features=True,
            do_extract_embeddings=True,
        )
        cache_file = _cache_path_for(sha)
        cache_file.parent.mkdir(parents=True, exist_ok=True)
        with open(cache_file, "w", encoding="utf-8") as f:
            json.dump(timeline, f, ensure_ascii=False)
        _jobs[job_id]["status"] = "done"
        _jobs[job_id]["result"] = timeline
    except Exception as exc:
        _jobs[job_id]["status"] = "error"
        _jobs[job_id]["error"] = str(exc)
    finally:
        _jobs[job_id]["finished_at"] = time.time()
        audio_path.unlink(missing_ok=True)


async def _run_infer(audio_path: Path, sha: str, job_id: str) -> None:
    """Semaphore-guarded wrapper so only one heavy forward runs at a time."""
    async with _infer_semaphore:
        await asyncio.to_thread(_run_infer_sync, audio_path, sha, job_id)


@app.post("/analyze")
async def analyze(
    background: BackgroundTasks,
    file: UploadFile = File(...),
) -> dict[str, Any]:
    """Accept audio file, return cached timeline OR enqueue inference.

    Response shapes:
        cache hit:  200 {"status": "done", "sha": ..., "timeline": {...}}
        miss:       202 {"status": "queued", "sha": ..., "job_id": ...}
    """
    ext = Path(file.filename or "audio.wav").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported format: {ext}")

    tmp_name = f"{uuid.uuid4()}{ext}"
    audio_path = _temp_dir / tmp_name
    with open(audio_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    sha = _sha256_of(audio_path)
    cache_file = _cache_path_for(sha)
    if cache_file.exists():
        audio_path.unlink(missing_ok=True)
        with open(cache_file, encoding="utf-8") as f:
            timeline = json.load(f)
        return {"status": "done", "sha": sha, "timeline": timeline}

    job_id = str(uuid.uuid4())
    _jobs[job_id] = {
        "status": "queued",
        "sha": sha,
        "started_at": time.time(),
    }
    _trim_jobs()
    background.add_task(_run_infer, audio_path, sha, job_id)
    return {"status": "queued", "sha": sha, "job_id": job_id}


@app.get("/analyze/{job_id}")
def analyze_status(job_id: str) -> dict[str, Any]:
    job = _jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Unknown job_id")
    return job


@app.get("/track/{sha}")
def get_cached(sha: str) -> dict[str, Any]:
    """Fetch a cached timeline by audio SHA256."""
    cache_file = _cache_path_for(sha)
    if not cache_file.exists():
        raise HTTPException(status_code=404, detail="Not in cache")
    with open(cache_file, encoding="utf-8") as f:
        timeline = json.load(f)
    return {"status": "done", "sha": sha, "timeline": timeline}


def _warmup() -> None:
    """Run one fake forward so the first real request isn't cold."""
    import numpy as np
    import torch

    if _model is None:
        return
    win_cfg = _cfg["windowing"]
    feat_cfg = _cfg["features"]
    audio_cfg = _cfg["audio"]
    n_mels = feat_cfg["n_mels"]
    hop_length = feat_cfg["hop_length"]
    n_frames = int(win_cfg["window_seconds"] * audio_cfg["sr"] / hop_length) + 1
    dummy = np.zeros((1, 1, n_mels, n_frames), dtype=np.float32)
    try:
        with torch.no_grad():
            _model(torch.from_numpy(dummy).to(_device))
        print("Warmup forward done")
    except Exception as exc:
        print(f"Warmup skipped ({exc})")


def main() -> None:
    parser = argparse.ArgumentParser(description="MusicML Inference API")
    parser.add_argument(
        "--ckpt",
        default=os.environ.get("MUSICML_CKPT", "checkpoints/best.pt"),
    )
    parser.add_argument(
        "--config",
        default=os.environ.get("MUSICML_CONFIG", "configs/default.yaml"),
    )
    parser.add_argument(
        "--cache-dir",
        default=os.environ.get("MUSICML_CACHE_DIR", "cache"),
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("MUSICML_PORT", "8000")),
    )
    parser.add_argument(
        "--host",
        default=os.environ.get("MUSICML_HOST", "0.0.0.0"),
    )
    args = parser.parse_args()

    from musicml.infer import load_model
    from musicml.utils import get_device, load_config

    global _cfg, _ckpt_path, _device, _architecture, _model, _cache_dir
    _cfg = load_config(args.config)
    _ckpt_path = args.ckpt
    _device = get_device()
    _architecture = _cfg.get("architecture", "cnn")
    _cache_dir = Path(args.cache_dir)
    _cache_dir.mkdir(parents=True, exist_ok=True)

    print(f"Loading {_architecture} model from {args.ckpt} on {_device}...")
    t0 = time.time()
    _model = load_model(
        args.ckpt, _cfg["model"], device=_device, architecture=_architecture,
    )
    load_s = time.time() - t0
    n_params = _model.count_params() if hasattr(_model, "count_params") else sum(
        p.numel() for p in _model.parameters()
    )
    print(f"Model loaded in {load_s:.1f}s ({n_params:,} params)")

    _warmup()

    print(f"Cache dir: {_cache_dir.resolve()}")
    print(f"Starting server on {args.host}:{args.port}")
    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
