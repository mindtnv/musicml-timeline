"""Embedding-based datasets for precomputed backbone features.

These datasets load precomputed embeddings (CNN or PANNs) instead of
raw spectrograms. Support per-window mode (Config 3) and sequence mode
(Configs 2 & 4) via the ``sequence_mode`` flag.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import torch


class DEAMEmbeddingDataset:
    """DEAM arousal/valence dataset on precomputed embeddings.

    In per-window mode each sample is a single embedding vector + labels.
    In sequence mode each sample is a full track (sequence of embeddings).

    Args:
        embedding_dir: Directory with ``{track_id}.npy`` files.
        annotations_csv: DEAM annotations CSV.
        thresholds_json: Arousal/valence discretization thresholds.
        track_ids: Subset of track IDs (from splits.json).
        hop_seconds: Window hop in seconds (for window indexing).
        window_seconds: Window length (for sample generation).
        sequence_mode: If True, yield full tracks; else individual windows.
    """

    def __init__(
        self,
        embedding_dir: str | Path,
        annotations_csv: str | Path,
        thresholds_json: str | Path,
        track_ids: list[int] | None = None,
        hop_seconds: float = 1.0,
        window_seconds: float = 8.0,
        sequence_mode: bool = False,
    ) -> None:
        self.embedding_dir = Path(embedding_dir)
        self.hop_seconds = hop_seconds
        self.window_seconds = window_seconds
        self.sequence_mode = sequence_mode

        with open(thresholds_json, encoding="utf-8") as f:
            thresholds = json.load(f)
        self.arousal_thresholds = (
            thresholds["arousal_low_mid"],
            thresholds["arousal_mid_high"],
        )
        self.valence_thresholds = (
            thresholds["valence_low_mid"],
            thresholds["valence_mid_high"],
        )

        df = pd.read_csv(annotations_csv)
        if track_ids is not None:
            df = df[df["track_id"].isin(track_ids)].reset_index(drop=True)

        # Filter to tracks with precomputed embeddings
        available = {
            int(p.stem) for p in self.embedding_dir.glob("*.npy")
        }
        df = df[df["track_id"].isin(available)].reset_index(drop=True)

        self._embedding_cache: dict[int, np.ndarray] = {}

        if sequence_mode:
            self.tracks = self._build_track_samples(df)
        else:
            self.samples = self._build_window_samples(df)

    @staticmethod
    def _discretize(value: float, thresholds: tuple[float, float]) -> int:
        if value < thresholds[0]:
            return 0
        if value < thresholds[1]:
            return 1
        return 2

    def _build_window_samples(
        self, df: pd.DataFrame,
    ) -> list[dict[str, Any]]:
        """Build per-window samples (same logic as DEAMDataset)."""
        samples: list[dict[str, Any]] = []
        for track_id, group in df.groupby("track_id"):
            emb = self._load_embedding(int(track_id))
            n_windows = emb.shape[0]

            group = group.sort_values("time_sec")
            times = group["time_sec"].values
            arousals = group["arousal"].values
            valences = group["valence"].values

            for wi in range(n_windows):
                start = wi * self.hop_seconds
                end = start + self.window_seconds
                mask = (times >= start) & (times < end)
                if mask.any():
                    mean_ar = float(np.mean(arousals[mask]))
                    mean_val = float(np.mean(valences[mask]))
                else:
                    mean_ar = float(np.mean(arousals))
                    mean_val = float(np.mean(valences))

                samples.append({
                    "track_id": int(track_id),
                    "window_idx": wi,
                    "y_ar": self._discretize(mean_ar, self.arousal_thresholds),
                    "y_val": self._discretize(
                        mean_val, self.valence_thresholds,
                    ),
                    "y_ar_cont": mean_ar,
                    "y_val_cont": mean_val,
                })
        return samples

    def _build_track_samples(
        self, df: pd.DataFrame,
    ) -> list[dict[str, Any]]:
        """Build per-track samples for sequence mode."""
        tracks: list[dict[str, Any]] = []
        for track_id, group in df.groupby("track_id"):
            emb = self._load_embedding(int(track_id))
            n_windows = emb.shape[0]

            group = group.sort_values("time_sec")
            times = group["time_sec"].values
            arousals = group["arousal"].values
            valences = group["valence"].values

            y_ar_list: list[int] = []
            y_val_list: list[int] = []
            y_ar_cont_list: list[float] = []
            y_val_cont_list: list[float] = []

            for wi in range(n_windows):
                start = wi * self.hop_seconds
                end = start + self.window_seconds
                mask = (times >= start) & (times < end)
                if mask.any():
                    mean_ar = float(np.mean(arousals[mask]))
                    mean_val = float(np.mean(valences[mask]))
                else:
                    mean_ar = float(np.mean(arousals))
                    mean_val = float(np.mean(valences))

                y_ar_list.append(
                    self._discretize(mean_ar, self.arousal_thresholds),
                )
                y_val_list.append(
                    self._discretize(mean_val, self.valence_thresholds),
                )
                y_ar_cont_list.append(mean_ar)
                y_val_cont_list.append(mean_val)

            tracks.append({
                "track_id": int(track_id),
                "n_windows": n_windows,
                "y_ar": y_ar_list,
                "y_val": y_val_list,
                "y_ar_cont": y_ar_cont_list,
                "y_val_cont": y_val_cont_list,
            })
        return tracks

    def _load_embedding(self, track_id: int) -> np.ndarray:
        if track_id in self._embedding_cache:
            return self._embedding_cache[track_id]
        path = self.embedding_dir / f"{track_id}.npy"
        emb = np.load(path)
        self._embedding_cache[track_id] = emb
        return emb

    def __len__(self) -> int:
        if self.sequence_mode:
            return len(self.tracks)
        return len(self.samples)

    def __getitem__(self, idx: int) -> dict[str, Any]:
        if self.sequence_mode:
            return self._get_track(idx)
        return self._get_window(idx)

    def _get_window(self, idx: int) -> dict[str, Any]:
        sample = self.samples[idx]
        emb = self._load_embedding(sample["track_id"])
        x = torch.from_numpy(emb[sample["window_idx"]]).float()
        return {
            "x": x,
            "y_ar": sample["y_ar"],
            "y_val": sample["y_val"],
            "y_seg": None,
            "y_ar_cont": sample["y_ar_cont"],
            "y_val_cont": sample["y_val_cont"],
        }

    def _get_track(self, idx: int) -> dict[str, Any]:
        track = self.tracks[idx]
        emb = self._load_embedding(track["track_id"])
        return {
            "x": torch.from_numpy(emb).float(),
            "y_ar": torch.tensor(track["y_ar"], dtype=torch.long),
            "y_val": torch.tensor(track["y_val"], dtype=torch.long),
            "y_seg": None,
            "y_ar_cont": torch.tensor(
                track["y_ar_cont"], dtype=torch.float32,
            ),
            "y_val_cont": torch.tensor(
                track["y_val_cont"], dtype=torch.float32,
            ),
            "length": track["n_windows"],
        }

    def get_all_labels(self, key: str) -> list[int]:
        """Return flat list of labels for class weight computation."""
        if self.sequence_mode:
            result: list[int] = []
            for t in self.tracks:
                result.extend(t[key])
            return result
        return [s[key] for s in self.samples]


class StructureEmbeddingDataset:
    """Structure segmentation dataset on precomputed embeddings.

    Args:
        embedding_dir: Directory with ``{track_id}.npy`` files.
        annotations_dir: Directory with annotation .tsv/.txt files.
        track_ids: Subset of track IDs (from splits.json).
        hop_seconds: Window hop in seconds.
        window_seconds: Window length.
        sequence_mode: If True, yield full tracks.
    """

    def __init__(
        self,
        embedding_dir: str | Path,
        annotations_dir: str | Path,
        track_ids: list[str] | None = None,
        hop_seconds: float = 1.0,
        window_seconds: float = 8.0,
        sequence_mode: bool = False,
    ) -> None:
        self.embedding_dir = Path(embedding_dir)
        self.annotations_dir = Path(annotations_dir)
        self.hop_seconds = hop_seconds
        self.window_seconds = window_seconds
        self.sequence_mode = sequence_mode

        # Lazy import to reuse annotation parsing
        from musicml.datasets.structure import (
            SEGMENT_CLASSES,
            boundaries_to_intervals,
            dominant_label,
            parse_annotations,
        )

        self._SEGMENT_CLASSES = SEGMENT_CLASSES
        self._parse = parse_annotations
        self._intervals = boundaries_to_intervals
        self._dominant = dominant_label

        available = {p.stem for p in self.embedding_dir.glob("*.npy")}
        if track_ids is not None:
            available = available & set(track_ids)

        self._embedding_cache: dict[str, np.ndarray] = {}

        if sequence_mode:
            self.tracks = self._build_track_samples(sorted(available))
        else:
            self.samples = self._build_window_samples(sorted(available))

    def _find_annotation(self, track_id: str) -> Path | None:
        for ext in (".tsv", ".txt"):
            path = self.annotations_dir / f"{track_id}{ext}"
            if path.exists():
                return path
        return None

    def _build_window_samples(
        self, track_ids: list[str],
    ) -> list[dict[str, Any]]:
        samples: list[dict[str, Any]] = []
        for track_id in track_ids:
            ann_path = self._find_annotation(track_id)
            if ann_path is None:
                continue
            entries = self._parse(ann_path)
            if len(entries) < 2:
                continue
            intervals = self._intervals(entries)

            emb = self._load_embedding(track_id)
            n_windows = emb.shape[0]

            for wi in range(n_windows):
                start = wi * self.hop_seconds
                end = start + self.window_seconds
                label = self._dominant(start, end, intervals)
                y_seg = self._SEGMENT_CLASSES.index(label)
                samples.append({
                    "track_id": track_id,
                    "window_idx": wi,
                    "y_seg": y_seg,
                })
        return samples

    def _build_track_samples(
        self, track_ids: list[str],
    ) -> list[dict[str, Any]]:
        tracks: list[dict[str, Any]] = []
        for track_id in track_ids:
            ann_path = self._find_annotation(track_id)
            if ann_path is None:
                continue
            entries = self._parse(ann_path)
            if len(entries) < 2:
                continue
            intervals = self._intervals(entries)

            emb = self._load_embedding(track_id)
            n_windows = emb.shape[0]

            y_seg_list: list[int] = []
            for wi in range(n_windows):
                start = wi * self.hop_seconds
                end = start + self.window_seconds
                label = self._dominant(start, end, intervals)
                y_seg_list.append(self._SEGMENT_CLASSES.index(label))

            tracks.append({
                "track_id": track_id,
                "n_windows": n_windows,
                "y_seg": y_seg_list,
            })
        return tracks

    def _load_embedding(self, track_id: str) -> np.ndarray:
        if track_id in self._embedding_cache:
            return self._embedding_cache[track_id]
        path = self.embedding_dir / f"{track_id}.npy"
        emb = np.load(path)
        self._embedding_cache[track_id] = emb
        return emb

    def __len__(self) -> int:
        if self.sequence_mode:
            return len(self.tracks)
        return len(self.samples)

    def __getitem__(self, idx: int) -> dict[str, Any]:
        if self.sequence_mode:
            return self._get_track(idx)
        return self._get_window(idx)

    def _get_window(self, idx: int) -> dict[str, Any]:
        sample = self.samples[idx]
        emb = self._load_embedding(sample["track_id"])
        x = torch.from_numpy(emb[sample["window_idx"]]).float()
        return {
            "x": x,
            "y_seg": sample["y_seg"],
            "y_ar": None,
            "y_val": None,
            "y_ar_cont": None,
            "y_val_cont": None,
        }

    def _get_track(self, idx: int) -> dict[str, Any]:
        track = self.tracks[idx]
        emb = self._load_embedding(track["track_id"])
        return {
            "x": torch.from_numpy(emb).float(),
            "y_seg": torch.tensor(track["y_seg"], dtype=torch.long),
            "y_ar": None,
            "y_val": None,
            "y_ar_cont": None,
            "y_val_cont": None,
            "length": track["n_windows"],
        }

    def get_all_labels(self, key: str) -> list[int]:
        if self.sequence_mode:
            result: list[int] = []
            for t in self.tracks:
                result.extend(t[key])
            return result
        return [s[key] for s in self.samples]


class GTZANEmbeddingDataset:
    """GTZAN genre dataset on precomputed embeddings.

    Args:
        embedding_dir: Directory with ``{track_id}.npy`` files.
        genre_map_json: JSON mapping track_id → genre index.
        track_ids: Subset of track IDs (from splits.json).
        hop_seconds: Window hop in seconds.
        window_seconds: Window length.
        sequence_mode: If True, yield full tracks.
    """

    def __init__(
        self,
        embedding_dir: str | Path,
        genre_map_json: str | Path,
        track_ids: list[str] | None = None,
        hop_seconds: float = 1.0,
        window_seconds: float = 8.0,
        sequence_mode: bool = False,
    ) -> None:
        self.embedding_dir = Path(embedding_dir)
        self.hop_seconds = hop_seconds
        self.window_seconds = window_seconds
        self.sequence_mode = sequence_mode

        with open(genre_map_json, encoding="utf-8") as f:
            genre_map: dict[str, int] = json.load(f)

        if track_ids is not None:
            genre_map = {
                tid: idx for tid, idx in genre_map.items()
                if tid in set(track_ids)
            }

        # Filter to tracks with embeddings
        available = {p.stem for p in self.embedding_dir.glob("*.npy")}
        genre_map = {
            tid: idx for tid, idx in genre_map.items()
            if tid in available
        }
        self.genre_map = genre_map

        self._embedding_cache: dict[str, np.ndarray] = {}

        if sequence_mode:
            self.tracks = self._build_track_samples()
        else:
            self.samples = self._build_window_samples()

    def _build_window_samples(self) -> list[dict[str, Any]]:
        samples: list[dict[str, Any]] = []
        for track_id in sorted(self.genre_map.keys()):
            genre_idx = self.genre_map[track_id]
            emb = self._load_embedding(track_id)
            n_windows = emb.shape[0]

            for wi in range(n_windows):
                samples.append({
                    "track_id": track_id,
                    "window_idx": wi,
                    "y_genre": genre_idx,
                })
        return samples

    def _build_track_samples(self) -> list[dict[str, Any]]:
        tracks: list[dict[str, Any]] = []
        for track_id in sorted(self.genre_map.keys()):
            genre_idx = self.genre_map[track_id]
            emb = self._load_embedding(track_id)
            n_windows = emb.shape[0]

            # Genre is track-level: all windows have same genre
            tracks.append({
                "track_id": track_id,
                "n_windows": n_windows,
                "y_genre": [genre_idx] * n_windows,
            })
        return tracks

    def _load_embedding(self, track_id: str) -> np.ndarray:
        if track_id in self._embedding_cache:
            return self._embedding_cache[track_id]
        path = self.embedding_dir / f"{track_id}.npy"
        emb = np.load(path)
        self._embedding_cache[track_id] = emb
        return emb

    def __len__(self) -> int:
        if self.sequence_mode:
            return len(self.tracks)
        return len(self.samples)

    def __getitem__(self, idx: int) -> dict[str, Any]:
        if self.sequence_mode:
            return self._get_track(idx)
        return self._get_window(idx)

    def _get_window(self, idx: int) -> dict[str, Any]:
        sample = self.samples[idx]
        emb = self._load_embedding(sample["track_id"])
        x = torch.from_numpy(emb[sample["window_idx"]]).float()
        return {
            "x": x,
            "y_genre": sample["y_genre"],
            "y_seg": None,
            "y_ar": None,
            "y_val": None,
            "y_ar_cont": None,
            "y_val_cont": None,
        }

    def _get_track(self, idx: int) -> dict[str, Any]:
        track = self.tracks[idx]
        emb = self._load_embedding(track["track_id"])
        return {
            "x": torch.from_numpy(emb).float(),
            "y_genre": torch.tensor(track["y_genre"], dtype=torch.long),
            "y_seg": None,
            "y_ar": None,
            "y_val": None,
            "y_ar_cont": None,
            "y_val_cont": None,
            "length": track["n_windows"],
        }

    def get_all_labels(self, key: str) -> list[int]:
        if self.sequence_mode:
            result: list[int] = []
            for t in self.tracks:
                result.extend(t[key])
            return result
        return [s[key] for s in self.samples]
