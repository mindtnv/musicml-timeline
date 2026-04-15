"""Benchmark segmentation post-processing on Harmonix test tracks.

Runs the CNN model on precomputed features for all test tracks, collects
frame-level probabilities, then applies different post-processing strategies
and compares frame accuracy + boundary F1 against ground truth.

Usage:
    python scripts/bench_segmentation.py --ckpt checkpoints/best.pt

    # Compare old vs new post-process
    python scripts/bench_segmentation.py --ckpt checkpoints/best.pt \\
        --limit 40 --tolerance 3.0
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import yaml


def load_cfg(path: str) -> dict:
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def parse_annotations_gt(
    ann_path: Path, segment_classes: list[str]
) -> list[tuple[float, float, str]]:
    """Return ground-truth intervals (start, end, mapped_class) for a track."""
    from musicml.datasets.structure import (
        boundaries_to_intervals,
        map_label,
        parse_annotations,
    )

    entries = parse_annotations(ann_path)
    intervals = boundaries_to_intervals(entries)
    out: list[tuple[float, float, str]] = []
    for s, e, raw in intervals:
        if raw.lower() in ("end", "silence"):
            # silence at start / end marker — skip
            if raw.lower() == "end":
                continue
            # leading silence will be folded into Intro by the frame-map step
        mapped = map_label(raw)
        if mapped not in segment_classes:
            continue
        out.append((s, e, mapped))
    return out


def frames_from_intervals(
    intervals: list[tuple[float, float, str]],
    class_names: list[str],
    n_frames: int,
    hop_seconds: float,
) -> np.ndarray:
    """Build per-frame ground-truth class index array."""
    y = np.full(n_frames, -1, dtype=np.int64)
    for s, e, label in intervals:
        if label not in class_names:
            continue
        ci = class_names.index(label)
        i0 = max(0, int(round(s / hop_seconds)))
        i1 = min(n_frames, int(round(e / hop_seconds)))
        y[i0:i1] = ci
    # Fill any unlabeled frames at the start with the first labeled class
    if (y == -1).any():
        first_ok = np.where(y != -1)[0]
        if len(first_ok):
            y[: first_ok[0]] = y[first_ok[0]]
            last_ok = first_ok[-1]
            y[last_ok + 1 :] = y[last_ok]
        else:
            y[:] = class_names.index("Verse")
    return y


def extract_boundaries(y: np.ndarray, hop_seconds: float) -> list[float]:
    bs = []
    for i in range(1, len(y)):
        if y[i] != y[i - 1]:
            bs.append(i * hop_seconds)
    return bs


def boundary_f1(
    true_b: list[float], pred_b: list[float], tolerance: float = 3.0
) -> tuple[float, float, float]:
    if not true_b and not pred_b:
        return 1.0, 1.0, 1.0
    if not true_b or not pred_b:
        return 0.0, 0.0, 0.0

    matched = set()
    tp = 0
    for pt in sorted(pred_b):
        best_i = -1
        best_d = float("inf")
        for i, tt in enumerate(true_b):
            if i in matched:
                continue
            d = abs(pt - tt)
            if d <= tolerance and d < best_d:
                best_d = d
                best_i = i
        if best_i >= 0:
            tp += 1
            matched.add(best_i)

    p = tp / len(pred_b)
    r = tp / len(true_b)
    f1 = 2 * p * r / (p + r) if (p + r) > 0 else 0.0
    return p, r, f1


def run_model_on_track(
    model, feats_path: Path, stats, cfg, device: str,
    return_features: bool = False,
):
    """Load cached features, window them, and return per-frame segment probs.

    Returns:
        If ``return_features`` is False (default): ``(T, K)`` probability matrix.
        If True: ``(probs, raw_features, feature_hop_seconds)`` where
        ``raw_features`` is the UN-normalized log-mel matrix sampled at
        ``feature_hop_seconds`` per frame.
    """
    import torch

    from musicml.features import window_features

    data = np.load(feats_path)
    raw_feats = data["log_mel"]  # (n_mels, T_full) — unnormalized

    # Normalize a copy for the model
    feats = raw_feats
    if stats is not None:
        mean = stats["mean"]
        std = np.where(stats["std"] < 1e-6, 1.0, stats["std"])
        feats = (raw_feats - mean) / std

    feat_cfg = cfg["features"]
    win_cfg = cfg["windowing"]

    windows = window_features(
        feats,
        sr=cfg["audio"]["sr"],
        hop_length=feat_cfg["hop_length"],
        window_seconds=win_cfg["window_seconds"],
        hop_seconds=win_cfg["hop_seconds"],
    )

    all_probs: list[np.ndarray] = []
    batch_size = 64
    with torch.no_grad():
        for s in range(0, windows.shape[0], batch_size):
            e = min(s + batch_size, windows.shape[0])
            batch = torch.from_numpy(windows[s:e]).float().to(device)
            out = model(batch)
            probs = torch.softmax(out["segment"], dim=1)
            all_probs.append(probs.cpu().numpy())
    probs = np.concatenate(all_probs, axis=0)

    if not return_features:
        return probs

    feature_hop_seconds = float(feat_cfg["hop_length"]) / float(cfg["audio"]["sr"])
    return probs, raw_feats, feature_hop_seconds


def eval_strategy(
    all_probs_list: list[np.ndarray],
    gt_frames_list: list[np.ndarray],
    class_names: list[str],
    hop_seconds: float,
    decode_fn,
    tolerance: float = 3.0,
    audio_feats_list: list | None = None,
    feature_hop_seconds: float | None = None,
) -> dict[str, float]:
    """Run a given decoder on every track and compute aggregated metrics.

    If ``audio_feats_list`` is provided, it will be passed to the decoder via
    the convention ``decode_fn(probs, class_names, hop, audio=..., feat_hop=...)``
    — the decoder is expected to accept those kwargs.
    """
    acc_sum = 0
    frame_total = 0
    b_p, b_r, b_f = [], [], []
    # Confusion
    K = len(class_names)
    cm = np.zeros((K, K), dtype=np.int64)

    use_audio = (
        audio_feats_list is not None and feature_hop_seconds is not None
    )

    for idx, (probs, gt) in enumerate(zip(all_probs_list, gt_frames_list)):
        if use_audio:
            segments = decode_fn(
                probs, class_names, hop_seconds,
                audio=audio_feats_list[idx], feat_hop=feature_hop_seconds,
            )
        else:
            segments = decode_fn(probs, class_names, hop_seconds)

        # Materialize predicted frames same length as gt
        T = len(gt)
        pred = np.full(T, -1, dtype=np.int64)
        for seg in segments:
            i0 = max(0, int(round(seg.start / hop_seconds)))
            i1 = min(T, int(round(seg.end / hop_seconds)))
            if seg.label in class_names:
                pred[i0:i1] = class_names.index(seg.label)
        # Fill unassigned at tail
        if (pred == -1).any():
            last = np.where(pred != -1)[0]
            if len(last):
                pred[pred == -1] = pred[last[-1]]
            else:
                pred[:] = 0

        mask = gt >= 0
        acc_sum += int((pred[mask] == gt[mask]).sum())
        frame_total += int(mask.sum())
        for t, p in zip(gt[mask], pred[mask]):
            cm[t, p] += 1

        true_b = extract_boundaries(gt, hop_seconds)
        pred_b = extract_boundaries(pred, hop_seconds)
        p, r, f = boundary_f1(true_b, pred_b, tolerance=tolerance)
        b_p.append(p)
        b_r.append(r)
        b_f.append(f)


    # Compute macro-F1 from CM rows
    per_class_f1 = []
    for i in range(K):
        tp = cm[i, i]
        fn = cm[i, :].sum() - tp
        fp = cm[:, i].sum() - tp
        if tp + fp == 0 or tp + fn == 0:
            per_class_f1.append(0.0)
            continue
        p_ = tp / (tp + fp)
        r_ = tp / (tp + fn)
        if p_ + r_ == 0:
            per_class_f1.append(0.0)
        else:
            per_class_f1.append(2 * p_ * r_ / (p_ + r_))
    macro_f1 = float(np.mean(per_class_f1))

    return {
        "frame_accuracy": acc_sum / frame_total if frame_total else 0.0,
        "frame_macro_f1": macro_f1,
        "boundary_precision": float(np.mean(b_p)),
        "boundary_recall": float(np.mean(b_r)),
        "boundary_f1": float(np.mean(b_f)),
        "per_class_f1": {n: float(per_class_f1[i]) for i, n in enumerate(class_names)},
        "cm": cm.tolist(),
    }


def decoder_plain(probs, class_names, hop):
    """argmax + merge (no Viterbi, no priors)."""
    from musicml.postprocess import merge_segments, smooth_predictions

    preds = np.argmax(probs, axis=1)
    preds = smooth_predictions(preds, 5)
    max_probs = probs.max(axis=1)
    return merge_segments(
        preds, max_probs, hop_seconds=hop, min_duration=4.0, class_names=class_names
    )


def decoder_current(probs, class_names, hop):
    """Current production decoder: Viterbi + position priors."""
    from musicml.postprocess import decode_segment_head

    return decode_segment_head(
        probs,
        class_names=class_names,
        hop_seconds=hop,
        use_viterbi=True,
        transition_penalty=1.0,
        use_position_priors=True,
        median_kernel=5,
        min_duration=6.0,
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ckpt", default="checkpoints/best.pt")
    parser.add_argument("--cfg", default="configs/default.yaml")
    parser.add_argument("--splits", default="data/structure/splits.json")
    parser.add_argument(
        "--feat-dir", default="data/structure/features"
    )
    parser.add_argument(
        "--ann-dir", default="data/structure/annotations"
    )
    parser.add_argument(
        "--stats", default="data/structure/features/stats.npz"
    )
    parser.add_argument("--limit", type=int, default=0, help="0 = all")
    parser.add_argument("--tolerance", type=float, default=3.0)
    parser.add_argument(
        "--split", default="test", choices=["train", "val", "test"]
    )
    parser.add_argument(
        "--output", default="results/bench_segmentation.json"
    )
    parser.add_argument(
        "--strategies",
        default="plain,current,improved",
        help="Comma-separated: plain, current, improved",
    )
    args = parser.parse_args()

    import torch

    from musicml.models import CNNMultiTask

    cfg = load_cfg(args.cfg)
    device = "cuda" if torch.cuda.is_available() else "cpu"

    print(f"Loading model from {args.ckpt} on {device}...")
    model = CNNMultiTask(**cfg["model"])
    ck = torch.load(args.ckpt, map_location=device, weights_only=False)
    model.load_state_dict(ck["model_state_dict"], strict=False)
    model.to(device).eval()

    with open(args.splits) as f:
        splits = json.load(f)
    track_ids = splits[args.split]
    if args.limit > 0:
        track_ids = track_ids[: args.limit]
    print(f"Evaluating on {len(track_ids)} tracks (split={args.split}).")

    feat_dir = Path(args.feat_dir)
    ann_dir = Path(args.ann_dir)
    stats = np.load(args.stats) if Path(args.stats).exists() else None
    if stats is not None:
        print(f"Using stats from {args.stats}")

    segment_classes: list[str] = cfg.get(
        "segment_classes",
        ["Intro", "Verse", "Bridge", "Chorus", "Instrumental", "Outro"],
    )
    hop_seconds: float = float(cfg["windowing"]["hop_seconds"])

    all_probs_list: list[np.ndarray] = []
    gt_frames_list: list[np.ndarray] = []
    audio_feats_list: list[np.ndarray] = []
    used_ids: list[str] = []
    feature_hop_seconds: float | None = None

    for i, tid in enumerate(track_ids):
        feat_path = feat_dir / f"{tid}.npz"
        if not feat_path.exists():
            continue
        ann_path = None
        for ext in (".txt", ".tsv"):
            p = ann_dir / f"{tid}{ext}"
            if p.exists():
                ann_path = p
                break
        if ann_path is None:
            continue

        try:
            probs, raw_feats, feat_hop = run_model_on_track(
                model, feat_path, stats, cfg, device, return_features=True,
            )
            feature_hop_seconds = feat_hop
        except Exception as ex:
            print(f"[skip {tid}] {ex}")
            continue

        intervals = parse_annotations_gt(ann_path, segment_classes)
        if not intervals:
            continue

        gt_frames = frames_from_intervals(
            intervals, segment_classes, n_frames=probs.shape[0],
            hop_seconds=hop_seconds,
        )
        all_probs_list.append(probs)
        gt_frames_list.append(gt_frames)
        audio_feats_list.append(raw_feats)
        used_ids.append(tid)

        if (i + 1) % 10 == 0:
            print(f"  processed {i + 1}/{len(track_ids)}")

    print(f"Collected predictions for {len(used_ids)} tracks.")

    # Pre-load improved decoder lazily (may not exist yet)
    strategy_map = {}
    needs_audio_map: dict[str, bool] = {}

    for s in args.strategies.split(","):
        s = s.strip()
        if s == "plain":
            strategy_map["plain"] = decoder_plain
            needs_audio_map["plain"] = False
        elif s == "current":
            strategy_map["current"] = decoder_current
            needs_audio_map["current"] = False
        elif s == "improved":
            try:
                from musicml.postprocess import decode_segment_head_v2  # type: ignore

                def _imp(probs, class_names, hop):
                    return decode_segment_head_v2(
                        probs, class_names=class_names, hop_seconds=hop,
                    )

                strategy_map["improved"] = _imp
                needs_audio_map["improved"] = False
            except ImportError:
                print("decode_segment_head_v2 not found - skipping 'improved'.")
        elif s == "improved_audio":
            from musicml.postprocess import decode_segment_head_v2  # type: ignore

            def _imp_audio(probs, class_names, hop, *, audio, feat_hop):
                return decode_segment_head_v2(
                    probs, class_names=class_names, hop_seconds=hop,
                    audio_features=audio,
                    feature_hop_seconds=feat_hop,
                )

            strategy_map["improved_audio"] = _imp_audio
            needs_audio_map["improved_audio"] = True

    results = {}
    for name, fn in strategy_map.items():
        print(f"\n=== Strategy: {name} ===")
        kwargs: dict = {"tolerance": args.tolerance}
        if needs_audio_map.get(name):
            kwargs["audio_feats_list"] = audio_feats_list
            kwargs["feature_hop_seconds"] = feature_hop_seconds
        r = eval_strategy(
            all_probs_list,
            gt_frames_list,
            segment_classes,
            hop_seconds,
            fn,
            **kwargs,
        )
        results[name] = r
        print(f"  frame_accuracy    : {r['frame_accuracy']:.4f}")
        print(f"  frame_macro_f1    : {r['frame_macro_f1']:.4f}")
        print(f"  boundary_precision: {r['boundary_precision']:.4f}")
        print(f"  boundary_recall   : {r['boundary_recall']:.4f}")
        print(f"  boundary_f1       : {r['boundary_f1']:.4f}")
        print("  per-class F1:")
        for c, v in r["per_class_f1"].items():
            print(f"    {c:14s} {v:.4f}")

    # Summary diff
    if len(results) >= 2:
        print("\n=== Delta vs 'current' ===")
        base = results.get("current")
        if base is not None:
            for name, r in results.items():
                if name == "current":
                    continue
                print(
                    f"  {name:10s}  "
                    f"d_acc={r['frame_accuracy'] - base['frame_accuracy']:+.4f}  "
                    f"d_mf1={r['frame_macro_f1'] - base['frame_macro_f1']:+.4f}  "
                    f"d_bf1={r['boundary_f1'] - base['boundary_f1']:+.4f}"
                )

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(
            {"tracks": used_ids, "tolerance": args.tolerance, "results": results},
            f, indent=2,
        )
    print(f"\nSaved -> {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
