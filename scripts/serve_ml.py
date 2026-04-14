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

    print(f"Loading model from {args.ckpt} on {_device}...")
    model = load_model(args.ckpt, _cfg["model"], device=_device)
    print(f"Model loaded ({model.count_params():,} params)")
    print(f"Starting server on {args.host}:{args.port}")

    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
