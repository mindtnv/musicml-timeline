"""Structure segmentation dataset (Harmonix Set).

Loads pre-computed log-mel features and mapped segment labels
derived from boundary annotations.
"""

from __future__ import annotations

import random
from pathlib import Path
from typing import Any

import numpy as np

SEGMENT_CLASSES = ["Calm", "Build-up", "Climax", "Outro"]

LABEL_MAP: dict[str, str] = {
    "chorus": "Climax",
    "drop": "Climax",
    "bridge": "Build-up",
    "pre-chorus": "Build-up",
    "prechorus": "Build-up",
    "build": "Build-up",
    "transition": "Build-up",
    "intro": "Calm",
    "verse": "Calm",
    "break": "Calm",
    "inst": "Calm",
    "interlude": "Calm",
    "solo": "Build-up",
    "outro": "Outro",
    "ending": "Outro",
}

DEFAULT_SEGMENT = "Calm"


def map_label(raw_label: str) -> str:
    """Map a raw annotation label to one of SEGMENT_CLASSES."""
    return LABEL_MAP.get(raw_label.lower().strip(), DEFAULT_SEGMENT)


def parse_annotations(annotation_path: Path) -> list[tuple[float, str]]:
    """Parse a Harmonix annotation file (TSV or space-separated).

    Each line: ``boundary_time<whitespace>label``

    Returns list of (time, label) sorted by time.
    """
    entries: list[tuple[float, str]] = []
    with open(annotation_path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            parts = line.split("\t") if "\t" in line else line.split(None, 1)
            if len(parts) < 2:
                continue
            time_sec = float(parts[0])
            label = parts[1].strip()
            entries.append((time_sec, label))
    entries.sort(key=lambda e: e[0])
    return entries


def boundaries_to_intervals(
    entries: list[tuple[float, str]],
) -> list[tuple[float, float, str]]:
    """Convert boundary list to intervals [(start, end, label), ...]."""
    intervals: list[tuple[float, float, str]] = []
    for i in range(len(entries)):
        start = entries[i][0]
        label = entries[i][1]
        if i + 1 < len(entries):
            end = entries[i + 1][0]
        else:
            end = start
        intervals.append((start, end, label))
    return intervals


def dominant_label(
    window_start: float,
    window_end: float,
    intervals: list[tuple[float, float, str]],
) -> str:
    """Find the label with maximum overlap in the given window."""
    overlap: dict[str, float] = {}
    for seg_start, seg_end, raw_label in intervals:
        ov_start = max(window_start, seg_start)
        ov_end = min(window_end, seg_end)
        if ov_end > ov_start:
            mapped = map_label(raw_label)
            overlap[mapped] = overlap.get(mapped, 0.0) + (ov_end - ov_start)

    if not overlap:
        return DEFAULT_SEGMENT
    return max(overlap, key=overlap.get)


class StructureDataset:
    """Dataset for structure segmentation annotations.

    Loads pre-computed features and mapped segment labels from
    Harmonix Set boundary annotations.
    """

    def __init__(
        self,
        annotations_dir: str | Path,
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
    ) -> None:
        self.annotations_dir = Path(annotations_dir)
        self.audio_dir = Path(audio_dir) if audio_dir else None
        self.feature_cache_dir = (
            Path(feature_cache_dir) if feature_cache_dir else None
        )
        self.sr = sr
        self.hop_length = hop_length
        self.n_mels = n_mels
        self.window_seconds = window_seconds
        self.hop_seconds = hop_seconds
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

        available_ids = self._discover_track_ids()
        if track_ids is not None:
            available_ids = [t for t in available_ids if t in set(track_ids)]

        # Filter to tracks that have pre-computed features
        if self.feature_cache_dir is not None:
            before = len(available_ids)
            available_ids = [
                t for t in available_ids
                if (self.feature_cache_dir / f"{t}.npz").exists()
            ]
            skipped = before - len(available_ids)
            if skipped > 0:
                import warnings
                warnings.warn(
                    f"Skipped {skipped} tracks without cached features"
                )

        self.samples = self._build_samples(available_ids)

    def _discover_track_ids(self) -> list[str]:
        """Discover track IDs from annotation files (.tsv or .txt)."""
        ids = []
        for path in sorted(self.annotations_dir.iterdir()):
            if path.suffix in (".tsv", ".txt"):
                ids.append(path.stem)
        return ids

    def _find_annotation(self, track_id: str) -> Path | None:
        """Find annotation file for a track (supports .tsv and .txt)."""
        for ext in (".tsv", ".txt"):
            path = self.annotations_dir / f"{track_id}{ext}"
            if path.exists():
                return path
        return None

    def _build_samples(self, track_ids: list[str]) -> list[dict[str, Any]]:
        """Build list of windowed samples from annotations."""
        samples: list[dict[str, Any]] = []

        for track_id in track_ids:
            ann_path = self._find_annotation(track_id)
            if ann_path is None:
                continue
            entries = parse_annotations(ann_path)
            if len(entries) < 2:
                continue

            intervals = boundaries_to_intervals(entries)
            duration = entries[-1][0]
            if duration <= 0:
                continue

            start = 0.0
            while start + self.window_seconds <= duration + 1e-6:
                window_end = start + self.window_seconds
                label = dominant_label(start, window_end, intervals)
                y_seg = SEGMENT_CLASSES.index(label)

                samples.append({
                    "track_id": track_id,
                    "window_start_sec": start,
                    "y_seg": y_seg,
                })
                start += self.hop_seconds

        return samples

    def _spec_augment(
        self, x: np.ndarray, freq_mask: int = 15, time_mask: int = 25, n_masks: int = 2,
    ) -> np.ndarray:
        """Apply SpecAugment: frequency and time masking."""
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

        # Clamp start_frame to valid range
        start_frame = min(start_frame, max(features.shape[1] - 1, 0))
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
            "y_seg": sample["y_seg"],
            "y_ar": None,
            "y_val": None,
        }

    def _load_features(self, track_id: str) -> np.ndarray:
        """Load or compute log-mel features for a track."""
        if self.feature_cache_dir is not None:
            npz_path = self.feature_cache_dir / f"{track_id}.npz"
            if npz_path.exists():
                return np.load(npz_path)["log_mel"]

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

    def _find_audio(self, track_id: str) -> Path:
        """Find audio file for a track_id in audio_dir."""
        assert self.audio_dir is not None
        for ext in (".wav", ".mp3", ".flac", ".ogg"):
            candidate = self.audio_dir / f"{track_id}{ext}"
            if candidate.exists():
                return candidate
        raise FileNotFoundError(
            f"Audio file for track {track_id} not found in {self.audio_dir}"
        )
