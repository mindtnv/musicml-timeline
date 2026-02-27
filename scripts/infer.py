"""Run inference: audio -> timeline JSON + optional plot.

Usage:
    python scripts/infer.py --audio song.mp3 --ckpt checkpoints/best.pt \
        --out timeline.json --plot timeline.png --config configs/default.yaml
"""

from __future__ import annotations

import argparse
import json

from musicml.infer import plot_timeline, run_inference
from musicml.utils import load_config


def main() -> None:
    parser = argparse.ArgumentParser(description="Run music analysis inference")
    parser.add_argument("--audio", required=True, help="Path to audio file")
    parser.add_argument("--ckpt", required=True, help="Model checkpoint path")
    parser.add_argument("--out", default="timeline.json", help="Output JSON path")
    parser.add_argument("--plot", default=None, help="Output plot path (optional)")
    parser.add_argument(
        "--config", default="configs/default.yaml", help="Config file path"
    )
    args = parser.parse_args()

    cfg = load_config(args.config)
    print(f"Running inference on {args.audio}...")

    timeline = run_inference(args.audio, args.ckpt, cfg)

    with open(args.out, "w") as f:
        json.dump(timeline, f, indent=2)
    print(f"Timeline saved to {args.out}")

    if args.plot:
        plot_timeline(timeline, args.plot)
        print(f"Plot saved to {args.plot}")


if __name__ == "__main__":
    main()
