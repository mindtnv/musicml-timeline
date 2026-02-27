"""Audio feature extraction: log-mel spectrogram, chroma, MFCC, RMS."""

from __future__ import annotations

import numpy as np


def load_audio(
    path: str,
    sr: int = 22050,
    mono: bool = True,
) -> tuple[np.ndarray, int]:
    """Load audio file, resample to target sr, convert to mono.

    Returns (y, sr) tuple.
    """
    import librosa

    y, sr_out = librosa.load(path, sr=sr, mono=mono)
    return y, sr_out


def compute_log_mel(
    y: np.ndarray,
    sr: int = 22050,
    n_fft: int = 2048,
    hop_length: int = 512,
    n_mels: int = 128,
    fmin: float = 30.0,
    fmax: float | None = None,
) -> np.ndarray:
    """Compute log-mel spectrogram (dB scale).

    Returns array of shape (n_mels, T).
    """
    import librosa

    if fmax is None:
        fmax = sr / 2.0
    mel = librosa.feature.melspectrogram(
        y=y,
        sr=sr,
        n_fft=n_fft,
        hop_length=hop_length,
        n_mels=n_mels,
        fmin=fmin,
        fmax=fmax,
    )
    log_mel = librosa.power_to_db(mel, ref=np.max)
    return log_mel


def compute_chroma(
    y: np.ndarray,
    sr: int = 22050,
    hop_length: int = 512,
) -> np.ndarray:
    """Compute chromagram. Returns array of shape (12, T)."""
    import librosa

    return librosa.feature.chroma_stft(y=y, sr=sr, hop_length=hop_length)


def compute_mfcc(
    y: np.ndarray,
    sr: int = 22050,
    n_mfcc: int = 20,
    hop_length: int = 512,
) -> np.ndarray:
    """Compute MFCCs. Returns array of shape (n_mfcc, T)."""
    import librosa

    return librosa.feature.mfcc(y=y, sr=sr, n_mfcc=n_mfcc, hop_length=hop_length)


def compute_rms(
    y: np.ndarray,
    hop_length: int = 512,
) -> np.ndarray:
    """Compute RMS energy. Returns array of shape (1, T)."""
    import librosa

    return librosa.feature.rms(y=y, hop_length=hop_length)


def compute_features(
    y: np.ndarray,
    sr: int = 22050,
    mode: str = "log_mel",
    n_mels: int = 128,
    n_fft: int = 2048,
    hop_length: int = 512,
    fmin: float = 30.0,
    fmax: float | None = None,
) -> np.ndarray:
    """Compute features based on mode.

    Args:
        y: Audio signal.
        sr: Sample rate.
        mode: "log_mel" -> (n_mels, T); "log_mel_chroma" -> (2, n_mels, T).
        n_mels: Number of mel bands.
        n_fft: FFT size.
        hop_length: Hop length.
        fmin: Minimum frequency for mel filterbank.
        fmax: Maximum frequency (defaults to sr/2).

    Returns:
        Feature array: 2D (F, T) for log_mel, 3D (C, F, T) for log_mel_chroma.

    Raises:
        ValueError: If mode is not recognized.
    """
    if mode == "log_mel":
        return compute_log_mel(
            y, sr=sr, n_fft=n_fft, hop_length=hop_length,
            n_mels=n_mels, fmin=fmin, fmax=fmax,
        )
    elif mode == "log_mel_chroma":
        log_mel = compute_log_mel(
            y, sr=sr, n_fft=n_fft, hop_length=hop_length,
            n_mels=n_mels, fmin=fmin, fmax=fmax,
        )
        chroma = compute_chroma(y, sr=sr, hop_length=hop_length)
        # Pad chroma (12, T) to (n_mels, T) with zeros
        pad_rows = n_mels - chroma.shape[0]
        chroma_padded = np.pad(chroma, ((0, pad_rows), (0, 0)), mode="constant")
        # Stack as 2 channels: (2, n_mels, T)
        return np.stack([log_mel, chroma_padded], axis=0)
    else:
        raise ValueError(
            f"Unknown feature mode: {mode!r}. "
            "Use 'log_mel' or 'log_mel_chroma'."
        )


