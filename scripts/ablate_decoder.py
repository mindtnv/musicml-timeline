"""Ablation of v2 decoder components on Harmonix test split.

Runs each variant on cached per-track segment probabilities (saved by the
first run of bench_segmentation.py) and reports frame accuracy / boundary F1
deltas vs the 'current' baseline.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Callable

import numpy as np
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
from bench_segmentation import (  # type: ignore
    decoder_current,
    eval_strategy,
    frames_from_intervals,
    parse_annotations_gt,
    run_model_on_track,
)


def load_cfg(path: str) -> dict:
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def collect_probs_and_gt(args, cfg):
    """Run the model once on each test track and return probs/gt/ids."""
    import torch

    from musicml.models import CNNMultiTask

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = CNNMultiTask(**cfg["model"])
    ck = torch.load(args.ckpt, map_location=device, weights_only=False)
    model.load_state_dict(ck["model_state_dict"], strict=False)
    model.to(device).eval()

    with open(args.splits) as f:
        splits = json.load(f)
    track_ids = splits[args.split]
    if args.limit > 0:
        track_ids = track_ids[: args.limit]

    feat_dir = Path(args.feat_dir)
    ann_dir = Path(args.ann_dir)
    stats = np.load(args.stats) if Path(args.stats).exists() else None

    segment_classes: list[str] = cfg.get(
        "segment_classes",
        ["Intro", "Verse", "Bridge", "Chorus", "Instrumental", "Outro"],
    )
    hop_seconds = float(cfg["windowing"]["hop_seconds"])

    all_probs: list[np.ndarray] = []
    gt_list: list[np.ndarray] = []
    used: list[str] = []

    for i, tid in enumerate(track_ids):
        feat_p = feat_dir / f"{tid}.npz"
        if not feat_p.exists():
            continue
        ann_p = None
        for ext in (".txt", ".tsv"):
            p = ann_dir / f"{tid}{ext}"
            if p.exists():
                ann_p = p
                break
        if ann_p is None:
            continue
        try:
            probs = run_model_on_track(model, feat_p, stats, cfg, device)
        except Exception:
            continue
        intervals = parse_annotations_gt(ann_p, segment_classes)
        if not intervals:
            continue
        gt = frames_from_intervals(
            intervals, segment_classes, probs.shape[0], hop_seconds,
        )
        all_probs.append(probs)
        gt_list.append(gt)
        used.append(tid)
        if (i + 1) % 20 == 0:
            print(f"  {i + 1}/{len(track_ids)}")
    return all_probs, gt_list, used, segment_classes, hop_seconds


def build_ablation_decoders() -> dict[str, Callable]:
    """Returns {variant_name: decode_fn(probs, class_names, hop)}."""
    from musicml.postprocess import decode_segment_head_v2

    def make(**kw) -> Callable:
        def fn(probs, class_names, hop):
            return decode_segment_head_v2(probs, class_names, hop, **kw)
        return fn

    tight_md = {
        "Intro": 3.0, "Verse": 6.0, "Bridge": 3.0,
        "Chorus": 6.0, "Instrumental": 6.0, "Outro": 3.0,
    }

    variants: dict[str, Callable] = {
        "current": decoder_current,
        "v2_default": make(),
        # Best single components
        "v2_noTemp_bf15": make(temperature=1.0, boundary_fraction=0.15),
        "v2_noTemp_bf15_tight": make(
            temperature=1.0, boundary_fraction=0.15,
            per_class_min_duration_sec=tight_md,
        ),
        "v2_noTemp_bf18_tight": make(
            temperature=1.0, boundary_fraction=0.18,
            per_class_min_duration_sec=tight_md,
        ),
        "v2_noTemp_bf15_tight_snap15": make(
            temperature=1.0, boundary_fraction=0.15,
            per_class_min_duration_sec=tight_md,
            novelty_snap_radius_sec=1.5,
        ),
        "v2_noTemp_bf15_tight_snap0": make(
            temperature=1.0, boundary_fraction=0.15,
            per_class_min_duration_sec=tight_md,
            novelty_snap_radius_sec=0.0,
        ),
        "v2_noTemp_bf15_tight_boost0": make(
            temperature=1.0, boundary_fraction=0.15,
            per_class_min_duration_sec=tight_md,
            position_boost=0.0,
        ),
        "v2_noTemp_bf12_tight": make(
            temperature=1.0, boundary_fraction=0.12,
            per_class_min_duration_sec=tight_md,
        ),
        "v2_noTemp_bf15_tight_noStruct": make(
            temperature=1.0, boundary_fraction=0.15,
            per_class_min_duration_sec=tight_md,
            base_transition_penalty=1.0,
        ),
    }
    return variants


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--ckpt", default="checkpoints/best.pt")
    p.add_argument("--cfg", default="configs/default.yaml")
    p.add_argument("--splits", default="data/structure/splits.json")
    p.add_argument("--feat-dir", default="data/structure/features")
    p.add_argument("--ann-dir", default="data/structure/annotations")
    p.add_argument("--stats", default="data/structure/features/stats.npz")
    p.add_argument("--limit", type=int, default=0)
    p.add_argument("--split", default="test")
    p.add_argument("--tolerance", type=float, default=3.0)
    p.add_argument("--output", default="results/ablate_decoder.json")
    args = p.parse_args()

    cfg = load_cfg(args.cfg)

    print("Collecting model probabilities...")
    probs_list, gt_list, used, class_names, hop = collect_probs_and_gt(args, cfg)
    print(f"Collected {len(used)} tracks.")

    variants = build_ablation_decoders()
    results = {}

    for name, fn in variants.items():
        r = eval_strategy(
            probs_list, gt_list, class_names, hop, fn, tolerance=args.tolerance,
        )
        results[name] = r
        print(
            f"{name:18s}  acc={r['frame_accuracy']:.4f}  "
            f"mf1={r['frame_macro_f1']:.4f}  bf1={r['boundary_f1']:.4f}"
        )

    # Diffs vs current
    base = results["current"]
    print("\nDelta vs current:")
    rows = []
    for name, r in results.items():
        if name == "current":
            continue
        d_acc = r["frame_accuracy"] - base["frame_accuracy"]
        d_mf1 = r["frame_macro_f1"] - base["frame_macro_f1"]
        d_bf1 = r["boundary_f1"] - base["boundary_f1"]
        score = d_acc + d_mf1 + d_bf1  # aggregate
        rows.append((name, score, d_acc, d_mf1, d_bf1))
    rows.sort(key=lambda x: -x[1])
    for name, score, d_acc, d_mf1, d_bf1 in rows:
        print(
            f"  {name:18s}  score={score:+.4f}  "
            f"d_acc={d_acc:+.4f}  d_mf1={d_mf1:+.4f}  d_bf1={d_bf1:+.4f}"
        )

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w") as f:
        json.dump({"tracks": used, "results": results}, f, indent=2)
    print(f"Saved -> {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
