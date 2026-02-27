"""Training loop for multi-task CNN.

Provides functions for training, validation, loss computation,
and checkpoint management.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import torch
import torch.nn as nn


def compute_multitask_loss(
    logits: tuple[torch.Tensor, torch.Tensor, torch.Tensor],
    batch: dict[str, Any],
    loss_weights: dict[str, float],
    criterion: nn.Module | dict[str, nn.Module],
) -> tuple[torch.Tensor, dict[str, float]]:
    """Compute weighted multi-task loss, skipping heads with no labels.

    Args:
        logits: (segment_logits, arousal_logits, valence_logits) from model.
        batch: Dict with keys ``y_seg``, ``y_ar``, ``y_val`` (Tensor or None).
        loss_weights: Weights per head, e.g. ``{"segment": 1.0, ...}``.
        criterion: Single loss function or dict of per-head loss functions.

    Returns:
        (total_loss, per_head_losses) where per_head_losses has float values.
    """
    seg_logits, ar_logits, val_logits = logits
    device = seg_logits.device
    total = torch.tensor(0.0, device=device)
    details: dict[str, float] = {}

    heads = [
        ("segment", seg_logits, batch.get("y_seg")),
        ("arousal", ar_logits, batch.get("y_ar")),
        ("valence", val_logits, batch.get("y_val")),
    ]

    for name, pred, target in heads:
        if target is None:
            details[name] = 0.0
            continue
        target = target.to(device)
        if isinstance(criterion, dict):
            crit = criterion[name]
        else:
            crit = criterion
        loss = crit(pred, target) * loss_weights.get(name, 1.0)
        total = total + loss
        details[name] = loss.item()

    return total, details


def compute_accuracy(
    logits: tuple[torch.Tensor, torch.Tensor, torch.Tensor],
    batch: dict[str, Any],
) -> dict[str, float | None]:
    """Compute per-head accuracy. Returns None for heads with no labels."""
    seg_logits, ar_logits, val_logits = logits
    result: dict[str, float | None] = {}

    heads = [
        ("segment", seg_logits, batch.get("y_seg")),
        ("arousal", ar_logits, batch.get("y_ar")),
        ("valence", val_logits, batch.get("y_val")),
    ]

    for name, pred, target in heads:
        if target is None:
            result[name] = None
            continue
        target = target.to(pred.device)
        mask = target >= 0
        if mask.sum() == 0:
            result[name] = None
            continue
        preds = pred[mask].argmax(dim=1)
        correct = (preds == target[mask]).float().mean().item()
        result[name] = correct

    return result


def train_epoch(
    model: nn.Module,
    loader,
    optimizer: torch.optim.Optimizer,
    criterion: nn.Module | dict[str, nn.Module],
    loss_weights: dict[str, float],
    device: str,
    scheduler=None,
    max_grad_norm: float = 1.0,
) -> dict[str, Any]:
    """Run one training epoch.

    Returns dict with loss, per-head losses, and per-head accuracies.
    """
    model.train()
    total_loss = 0.0
    head_losses: dict[str, float] = {"segment": 0.0, "arousal": 0.0, "valence": 0.0}
    head_acc_sums: dict[str, float] = {"segment": 0.0, "arousal": 0.0, "valence": 0.0}
    head_acc_counts: dict[str, int] = {"segment": 0, "arousal": 0, "valence": 0}
    n_batches = 0

    for batch in loader:
        x = batch["x"].to(device)

        logits = model(x)
        loss, details = compute_multitask_loss(
            logits, batch, loss_weights, criterion,
        )

        optimizer.zero_grad(set_to_none=True)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=max_grad_norm)
        optimizer.step()

        if scheduler is not None:
            scheduler.step()

        total_loss += loss.item()
        for k in head_losses:
            head_losses[k] += details[k]

        acc = compute_accuracy(logits, batch)
        for k in head_acc_sums:
            if acc[k] is not None:
                head_acc_sums[k] += acc[k]
                head_acc_counts[k] += 1

        n_batches += 1

    if n_batches == 0:
        return {"loss": 0.0}

    metrics: dict[str, Any] = {
        "loss": total_loss / n_batches,
    }
    for k in head_losses:
        metrics[f"loss_{k}"] = head_losses[k] / n_batches
        if head_acc_counts[k] > 0:
            metrics[f"acc_{k}"] = head_acc_sums[k] / head_acc_counts[k]
        else:
            metrics[f"acc_{k}"] = None

    return metrics


def validate(
    model: nn.Module,
    loader,
    criterion: nn.Module | dict[str, nn.Module],
    loss_weights: dict[str, float],
    device: str,
) -> dict[str, Any]:
    """Run validation (no gradient computation).

    Returns dict with the same structure as train_epoch.
    """
    model.eval()
    total_loss = 0.0
    head_losses: dict[str, float] = {"segment": 0.0, "arousal": 0.0, "valence": 0.0}
    head_acc_sums: dict[str, float] = {"segment": 0.0, "arousal": 0.0, "valence": 0.0}
    head_acc_counts: dict[str, int] = {"segment": 0, "arousal": 0, "valence": 0}
    n_batches = 0

    with torch.inference_mode():
        for batch in loader:
            x = batch["x"].to(device)

            logits = model(x)
            loss, details = compute_multitask_loss(
                logits, batch, loss_weights, criterion,
            )

            total_loss += loss.item()
            for k in head_losses:
                head_losses[k] += details[k]

            acc = compute_accuracy(logits, batch)
            for k in head_acc_sums:
                if acc[k] is not None:
                    head_acc_sums[k] += acc[k]
                    head_acc_counts[k] += 1

            n_batches += 1

    if n_batches == 0:
        return {"loss": 0.0}

    metrics: dict[str, Any] = {
        "loss": total_loss / n_batches,
    }
    for k in head_losses:
        metrics[f"loss_{k}"] = head_losses[k] / n_batches
        if head_acc_counts[k] > 0:
            metrics[f"acc_{k}"] = head_acc_sums[k] / head_acc_counts[k]
        else:
            metrics[f"acc_{k}"] = None

    return metrics


def save_checkpoint(
    model: nn.Module,
    optimizer: torch.optim.Optimizer,
    scheduler: Any,
    epoch: int,
    metrics: dict[str, Any],
    path: str | Path,
) -> None:
    """Save training checkpoint."""
    state = {
        "model_state_dict": model.state_dict(),
        "optimizer_state_dict": optimizer.state_dict(),
        "epoch": epoch,
        "metrics": metrics,
    }
    if scheduler is not None:
        state["scheduler_state_dict"] = scheduler.state_dict()
    torch.save(state, path)


def load_checkpoint(
    path: str | Path,
    model: nn.Module,
    optimizer: torch.optim.Optimizer | None = None,
    scheduler: Any = None,
) -> int:
    """Load training checkpoint. Returns the epoch number."""
    checkpoint = torch.load(path, map_location="cpu", weights_only=False)
    model.load_state_dict(checkpoint["model_state_dict"])
    if optimizer is not None and "optimizer_state_dict" in checkpoint:
        optimizer.load_state_dict(checkpoint["optimizer_state_dict"])
    if scheduler is not None and "scheduler_state_dict" in checkpoint:
        scheduler.load_state_dict(checkpoint["scheduler_state_dict"])
    return checkpoint["epoch"]