def compute_feature_stats(
    feature_dir: str,
    track_ids: list | None = None,
) -> tuple[np.ndarray, np.ndarray]:
    """Compute per-frequency-bin mean and std across all .npz feature files.

    Args:
        feature_dir: Directory containing ``{track_id}.npz`` files with ``log_mel`` key.
        track_ids: Optional list of track IDs to include. If None, uses all .npz files.

    Returns:
        (mean, std) arrays of shape ``(n_mels, 1)`` computed with Welford's algorithm.
    """
    from pathlib import Path

    feature_path = Path(feature_dir)
    if track_ids is not None:
        npz_files = [feature_path / f"{tid}.npz" for tid in track_ids]
        npz_files = [f for f in npz_files if f.exists()]
    else:
        npz_files = sorted(feature_path.glob("*.npz"))

    n = 0
    mean = None
    m2 = None

    for npz_path in npz_files:
        data = np.load(npz_path)
        log_mel = data["log_mel"]  # (n_mels, T)

        if mean is None:
            n_mels = log_mel.shape[0]
            mean = np.zeros(n_mels, dtype=np.float64)
            m2 = np.zeros(n_mels, dtype=np.float64)

        for t in range(log_mel.shape[1]):
            col = log_mel[:, t].astype(np.float64)
            n += 1
            delta = col - mean
            mean += delta / n
            delta2 = col - mean
            m2 += delta * delta2

    if n < 2:
        raise ValueError(
            f"Need at least 2 frames to compute stats, got {n} "
            f"from {len(npz_files)} files in {feature_dir}"
        )

    variance = m2 / n
    std = np.sqrt(variance)

    return mean.reshape(-1, 1).astype(np.float32), std.reshape(-1, 1).astype(np.float32)


def window_features(
    features: np.ndarray,
    sr: int = 22050,
    hop_length: int = 512,
    window_seconds: float = 8.0,
    hop_seconds: float = 1.0,
) -> np.ndarray:
    """Split feature matrix into overlapping windows.

    Args:
        features: Feature matrix of shape (F, T) or (C, F, T).
        sr: Sample rate.
        hop_length: Hop length used for feature extraction.
        window_seconds: Window duration in seconds.
        hop_seconds: Hop between windows in seconds.

    Returns:
        For 2D input (F, T): array of shape (N, 1, F, W).
        For 3D input (C, F, T): array of shape (N, C, F, W).
    """
    frames_per_sec = sr / hop_length
    window_frames = int(window_seconds * frames_per_sec)
    hop_frames = int(hop_seconds * frames_per_sec)

    is_3d = features.ndim == 3

    if is_3d:
        n_channels = features.shape[0]
        n_features = features.shape[1]
        total_frames = features.shape[2]
    else:
        n_features = features.shape[0]
        total_frames = features.shape[1]

    windows: list[np.ndarray] = []
    start = 0
    while start + window_frames <= total_frames:
        if is_3d:
            windows.append(features[:, :, start : start + window_frames])
        else:
            windows.append(features[:, start : start + window_frames])
        start += hop_frames

    # Include last partial window if it has at least half the frames
    if start < total_frames and (total_frames - start) >= window_frames // 2:
        pad_width = window_frames - (total_frames - start)
        if is_3d:
            last = np.pad(
                features[:, :, start:],
                ((0, 0), (0, 0), (0, pad_width)),
                mode="edge",
            )
        else:
            last = np.pad(features[:, start:], ((0, 0), (0, pad_width)), mode="edge")
        windows.append(last)

    if len(windows) == 0:
        if is_3d:
            return np.empty((0, n_channels, n_features, window_frames))
        return np.empty((0, 1, n_features, window_frames))

    stacked = np.stack(windows, axis=0)

    if is_3d:
        # Already (N, C, F, W)
        return stacked
    else:
        # (N, F, W) → (N, 1, F, W)
        return stacked[:, np.newaxis, :, :]
