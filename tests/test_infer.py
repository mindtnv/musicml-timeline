"""Tests for inference pipeline (Step 6)."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest
import torch

from musicml.infer import (
    build_timeline,
    extract_features,
    load_model,
    plot_timeline,
    predict_windows,
    run_inference,
)
from musicml.models import CNNMultiTask
from musicml.train import save_checkpoint
from musicml.utils import load_config


@pytest.fixture
def cfg() -> dict:
    return load_config("configs/default.yaml")


@pytest.fixture
def fake_checkpoint(tmp_path: Path) -> Path:
    """Save a random CNNMultiTask as a checkpoint."""
    model = CNNMultiTask()
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    ckpt_path = tmp_path / "fake.pt"
    save_checkpoint(model, optimizer, None, epoch=0, metrics={}, path=ckpt_path)
    return ckpt_path


@pytest.fixture
def fake_audio(tmp_path: Path) -> Path:
    """Create a 12-second sine wave WAV file."""
    import soundfile as sf

    sr = 22050
    duration = 12.0
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    y = (0.5 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
    path = tmp_path / "test_audio.wav"
    sf.write(str(path), y, sr)
    return path


def test_load_model(fake_checkpoint: Path, cfg: dict) -> None:
    model = load_model(fake_checkpoint, cfg["model"], device="cpu")
    assert not model.training
    x = torch.randn(1, 1, 128, 344)
    seg, aro, val = model(x)
    assert seg.shape == (1, 4)
    assert aro.shape == (1, 3)
    assert val.shape == (1, 3)


def test_extract_features_shape(fake_audio: Path, cfg: dict) -> None:
    windows, duration = extract_features(fake_audio, cfg)
    assert windows.ndim == 4
    assert windows.shape[1] == 1  # channels
    assert windows.shape[2] == 128  # n_mels
    assert duration > 0


def test_extract_features_duration(fake_audio: Path, cfg: dict) -> None:
    _, duration = extract_features(fake_audio, cfg)
    assert 11.0 < duration < 13.0  # ~12s sine wave


def test_predict_windows_keys(fake_checkpoint: Path, cfg: dict) -> None:
    model = load_model(fake_checkpoint, cfg["model"], device="cpu")
    windows = np.random.randn(5, 1, 128, 344).astype(np.float32)
    result = predict_windows(model, windows, "cpu", batch_size=2)

    for head in ("segment", "arousal", "valence"):
        assert head in result
        assert "predictions" in result[head]
        assert "probabilities" in result[head]


def test_predict_windows_value_ranges(fake_checkpoint: Path, cfg: dict) -> None:
    model = load_model(fake_checkpoint, cfg["model"], device="cpu")
    windows = np.random.randn(5, 1, 128, 344).astype(np.float32)
    result = predict_windows(model, windows, "cpu")

    for head, n_classes in [("segment", 4), ("arousal", 3), ("valence", 3)]:
        preds = result[head]["predictions"]
        probs = result[head]["probabilities"]
        assert np.all(preds >= 0)
        assert np.all(preds < n_classes)
        assert np.all(probs >= 0)
        assert np.all(probs <= 1.0 + 1e-6)


def test_build_timeline_structure(cfg: dict) -> None:
    raw = {}
    for head, n_cls in [("segment", 4), ("arousal", 3), ("valence", 3)]:
        raw[head] = {
            "predictions": np.random.randint(0, n_cls, size=20),
            "probabilities": np.random.rand(20),
        }

    timeline = build_timeline(raw, cfg, audio_duration=30.0)

    assert "metadata" in timeline
    assert timeline["metadata"]["duration_sec"] == 30.0
    for head in ("segment", "arousal", "valence"):
        assert head in timeline
        assert isinstance(timeline[head], list)
        if len(timeline[head]) > 0:
            seg = timeline[head][0]
            assert "start" in seg
            assert "end" in seg
            assert "label" in seg
            assert "confidence" in seg


def test_run_inference_end_to_end(
    fake_audio: Path, fake_checkpoint: Path, cfg: dict
) -> None:
    timeline = run_inference(fake_audio, fake_checkpoint, cfg, device="cpu")

    assert "metadata" in timeline
    assert "segment" in timeline
    assert "arousal" in timeline
    assert "valence" in timeline
    assert timeline["metadata"]["duration_sec"] > 0


def test_plot_timeline_creates_file(tmp_path: Path, cfg: dict) -> None:
    timeline = {
        "metadata": {"duration_sec": 30.0, "window_seconds": 8.0, "hop_seconds": 1.0},
        "segment": [
            {"start": 0, "end": 10, "label": "Calm", "confidence": 0.9},
            {"start": 10, "end": 30, "label": "Climax", "confidence": 0.8},
        ],
        "arousal": [
            {"start": 0, "end": 30, "label": "Mid", "confidence": 0.7},
        ],
        "valence": [
            {"start": 0, "end": 15, "label": "Dark", "confidence": 0.6},
            {"start": 15, "end": 30, "label": "Bright", "confidence": 0.8},
        ],
    }
    plot_path = tmp_path / "timeline.png"
    plot_timeline(timeline, plot_path)
    assert plot_path.exists()
    assert plot_path.stat().st_size > 0


def test_predict_windows_all_probs(
    fake_checkpoint: Path, cfg: dict,
) -> None:
    model = load_model(fake_checkpoint, cfg["model"], device="cpu")
    windows = np.random.randn(5, 1, 128, 344).astype(np.float32)
    result = predict_windows(model, windows, "cpu")

    for head, n_classes in [("segment", 4), ("arousal", 3), ("valence", 3)]:
        all_probs = result[head]["all_probs"]
        assert all_probs.shape == (5, n_classes)
        # Each row sums to ~1
        row_sums = all_probs.sum(axis=1)
        np.testing.assert_allclose(row_sums, 1.0, atol=1e-5)


def test_frame_predictions_in_timeline(
    fake_audio: Path, fake_checkpoint: Path, cfg: dict,
) -> None:
    timeline = run_inference(fake_audio, fake_checkpoint, cfg, device="cpu")

    assert "frame_predictions" in timeline
    fp = timeline["frame_predictions"]
    assert "frame_hop_seconds" in fp
    assert "segment_probs" in fp
    assert "arousal_probs" in fp
    assert "valence_probs" in fp
    # Each entry is a list of lists
    assert len(fp["segment_probs"]) > 0
    assert len(fp["segment_probs"][0]) == 4  # 4 segment classes
    assert len(fp["arousal_probs"][0]) == 3
    assert len(fp["valence_probs"][0]) == 3


def test_timeline_json_serializable(
    fake_audio: Path, fake_checkpoint: Path, cfg: dict,
) -> None:
    timeline = run_inference(fake_audio, fake_checkpoint, cfg, device="cpu")
    serialized = json.dumps(timeline)
    assert isinstance(serialized, str)
    parsed = json.loads(serialized)
    assert "metadata" in parsed
    assert "frame_predictions" in parsed
