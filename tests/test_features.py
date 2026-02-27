"""Tests for musicml.features on synthetic audio signals."""

from __future__ import annotations

import numpy as np
import pytest

from musicml.features import (
    compute_chroma,
    compute_log_mel,
    compute_mfcc,
    compute_rms,
    window_features,
)

SR = 22050
DURATION = 5.0
HOP_LENGTH = 512


@pytest.fixture()
def sine_wave() -> np.ndarray:
    """Generate a 440 Hz sine wave, 5 seconds long."""
    t = np.linspace(0, DURATION, int(SR * DURATION), endpoint=False)
    return (0.5 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)


# --- compute_log_mel ---


def test_log_mel_shape(sine_wave: np.ndarray) -> None:
    mel = compute_log_mel(sine_wave, sr=SR, hop_length=HOP_LENGTH)
    assert mel.shape[0] == 128
    assert mel.shape[1] > 0


def test_log_mel_custom_n_mels(sine_wave: np.ndarray) -> None:
    mel = compute_log_mel(sine_wave, sr=SR, hop_length=HOP_LENGTH, n_mels=64)
    assert mel.shape[0] == 64


def test_log_mel_db_range(sine_wave: np.ndarray) -> None:
    mel = compute_log_mel(sine_wave, sr=SR, hop_length=HOP_LENGTH)
    assert mel.max() <= 0.0  # ref=np.max → max is 0 dB
    assert mel.min() >= -80.0  # librosa default floor


# --- compute_chroma ---


def test_chroma_shape(sine_wave: np.ndarray) -> None:
    chroma = compute_chroma(sine_wave, sr=SR, hop_length=HOP_LENGTH)
    assert chroma.shape[0] == 12
    assert chroma.shape[1] > 0


def test_chroma_values_nonnegative(sine_wave: np.ndarray) -> None:
    chroma = compute_chroma(sine_wave, sr=SR, hop_length=HOP_LENGTH)
    assert np.all(chroma >= 0)


# --- compute_mfcc ---


def test_mfcc_shape(sine_wave: np.ndarray) -> None:
    mfcc = compute_mfcc(sine_wave, sr=SR, hop_length=HOP_LENGTH)
    assert mfcc.shape[0] == 20
    assert mfcc.shape[1] > 0


def test_mfcc_custom_n_mfcc(sine_wave: np.ndarray) -> None:
    mfcc = compute_mfcc(sine_wave, sr=SR, n_mfcc=13, hop_length=HOP_LENGTH)
    assert mfcc.shape[0] == 13


# --- compute_rms ---


def test_rms_shape(sine_wave: np.ndarray) -> None:
    rms = compute_rms(sine_wave, hop_length=HOP_LENGTH)
    assert rms.shape[0] == 1
    assert rms.shape[1] > 0


def test_rms_nonnegative(sine_wave: np.ndarray) -> None:
    rms = compute_rms(sine_wave, hop_length=HOP_LENGTH)
    assert np.all(rms >= 0)


def test_rms_silent_signal() -> None:
    silence = np.zeros(SR, dtype=np.float32)
    rms = compute_rms(silence, hop_length=HOP_LENGTH)
    assert np.allclose(rms, 0.0, atol=1e-6)


# --- window_features ---


def test_window_features_shape(sine_wave: np.ndarray) -> None:
    mel = compute_log_mel(sine_wave, sr=SR, hop_length=HOP_LENGTH)
    result = window_features(mel, sr=SR, hop_length=HOP_LENGTH, window_seconds=2.0)
    assert result.ndim == 4
    assert result.shape[1] == 1  # channel dim
    assert result.shape[2] == mel.shape[0]  # F


def test_window_features_num_windows(sine_wave: np.ndarray) -> None:
    mel = compute_log_mel(sine_wave, sr=SR, hop_length=HOP_LENGTH)
    window_sec = 2.0
    hop_sec = 1.0
    result = window_features(
        mel, sr=SR, hop_length=HOP_LENGTH,
        window_seconds=window_sec, hop_seconds=hop_sec,
    )
    frames_per_sec = SR / HOP_LENGTH
    window_frames = int(window_sec * frames_per_sec)
    hop_frames = int(hop_sec * frames_per_sec)
    expected_n = (mel.shape[1] - window_frames) // hop_frames + 1
    # May include padded last window, so N >= expected_n
    assert result.shape[0] >= expected_n


def test_window_features_first_window_matches(sine_wave: np.ndarray) -> None:
    mel = compute_log_mel(sine_wave, sr=SR, hop_length=HOP_LENGTH)
    window_sec = 2.0
    result = window_features(
        mel, sr=SR, hop_length=HOP_LENGTH, window_seconds=window_sec,
    )
    frames_per_sec = SR / HOP_LENGTH
    window_frames = int(window_sec * frames_per_sec)
    np.testing.assert_array_equal(
        result[0, 0, :, :], mel[:, :window_frames],
    )


def test_window_features_last_window_padded() -> None:
    """Last window is padded when partial window >= half window length."""
    n_features = 10
    # Create features where a partial window of sufficient length exists
    window_frames = 10
    # 15 frames → 1 full window (0-9) + 5 frames partial (>= 10//2=5) → padded
    features = np.random.randn(n_features, 15).astype(np.float32)
    result = window_features(
        features, sr=HOP_LENGTH * 1, hop_length=HOP_LENGTH,
        window_seconds=10.0 / 1.0, hop_seconds=10.0 / 1.0,
    )
    assert result.shape[0] == 2  # 1 full + 1 padded
    assert result.shape[3] == window_frames


def test_window_features_empty_on_short_audio() -> None:
    """Short audio produces empty (0, 1, F, W) array."""
    n_features = 128
    features = np.random.randn(n_features, 5).astype(np.float32)
    result = window_features(
        features, sr=SR, hop_length=HOP_LENGTH, window_seconds=8.0,
    )
    assert result.shape[0] == 0
    assert result.shape[1] == 1
    assert result.shape[2] == n_features


def test_window_features_integration_log_mel(sine_wave: np.ndarray) -> None:
    """Full pipeline: compute_log_mel → window_features → valid 4D tensor."""
    mel = compute_log_mel(sine_wave, sr=SR, hop_length=HOP_LENGTH, n_mels=128)
    result = window_features(mel, sr=SR, hop_length=HOP_LENGTH, window_seconds=2.0)
    assert result.ndim == 4
    assert result.shape[1] == 1
    assert result.shape[2] == 128
    assert np.isfinite(result).all()
