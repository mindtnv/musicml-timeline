"""Train the multi-task CNN model.

Usage:
    python scripts/train.py --config configs/default.yaml \
        --deam-dir data/deam --structure-dir data/structure \
        --output-dir checkpoints [--resume checkpoints/last.pt]
"""

from __future__ import annotations

import argparse
import json
import time
from collections import Counter
from pathlib import Path

import torch
import torch.nn as nn
from tqdm import tqdm

from musicml.datasets.multitask import (
    RoundRobinLoader,
    collate_multitask,
    collate_sequences,
)
from musicml.models import CNNMultiTask, LinearMultiTask, LSTMMultiTask
from musicml.train import (
    FocalLoss,
    load_checkpoint,
    save_checkpoint,
    train_epoch,
    validate,
)
from musicml.utils import get_device, load_config, set_seed


class ProgressLoader:
    """Wraps a DataLoader/RoundRobinLoader with a tqdm progress bar."""

    def __init__(self, loader, **tqdm_kwargs):
        self.loader = loader
        self.tqdm_kwargs = tqdm_kwargs

    def __len__(self):
        return len(self.loader)

    def __iter__(self):
        yield from tqdm(self.loader, **self.tqdm_kwargs)


def compute_class_weights(
    labels: list[int], n_classes: int,
    max_weight: float | None = 4.0,
) -> torch.Tensor:
    """Compute inverse-frequency class weights, capped at max_weight.

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
    weights_t = torch.tensor(weights, dtype=torch.float32)
    if max_weight is not None:
        weights_t = weights_t.clamp(max=max_weight)
    return weights_t


def build_loaders(
    cfg: dict,
    deam_dir: Path | None,
    structure_dir: Path | None,
    gtzan_dir: Path | None = None,
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
    spec_aug_cfg = cfg.get("spec_augment")

    class_labels: dict[str, list[int]] = {
        "segment": [], "arousal": [], "valence": [], "genre": [],
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
            spec_augment=spec_aug_cfg,
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
            spec_augment=spec_aug_cfg,
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

    if gtzan_dir is not None:
        from musicml.datasets.gtzan import GTZANDataset

        splits_path = gtzan_dir / "splits.json"
        with open(splits_path) as f:
            gtzan_splits = json.load(f)

        genre_map_path = gtzan_dir / "genre_map.json"
        feature_cache = gtzan_dir / "features"
        cache_dir = feature_cache if feature_cache.exists() else None

        stats_path = gtzan_dir / "features" / "stats.npz"
        stats = stats_path if stats_path.exists() else None

        gtzan_train = GTZANDataset(
            genre_map_json=genre_map_path,
            feature_cache_dir=cache_dir,
            track_ids=gtzan_splits["train"],
            sr=audio_cfg["sr"],
            hop_length=feat_cfg["hop_length"],
            n_mels=feat_cfg["n_mels"],
            window_seconds=window_sec,
            hop_seconds=hop_sec,
            training=True,
            stats_path=stats,
            spec_augment=spec_aug_cfg,
        )
        gtzan_val = GTZANDataset(
            genre_map_json=genre_map_path,
            feature_cache_dir=cache_dir,
            track_ids=gtzan_splits["val"],
            sr=audio_cfg["sr"],
            hop_length=feat_cfg["hop_length"],
            n_mels=feat_cfg["n_mels"],
            window_seconds=window_sec,
            hop_seconds=hop_sec,
            training=False,
            stats_path=stats,
        )

        for s in gtzan_train.samples:
            class_labels["genre"].append(s["y_genre"])

        train_loaders.append(
            torch.utils.data.DataLoader(
                gtzan_train, batch_size=batch_size, shuffle=True,
                collate_fn=collate_multitask,
                num_workers=num_workers, persistent_workers=num_workers > 0,
                prefetch_factor=2 if num_workers > 0 else None,
            )
        )
        val_loaders.append(
            torch.utils.data.DataLoader(
                gtzan_val, batch_size=batch_size, shuffle=False,
                collate_fn=collate_multitask,
                num_workers=num_workers, persistent_workers=num_workers > 0,
                prefetch_factor=2 if num_workers > 0 else None,
            )
        )
        print(f"  GTZAN: train={len(gtzan_train)}, val={len(gtzan_val)}")

    if not train_loaders:
        raise ValueError("No datasets provided. Use --deam-dir and/or --structure-dir")

    train_loader = RoundRobinLoader(*train_loaders)
    val_loader = RoundRobinLoader(*val_loaders)

    return train_loader, val_loader, class_labels


def build_embedding_loaders(
    cfg: dict,
    deam_dir: Path | None,
    structure_dir: Path | None,
    gtzan_dir: Path | None = None,
    num_workers: int = 0,
) -> tuple:
    """Build train and val DataLoaders from precomputed embeddings.

    Reads ``cfg["embedding_source"]`` for the subfolder name (e.g.
    ``cnn_embeddings`` or ``panns_embeddings``) and ``cfg["sequence_mode"]``
    to decide per-window vs sequence datasets.

    Returns (train_loader, val_loader, class_labels).
    """
    from musicml.datasets.embeddings import (
        DEAMEmbeddingDataset,
        GTZANEmbeddingDataset,
        StructureEmbeddingDataset,
    )

    emb_source = cfg["embedding_source"]
    seq_mode = cfg.get("sequence_mode", False)
    batch_size = cfg["training"]["batch_size"]
    hop_sec = cfg["windowing"]["hop_seconds"]
    win_sec = cfg["windowing"]["window_seconds"]
    collate_fn = collate_sequences if seq_mode else collate_multitask

    train_loaders = []
    val_loaders = []
    class_labels: dict[str, list[int]] = {
        "segment": [], "arousal": [], "valence": [], "genre": [],
    }

    if deam_dir is not None:
        splits_path = deam_dir / "splits.json"
        with open(splits_path) as f:
            deam_splits = json.load(f)

        thresholds_path = Path("configs") / "thresholds.json"
        csv_path = deam_dir / "annotations.csv"
        emb_dir = deam_dir / emb_source

        deam_train = DEAMEmbeddingDataset(
            embedding_dir=emb_dir,
            annotations_csv=csv_path,
            thresholds_json=thresholds_path,
            track_ids=deam_splits["train"],
            hop_seconds=hop_sec,
            window_seconds=win_sec,
            sequence_mode=seq_mode,
        )
        deam_val = DEAMEmbeddingDataset(
            embedding_dir=emb_dir,
            annotations_csv=csv_path,
            thresholds_json=thresholds_path,
            track_ids=deam_splits["val"],
            hop_seconds=hop_sec,
            window_seconds=win_sec,
            sequence_mode=seq_mode,
        )

        # Collect class labels
        class_labels["arousal"].extend(deam_train.get_all_labels("y_ar"))
        class_labels["valence"].extend(deam_train.get_all_labels("y_val"))

        train_loaders.append(
            torch.utils.data.DataLoader(
                deam_train, batch_size=batch_size, shuffle=True,
                collate_fn=collate_fn,
                num_workers=num_workers,
                persistent_workers=num_workers > 0,
                prefetch_factor=2 if num_workers > 0 else None,
            ),
        )
        val_loaders.append(
            torch.utils.data.DataLoader(
                deam_val, batch_size=batch_size, shuffle=False,
                collate_fn=collate_fn,
                num_workers=num_workers,
                persistent_workers=num_workers > 0,
                prefetch_factor=2 if num_workers > 0 else None,
            ),
        )
        print(f"  DEAM (emb): train={len(deam_train)}, val={len(deam_val)}")

    if structure_dir is not None:
        splits_path = structure_dir / "splits.json"
        with open(splits_path) as f:
            struct_splits = json.load(f)

        annotations_dir = structure_dir / "annotations"
        emb_dir = structure_dir / emb_source

        struct_train = StructureEmbeddingDataset(
            embedding_dir=emb_dir,
            annotations_dir=annotations_dir,
            track_ids=struct_splits["train"],
            hop_seconds=hop_sec,
            window_seconds=win_sec,
            sequence_mode=seq_mode,
        )
        struct_val = StructureEmbeddingDataset(
            embedding_dir=emb_dir,
            annotations_dir=annotations_dir,
            track_ids=struct_splits["val"],
            hop_seconds=hop_sec,
            window_seconds=win_sec,
            sequence_mode=seq_mode,
        )

        class_labels["segment"].extend(struct_train.get_all_labels("y_seg"))

        train_loaders.append(
            torch.utils.data.DataLoader(
                struct_train, batch_size=batch_size, shuffle=True,
                collate_fn=collate_fn,
                num_workers=num_workers,
                persistent_workers=num_workers > 0,
                prefetch_factor=2 if num_workers > 0 else None,
            ),
        )
        val_loaders.append(
            torch.utils.data.DataLoader(
                struct_val, batch_size=batch_size, shuffle=False,
                collate_fn=collate_fn,
                num_workers=num_workers,
                persistent_workers=num_workers > 0,
                prefetch_factor=2 if num_workers > 0 else None,
            ),
        )
        print(f"  Structure (emb): train={len(struct_train)}, val={len(struct_val)}")

    if gtzan_dir is not None:
        splits_path = gtzan_dir / "splits.json"
        with open(splits_path) as f:
            gtzan_splits = json.load(f)

        genre_map_path = gtzan_dir / "genre_map.json"
        emb_dir = gtzan_dir / emb_source

        gtzan_train = GTZANEmbeddingDataset(
            embedding_dir=emb_dir,
            genre_map_json=genre_map_path,
            track_ids=gtzan_splits["train"],
            hop_seconds=hop_sec,
            window_seconds=win_sec,
            sequence_mode=seq_mode,
        )
        gtzan_val = GTZANEmbeddingDataset(
            embedding_dir=emb_dir,
            genre_map_json=genre_map_path,
            track_ids=gtzan_splits["val"],
            hop_seconds=hop_sec,
            window_seconds=win_sec,
            sequence_mode=seq_mode,
        )

        class_labels["genre"].extend(gtzan_train.get_all_labels("y_genre"))

        train_loaders.append(
            torch.utils.data.DataLoader(
                gtzan_train, batch_size=batch_size, shuffle=True,
                collate_fn=collate_fn,
                num_workers=num_workers,
                persistent_workers=num_workers > 0,
                prefetch_factor=2 if num_workers > 0 else None,
            ),
        )
        val_loaders.append(
            torch.utils.data.DataLoader(
                gtzan_val, batch_size=batch_size, shuffle=False,
                collate_fn=collate_fn,
                num_workers=num_workers,
                persistent_workers=num_workers > 0,
                prefetch_factor=2 if num_workers > 0 else None,
            ),
        )
        print(f"  GTZAN (emb): train={len(gtzan_train)}, val={len(gtzan_val)}")

    if not train_loaders:
        raise ValueError("No datasets provided.")

    train_loader = RoundRobinLoader(*train_loaders)
    val_loader = RoundRobinLoader(*val_loaders)

    return train_loader, val_loader, class_labels


def build_criterions(
    class_labels: dict[str, list[int]],
    model_cfg: dict,
    training_cfg: dict,
    device: str,
    max_class_weight: float | None = 4.0,
) -> dict[str, nn.Module]:
    """Build per-head loss functions and regression criterions."""
    loss_type = training_cfg.get("loss_type", "cross_entropy")
    focal_gamma = training_cfg.get("focal_gamma", 2.0)

    head_configs = {
        "segment": (model_cfg.get("n_segment_classes", 4), "segment"),
        "arousal_cls": (model_cfg.get("n_arousal_classes", 3), "arousal"),
        "valence_cls": (model_cfg.get("n_valence_classes", 3), "valence"),
    }
    n_genre = model_cfg.get("n_genre_classes", 0)
    if n_genre > 0:
        head_configs["genre"] = (n_genre, "genre")
    criterions: dict[str, nn.Module] = {}

    for head_key, (n_classes, label_group) in head_configs.items():
        labels = class_labels.get(label_group, [])
        weights = None
        if labels:
            weights = compute_class_weights(
                labels, n_classes, max_weight=max_class_weight,
            ).to(device)
            print(f"  {head_key} class weights: {weights.tolist()}")

        if loss_type == "focal":
            criterions[head_key] = FocalLoss(
                weight=weights,
                gamma=focal_gamma,
                label_smoothing=0.1,
                ignore_index=-1,
            )
        else:
            criterions[head_key] = nn.CrossEntropyLoss(
                weight=weights, label_smoothing=0.1, ignore_index=-1,
            )

    # Regression criterions
    if model_cfg.get("enable_regression", False):
        criterions["arousal_reg"] = nn.SmoothL1Loss()
        criterions["valence_reg"] = nn.SmoothL1Loss()

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
    parser.add_argument("--gtzan-dir", default=None, help="GTZAN data directory")
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
    gtzan_dir = Path(args.gtzan_dir) if args.gtzan_dir else None

    arch = cfg.get("architecture", "cnn")
    print(f"Architecture: {arch}")
    print("Building datasets...")

    if arch in ("cnn", "ast"):
        train_loader, val_loader, class_labels = build_loaders(
            cfg, deam_dir, structure_dir, gtzan_dir, num_workers=args.num_workers,
        )
        if arch == "cnn":
            model = CNNMultiTask(**cfg["model"]).to(device)
        else:
            from musicml.models.ast_multitask import ASTMultiTask
            model = ASTMultiTask(**cfg["model"]).to(device)
    elif arch in ("cnn_lstm", "panns_lstm"):
        train_loader, val_loader, class_labels = build_embedding_loaders(
            cfg, deam_dir, structure_dir, gtzan_dir, num_workers=args.num_workers,
        )
        model = LSTMMultiTask(**cfg["model"]).to(device)
    elif arch == "panns_linear":
        train_loader, val_loader, class_labels = build_embedding_loaders(
            cfg, deam_dir, structure_dir, gtzan_dir, num_workers=args.num_workers,
        )
        model = LinearMultiTask(**cfg["model"]).to(device)
    else:
        raise ValueError(f"Unknown architecture: {arch}")

    print(f"Model parameters: {model.count_params():,}")

    if device == "cuda":
        torch.backends.cudnn.benchmark = True
        torch.set_float32_matmul_precision("medium")
        import sys
        if sys.platform != "win32" and hasattr(torch, "compile"):
            try:
                model = torch.compile(model)
                print("torch.compile enabled")
            except Exception as e:
                print(f"torch.compile skipped: {e}")
        else:
            print("torch.compile skipped (Windows — Triton not supported)")

    lr = cfg["training"]["lr"]
    weight_decay = cfg["training"]["weight_decay"]
    epochs = cfg["training"]["epochs"]
    patience = cfg["training"]["early_stopping_patience"]

    # Differential learning rate for pretrained models (AST)
    lr_head = cfg["training"].get("lr_head", None)
    if lr_head is not None and hasattr(model, "get_param_groups"):
        param_groups = model.get_param_groups(lr_backbone=lr, lr_head=lr_head)
        optimizer = torch.optim.AdamW(param_groups, weight_decay=weight_decay)
    else:
        optimizer = torch.optim.AdamW(
            model.parameters(), lr=lr, weight_decay=weight_decay,
        )

    scheduler_type = cfg["training"].get("scheduler", "cosine")
    step_scheduler_per_batch = False
    if scheduler_type == "onecycle":
        total_steps = len(train_loader) * epochs
        scheduler = torch.optim.lr_scheduler.OneCycleLR(
            optimizer,
            max_lr=lr,
            total_steps=total_steps,
            pct_start=0.3,
            anneal_strategy="cos",
            div_factor=25.0,
            final_div_factor=1e4,
        )
        step_scheduler_per_batch = True
    elif scheduler_type == "cosine_warm_restarts":
        scheduler = torch.optim.lr_scheduler.CosineAnnealingWarmRestarts(
            optimizer, T_0=10, T_mult=2, eta_min=1e-6,
        )
    else:
        scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
            optimizer, T_max=epochs, eta_min=1e-6,
        )

    loss_type = cfg["training"].get("loss_type", "cross_entropy")
    print(f"Building per-head criterions (loss={loss_type})...")
    max_cw = cfg["training"].get("max_class_weight", 4.0)
    criterions = build_criterions(
        class_labels, cfg["model"], cfg["training"], device, max_cw,
    )
    loss_weights = cfg["loss_weights"]
    mixup_alpha = cfg["training"].get("mixup_alpha", 0.0)

    start_epoch = 0
    if args.resume:
        print(f"Resuming from {args.resume}...")
        start_epoch = load_checkpoint(args.resume, model, optimizer, scheduler) + 1
        print(f"  Resumed at epoch {start_epoch}")

    # --- Config summary ---
    print("\n" + "=" * 60)
    print("TRAINING CONFIGURATION")
    print("=" * 60)
    print(f"  Device:          {device}")
    print(f"  Seed:            {seed}")
    print(f"  Epochs:          {epochs}")
    print(f"  Batch size:      {cfg['training']['batch_size']}")
    print(f"  Learning rate:   {lr}")
    print(f"  Weight decay:    {weight_decay}")
    print(f"  Patience:        {patience}")
    print(f"  Architecture:    {arch}")
    if arch in ("cnn", "ast"):
        print(f"  Features:        {cfg['features']['mode']}")
    else:
        print(f"  Embeddings:      {cfg.get('embedding_source', 'n/a')}")
        print(f"  Sequence mode:   {cfg.get('sequence_mode', False)}")
    win = cfg["windowing"]
    print(f"  Window:          {win['window_seconds']}s / hop {win['hop_seconds']}s")
    dropout = cfg["model"].get("dropout", cfg["model"].get("head_dropout", "n/a"))
    print(f"  Dropout:         {dropout}")
    print(f"  Scheduler:       {scheduler_type}")
    print(f"  Loss type:       {loss_type}")
    if mixup_alpha > 0:
        print(f"  Mixup alpha:     {mixup_alpha}")
    print(f"  Loss weights:    {loss_weights}")
    print(f"  Output dir:      {output_dir}")
    print(f"  Train batches:   {len(train_loader)}")
    print(f"  Val batches:     {len(val_loader)}")
    print("=" * 60 + "\n")

    best_val_loss = float("inf")
    epochs_no_improve = 0
    training_start = time.time()

    for epoch in range(start_epoch, epochs):
        epoch_start = time.time()

        train_pbar = ProgressLoader(
            train_loader,
            desc=f"Epoch {epoch + 1}/{epochs} [train]",
            leave=False,
            ncols=100,
            bar_format="{l_bar}{bar}| {n_fmt}/{total_fmt} [{elapsed}<{remaining}]",
        )
        train_metrics = train_epoch(
            model, train_pbar, optimizer, criterions, loss_weights, device,
            scheduler=scheduler if step_scheduler_per_batch else None,
            mixup_alpha=mixup_alpha,
        )

        val_pbar = ProgressLoader(
            val_loader,
            desc=f"Epoch {epoch + 1}/{epochs} [val]  ",
            leave=False,
            ncols=100,
            bar_format="{l_bar}{bar}| {n_fmt}/{total_fmt} [{elapsed}<{remaining}]",
        )
        val_metrics = validate(model, val_pbar, criterions, loss_weights, device)

        if not step_scheduler_per_batch:
            scheduler.step()
        epoch_time = time.time() - epoch_start
        lr_now = optimizer.param_groups[0]["lr"]

        # --- Epoch summary ---
        print(f"\n--- Epoch {epoch + 1}/{epochs} ({epoch_time:.1f}s) ---")
        t_loss = train_metrics["loss"]
        v_loss = val_metrics["loss"]
        print(f"  Total loss:  train={t_loss:.4f}  val={v_loss:.4f}")
        print(f"  LR: {lr_now:.2e}")
        for head_key, display_name in [
            ("segment", "segment"),
            ("arousal_cls", "arousal"),
            ("valence_cls", "valence"),
        ]:
            t_loss = train_metrics.get(f"loss_{head_key}", 0.0)
            v_loss = val_metrics.get(f"loss_{head_key}", 0.0)
            t_acc = train_metrics.get(f"acc_{head_key}")
            v_acc = val_metrics.get(f"acc_{head_key}")
            t_acc_str = f"{t_acc:.3f}" if t_acc is not None else "n/a"
            v_acc_str = f"{v_acc:.3f}" if v_acc is not None else "n/a"
            print(
                f"  {display_name:>8s}: loss={t_loss:.4f}/{v_loss:.4f}  "
                f"acc={t_acc_str}/{v_acc_str}"
            )
        for reg_key, display_name in [
            ("arousal_reg", "ar_reg"),
            ("valence_reg", "val_reg"),
        ]:
            t_rl = train_metrics.get(f"loss_{reg_key}", 0.0)
            v_rl = val_metrics.get(f"loss_{reg_key}", 0.0)
            if t_rl > 0 or v_rl > 0:
                print(
                    f"  {display_name:>8s}: loss={t_rl:.4f}/{v_rl:.4f}"
                )

        # Genre head
        genre_key = "genre"
        t_gl = train_metrics.get(f"loss_{genre_key}", 0.0)
        v_gl = val_metrics.get(f"loss_{genre_key}", 0.0)
        if t_gl > 0 or v_gl > 0:
            t_ga = train_metrics.get(f"acc_{genre_key}")
            v_ga = val_metrics.get(f"acc_{genre_key}")
            t_ga_str = f"{t_ga:.3f}" if t_ga is not None else "n/a"
            v_ga_str = f"{v_ga:.3f}" if v_ga is not None else "n/a"
            print(
                f"  {'genre':>8s}: loss={t_gl:.4f}/{v_gl:.4f}  "
                f"acc={t_ga_str}/{v_ga_str}"
            )

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
            print(f"  >>> New best val_loss={best_val_loss:.4f} (saved best.pt)")
        else:
            epochs_no_improve += 1
            print(f"  No improvement ({epochs_no_improve}/{patience})")
            if epochs_no_improve >= patience:
                print(f"\n  Early stopping after {patience} epochs without improvement")
                break

    total_time = time.time() - training_start
    minutes, seconds = divmod(int(total_time), 60)
    print("\n" + "=" * 60)
    print(f"Training complete in {minutes}m {seconds}s")
    print(f"Best val_loss = {best_val_loss:.4f}")
    print(f"Checkpoints saved to: {output_dir.resolve()}")
    print("=" * 60)


if __name__ == "__main__":
    main()
