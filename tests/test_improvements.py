"""Tests for model improvements (stats, SEBlock, SpecAugment, normalization)."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf
import torch
import torch.nn as nn

from musicml.features import compute_feature_stats
from musicml.models import CNNMultiTask
from musicml.models.cnn_multitask import SEBlock
from musicml.train import compute_multitask_loss, train_epoch

SR = 22050


# --- compute_feature_stats ---


@pytest.fixture
def feature_dir(tmp_path: Path) -> Path:
    """Create a directory with synthetic .npz feature files."""
    feat_dir = tmp_path / "features"
    feat_dir.mkdir()
    rng = np.random.RandomState(42)
    for i in range(5):
        log_mel = rng.randn(128, 100).astype(np.float32) * 10 + (i * 5)
        np.savez_compressed(feat_dir / f"{i}.npz", log_mel=log_mel)
    return feat_dir


def test_compute_feature_stats_shape(feature_dir: Path) -> None:
    mean, std = compute_feature_stats(str(feature_dir))
    assert mean.shape == (128, 1)
    assert std.shape == (128, 1)


def test_compute_feature_stats_dtype(feature_dir: Path) -> None:
    mean, std = compute_feature_stats(str(feature_dir))
    assert mean.dtype == np.float32
    assert std.dtype == np.float32


def test_compute_feature_stats_with_track_ids(feature_dir: Path) -> None:
    mean_all, std_all = compute_feature_stats(str(feature_dir))
    mean_sub, std_sub = compute_feature_stats(str(feature_dir), track_ids=[0, 1])
    # Different subsets should give different stats
    assert not np.allclose(mean_all, mean_sub)


def test_compute_feature_stats_positive_std(feature_dir: Path) -> None:
    _, std = compute_feature_stats(str(feature_dir))
    assert np.all(std >= 0)


def test_compute_feature_stats_empty_dir(tmp_path: Path) -> None:
    empty_dir = tmp_path / "empty_features"
    empty_dir.mkdir()
    with pytest.raises(ValueError, match="Need at least 2 frames"):
        compute_feature_stats(str(empty_dir))


# --- SEBlock ---


def test_se_block_shape() -> None:
    se = SEBlock(channels=64)
    x = torch.randn(2, 64, 16, 32)
    out = se(x)
    assert out.shape == x.shape


def test_se_block_output_different() -> None:
    se = SEBlock(channels=32)
    x = torch.randn(2, 32, 8, 16)
    out = se(x)
    # SE block applies channel weighting, output should differ from input
    assert not torch.allclose(out, x)


def test_se_block_small_channels() -> None:
    """SEBlock should work even with channels < reduction."""
    se = SEBlock(channels=4, reduction=16)
    x = torch.randn(1, 4, 8, 8)
    out = se(x)
    assert out.shape == x.shape


# --- Updated CNNMultiTask ---


def test_cnn_param_count() -> None:
    """New model should have more params than old baseline (~94K)."""
    model = CNNMultiTask()
    params = model.count_params()
    assert params > 150_000  # significantly more than 94K


def test_cnn_gap_produces_256_features() -> None:
    model = CNNMultiTask()
    x = torch.randn(2, 1, 128, 344)
    # Access internal features
    features = model.backbone(x)
    pooled = model.gap(features).flatten(1)
    assert pooled.shape[1] == 256


# --- Per-head criterions ---


def test_compute_multitask_loss_with_dict_criterion() -> None:
    model = CNNMultiTask()
    x = torch.randn(4, 1, 128, 344)
    logits = model(x)

    criterions = {
        "segment": nn.CrossEntropyLoss(ignore_index=-1),
        "arousal": nn.CrossEntropyLoss(ignore_index=-1),
        "valence": nn.CrossEntropyLoss(ignore_index=-1),
    }
    batch = {
        "y_seg": None,
        "y_ar": torch.tensor([0, 1, 2, 0]),
        "y_val": torch.tensor([1, 1, 0, 2]),
    }
    loss_weights = {"segment": 1.0, "arousal": 1.0, "valence": 1.0}
    total, details = compute_multitask_loss(logits, batch, loss_weights, criterions)
    assert total.item() > 0
    assert details["segment"] == 0.0
    assert details["arousal"] > 0
    assert details["valence"] > 0


def test_compute_multitask_loss_with_weighted_criterion() -> None:
    model = CNNMultiTask()
    x = torch.randn(4, 1, 128, 344)
    logits = model(x)

    ar_weights = torch.tensor([1.0, 2.0, 1.5])
    criterions = {
        "segment": nn.CrossEntropyLoss(ignore_index=-1),
        "arousal": nn.CrossEntropyLoss(weight=ar_weights, ignore_index=-1),
        "valence": nn.CrossEntropyLoss(ignore_index=-1),
    }
    batch = {
        "y_seg": None,
        "y_ar": torch.tensor([0, 1, 2, 0]),
        "y_val": torch.tensor([1, 1, 0, 2]),
    }
    loss_weights = {"segment": 1.0, "arousal": 1.0, "valence": 1.0}
    total, details = compute_multitask_loss(logits, batch, loss_weights, criterions)
    assert total.item() > 0


# --- SpecAugment in datasets ---


def test_deam_spec_augment(tmp_path: Path) -> None:
    from musicml.datasets.deam import DEAMDataset

    audio_dir = tmp_path / "audio"
    audio_dir.mkdir()

    n_samples = int(SR * 10)
    t = np.linspace(0, 10, n_samples, endpoint=False)
    y = (0.3 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
    sf.write(str(audio_dir / "1.wav"), y, SR)

    import pandas as pd

    rows = [
        {"track_id": 1, "time_sec": sec, "arousal": 4.0, "valence": 3.5}
        for sec in np.arange(0, 10, 0.5)
    ]
    csv_path = tmp_path / "annotations.csv"
    pd.DataFrame(rows).to_csv(csv_path, index=False)

    thresholds = {
        "arousal_low_mid": 3.5, "arousal_mid_high": 4.5,
        "valence_low_mid": 3.0, "valence_mid_high": 4.0,
    }
    thresh_path = tmp_path / "thresholds.json"
    with open(thresh_path, "w") as f:
        json.dump(thresholds, f)

    ds_train = DEAMDataset(
        annotations_csv=csv_path,
        thresholds_json=thresh_path,
        audio_dir=audio_dir,
        window_seconds=4.0,
        hop_seconds=2.0,
        training=True,
    )
    ds_val = DEAMDataset(
        annotations_csv=csv_path,
        thresholds_json=thresh_path,
        audio_dir=audio_dir,
        window_seconds=4.0,
        hop_seconds=2.0,
        training=False,
    )

    sample_train = ds_train[0]
    sample_val = ds_val[0]

    # Both should return valid tensors
    assert sample_train["x"].shape == sample_val["x"].shape
    assert sample_train["x"].dtype == torch.float32


def test_deam_normalization(tmp_path: Path) -> None:
    from musicml.datasets.deam import DEAMDataset

    audio_dir = tmp_path / "audio"
    audio_dir.mkdir()
    feat_dir = tmp_path / "features"
    feat_dir.mkdir()

    # Create cached features
    log_mel = np.random.randn(128, 500).astype(np.float32) * 10 - 30
    np.savez_compressed(feat_dir / "1.npz", log_mel=log_mel)

    # Create stats
    mean = np.mean(log_mel, axis=1, keepdims=True).astype(np.float32)
    std = np.std(log_mel, axis=1, keepdims=True).astype(np.float32)
    stats_path = feat_dir / "stats.npz"
    np.savez(stats_path, mean=mean, std=std)

    import pandas as pd

    rows = [
        {"track_id": 1, "time_sec": sec, "arousal": 4.0, "valence": 3.5}
        for sec in np.arange(0, 11, 0.5)
    ]
    csv_path = tmp_path / "annotations.csv"
    pd.DataFrame(rows).to_csv(csv_path, index=False)

    thresholds = {
        "arousal_low_mid": 3.5, "arousal_mid_high": 4.5,
        "valence_low_mid": 3.0, "valence_mid_high": 4.0,
    }
    thresh_path = tmp_path / "thresholds.json"
    with open(thresh_path, "w") as f:
        json.dump(thresholds, f)

    ds_norm = DEAMDataset(
        annotations_csv=csv_path,
        thresholds_json=thresh_path,
        feature_cache_dir=feat_dir,
        track_ids=[1],
        window_seconds=4.0,
        hop_seconds=2.0,
        stats_path=stats_path,
    )
    ds_raw = DEAMDataset(
        annotations_csv=csv_path,
        thresholds_json=thresh_path,
        feature_cache_dir=feat_dir,
        track_ids=[1],
        window_seconds=4.0,
        hop_seconds=2.0,
    )

    sample_norm = ds_norm[0]
    sample_raw = ds_raw[0]

    # Normalized data should have values closer to 0
    assert abs(sample_norm["x"].mean().item()) < abs(sample_raw["x"].mean().item())


# --- train_epoch with scheduler ---


def test_train_epoch_with_scheduler() -> None:
    from musicml.datasets.multitask import RoundRobinLoader, collate_multitask

    class FakeDS(torch.utils.data.Dataset):
        def __init__(self, size=8):
            self.size = size

        def __len__(self):
            return self.size

        def __getitem__(self, idx):
            return {
                "x": torch.randn(1, 128, 344),
                "y_seg": None,
                "y_ar": idx % 3,
                "y_val": idx % 3,
            }

    loader = RoundRobinLoader(
        torch.utils.data.DataLoader(
            FakeDS(), batch_size=4, collate_fn=collate_multitask,
        ),
    )

    model = CNNMultiTask()
    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-3)
    scheduler = torch.optim.lr_scheduler.OneCycleLR(
        optimizer, max_lr=3e-3, epochs=1, steps_per_epoch=len(loader),
    )
    criterion = nn.CrossEntropyLoss(ignore_index=-1)
    loss_weights = {"segment": 1.0, "arousal": 1.0, "valence": 1.0}

    metrics = train_epoch(
        model, loader, optimizer, criterion, loss_weights, "cpu",
        scheduler=scheduler,
    )
    assert "loss" in metrics
    assert metrics["loss"] > 0
