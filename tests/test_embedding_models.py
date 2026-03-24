"""Tests for embedding-based models, datasets, and 3D logits support."""

from __future__ import annotations

import torch
import torch.nn as nn
import torch.utils.data

from musicml.datasets.multitask import collate_multitask, collate_sequences
from musicml.models import LinearMultiTask, LSTMMultiTask
from musicml.train import (
    FocalLoss,
    compute_accuracy,
    compute_multitask_loss,
    train_epoch,
    validate,
)

LOSS_WEIGHTS = {
    "segment": 1.0, "arousal_cls": 1.0, "valence_cls": 1.0, "genre": 1.0,
}


# ===== LinearMultiTask tests =====


def test_linear_multitask_forward_shape() -> None:
    """LinearMultiTask should produce (B, C) logits for each head."""
    model = LinearMultiTask(embedding_dim=256, n_genre_classes=10)
    x = torch.randn(8, 256)
    out = model(x)
    assert out["segment"].shape == (8, 6)
    assert out["arousal_cls"].shape == (8, 3)
    assert out["valence_cls"].shape == (8, 3)
    assert out["genre"].shape == (8, 10)


def test_linear_multitask_no_genre() -> None:
    """Without genre, output should not have genre key."""
    model = LinearMultiTask(embedding_dim=128, n_genre_classes=0)
    x = torch.randn(4, 128)
    out = model(x)
    assert "genre" not in out
    assert out["segment"].shape == (4, 6)


def test_linear_multitask_regression() -> None:
    """With enable_regression, should have regression outputs."""
    model = LinearMultiTask(
        embedding_dim=128, enable_regression=True,
    )
    x = torch.randn(4, 128)
    out = model(x)
    assert "arousal_reg" in out
    assert "valence_reg" in out
    assert out["arousal_reg"].shape == (4, 1)


def test_linear_multitask_backward() -> None:
    """LinearMultiTask should support gradient computation."""
    model = LinearMultiTask(embedding_dim=64)
    x = torch.randn(4, 64)
    out = model(x)
    loss = out["segment"].sum()
    loss.backward()
    # Check gradient exists on the first parameter
    for p in model.parameters():
        assert p.grad is not None
        break


def test_linear_multitask_count_params() -> None:
    model = LinearMultiTask(embedding_dim=256)
    n = model.count_params()
    assert n > 0
    assert isinstance(n, int)


def test_linear_multitask_kwargs_ignored() -> None:
    """Extra kwargs should be silently ignored."""
    model = LinearMultiTask(embedding_dim=128, extra_param=42, unknown=True)
    x = torch.randn(2, 128)
    out = model(x)
    assert out["segment"].shape == (2, 6)


# ===== LSTMMultiTask tests =====


def test_lstm_multitask_forward_shape() -> None:
    """LSTMMultiTask should produce (B, T, C) logits for each head."""
    model = LSTMMultiTask(
        embedding_dim=256, lstm_hidden=64, lstm_layers=1,
        n_genre_classes=10,
    )
    x = torch.randn(4, 20, 256)  # B=4, T=20, D=256
    out = model(x)
    assert out["segment"].shape == (4, 20, 6)
    assert out["arousal_cls"].shape == (4, 20, 3)
    assert out["valence_cls"].shape == (4, 20, 3)
    assert out["genre"].shape == (4, 20, 10)


def test_lstm_multitask_with_lengths() -> None:
    """LSTMMultiTask should work with packed sequences (lengths)."""
    model = LSTMMultiTask(
        embedding_dim=128, lstm_hidden=32, lstm_layers=1,
    )
    x = torch.randn(3, 15, 128)  # B=3, T_max=15
    lengths = torch.tensor([15, 10, 5])
    out = model(x, lengths=lengths)
    # Output shape always (B, T_max, C)
    assert out["segment"].shape == (3, 15, 6)


def test_lstm_multitask_regression() -> None:
    model = LSTMMultiTask(
        embedding_dim=64, lstm_hidden=32, lstm_layers=1,
        enable_regression=True,
    )
    x = torch.randn(2, 10, 64)
    out = model(x)
    assert "arousal_reg" in out
    assert out["arousal_reg"].shape == (2, 10, 1)


