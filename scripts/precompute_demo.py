"""Precompute timeline JSON for a set of demo tracks.

Runs the full inference pipeline once per track and stores the result in
the same SHA256-keyed cache that the API reads from. After the cache is
warm, the `/analyze` endpoint returns in <100ms for those tracks, so the
thesis defence demo feels instant.

Usage:
    python scripts/precompute_demo.py \\
        --audio-dir web/public/audio \\
        --ckpt checkpoints/ast_v3/best.pt \\
        --config configs/ast.yaml \\
        --cache-dir cache
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from pathlib import Path

AUDIO_EXTS = {".mp3", ".wav", ".flac", ".ogg", ".m4a"}


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--audio-dir", required=True, type=Path)
    parser.add_argument("--ckpt", required=True, type=Path)
    parser.add_argument("--config", required=True, type=Path)
    parser.add_argument("--cache-dir", default=Path("cache"), type=Path)
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-run inference even if a cached JSON already exists.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Process at most N tracks (0 = all).",
    )
    args = parser.parse_args()

    audio_dir: Path = args.audio_dir
    if not audio_dir.exists():
        print(f"ERROR: audio dir not found: {audio_dir}", file=sys.stderr)
        return 1

    tracks = sorted(
        p for p in audio_dir.rglob("*")
        if p.is_file() and p.suffix.lower() in AUDIO_EXTS
    )
    if args.limit > 0:
        tracks = tracks[: args.limit]
    if not tracks:
        print(f"No audio files found under {audio_dir}")
        return 0

    args.cache_dir.mkdir(parents=True, exist_ok=True)

    # Load model + config once.
    from musicml.infer import load_model, run_inference
    from musicml.utils import get_device, load_config

    cfg = load_config(args.config)
    architecture = cfg.get("architecture", "cnn")
    device = get_device()

    print(f"Loading {architecture} model on {device}...")
    t0 = time.time()
    model = load_model(
        args.ckpt, cfg["model"], device=device, architecture=architecture,
    )
    print(f"Model loaded in {time.time() - t0:.1f}s")

    ok = 0
    skipped = 0
    failed = 0
    for i, track in enumerate(tracks, 1):
        sha = sha256_of(track)
        cache_file = args.cache_dir / f"{sha}.json"
        if cache_file.exists() and not args.force:
            print(f"[{i}/{len(tracks)}] SKIP (cached) {track.name}")
            skipped += 1
            continue

        print(f"[{i}/{len(tracks)}] INFER {track.name}  sha={sha[:12]}")
        t = time.time()
        try:
            timeline = run_inference(
                audio_path=str(track),
                cfg=cfg,
                device=device,
                model=model,
                include_audio_features=True,
                do_extract_embeddings=True,
            )
        except Exception as exc:
            print(f"    FAILED: {exc}")
            failed += 1
            continue

        with open(cache_file, "w", encoding="utf-8") as f:
            json.dump(timeline, f, ensure_ascii=False)
        print(f"    done in {time.time() - t:.1f}s → {cache_file.name}")
        ok += 1

    print(f"\nSummary: {ok} inferred, {skipped} skipped, {failed} failed")
    return 0 if failed == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
