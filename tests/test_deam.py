"""Smoke tests for DEAMDataset on synthetic toy data."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

from musicml.datasets.deam import DEAMDataset

SR = 22050
TRACK_DURATION = 10.0  # seconds
N_TRACKS = 3
TRACK_IDS = [1, 2, 3]


@pytest.fixture()
def toy_deam(tmp_path: Path) -> dict[str, Path]:
    """Create a minimal DEAM-like dataset with synthetic wav + CSV + thresholds."""
    audio_dir = tmp_path / "audio"
    audio_dir.mkdir()

    # Generate sine wave audio files
    n_samples = int(SR * TRACK_DURATION)
    t = np.linspace(0, TRACK_DURATION, n_samples, endpoint=False)
    for tid in TRACK_IDS:
        freq = 220 * tid
        y = (0.3 * np.sin(2 * np.pi * freq * t)).astype(np.float32)
        sf.write(str(audio_dir / f"{tid}.wav"), y, SR)

    # Generate annotations CSV
    rows = []
    for tid in TRACK_IDS:
        for sec in np.arange(0.0, TRACK_DURATION, 0.5):
            rows.append({
                "track_id": tid,
                "time_sec": sec,
                "arousal": 3.0 + tid * 0.5 + np.random.uniform(-0.2, 0.2),
                "valence": 4.0 - tid * 0.3 + np.random.uniform(-0.2, 0.2),
            })

    import pandas as pd

    df = pd.DataFrame(rows)
    csv_path = tmp_path / "annotations.csv"
    df.to_csv(csv_path, index=False)

    # Generate thresholds
    thresholds = {
        "arousal_low_mid": 3.5,
        "arousal_mid_high": 4.5,
        "valence_low_mid": 3.0,
        "valence_mid_high": 4.0,
    }
    thresholds_path = tmp_path / "thresholds.json"
    with open(thresholds_path, "w") as f:
        json.dump(thresholds, f)

    return {
        "audio_dir": audio_dir,
        "csv_path": csv_path,
        "thresholds_path": thresholds_path,
    }


def test_dataset_creation(toy_deam: dict[str, Path]) -> None:
    ds = DEAMDataset(
        annotations_csv=toy_deam["csv_path"],
        thresholds_json=toy_deam["thresholds_path"],
        audio_dir=toy_deam["audio_dir"],
        window_seconds=4.0,
        hop_seconds=2.0,
    )
    assert len(ds) > 0


def test_dataset_filter_track_ids(toy_deam: dict[str, Path]) -> None:
    ds_all = DEAMDataset(
        annotations_csv=toy_deam["csv_path"],
        thresholds_json=toy_deam["thresholds_path"],
        audio_dir=toy_deam["audio_dir"],
        window_seconds=4.0,
        hop_seconds=2.0,
    )
    ds_one = DEAMDataset(
        annotations_csv=toy_deam["csv_path"],
        thresholds_json=toy_deam["thresholds_path"],
        audio_dir=toy_deam["audio_dir"],
        track_ids=[1],
        window_seconds=4.0,
        hop_seconds=2.0,
    )
    assert len(ds_one) < len(ds_all)
    assert len(ds_one) > 0


def test_getitem_shape(toy_deam: dict[str, Path]) -> None:
    ds = DEAMDataset(
        annotations_csv=toy_deam["csv_path"],
        thresholds_json=toy_deam["thresholds_path"],
        audio_dir=toy_deam["audio_dir"],
        window_seconds=4.0,
        hop_seconds=2.0,
    )
    sample = ds[0]
    assert "x" in sample
    assert "y_ar" in sample
    assert "y_val" in sample
    assert "y_seg" in sample

    x = sample["x"]
    assert x.ndim == 3  # (1, F, T)
    assert x.shape[0] == 1  # channel dim
    assert x.shape[1] == 128  # n_mels


def test_getitem_labels_valid(toy_deam: dict[str, Path]) -> None:
    ds = DEAMDataset(
        annotations_csv=toy_deam["csv_path"],
        thresholds_json=toy_deam["thresholds_path"],
        audio_dir=toy_deam["audio_dir"],
        window_seconds=4.0,
        hop_seconds=2.0,
    )
    for i in range(min(5, len(ds))):
        sample = ds[i]
        assert sample["y_ar"] in (0, 1, 2)
        assert sample["y_val"] in (0, 1, 2)
        assert sample["y_seg"] is None


def test_getitem_tensor_type(toy_deam: dict[str, Path]) -> None:
    import torch

    ds = DEAMDataset(
        annotations_csv=toy_deam["csv_path"],
        thresholds_json=toy_deam["thresholds_path"],
        audio_dir=toy_deam["audio_dir"],
        window_seconds=4.0,
        hop_seconds=2.0,
    )
    sample = ds[0]
    assert isinstance(sample["x"], torch.Tensor)
    assert sample["x"].dtype == torch.float32


def test_dataloader_compatible(toy_deam: dict[str, Path]) -> None:
    import torch

    ds = DEAMDataset(
        annotations_csv=toy_deam["csv_path"],
        thresholds_json=toy_deam["thresholds_path"],
        audio_dir=toy_deam["audio_dir"],
        window_seconds=4.0,
        hop_seconds=2.0,
    )

    def collate_fn(batch: list) -> dict:
        return {
            "x": torch.stack([s["x"] for s in batch]),
            "y_ar": torch.tensor([s["y_ar"] for s in batch]),
            "y_val": torch.tensor([s["y_val"] for s in batch]),
        }

    loader = torch.utils.data.DataLoader(
        ds, batch_size=2, shuffle=False, collate_fn=collate_fn,
    )
    batch = next(iter(loader))
    assert batch["x"].ndim == 4  # (B, 1, F, T)
    assert batch["x"].shape[0] == 2
    assert batch["y_ar"].shape == (2,)


def test_cached_features(toy_deam: dict[str, Path], tmp_path: Path) -> None:
    """Test loading from pre-computed .npz cache."""
    cache_dir = tmp_path / "cache"
    cache_dir.mkdir()

    # Pre-compute features for track 1
    from musicml.features import compute_log_mel, load_audio

    audio_path = toy_deam["audio_dir"] / "1.wav"
    y, sr = load_audio(str(audio_path), sr=SR)
    log_mel = compute_log_mel(y, sr=sr, n_mels=128)
    np.savez_compressed(cache_dir / "1.npz", log_mel=log_mel)

    ds = DEAMDataset(
        annotations_csv=toy_deam["csv_path"],
        thresholds_json=toy_deam["thresholds_path"],
        feature_cache_dir=cache_dir,
        track_ids=[1],
        window_seconds=4.0,
        hop_seconds=2.0,
    )
    sample = ds[0]
    assert sample["x"].shape[0] == 1
    assert sample["x"].shape[1] == 128