def test_lstm_multitask_backward() -> None:
    model = LSTMMultiTask(
        embedding_dim=64, lstm_hidden=32, lstm_layers=1,
    )
    x = torch.randn(2, 5, 64)
    out = model(x)
    loss = out["segment"].sum()
    loss.backward()
    for p in model.parameters():
        assert p.grad is not None
        break


def test_lstm_multitask_count_params() -> None:
    model = LSTMMultiTask(embedding_dim=128, lstm_hidden=64, lstm_layers=2)
    n = model.count_params()
    assert n > 0
    assert isinstance(n, int)


# ===== collate_sequences tests =====


def _make_seq_batch(
    n: int, d: int = 64, lengths: list[int] | None = None,
) -> list[dict]:
    """Create a fake batch of variable-length sequences."""
    if lengths is None:
        lengths = [10 + i * 3 for i in range(n)]
    batch = []
    for length in lengths:
        batch.append({
            "x": torch.randn(length, d),
            "y_seg": torch.randint(0, 6, (length,)),
            "y_ar": torch.randint(0, 3, (length,)),
            "y_val": torch.randint(0, 3, (length,)),
            "y_ar_cont": torch.randn(length),
            "y_val_cont": torch.randn(length),
            "length": length,
        })
    return batch


def test_collate_sequences_padding() -> None:
    """Sequences should be padded to max length."""
    batch = _make_seq_batch(3, d=64, lengths=[5, 10, 7])
    collated = collate_sequences(batch)

    assert collated["x"].shape == (3, 10, 64)
    assert collated["y_seg"].shape == (3, 10)
    assert collated["y_ar"].shape == (3, 10)
    assert collated["lengths"].tolist() == [5, 10, 7]


def test_collate_sequences_padding_values() -> None:
    """Padded int labels should be -1, float labels NaN."""
    batch = _make_seq_batch(2, d=32, lengths=[3, 5])
    collated = collate_sequences(batch)

    # For the shorter sequence (length=3), positions 3-4 should be padded
    assert collated["y_seg"][0, 3].item() == -1
    assert collated["y_seg"][0, 4].item() == -1
    assert collated["y_ar"][0, 3].item() == -1

    # Float labels should be NaN in padded positions
    assert torch.isnan(collated["y_ar_cont"][0, 3])
    assert torch.isnan(collated["y_val_cont"][0, 4])

    # x should be zero-padded
    assert collated["x"][0, 3].abs().sum().item() == 0.0


def test_collate_sequences_none_labels() -> None:
    """When a label is None for all items, it should remain None."""
    batch = [
        {
            "x": torch.randn(5, 32),
            "y_seg": torch.randint(0, 6, (5,)),
            "y_ar": None,
            "y_val": None,
            "y_ar_cont": None,
            "y_val_cont": None,
            "length": 5,
        },
        {
            "x": torch.randn(3, 32),
            "y_seg": torch.randint(0, 6, (3,)),
            "y_ar": None,
            "y_val": None,
            "y_ar_cont": None,
            "y_val_cont": None,
            "length": 3,
        },
    ]
    collated = collate_sequences(batch)
    assert collated["y_ar"] is None
    assert collated["y_val"] is None
    assert collated["y_ar_cont"] is None
    assert collated["y_val_cont"] is None
    assert collated["y_seg"].shape == (2, 5)


# ===== 3D logits in loss and accuracy =====


def test_compute_loss_3d_logits() -> None:
    """compute_multitask_loss should work with 3D (B, T, C) logits."""
    model = LSTMMultiTask(
        embedding_dim=64, lstm_hidden=32, lstm_layers=1,
    )
    x = torch.randn(2, 5, 64)
    logits = model(x)

    batch = {
        "y_seg": torch.randint(0, 6, (2, 5)),
        "y_ar": torch.randint(0, 3, (2, 5)),
        "y_val": torch.randint(0, 3, (2, 5)),
    }

    criterion = nn.CrossEntropyLoss(ignore_index=-1)
    total, details = compute_multitask_loss(
        logits, batch, LOSS_WEIGHTS, criterion,
    )
    assert total.item() > 0
    assert details["segment"] > 0
    assert details["arousal_cls"] > 0
    assert details["valence_cls"] > 0


