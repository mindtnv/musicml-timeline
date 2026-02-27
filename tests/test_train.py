"""Tests for training loop functions."""

from __future__ import annotations

from pathlib import Path

import torch
import torch.nn as nn
import torch.utils.data

from musicml.datasets.multitask import RoundRobinLoader, collate_multitask
from musicml.models import CNNMultiTask
from musicml.train import (
    compute_accuracy,
    compute_multitask_loss,
    load_checkpoint,
    save_checkpoint,
    train_epoch,
    validate,
)

LOSS_WEIGHTS = {"segment": 1.0, "arousal": 1.0, "valence": 1.0}


class FakeDeamDataset(torch.utils.data.Dataset):
    def __init__(self, size: int = 16) -> None:
        self.size = size

    def __len__(self) -> int:
        return self.size

    def __getitem__(self, idx: int) -> dict:
        return {
            "x": torch.randn(1, 128, 344),
            "y_seg": None,
            "y_ar": idx % 3,
            "y_val": idx % 3,
        }


class FakeStructureDataset(torch.utils.data.Dataset):
    def __init__(self, size: int = 16) -> None:
        self.size = size

    def __len__(self) -> int:
        return self.size

    def __getitem__(self, idx: int) -> dict:
        return {
            "x": torch.randn(1, 128, 344),
            "y_seg": idx % 4,
            "y_ar": None,
            "y_val": None,
        }


def _make_loader(*datasets, batch_size=4):
    loaders = [
        torch.utils.data.DataLoader(
            ds, batch_size=batch_size, collate_fn=collate_multitask,
        )
        for ds in datasets
    ]
    return RoundRobinLoader(*loaders)


def test_compute_multitask_loss_deam_batch() -> None:
    """DEAM batch: segment loss=0, arousal/valence > 0."""
    model = CNNMultiTask()
    criterion = nn.CrossEntropyLoss(ignore_index=-1)

    x = torch.randn(4, 1, 128, 344)
    logits = model(x)

    batch = {
        "y_seg": None,
        "y_ar": torch.tensor([0, 1, 2, 0]),
        "y_val": torch.tensor([1, 1, 0, 2]),
    }

    total, details = compute_multitask_loss(logits, batch, LOSS_WEIGHTS, criterion)
    assert total.item() > 0
    assert details["segment"] == 0.0
    assert details["arousal"] > 0
    assert details["valence"] > 0


def test_compute_multitask_loss_structure_batch() -> None:
    """Structure batch: arousal/valence loss=0, segment > 0."""
    model = CNNMultiTask()
    criterion = nn.CrossEntropyLoss(ignore_index=-1)

    x = torch.randn(4, 1, 128, 344)
    logits = model(x)

    batch = {
        "y_seg": torch.tensor([0, 1, 2, 3]),
        "y_ar": None,
        "y_val": None,
    }

    total, details = compute_multitask_loss(logits, batch, LOSS_WEIGHTS, criterion)
    assert total.item() > 0
    assert details["segment"] > 0
    assert details["arousal"] == 0.0
    assert details["valence"] == 0.0


def test_compute_accuracy() -> None:
    model = CNNMultiTask()
    x = torch.randn(4, 1, 128, 344)
    logits = model(x)

    batch = {
        "y_seg": torch.tensor([0, 1, 2, 3]),
        "y_ar": None,
        "y_val": torch.tensor([0, 1, 2, 0]),
    }

    acc = compute_accuracy(logits, batch)
    assert isinstance(acc["segment"], float)
    assert acc["arousal"] is None
    assert isinstance(acc["valence"], float)


def test_train_epoch_runs() -> None:
    """One training epoch should return dict with expected keys."""
    model = CNNMultiTask()
    loader = _make_loader(FakeDeamDataset(8), FakeStructureDataset(8), batch_size=4)
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    criterion = nn.CrossEntropyLoss(ignore_index=-1)

    metrics = train_epoch(model, loader, optimizer, criterion, LOSS_WEIGHTS, "cpu")
    assert "loss" in metrics
    assert metrics["loss"] > 0
    assert "loss_segment" in metrics
    assert "loss_arousal" in metrics
    assert "acc_segment" in metrics


def test_validate_runs() -> None:
    """Validation should return dict with expected keys."""
    model = CNNMultiTask()
    loader = _make_loader(FakeDeamDataset(8), FakeStructureDataset(8), batch_size=4)
    criterion = nn.CrossEntropyLoss(ignore_index=-1)

    metrics = validate(model, loader, criterion, LOSS_WEIGHTS, "cpu")
    assert "loss" in metrics
    assert metrics["loss"] > 0


def test_save_load_checkpoint(tmp_path: Path) -> None:
    """Save checkpoint, load it, verify weights match."""
    model1 = CNNMultiTask()
    optimizer1 = torch.optim.Adam(model1.parameters(), lr=1e-3)
    scheduler1 = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer1, T_max=10)

    ckpt_path = tmp_path / "test.pt"
    save_checkpoint(
        model1, optimizer1, scheduler1, epoch=5,
        metrics={"loss": 0.5}, path=ckpt_path,
    )

    model2 = CNNMultiTask()
    optimizer2 = torch.optim.Adam(model2.parameters(), lr=1e-3)
    scheduler2 = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer2, T_max=10)

    epoch = load_checkpoint(ckpt_path, model2, optimizer2, scheduler2)
    assert epoch == 5

    for p1, p2 in zip(model1.parameters(), model2.parameters()):
        assert torch.equal(p1, p2)


def test_training_reduces_loss() -> None:
    """Loss should decrease over several epochs on fake data."""
    torch.manual_seed(42)
    model = CNNMultiTask()
    loader = _make_loader(FakeDeamDataset(16), FakeStructureDataset(16), batch_size=8)
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    criterion = nn.CrossEntropyLoss(ignore_index=-1)

    losses = []
    for _ in range(5):
        metrics = train_epoch(model, loader, optimizer, criterion, LOSS_WEIGHTS, "cpu")
        losses.append(metrics["loss"])

    # Loss at epoch 5 should be less than epoch 1
    assert losses[-1] < losses[0], f"Loss did not decrease: {losses}"
