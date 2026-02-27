"""Evaluate model: compute metrics on test set.

Usage:
    python scripts/eval.py --ckpt checkpoints/best.pt \
        --config configs/default.yaml \
        --deam-dir data/deam --structure-dir data/structure \
        --output results/metrics.csv --plot-dir results/plots
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from musicml.evaluate import (
    evaluate_all_heads,
    metrics_to_csv,
    plot_confusion_matrix,
)
from musicml.infer import load_model
from musicml.utils import load_config


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate model on test set")
    parser.add_argument("--ckpt", required=True, help="Model checkpoint path")
    parser.add_argument(
        "--config", default="configs/default.yaml", help="Config file path"
    )
    parser.add_argument(
        "--output", default="results/metrics.csv", help="Output metrics CSV"
    )
    parser.add_argument("--deam-dir", default=None, help="DEAM data directory")
    parser.add_argument(
        "--structure-dir", default=None, help="Structure data directory"
    )
    parser.add_argument(
        "--plot-dir", default=None, help="Directory for confusion matrix plots"
    )
    args = parser.parse_args()

    cfg = load_config(args.config)
    device = "cpu"
    try:
        from musicml.utils import get_device

        device = get_device()
    except Exception:
        pass

    print(f"Device: {device}")
    model = load_model(args.ckpt, cfg["model"], device=device)

    deam_dataset = None
    structure_dataset = None

    audio_cfg = cfg["audio"]
    feat_cfg = cfg["features"]
    win_cfg = cfg["windowing"]

    if args.deam_dir:
        from musicml.datasets.deam import DEAMDataset

        deam_dir = Path(args.deam_dir)
        splits_path = deam_dir / "splits.json"
        with open(splits_path) as f:
            deam_splits = json.load(f)

        feature_cache = deam_dir / "features"
        cache_dir = feature_cache if feature_cache.exists() else None

        deam_dataset = DEAMDataset(
            annotations_csv=deam_dir / "annotations.csv",
            thresholds_json=Path("configs") / "thresholds.json",
            feature_cache_dir=cache_dir,
            track_ids=deam_splits["test"],
            sr=audio_cfg["sr"],
            hop_length=feat_cfg["hop_length"],
            n_mels=feat_cfg["n_mels"],
            window_seconds=win_cfg["window_seconds"],
            hop_seconds=win_cfg["hop_seconds"],
        )
        print(f"DEAM test set: {len(deam_dataset)} samples")

    if args.structure_dir:
        from musicml.datasets.structure import StructureDataset

        structure_dir = Path(args.structure_dir)
        splits_path = structure_dir / "splits.json"
        with open(splits_path) as f:
            struct_splits = json.load(f)

        annotations_dir = structure_dir / "annotations"
        feature_cache = structure_dir / "features"
        cache_dir = feature_cache if feature_cache.exists() else None

        structure_dataset = StructureDataset(
            annotations_dir=annotations_dir,
            feature_cache_dir=cache_dir,
            track_ids=struct_splits["test"],
            sr=audio_cfg["sr"],
            hop_length=feat_cfg["hop_length"],
            n_mels=feat_cfg["n_mels"],
            window_seconds=win_cfg["window_seconds"],
            hop_seconds=win_cfg["hop_seconds"],
        )
        print(f"Structure test set: {len(structure_dataset)} samples")

    if deam_dataset is None and structure_dataset is None:
        raise ValueError(
            "No datasets provided. Use --deam-dir and/or --structure-dir"
        )

    print("\nEvaluating...")
    all_metrics = evaluate_all_heads(
        model, deam_dataset, structure_dataset, cfg, device,
    )

    metrics_to_csv(all_metrics, args.output)
    print(f"\nMetrics saved to {args.output}")

    class_names_map = {
        "segment": cfg.get("segment_classes", ["Calm", "Build-up", "Climax", "Outro"]),
        "arousal": cfg.get("arousal_classes", ["Low", "Mid", "High"]),
        "valence": cfg.get("valence_classes", ["Dark", "Neutral", "Bright"]),
    }

    if args.plot_dir:
        plot_dir = Path(args.plot_dir)
        plot_dir.mkdir(parents=True, exist_ok=True)
        for head_name, metrics in all_metrics.items():
            cm = metrics["confusion_matrix"]
            names = class_names_map[head_name]
            plot_path = plot_dir / f"cm_{head_name}.png"
            title = f"Confusion Matrix: {head_name}"
            plot_confusion_matrix(cm, names, title, plot_path)
            print(f"Confusion matrix plot: {plot_path}")

    print("\n=== Summary ===")
    for head_name, metrics in all_metrics.items():
        print(
            f"  {head_name}: accuracy={metrics['accuracy']:.4f}, "
            f"macro_f1={metrics['macro_f1']:.4f}"
        )


if __name__ == "__main__":
    main()