def test_compute_loss_3d_with_padding() -> None:
    """Loss should correctly ignore padded positions (label=-1)."""
    model = LSTMMultiTask(
        embedding_dim=32, lstm_hidden=16, lstm_layers=1,
    )
    x = torch.randn(2, 5, 32)
    logits = model(x)

    # Second sample has real length 3, padded to 5
    y_seg = torch.randint(0, 6, (2, 5))
    y_seg[1, 3:] = -1  # padding

    batch = {
        "y_seg": y_seg,
        "y_ar": None,
        "y_val": None,
    }

    criterion = FocalLoss(gamma=2.0, ignore_index=-1)
    total, details = compute_multitask_loss(
        logits, batch, LOSS_WEIGHTS, criterion,
    )
    assert total.item() > 0
    assert details["segment"] > 0


def test_compute_accuracy_3d_logits() -> None:
    """compute_accuracy should work with 3D logits."""
    model = LSTMMultiTask(
        embedding_dim=32, lstm_hidden=16, lstm_layers=1,
    )
    x = torch.randn(2, 5, 32)
    logits = model(x)

    y_seg = torch.randint(0, 6, (2, 5))
    y_seg[1, 3:] = -1  # padding

    batch = {
        "y_seg": y_seg,
        "y_ar": None,
        "y_val": None,
    }

    acc = compute_accuracy(logits, batch)
    assert isinstance(acc["segment"], float)
    assert 0.0 <= acc["segment"] <= 1.0
    assert acc["arousal_cls"] is None


def test_compute_loss_3d_regression() -> None:
    """Regression loss should work with 3D (sequence) outputs."""
    model = LSTMMultiTask(
        embedding_dim=32, lstm_hidden=16, lstm_layers=1,
        enable_regression=True,
    )
    x = torch.randn(2, 5, 32)
    logits = model(x)

    # Regression targets with some NaN for padding
    y_ar_cont = torch.randn(2, 5)
    y_ar_cont[1, 3:] = float("nan")

    batch = {
        "y_seg": None,
        "y_ar": None,
        "y_val": None,
        "y_ar_cont": y_ar_cont,
        "y_val_cont": torch.randn(2, 5),
    }

    criterions = {
        "segment": nn.CrossEntropyLoss(ignore_index=-1),
        "arousal_cls": nn.CrossEntropyLoss(ignore_index=-1),
        "valence_cls": nn.CrossEntropyLoss(ignore_index=-1),
        "arousal_reg": nn.SmoothL1Loss(),
        "valence_reg": nn.SmoothL1Loss(),
    }
    total, details = compute_multitask_loss(
        logits, batch,
        {**LOSS_WEIGHTS, "arousal_reg": 0.5, "valence_reg": 0.5},
        criterions,
    )
    assert total.item() > 0
    assert details["arousal_reg"] > 0
    assert details["valence_reg"] > 0


# ===== Training loop with LSTM =====


class FakeSeqDeamDataset(torch.utils.data.Dataset):
    """Fake DEAM embedding sequence dataset."""

    def __init__(self, size: int = 4, d: int = 64) -> None:
        self.size = size
        self.d = d

    def __len__(self) -> int:
        return self.size

    def __getitem__(self, idx: int) -> dict:
        length = 5 + idx * 2
        return {
            "x": torch.randn(length, self.d),
            "y_seg": None,
            "y_ar": torch.randint(0, 3, (length,)),
            "y_val": torch.randint(0, 3, (length,)),
            "y_ar_cont": None,
            "y_val_cont": None,
            "length": length,
        }


class FakeSeqStructureDataset(torch.utils.data.Dataset):
    """Fake Structure embedding sequence dataset."""

    def __init__(self, size: int = 4, d: int = 64) -> None:
        self.size = size
        self.d = d

    def __len__(self) -> int:
        return self.size

    def __getitem__(self, idx: int) -> dict:
        length = 5 + idx * 2
        return {
            "x": torch.randn(length, self.d),
            "y_seg": torch.randint(0, 6, (length,)),
            "y_ar": None,
            "y_val": None,
            "y_ar_cont": None,
            "y_val_cont": None,
            "length": length,
        }


