"""Train the multi-task CNN model.

Usage:
    python scripts/train.py --config configs/default.yaml \
        --deam-dir data/deam --structure-dir data/structure \
        --output-dir checkpoints [--resume checkpoints/last.pt]
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

import torch
import torch.nn as nn

from musicml.datasets.multitask import RoundRobinLoader, collate_multitask
from musicml.models import CNNMultiTask
from musicml.train import (
    load_checkpoint,
    save_checkpoint,
    train_epoch,
    validate,
)
from musicml.utils import get_device, load_config, set_seed


def compute_class_weights(
    labels: list[int], n_classes: int,
) -> torch.Tensor:
    """Compute inverse-frequency class weights.

    weight[c] = N_total / (N_classes * N_c)
    """
    counter = Counter(labels)
    total = len(labels)
    weights = []
    for c in range(n_classes):
        count = counter.get(c, 0)
        if count > 0:
            weights.append(total / (n_classes * count))
        else:
            weights.append(1.0)
    return torch.tensor(weights, dtype=torch.float32)


def build_loaders(
    cfg: dict,
    deam_dir: Path | None,
    structure_dir: Path | None,
    num_workers: int = 0,
) -> tuple:
    """Build train and val DataLoaders.

    Returns (train_loader, val_loader, class_labels) where class_labels
    is a dict with per-head label lists from train datasets.
    """
    train_loaders = []
    val_loaders = []
    batch_size = cfg["training"]["batch_size"]
    window_sec = cfg["windowing"]["window_seconds"]
    hop_sec = cfg["windowing"]["hop_seconds"]
    audio_cfg = cfg["audio"]
    feat_cfg = cfg["features"]

    class_labels: dict[str, list[int]] = {
        "segment": [], "arousal": [], "valence": [],
    }

    if deam_dir is not None:
        from musicml.datasets.deam import DEAMDataset

        splits_path = deam_dir / "splits.json"
        with open(splits_path) as f:
            deam_splits = json.load(f)

        thresholds_path = Path("configs") / "thresholds.json"
        csv_path = deam_dir / "annotations.csv"
        feature_cache = deam_dir / "features"
        cache_dir = feature_cache if feature_cache.exists() else None

        # Check for stats file
        stats_path = deam_dir / "features" / "stats.npz"
        stats = stats_path if stats_path.exists() else None

        deam_train = DEAMDataset(
            annotations_csv=csv_path,
            thresholds_json=thresholds_path,
            audio_dir=deam_dir / "audio",
            feature_cache_dir=cache_dir,
            track_ids=deam_splits["train"],
            sr=audio_cfg["sr"],
            hop_length=feat_cfg["hop_length"],
            n_mels=feat_cfg["n_mels"],
            window_seconds=window_sec,
            hop_seconds=hop_sec,
            training=True,
            stats_path=stats,
        )
        deam_val = DEAMDataset(
            annotations_csv=csv_path,
            thresholds_json=thresholds_path,
            audio_dir=deam_dir / "audio",
            feature_cache_dir=cache_dir,
            track_ids=deam_splits["val"],
            sr=audio_cfg["sr"],
            hop_length=feat_cfg["hop_length"],
            n_mels=feat_cfg["n_mels"],
            window_seconds=window_sec,
            hop_seconds=hop_sec,
            training=False,
            stats_path=stats,
        )

        # Collect class labels for weight computation
        for s in deam_train.samples:
            class_labels["arousal"].append(s["y_ar"])
            class_labels["valence"].append(s["y_val"])

        train_loaders.append(
            torch.utils.data.DataLoader(
                deam_train, batch_size=batch_size, shuffle=True,
                collate_fn=collate_multitask,
                num_workers=num_workers, persistent_workers=num_workers > 0,
                prefetch_factor=2 if num_workers > 0 else None,
            )
        )
        val_loaders.append(
            torch.utils.data.DataLoader(
                deam_val, batch_size=batch_size, shuffle=False,
                collate_fn=collate_multitask,
                num_workers=num_workers, persistent_workers=num_workers > 0,
                prefetch_factor=2 if num_workers > 0 else None,
            )
        )
        print(f"  DEAM: train={len(deam_train)}, val={len(deam_val)}")

    if structure_dir is not None:
        from musicml.datasets.structure import StructureDataset

        splits_path = structure_dir / "splits.json"
        with open(splits_path) as f:
            struct_splits = json.load(f)

        annotations_dir = structure_dir / "annotations"
        feature_cache = structure_dir / "features"
        cache_dir = feature_cache if feature_cache.exists() else None

        # Check for stats file
        stats_path = structure_dir / "features" / "stats.npz"
        stats = stats_path if stats_path.exists() else None

        struct_train = StructureDataset(
            annotations_dir=annotations_dir,
            audio_dir=structure_dir / "audio",
            feature_cache_dir=cache_dir,
            track_ids=struct_splits["train"],
            sr=audio_cfg["sr"],
            hop_length=feat_cfg["hop_length"],
            n_mels=feat_cfg["n_mels"],
            window_seconds=window_sec,
            hop_seconds=hop_sec,
            training=True,
            stats_path=stats,
        )
        struct_val = StructureDataset(
            annotations_dir=annotations_dir,
            audio_dir=structure_dir / "audio",
            feature_cache_dir=cache_dir,
            track_ids=struct_splits["val"],
            sr=audio_cfg["sr"],
            hop_length=feat_cfg["hop_length"],
            n_mels=feat_cfg["n_mels"],
            window_seconds=window_sec,
            hop_seconds=hop_sec,
            training=False,
            stats_path=stats,
        )

        # Collect class labels for weight computation
        for s in struct_train.samples:
            class_labels["segment"].append(s["y_seg"])

        train_loaders.append(
            torch.utils.data.DataLoader(
                struct_train, batch_size=batch_size, shuffle=True,
                collate_fn=collate_multitask,
                num_workers=num_workers, persistent_workers=num_workers > 0,
                prefetch_factor=2 if num_workers > 0 else None,
            )
        )
        val_loaders.append(
            torch.utils.data.DataLoader(
                struct_val, batch_size=batch_size, shuffle=False,
                collate_fn=collate_multitask,
                num_workers=num_workers, persistent_workers=num_workers > 0,
                prefetch_factor=2 if num_workers > 0 else None,
            )
        )
        print(f"  Structure: train={len(struct_train)}, val={len(struct_val)}")

    if not train_loaders:
        raise ValueError("No datasets provided. Use --deam-dir and/or --structure-dir")

    train_loader = RoundRobinLoader(*train_loaders)
    val_loader = RoundRobinLoader(*val_loaders)

    return train_loader, val_loader, class_labels


def build_criterions(
    class_labels: dict[str, list[int]],
    model_cfg: dict,
    device: str,
) -> dict[str, nn.Module]:
    """Build per-head weighted CrossEntropyLoss criterions."""
    head_configs = {
        "segment": model_cfg.get("n_segment_classes", 4),
        "arousal": model_cfg.get("n_arousal_classes", 3),
        "valence": model_cfg.get("n_valence_classes", 3),
    }
    criterions: dict[str, nn.Module] = {}

    for head, n_classes in head_configs.items():
        labels = class_labels.get(head, [])
        if labels:
            weights = compute_class_weights(labels, n_classes).to(device)
            print(f"  {head} class weights: {weights.tolist()}")
            criterions[head] = nn.CrossEntropyLoss(
                weight=weights, label_smoothing=0.1, ignore_index=-1,
            )
        else:
            criterions[head] = nn.CrossEntropyLoss(
                label_smoothing=0.1, ignore_index=-1,
            )

    return criterions


def main() -> None:
    parser = argparse.ArgumentParser(description="Train multi-task CNN")
    parser.add_argument(
        "--config", default="configs/default.yaml", help="Config file path",
    )
    parser.add_argument("--deam-dir", default=None, help="DEAM data directory")
    parser.add_argument(
        "--structure-dir", default=None, help="Structure data directory",
    )
    parser.add_argument(
        "--output-dir", default="checkpoints", help="Output directory for checkpoints",
    )
    parser.add_argument("--resume", default=None, help="Checkpoint to resume from")
    parser.add_argument(
        "--num-workers", type=int, default=0,
        help="DataLoader workers (0 is optimal for MPS/unified memory)",
    )
    args = parser.parse_args()

    cfg = load_config(args.config)
    seed = cfg["training"]["seed"]
    set_seed(seed)
    device = get_device()
    print(f"Device: {device}, Seed: {seed}")

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    deam_dir = Path(args.deam_dir) if args.deam_dir else None
    structure_dir = Path(args.structure_dir) if args.structure_dir else None

    print("Building datasets...")
    train_loader, val_loader, class_labels = build_loaders(
        cfg, deam_dir, structure_dir, num_workers=args.num_workers,
    )

    model = CNNMultiTask(**cfg["model"]).to(device)
    print(f"Model parameters: {model.count_params():,}")

    if device == "cuda":
        torch.set_float32_matmul_precision("medium")
        if hasattr(torch, "compile"):
            try:
                model = torch.compile(model)
                print("torch.compile enabled")
            except Exception as e:
                print(f"torch.compile skipped: {e}")

    lr = cfg["training"]["lr"]
    weight_decay = cfg["training"]["weight_decay"]
    epochs = cfg["training"]["epochs"]
    patience = cfg["training"]["early_stopping_patience"]

    optimizer = torch.optim.AdamW(
        model.parameters(), lr=lr, weight_decay=weight_decay,
    )
    scheduler = torch.optim.lr_scheduler.OneCycleLR(
        optimizer,
        max_lr=lr * 3,
        epochs=epochs,
        steps_per_epoch=len(train_loader),
        pct_start=0.3,
        div_factor=25,
        final_div_factor=1e4,
    )

    print("Building per-head weighted criterions...")
    criterions = build_criterions(class_labels, cfg["model"], device)
    loss_weights = cfg["loss_weights"]

    start_epoch = 0
    if args.resume:
        print(f"Resuming from {args.resume}...")
        start_epoch = load_checkpoint(args.resume, model, optimizer, scheduler) + 1
        print(f"  Resumed at epoch {start_epoch}")

    best_val_loss = float("inf")
    epochs_no_improve = 0

    for epoch in range(start_epoch, epochs):
        train_metrics = train_epoch(
            model, train_loader, optimizer, criterions, loss_weights, device,
            scheduler=scheduler,
        )
        val_metrics = validate(model, val_loader, criterions, loss_weights, device)

        lr_now = optimizer.param_groups[0]["lr"]
        print(
            f"Epoch {epoch + 1}/{epochs} | "
            f"train_loss={train_metrics['loss']:.4f} | "
            f"val_loss={val_metrics['loss']:.4f} | "
            f"lr={lr_now:.6f}"
        )

        for head in ("segment", "arousal", "valence"):
            t_acc = train_metrics.get(f"acc_{head}")
            v_acc = val_metrics.get(f"acc_{head}")
            t_str = f"{t_acc:.3f}" if t_acc is not None else "n/a"
            v_str = f"{v_acc:.3f}" if v_acc is not None else "n/a"
            print(f"  {head}: train_acc={t_str}, val_acc={v_str}")

        save_checkpoint(
            model, optimizer, scheduler, epoch, val_metrics,
            output_dir / "last.pt",
        )

        if val_metrics["loss"] < best_val_loss:
            best_val_loss = val_metrics["loss"]
            epochs_no_improve = 0
            save_checkpoint(
                model, optimizer, scheduler, epoch, val_metrics,
                output_dir / "best.pt",
            )
            print(f"  * New best val_loss={best_val_loss:.4f}")
        else:
            epochs_no_improve += 1
            if epochs_no_improve >= patience:
                print(f"  Early stopping after {patience} epochs without improvement")
                break

    print(f"\nTraining complete. Best val_loss={best_val_loss:.4f}")


if __name__ == "__main__":
    main()
