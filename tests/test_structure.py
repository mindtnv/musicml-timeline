"""Tests for StructureDataset on synthetic toy data."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

from musicml.datasets.structure import (
    StructureDataset,
    dominant_label,
    map_label,
    parse_annotations,
)

SR = 22050
TRACK_DURATION = 30.0  # seconds
N_TRACKS = 3
TRACK_IDS = ["track_001", "track_002", "track_003"]

# Annotation layout: intro(0-8) → verse(8-16) → chorus(16-24) → outro(24-30)
ANNOTATIONS = [
    (0.0, "intro"),
    (8.0, "verse"),
    (16.0, "chorus"),
    (24.0, "outro"),
    (30.0, "end"),
]


@pytest.fixture()
def toy_structure(tmp_path: Path) -> dict[str, Path]:
    """Create a minimal Harmonix-like dataset with synthetic wav + TSV."""
    audio_dir = tmp_path / "audio"
    audio_dir.mkdir()
    annotations_dir = tmp_path / "annotations"
    annotations_dir.mkdir()

    n_samples = int(SR * TRACK_DURATION)
    t = np.linspace(0, TRACK_DURATION, n_samples, endpoint=False)

    for tid in TRACK_IDS:
        freq = 440
        y = (0.3 * np.sin(2 * np.pi * freq * t)).astype(np.float32)
        sf.write(str(audio_dir / f"{tid}.wav"), y, SR)

        tsv_path = annotations_dir / f"{tid}.tsv"
        with open(tsv_path, "w") as f:
            for time_sec, label in ANNOTATIONS:
                f.write(f"{time_sec}\t{label}\n")

    return {
        "audio_dir": audio_dir,
        "annotations_dir": annotations_dir,
    }


def test_dataset_creation(toy_structure: dict[str, Path]) -> None:
    ds = StructureDataset(
        annotations_dir=toy_structure["annotations_dir"],
        audio_dir=toy_structure["audio_dir"],
        window_seconds=4.0,
        hop_seconds=2.0,
    )
    assert len(ds) > 0


def test_dataset_filter_track_ids(toy_structure: dict[str, Path]) -> None:
    ds_all = StructureDataset(
        annotations_dir=toy_structure["annotations_dir"],
        audio_dir=toy_structure["audio_dir"],
        window_seconds=4.0,
        hop_seconds=2.0,
    )
    ds_one = StructureDataset(
        annotations_dir=toy_structure["annotations_dir"],
        audio_dir=toy_structure["audio_dir"],
        track_ids=["track_001"],
        window_seconds=4.0,
        hop_seconds=2.0,
    )
    assert len(ds_one) < len(ds_all)
    assert len(ds_one) > 0


def test_getitem_shape(toy_structure: dict[str, Path]) -> None:
    ds = StructureDataset(
        annotations_dir=toy_structure["annotations_dir"],
        audio_dir=toy_structure["audio_dir"],
        window_seconds=4.0,
        hop_seconds=2.0,
    )
    sample = ds[0]
    assert "x" in sample
    assert "y_seg" in sample
    assert "y_ar" in sample
    assert "y_val" in sample

    x = sample["x"]
    assert x.ndim == 3  # (1, F, T)
    assert x.shape[0] == 1
    assert x.shape[1] == 128  # n_mels
    assert sample["y_seg"] in range(6)
    assert sample["y_ar"] is None
    assert sample["y_val"] is None
    assert sample["y_ar_cont"] is None
    assert sample["y_val_cont"] is None


def test_map_label_known() -> None:
    assert map_label("chorus") == "Chorus"
    assert map_label("Chorus") == "Chorus"
    assert map_label("intro") == "Intro"
    assert map_label("verse") == "Verse"
    assert map_label("bridge") == "Bridge"
    assert map_label("outro") == "Outro"


def test_map_label_unknown() -> None:
    assert map_label("unknown") == "Verse"
    assert map_label("weird_thing") == "Verse"


def test_dominant_label_simple() -> None:
    """Test dominant label with known overlaps."""
    intervals = [
        (0.0, 10.0, "intro"),
        (10.0, 20.0, "chorus"),
        (20.0, 30.0, "outro"),
    ]
    # Window fully inside intro → Intro
    assert dominant_label(2.0, 8.0, intervals) == "Intro"
    # Window fully inside chorus → Chorus
    assert dominant_label(12.0, 18.0, intervals) == "Chorus"
    # Window overlapping intro(3s) and chorus(5s) → Chorus wins
    assert dominant_label(7.0, 15.0, intervals) == "Chorus"
    # Window overlapping chorus(2s) and outro(6s) → Outro wins
    assert dominant_label(18.0, 26.0, intervals) == "Outro"


def test_parse_annotations(tmp_path: Path) -> None:
    tsv = tmp_path / "test.tsv"
    tsv.write_text("0.0\tintro\n10.0\tverse\n20.0\tchorus\n")
    entries = parse_annotations(tsv)
    assert len(entries) == 3
    assert entries[0] == (0.0, "intro")
    assert entries[2] == (20.0, "chorus")


def test_dataloader_compatible(toy_structure: dict[str, Path]) -> None:
    import torch

    from musicml.datasets.multitask import collate_multitask

    ds = StructureDataset(
        annotations_dir=toy_structure["annotations_dir"],
        audio_dir=toy_structure["audio_dir"],
        window_seconds=4.0,
        hop_seconds=2.0,
    )

    loader = torch.utils.data.DataLoader(
        ds, batch_size=2, shuffle=False, collate_fn=collate_multitask,
    )
    batch = next(iter(loader))
    assert batch["x"].ndim == 4  # (B, 1, F, T)
    assert batch["x"].shape[0] == 2
    assert batch["y_seg"] is not None
    assert batch["y_ar"] is None
    assert batch["y_val"] is None


def test_cached_features(toy_structure: dict[str, Path], tmp_path: Path) -> None:
    """Test loading from pre-computed .npz cache."""
    cache_dir = tmp_path / "cache"
    cache_dir.mkdir()

    from musicml.features import compute_log_mel, load_audio

    audio_path = toy_structure["audio_dir"] / "track_001.wav"
    y, sr = load_audio(str(audio_path), sr=SR)
    log_mel = compute_log_mel(y, sr=sr, n_mels=128)
    np.savez_compressed(cache_dir / "track_001.npz", log_mel=log_mel)

    ds = StructureDataset(
        annotations_dir=toy_structure["annotations_dir"],
        feature_cache_dir=cache_dir,
        track_ids=["track_001"],
        window_seconds=4.0,
        hop_seconds=2.0,
    )
    sample = ds[0]
    assert sample["x"].shape[0] == 1
    assert sample["x"].shape[1] == 128