def _make_seq_loader(*datasets, batch_size=2):
    from musicml.datasets.multitask import RoundRobinLoader
    loaders = [
        torch.utils.data.DataLoader(
            ds, batch_size=batch_size, collate_fn=collate_sequences,
        )
        for ds in datasets
    ]
    return RoundRobinLoader(*loaders)


def test_train_epoch_lstm() -> None:
    """Training epoch should work with LSTMMultiTask + sequence data."""
    d = 64
    model = LSTMMultiTask(
        embedding_dim=d, lstm_hidden=32, lstm_layers=1,
    )
    loader = _make_seq_loader(
        FakeSeqDeamDataset(4, d), FakeSeqStructureDataset(4, d),
        batch_size=2,
    )
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    criterion = nn.CrossEntropyLoss(ignore_index=-1)

    metrics = train_epoch(
        model, loader, optimizer, criterion, LOSS_WEIGHTS, "cpu",
    )
    assert "loss" in metrics
    assert metrics["loss"] > 0


def test_validate_lstm() -> None:
    """Validation should work with LSTMMultiTask + sequence data."""
    d = 64
    model = LSTMMultiTask(
        embedding_dim=d, lstm_hidden=32, lstm_layers=1,
    )
    loader = _make_seq_loader(
        FakeSeqDeamDataset(4, d), FakeSeqStructureDataset(4, d),
        batch_size=2,
    )
    criterion = nn.CrossEntropyLoss(ignore_index=-1)

    metrics = validate(model, loader, criterion, LOSS_WEIGHTS, "cpu")
    assert "loss" in metrics
    assert metrics["loss"] > 0


# ===== Per-window embedding training =====


class FakeWindowDeamEmbDataset(torch.utils.data.Dataset):
    """Fake DEAM per-window embedding dataset."""

    def __init__(self, size: int = 8, d: int = 128) -> None:
        self.size = size
        self.d = d

    def __len__(self) -> int:
        return self.size

    def __getitem__(self, idx: int) -> dict:
        return {
            "x": torch.randn(self.d),
            "y_seg": None,
            "y_ar": idx % 3,
            "y_val": idx % 3,
            "y_ar_cont": None,
            "y_val_cont": None,
            "y_genre": None,
        }


def _make_pw_loader(*datasets, batch_size=4):
    from musicml.datasets.multitask import RoundRobinLoader
    loaders = [
        torch.utils.data.DataLoader(
            ds, batch_size=batch_size, collate_fn=collate_multitask,
        )
        for ds in datasets
    ]
    return RoundRobinLoader(*loaders)


def test_train_epoch_linear() -> None:
    """Training epoch should work with LinearMultiTask + per-window data."""
    d = 128
    model = LinearMultiTask(embedding_dim=d)
    loader = _make_pw_loader(FakeWindowDeamEmbDataset(8, d), batch_size=4)
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    criterion = nn.CrossEntropyLoss(ignore_index=-1)

    metrics = train_epoch(
        model, loader, optimizer, criterion, LOSS_WEIGHTS, "cpu",
    )
    assert "loss" in metrics
    assert metrics["loss"] > 0


# ===== Old CNN tests still work =====


def test_cnn_2d_logits_unchanged() -> None:
    """Existing CNN model should still work (2D logits)."""
    from musicml.models import CNNMultiTask
    model = CNNMultiTask()
    x = torch.randn(4, 1, 128, 344)
    logits = model(x)

    batch = {
        "y_seg": torch.tensor([0, 1, 2, 3]),
        "y_ar": torch.tensor([0, 1, 2, 0]),
        "y_val": torch.tensor([1, 0, 2, 1]),
    }

    criterion = nn.CrossEntropyLoss(ignore_index=-1)
    total, details = compute_multitask_loss(
        logits, batch, LOSS_WEIGHTS, criterion,
    )
    assert total.item() > 0

    acc = compute_accuracy(logits, batch)
    assert isinstance(acc["segment"], float)
    assert isinstance(acc["arousal_cls"], float)
    assert isinstance(acc["valence_cls"], float)
