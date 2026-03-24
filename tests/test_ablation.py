"""Tests for ablation features (Step 8)."""

from __future__ import annotations

import numpy as np
import pytest
import torch

from musicml.features import compute_features, window_features
from musicml.models import CNNMultiTask


@pytest.fixture
def sine_signal() -> tuple[np.ndarray, int]:
    """Generate a short sine wave for feature tests."""
    sr = 22050
    duration = 3.0
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    y = (0.5 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
    return y, sr


def test_compute_features_log_mel_mode(sine_signal: tuple) -> None:
    y, sr = sine_signal
    feats = compute_features(y, sr=sr, mode="log_mel", n_mels=128)
    assert feats.ndim == 2
    assert feats.shape[0] == 128


def test_compute_features_chroma_mode(sine_signal: tuple) -> None:
    y, sr = sine_signal
    feats = compute_features(y, sr=sr, mode="log_mel_chroma", n_mels=128)
    assert feats.ndim == 3
    assert feats.shape[0] == 2  # 2 channels
    assert feats.shape[1] == 128


def test_compute_features_invalid_mode(sine_signal: tuple) -> None:
    y, sr = sine_signal
    with pytest.raises(ValueError, match="Unknown feature mode"):
        compute_features(y, sr=sr, mode="invalid_mode")


def test_window_features_3d_input() -> None:
    """3D input (C, F, T) should produce (N, C, F, W)."""
    features_3d = np.random.randn(2, 128, 500).astype(np.float32)
    windows = window_features(features_3d, sr=22050, hop_length=512)
    assert windows.ndim == 4
    assert windows.shape[1] == 2  # channels preserved
    assert windows.shape[2] == 128


def test_window_features_2d_backward_compat() -> None:
    """2D input (F, T) should still produce (N, 1, F, W)."""
    features_2d = np.random.randn(128, 500).astype(np.float32)
    windows = window_features(features_2d, sr=22050, hop_length=512)
    assert windows.ndim == 4
    assert windows.shape[1] == 1


def test_model_accepts_2_channels() -> None:
    model = CNNMultiTask(in_channels=2)
    x = torch.randn(2, 2, 128, 344)
    output = model(x)
    assert output["segment"].shape == (2, 6)
    assert output["arousal_cls"].shape == (2, 3)
    assert output["valence_cls"].shape == (2, 3)


def test_model_1_channel_default() -> None:
    model = CNNMultiTask()
    x = torch.randn(2, 1, 128, 344)
    output = model(x)
    assert output["segment"].shape == (2, 6)
