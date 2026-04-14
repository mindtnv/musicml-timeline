"""Training loop for multi-task CNN.

Provides functions for training, validation, loss computation,
and checkpoint management.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import torch
import torch.nn as nn

# Classification head keys and their batch label keys
CLS_HEADS = [
    ("segment", "y_seg"),
    ("arousal_cls", "y_ar"),
    ("valence_cls", "y_val"),
    ("genre", "y_genre"),
]

# Regression head keys and their batch label keys
REG_HEADS = [
    ("arousal_reg", "y_ar_cont"),
    ("valence_reg", "y_val_cont"),
]


class FocalLoss(nn.Module):
    """Focal Loss for imbalanced classification.

    FL(p_t) = -alpha_t * (1 - p_t)^gamma * log(p_t)

    When gamma=0, this is equivalent to CrossEntropyLoss.
    """

    def __init__(
        self,
        weight: torch.Tensor | None = None,
        gamma: float = 2.0,
        label_smoothing: float = 0.0,
        ignore_index: int = -1,
    ) -> None:
        super().__init__()
        self.register_buffer(
            "weight", weight if weight is not None else None,
        )
        self.gamma = gamma
        self.label_smoothing = label_smoothing
        self.ignore_index = ignore_index

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        mask = targets != self.ignore_index
        if mask.sum() == 0:
            return torch.tensor(0.0, device=logits.device, requires_grad=True)

        logits = logits[mask]
        targets = targets[mask]

        ce = nn.functional.cross_entropy(
            logits,
            targets,
            weight=self.weight,
            reduction="none",
            label_smoothing=self.label_smoothing,
        )
        pt = torch.exp(-ce)
        focal = ((1 - pt) ** self.gamma) * ce
        return focal.mean()


def mixup_batch(
    x: torch.Tensor,
    alpha: float = 0.2,
) -> tuple[torch.Tensor, torch.Tensor, float]:
    """Apply Mixup augmentation to a batch.

    Returns (mixed_x, permutation_index, lambda).
    Lambda >= 0.5 so the original sample dominates.
    """
    if alpha <= 0:
        return x, torch.arange(x.size(0), device=x.device), 1.0

    lam = float(np.random.beta(alpha, alpha))
    lam = max(lam, 1 - lam)  # ensure lam >= 0.5

    index = torch.randperm(x.size(0), device=x.device)
    mixed_x = lam * x + (1 - lam) * x[index]

    return mixed_x, index, lam


def compute_multitask_loss(
    logits: dict[str, torch.Tensor],
    batch: dict[str, Any],
    loss_weights: dict[str, float],
    criterion: nn.Module | dict[str, nn.Module],
) -> tuple[torch.Tensor, dict[str, float]]:
    """Compute weighted multi-task loss, skipping heads with no labels.

    Args:
        logits: Dict from model forward (classification + optional regression).
        batch: Dict with label keys (y_seg, y_ar, y_val, y_ar_cont, y_val_cont).
        loss_weights: Weights per head name.
        criterion: Single loss function or dict of per-head loss functions.

    Returns:
        (total_loss, per_head_losses) where per_head_losses has float values.
    """
    device = logits["segment"].device
    total = torch.tensor(0.0, device=device)
    details: dict[str, float] = {}

    # Classification heads
    for head_key, label_key in CLS_HEADS:
        target = batch.get(label_key)
        if target is None:
            details[head_key] = 0.0
            continue
        logit = logits[head_key]
        target_t = target.to(device)
        # Flatten 3D sequence logits: (B, T, C) → (B*T, C)
        if logit.dim() == 3:
            logit = logit.reshape(-1, logit.size(-1))
            target_t = target_t.reshape(-1)
        crit = criterion[head_key] if isinstance(criterion, dict) else criterion
        loss = crit(logit, target_t) * loss_weights.get(head_key, 1.0)
        total = total + loss
        details[head_key] = loss.item()

    # Regression heads (if present in logits)
    for head_key, label_key in REG_HEADS:
        if head_key not in logits:
            continue
        target = batch.get(label_key)
        if target is None:
            details[head_key] = 0.0
            continue
        target = target.to(device).float()
        pred = logits[head_key].squeeze(-1)
        # Flatten 3D sequence outputs: (B, T) → (B*T,)
        if pred.dim() == 2 and target.dim() == 2:
            pred = pred.reshape(-1)
            target = target.reshape(-1)
        mask = ~torch.isnan(target)
        if mask.sum() == 0:
            details[head_key] = 0.0
            continue
        crit = criterion[head_key] if isinstance(criterion, dict) else criterion
        loss = crit(pred[mask], target[mask]) * loss_weights.get(head_key, 1.0)
        total = total + loss
        details[head_key] = loss.item()

    return total, details


def compute_accuracy(
    logits: dict[str, torch.Tensor],
    batch: dict[str, Any],
) -> dict[str, float | None]:
    """Compute per-head accuracy. Returns None for heads with no labels."""
    result: dict[str, float | None] = {}

    for head_key, label_key in CLS_HEADS:
        target = batch.get(label_key)
        if target is None:
            result[head_key] = None
            continue
        pred = logits[head_key]
        target = target.to(pred.device)
        # Flatten 3D sequence logits: (B, T, C) → (B*T, C)
        if pred.dim() == 3:
            pred = pred.reshape(-1, pred.size(-1))
            target = target.reshape(-1)
        mask = target >= 0
        if mask.sum() == 0:
            result[head_key] = None
            continue
        preds = pred[mask].argmax(dim=1)
        correct = (preds == target[mask]).float().mean().item()
        result[head_key] = correct

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
    mixup_alpha: float = 0.0,
    grad_accumulation_steps: int = 1,
) -> dict[str, Any]:
    """Run one training epoch.

    Returns dict with loss, per-head losses, and per-head accuracies.
    Supports gradient accumulation via grad_accumulation_steps.
    """
    model.train()
    total_loss = 0.0
    cls_keys = [h for h, _ in CLS_HEADS]
    reg_keys = [h for h, _ in REG_HEADS]
    all_keys = cls_keys + reg_keys

    head_losses: dict[str, float] = {k: 0.0 for k in all_keys}
    head_acc_sums: dict[str, float] = {k: 0.0 for k in cls_keys}
    head_acc_counts: dict[str, int] = {k: 0 for k in cls_keys}
    n_batches = 0
    optimizer.zero_grad(set_to_none=True)

    for batch in loader:
        x = batch["x"].to(device, non_blocking=True)
        lengths = batch.get("lengths")

        if mixup_alpha > 0:
            mixed_x, perm_idx, lam = mixup_batch(x, mixup_alpha)
            perm_idx = perm_idx.cpu()
            if lengths is not None:
                logits = model(mixed_x, lengths=lengths)
            else:
                logits = model(mixed_x)
            loss1, details1 = compute_multitask_loss(
                logits, batch, loss_weights, criterion,
            )
            # Permuted targets for mixup second term
            batch_perm: dict[str, Any] = {}
            for k, v in batch.items():
                if k == "x":
                    continue
                if isinstance(v, torch.Tensor):
                    batch_perm[k] = v[perm_idx]
                else:
                    batch_perm[k] = v
            loss2, details2 = compute_multitask_loss(
                logits, batch_perm, loss_weights, criterion,
            )
            loss = lam * loss1 + (1 - lam) * loss2
            details = {
                k: lam * details1.get(k, 0.0) + (1 - lam) * details2.get(k, 0.0)
                for k in set(details1) | set(details2)
            }
        else:
            if lengths is not None:
                logits = model(x, lengths=lengths)
            else:
                logits = model(x)
            loss, details = compute_multitask_loss(
                logits, batch, loss_weights, criterion,
            )

        scaled_loss = loss / grad_accumulation_steps
        scaled_loss.backward()

        if (n_batches + 1) % grad_accumulation_steps == 0:
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=max_grad_norm)
            optimizer.step()
            optimizer.zero_grad(set_to_none=True)
            if scheduler is not None:
                scheduler.step()

        total_loss += loss.item()
        for k in head_losses:
            head_losses[k] += details.get(k, 0.0)

        # Accuracy computed on unmixed logits (approximate for mixup)
        acc = compute_accuracy(logits, batch)
        for k in cls_keys:
            if acc.get(k) is not None:
                head_acc_sums[k] += acc[k]
                head_acc_counts[k] += 1

        n_batches += 1

    if n_batches == 0:
        return {"loss": 0.0}

    metrics: dict[str, Any] = {
        "loss": total_loss / n_batches,
    }
    for k in all_keys:
        metrics[f"loss_{k}"] = head_losses[k] / n_batches
    for k in cls_keys:
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
    cls_keys = [h for h, _ in CLS_HEADS]
    reg_keys = [h for h, _ in REG_HEADS]
    all_keys = cls_keys + reg_keys

    head_losses: dict[str, float] = {k: 0.0 for k in all_keys}
    head_acc_sums: dict[str, float] = {k: 0.0 for k in cls_keys}
    head_acc_counts: dict[str, int] = {k: 0 for k in cls_keys}
    n_batches = 0

    with torch.inference_mode():
        for batch in loader:
            x = batch["x"].to(device, non_blocking=True)
            lengths = batch.get("lengths")

            if lengths is not None:
                logits = model(x, lengths=lengths)
            else:
                logits = model(x)
            loss, details = compute_multitask_loss(
                logits, batch, loss_weights, criterion,
            )

            total_loss += loss.item()
            for k in head_losses:
                head_losses[k] += details.get(k, 0.0)

            acc = compute_accuracy(logits, batch)
            for k in cls_keys:
                if acc.get(k) is not None:
                    head_acc_sums[k] += acc[k]
                    head_acc_counts[k] += 1

            n_batches += 1

    if n_batches == 0:
        return {"loss": 0.0}

    metrics: dict[str, Any] = {
        "loss": total_loss / n_batches,
    }
    for k in all_keys:
        metrics[f"loss_{k}"] = head_losses[k] / n_batches
    for k in cls_keys:
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
    strict: bool = True,
) -> int:
    """Load training checkpoint. Returns the epoch number."""
    checkpoint = torch.load(path, map_location="cpu", weights_only=False)
    model.load_state_dict(checkpoint["model_state_dict"], strict=strict)
    if optimizer is not None and "optimizer_state_dict" in checkpoint:
        optimizer.load_state_dict(checkpoint["optimizer_state_dict"])
    if scheduler is not None and "scheduler_state_dict" in checkpoint:
        scheduler.load_state_dict(checkpoint["scheduler_state_dict"])
    return checkpoint["epoch"]
