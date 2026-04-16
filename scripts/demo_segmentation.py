"""Render side-by-side v1 vs v2 segmentation for a few popular tracks.

Uses cached features and ground-truth annotations; no audio load needed.
Saves PNG comparisons into ``results/segmentation_demos/``.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
from bench_segmentation import (  # type: ignore
    frames_from_intervals,
    parse_annotations_gt,
    run_model_on_track,
)

COLORS = {
    "Intro": "#81C784",
    "Verse": "#4CAF50",
    "Bridge": "#FF9800",
    "Chorus": "#F44336",
    "Instrumental": "#42A5F5",
    "Outro": "#9E9E9E",
}


def render_track(
    ax, segments, duration, title, class_names, show_labels=True,
):
    import matplotlib.patches as mpatches

    for seg in segments:
        s = seg["start"] if isinstance(seg, dict) else seg.start
        e = seg["end"] if isinstance(seg, dict) else seg.end
        label = seg["label"] if isinstance(seg, dict) else seg.label
        rect = mpatches.Rectangle(
            (s, 0), e - s, 1,
            facecolor=COLORS.get(label, "#CCCCCC"),
            edgecolor="white",
            linewidth=0.5,
        )
        ax.add_patch(rect)
        if show_labels and (e - s) > duration * 0.04:
            ax.text(
                (s + e) / 2, 0.5, label,
                ha="center", va="center", fontsize=7, color="white",
            )
    ax.set_xlim(0, duration)
    ax.set_ylim(0, 1)
    ax.set_yticks([])
    ax.set_title(title, fontsize=10, loc="left")


def frames_to_segments(frames, class_names, hop):
    """Convert per-frame int labels to (start, end, label) dicts."""
    segs = []
    if len(frames) == 0:
        return segs
    i = 0
    T = len(frames)
    while i < T:
        j = i
        while j + 1 < T and frames[j + 1] == frames[i]:
            j += 1
        c = int(frames[i])
        if c >= 0:
            segs.append({
                "start": i * hop,
                "end": (j + 1) * hop,
                "label": class_names[c],
            })
        i = j + 1
    return segs


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--ckpt", default="checkpoints/best.pt")
    p.add_argument("--cfg", default="configs/default.yaml")
    p.add_argument("--feat-dir", default="data/structure/features")
    p.add_argument("--ann-dir", default="data/structure/annotations")
    p.add_argument("--stats", default="data/structure/features/stats.npz")
    p.add_argument("--output-dir", default="results/segmentation_demos")
    p.add_argument(
        "--track-ids",
        default=(
            "0017_badromance,0043_callmemaybe,0094_fireflies,"
            "0118_grenade,0073_disturbia,0124_hello,"
            "0074_djgotusfallininlove,0099_forgetyou"
        ),
    )
    args = p.parse_args()

    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import torch

    from musicml.models import CNNMultiTask
    from musicml.postprocess import (
        decode_segment_head,
        decode_segment_head_v2,
    )

    with open(args.cfg, encoding="utf-8") as f:
        cfg = yaml.safe_load(f)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = CNNMultiTask(**cfg["model"])
    ck = torch.load(args.ckpt, map_location=device, weights_only=False)
    model.load_state_dict(ck["model_state_dict"], strict=False)
    model.to(device).eval()

    stats = np.load(args.stats)
    class_names = cfg["segment_classes"]
    hop = float(cfg["windowing"]["hop_seconds"])

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    track_ids = [t.strip() for t in args.track_ids.split(",")]
    n = len(track_ids)
    fig, axes = plt.subplots(n * 3, 1, figsize=(14, 1.1 * n * 3))
    if n == 1:
        axes = [axes]

    for i, tid in enumerate(track_ids):
        feat_p = Path(args.feat_dir) / f"{tid}.npz"
        ann_p = None
        for ext in (".txt", ".tsv"):
            cand = Path(args.ann_dir) / f"{tid}{ext}"
            if cand.exists():
                ann_p = cand
                break
        if not feat_p.exists() or ann_p is None:
            print(f"[skip {tid}]")
            continue

        probs, raw_feats, feat_hop = run_model_on_track(
            model, feat_p, stats, cfg, device, return_features=True,
        )
        T = probs.shape[0]
        duration = T * hop

        # Ground truth
        intervals = parse_annotations_gt(ann_p, class_names)
        gt_frames = frames_from_intervals(intervals, class_names, T, hop)
        gt_segs = frames_to_segments(gt_frames, class_names, hop)

        # v1
        segs_v1 = decode_segment_head(
            probs, class_names=class_names, hop_seconds=hop,
            use_viterbi=True, transition_penalty=1.0,
            use_position_priors=True, median_kernel=5, min_duration=6.0,
        )
        # v2 + audio (full stack)
        segs_v2 = decode_segment_head_v2(
            probs, class_names=class_names, hop_seconds=hop,
            window_seconds=cfg["windowing"]["window_seconds"],
            audio_features=raw_feats,
            feature_hop_seconds=feat_hop,
        )

        # Score each
        def score(preds_segs):
            pred = np.full(T, -1, dtype=np.int64)
            for s in preds_segs:
                s_s = s.start if hasattr(s, "start") else s["start"]
                s_e = s.end if hasattr(s, "end") else s["end"]
                s_l = s.label if hasattr(s, "label") else s["label"]
                i0 = max(0, int(round(s_s / hop)))
                i1 = min(T, int(round(s_e / hop)))
                if s_l in class_names:
                    pred[i0:i1] = class_names.index(s_l)
            mask = gt_frames >= 0
            return float((pred[mask] == gt_frames[mask]).mean())

        acc_v1 = score(segs_v1) * 100
        acc_v2 = score(segs_v2) * 100

        # Sanity: does the last segment land on Outro, and does GT have Outro?
        gt_last = gt_segs[-1]["label"] if gt_segs else "-"
        v1_last = (segs_v1[-1].label if segs_v1 else "-")
        v2_last = (segs_v2[-1].label if segs_v2 else "-")
        print(
            f"  last segment  gt={gt_last:12s}  "
            f"v1={v1_last:12s}  v2={v2_last:12s}"
        )

        render_track(axes[3 * i], gt_segs, duration,
                     f"{tid}  (GT)", class_names)
        render_track(axes[3 * i + 1], segs_v1, duration,
                     f"  v1 post-process  (frame acc = {acc_v1:.1f}%)",
                     class_names)
        render_track(axes[3 * i + 2], segs_v2, duration,
                     f"  v2 post-process  (frame acc = {acc_v2:.1f}%)",
                     class_names)
        print(
            f"{tid:30s}  duration={duration:5.0f}s  "
            f"v1={acc_v1:5.1f}%  v2={acc_v2:5.1f}%  "
            f"delta={acc_v2 - acc_v1:+5.1f}"
        )

    import matplotlib.patches as mpatches
    handles = [
        mpatches.Patch(facecolor=COLORS[c], label=c, edgecolor="white")
        for c in class_names
    ]
    axes[-1].set_xlabel("Time (s)")
    fig.legend(handles=handles, loc="lower center",
               ncol=len(class_names), fontsize=8,
               bbox_to_anchor=(0.5, -0.01))
    fig.suptitle("Segment decoding: ground truth vs v1 vs v2", fontsize=11)
    fig.tight_layout(rect=[0, 0.02, 1, 0.98])
    out_path = out_dir / "segmentation_v1_vs_v2.png"
    fig.savefig(out_path, dpi=140, bbox_inches="tight")
    plt.close(fig)
    print(f"\nSaved -> {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
