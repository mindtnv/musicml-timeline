"""DEAM dataset for arousal/valence emotion recognition.

Loads audio files, computes log-mel spectrograms on-the-fly,
and returns windowed features with discretized emotion labels.
"""

from __future__ import annotations

import json
import random
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd


class DEAMDataset:
    """Dataset for DEAM arousal/valence annotations.

    Each sample is a fixed-length window of log-mel spectrogram features
    with discretized arousal and valence labels, plus continuous values.
    """

    def __init__(
        self,
        annotations_csv: str | Path,
        thresholds_json: str | Path,
        audio_dir: str | Path | None = None,
        feature_cache_dir: str | Path | None = None,
        track_ids: list[int] | None = None,
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

        with open(thresholds_json, encoding="utf-8") as f:
            thresholds = json.load(f)
        self.arousal_thresholds: tuple[float, float] = (
            thresholds["arousal_low_mid"],
            thresholds["arousal_mid_high"],
        )
        self.valence_thresholds: tuple[float, float] = (
            thresholds["valence_low_mid"],
            thresholds["valence_mid_high"],
        )

        df = pd.read_csv(annotations_csv)
        if track_ids is not None:
            df = df[df["track_id"].isin(track_ids)].reset_index(drop=True)

        self._feature_cache: dict[int, np.ndarray] = {}

        self.samples = self._build_samples(df)

        # Preload all features into RAM
        self._preload_features()

    def _build_samples(self, df: pd.DataFrame) -> list[dict[str, Any]]:
        """Build list of samples with discrete and continuous labels."""
        samples: list[dict[str, Any]] = []

        for track_id, group in df.groupby("track_id"):
            group = group.sort_values("time_sec")
            times = group["time_sec"].values
            arousals = group["arousal"].values
            valences = group["valence"].values

            duration = times[-1] if len(times) > 0 else 0.0
            start = 0.0
            while start + self.window_seconds <= duration + 1e-6:
                end = start + self.window_seconds
                mask = (times >= start) & (times < end)
                if mask.any():
                    mean_ar = float(np.mean(arousals[mask]))
                    mean_val = float(np.mean(valences[mask]))
                else:
                    mean_ar = float(np.mean(arousals))
                    mean_val = float(np.mean(valences))

                y_ar = self._discretize(mean_ar, self.arousal_thresholds)
                y_val = self._discretize(mean_val, self.valence_thresholds)

                samples.append({
                    "track_id": int(track_id),
                    "window_start_sec": start,
                    "y_ar": y_ar,
                    "y_val": y_val,
                    "y_ar_cont": mean_ar,
                    "y_val_cont": mean_val,
                })
                start += self.hop_seconds

        return samples

    @staticmethod
    def _discretize(value: float, thresholds: tuple[float, float]) -> int:
        """Map continuous value to discrete class: 0 (Low), 1 (Mid), 2 (High)."""
        if value < thresholds[0]:
            return 0
        if value < thresholds[1]:
            return 1
        return 2

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

        # Temporal jitter: ±1s random shift during training
        if self.training:
            jitter = random.uniform(-1.0, 1.0)
            start_sec = max(0.0, start_sec + jitter)

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
            "y_ar": sample["y_ar"],
            "y_val": sample["y_val"],
            "y_seg": None,
            "y_ar_cont": sample["y_ar_cont"],
            "y_val_cont": sample["y_val_cont"],
        }

    def _preload_features(self) -> None:
        """Preload all track features into RAM at init time."""
        track_ids = {s["track_id"] for s in self.samples}
        for tid in track_ids:
            if tid not in self._feature_cache:
                self._load_features(tid)

    def _load_features(self, track_id: int) -> np.ndarray:
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
        return log_mel

    def _find_audio(self, track_id: int) -> Path:
        """Find audio file for a track_id in audio_dir."""
        assert self.audio_dir is not None
        for ext in (".wav", ".mp3", ".flac", ".ogg"):
            candidate = self.audio_dir / f"{track_id}{ext}"
            if candidate.exists():
                return candidate
        raise FileNotFoundError(
            f"Audio file for track {track_id} not found in {self.audio_dir}"
        )
