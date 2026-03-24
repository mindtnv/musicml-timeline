"""GTZAN dataset for genre classification.

Loads audio files, computes log-mel spectrograms on-the-fly,
and returns windowed features with genre labels (track-level).
"""

from __future__ import annotations

import json
import random
from pathlib import Path
from typing import Any

import numpy as np

GENRE_CLASSES = [
    "blues", "classical", "country", "disco", "hiphop",
    "jazz", "metal", "pop", "reggae", "rock",
]


class GTZANDataset:
    """Dataset for GTZAN genre classification.

    Each sample is a fixed-length window of log-mel spectrogram features
    with a genre label inherited from the track-level annotation.
    """

    def __init__(
        self,
        genre_map_json: str | Path,
        audio_dir: str | Path | None = None,
        feature_cache_dir: str | Path | None = None,
        track_ids: list[str] | None = None,
        sr: int = 22050,
        hop_length: int = 512,
        n_mels: int = 128,
        window_seconds: float = 8.0,
        hop_seconds: float = 1.0,
        training: bool = False,
        stats_path: str | Path | None = None,
        spec_augment: dict | None = None,
    ) -> None:
        self.sr = sr
        self.hop_length = hop_length
        self.n_mels = n_mels
        self.window_seconds = window_seconds
        self.hop_seconds = hop_seconds
        self.spec_augment = spec_augment or {
            "freq_mask": 15, "time_mask": 25, "n_masks": 2,
        }
        self.audio_dir = Path(audio_dir) if audio_dir else None
        self.feature_cache_dir = (
            Path(feature_cache_dir) if feature_cache_dir else None
        )
        self.training = training

        self.frames_per_sec = sr / hop_length
        self.window_frames = int(window_seconds * self.frames_per_sec)
        self.hop_frames = int(hop_seconds * self.frames_per_sec)

        # Load normalization stats if provided
        self.feat_mean: np.ndarray | None = None
        self.feat_std: np.ndarray | None = None
        if stats_path is not None:
            stats = np.load(stats_path)
            self.feat_mean = stats["mean"]  # (n_mels, 1)
            self.feat_std = stats["std"]    # (n_mels, 1)

        # Load genre map
        with open(genre_map_json, encoding="utf-8") as f:
            self.genre_map: dict[str, int] = json.load(f)

        # Filter to requested track_ids if provided
        if track_ids is not None:
            self.genre_map = {
                tid: idx for tid, idx in self.genre_map.items()
                if tid in set(track_ids)
            }

        # Filter to tracks that have pre-computed features
        if self.feature_cache_dir is not None:
            before = len(self.genre_map)
            self.genre_map = {
                tid: idx for tid, idx in self.genre_map.items()
                if (self.feature_cache_dir / f"{tid}.npz").exists()
            }
            skipped = before - len(self.genre_map)
            if skipped > 0:
                import warnings
                warnings.warn(
                    f"Skipped {skipped} tracks without cached features"
                )

        self._feature_cache: dict[str, np.ndarray] = {}

        self.samples = self._build_samples()

        # Preload all features into RAM
        self._preload_features()

    def _build_samples(self) -> list[dict[str, Any]]:
        """Build list of windowed samples with genre labels.

        For each track, compute the number of windows from the feature
        duration. Every window inherits the track-level genre label.
        """
        samples: list[dict[str, Any]] = []

        for track_id in sorted(self.genre_map.keys()):
            genre_idx = self.genre_map[track_id]

            # Load features to determine duration
            features = self._load_features(track_id)
            total_frames = features.shape[1]
            duration_sec = total_frames / self.frames_per_sec

            start = 0.0
            while start + self.window_seconds <= duration_sec + 1e-6:
                samples.append({
                    "track_id": track_id,
                    "window_start_sec": start,
                    "y_genre": genre_idx,
                })
                start += self.hop_seconds

        return samples

    def _spec_augment(self, x: np.ndarray) -> np.ndarray:
        """Apply SpecAugment: frequency and time masking."""
        freq_mask = self.spec_augment["freq_mask"]
        time_mask = self.spec_augment["time_mask"]
        n_masks = self.spec_augment["n_masks"]
        x = x.copy()
        for _ in range(n_masks):
            f = random.randint(0, freq_mask)
            f0 = random.randint(0, max(x.shape[-2] - f, 0))
            x[..., f0:f0 + f, :] = 0
            t = random.randint(0, time_mask)
            t0 = random.randint(0, max(x.shape[-1] - t, 0))
            x[..., :, t0:t0 + t] = 0
        return x

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int) -> dict[str, Any]:
        import torch

        sample = self.samples[idx]
        track_id = sample["track_id"]
        start_sec = sample["window_start_sec"]

        features = self._load_features(track_id)
        start_frame = int(start_sec * self.frames_per_sec)
        end_frame = start_frame + self.window_frames

        if end_frame <= features.shape[1]:
            window = features[:, start_frame:end_frame]
        else:
            available = features[:, start_frame:]
            pad_width = self.window_frames - available.shape[1]
            window = np.pad(available, ((0, 0), (0, pad_width)), mode="edge")

        # Normalize features
        if self.feat_mean is not None and self.feat_std is not None:
            window = (window - self.feat_mean) / (self.feat_std + 1e-8)

        # SpecAugment (training only)
        if self.training:
            window = self._spec_augment(window)

        x = torch.from_numpy(window[np.newaxis, :, :]).float()

        return {
            "x": x,
            "y_genre": sample["y_genre"],
            "y_seg": None,
            "y_ar": None,
            "y_val": None,
            "y_ar_cont": None,
            "y_val_cont": None,
        }

    def _preload_features(self) -> None:
        """Preload all track features into RAM at init time."""
        track_ids = {s["track_id"] for s in self.samples}
        for tid in track_ids:
            if tid not in self._feature_cache:
                self._load_features(tid)

    def _load_features(self, track_id: str) -> np.ndarray:
        """Load or compute log-mel features for a track (cached in RAM)."""
        if track_id in self._feature_cache:
            return self._feature_cache[track_id]

        if self.feature_cache_dir is not None:
            npz_path = self.feature_cache_dir / f"{track_id}.npz"
            if npz_path.exists():
                data = np.load(npz_path)["log_mel"]
                self._feature_cache[track_id] = data
                return data

        if self.audio_dir is None:
            raise FileNotFoundError(
                f"No audio_dir or cached features for track {track_id}"
            )

        from musicml.features import compute_log_mel, load_audio

        audio_path = self._find_audio(track_id)
        y, sr = load_audio(str(audio_path), sr=self.sr)
        log_mel = compute_log_mel(
            y, sr=sr, hop_length=self.hop_length, n_mels=self.n_mels,
        )
        self._feature_cache[track_id] = log_mel
        return log_mel

    def _find_audio(self, track_id: str) -> Path:
        """Find audio file for a track_id in audio_dir.

        GTZAN structure: {genre}/{genre}.{number}.wav
        where track_id = "{genre}.{number}" (e.g. "blues.00000").
        """
        assert self.audio_dir is not None
        genre = track_id.split(".")[0]
        candidate = self.audio_dir / genre / f"{track_id}.wav"
        if candidate.exists():
            return candidate
        # Fallback: search directly in audio_dir
        for ext in (".wav", ".mp3", ".flac", ".ogg"):
            candidate = self.audio_dir / f"{track_id}{ext}"
            if candidate.exists():
                return candidate
        raise FileNotFoundError(
            f"Audio file for track {track_id} not found in {self.audio_dir}"
        )
