"""Prepare DEAM dataset: compute thresholds, save splits, precompute.

Usage:
    python scripts/prepare_deam.py --deam-dir /path/to/DEAM --output-dir data/deam
    python scripts/prepare_deam.py --deam-dir /path/to/DEAM --precompute
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd


def load_annotations(deam_dir: Path) -> pd.DataFrame:
    """Load and normalize DEAM annotations into a unified DataFrame.

    Expects DEAM directory to contain annotations CSV with columns:
    track_id, time_sec, arousal, valence.
    """
    csv_path = deam_dir / "annotations.csv"
    if not csv_path.exists():
        raise FileNotFoundError(
            f"annotations.csv not found in {deam_dir}. "
            "Expected columns: track_id, time_sec, arousal, valence"
        )
    return pd.read_csv(csv_path)


def split_tracks(
    track_ids: list[int],
    seed: int = 42,
    train_ratio: float = 0.7,
    val_ratio: float = 0.15,
) -> dict[str, list[int]]:
    """Split track IDs into train/val/test sets."""
    from sklearn.model_selection import train_test_split

    train_ids, temp_ids = train_test_split(
        track_ids, train_size=train_ratio, random_state=seed,
    )
    relative_val = val_ratio / (1.0 - train_ratio)
    val_ids, test_ids = train_test_split(
        temp_ids, train_size=relative_val, random_state=seed,
    )
    return {
        "train": sorted(int(x) for x in train_ids),
        "val": sorted(int(x) for x in val_ids),
        "test": sorted(int(x) for x in test_ids),
    }


def compute_thresholds(
    df: pd.DataFrame,
    train_track_ids: list[int],
    window_seconds: float = 8.0,
    hop_seconds: float = 1.0,
) -> dict[str, float]:
    """Compute quantile thresholds (33%/66%) from train windows.

    Aggregates annotations into windows and computes mean arousal/valence
    per window, then calculates percentile boundaries.
    """
    train_df = df[df["track_id"].isin(train_track_ids)]

    arousal_means = []
    valence_means = []

    for _, group in train_df.groupby("track_id"):
        group = group.sort_values("time_sec")
        times = group["time_sec"].values
        arousals = group["arousal"].values
        valences = group["valence"].values

        duration = times[-1] if len(times) > 0 else 0.0
        start = 0.0
        while start + window_seconds <= duration + 1e-6:
            end = start + window_seconds
            mask = (times >= start) & (times < end)
            if mask.any():
                arousal_means.append(float(np.mean(arousals[mask])))
                valence_means.append(float(np.mean(valences[mask])))
            start += hop_seconds

    arousal_arr = np.array(arousal_means)
    valence_arr = np.array(valence_means)

    return {
        "arousal_low_mid": float(np.percentile(arousal_arr, 33.33)),
        "arousal_mid_high": float(np.percentile(arousal_arr, 66.67)),
        "valence_low_mid": float(np.percentile(valence_arr, 33.33)),
        "valence_mid_high": float(np.percentile(valence_arr, 66.67)),
    }


def precompute_features(
    deam_dir: Path,
    output_dir: Path,
    track_ids: list[int],
    sr: int = 22050,
    hop_length: int = 512,
    n_mels: int = 128,
) -> None:
    """Pre-compute log-mel spectrograms and save as .npz files."""
    from musicml.features import compute_log_mel, load_audio

    cache_dir = output_dir / "features"
    cache_dir.mkdir(parents=True, exist_ok=True)

    audio_dir = deam_dir / "audio"
    for track_id in track_ids:
        npz_path = cache_dir / f"{track_id}.npz"
        if npz_path.exists():
            continue

        audio_path = None
        for ext in (".wav", ".mp3", ".flac", ".ogg"):
            candidate = audio_dir / f"{track_id}{ext}"
            if candidate.exists():
                audio_path = candidate
                break

        if audio_path is None:
            print(f"Warning: audio for track {track_id} not found, skipping")
            continue

        y, sr_out = load_audio(str(audio_path), sr=sr)
        log_mel = compute_log_mel(y, sr=sr_out, hop_length=hop_length, n_mels=n_mels)
        np.savez_compressed(npz_path, log_mel=log_mel)
        print(f"  Saved {npz_path.name} ({log_mel.shape})")


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare DEAM dataset")
    parser.add_argument(
        "--deam-dir", required=True, help="Path to DEAM dataset root",
    )
    parser.add_argument(
        "--output-dir", default="data/deam", help="Output directory",
    )
    parser.add_argument(
        "--config", default="configs/default.yaml", help="Config file",
    )
    parser.add_argument(
        "--precompute", action="store_true",
        help="Pre-compute log-mel features as .npz",
    )
    parser.add_argument(
        "--compute-stats", action="store_true",
        help="Compute feature mean/std from train split and save stats.npz",
    )
    args = parser.parse_args()

    from musicml.utils import load_config

    cfg = load_config(args.config)
    deam_dir = Path(args.deam_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    print("Loading DEAM annotations...")
    df = load_annotations(deam_dir)
    all_track_ids = sorted(df["track_id"].unique().tolist())
    print(f"  Found {len(all_track_ids)} tracks, {len(df)} annotation rows")

    seed = cfg["training"]["seed"]
    splits = split_tracks(all_track_ids, seed=seed)
    splits_path = output_dir / "splits.json"
    with open(splits_path, "w") as f:
        json.dump(splits, f, indent=2)
    print(f"  Splits saved: train={len(splits['train'])}, "
          f"val={len(splits['val'])}, test={len(splits['test'])}")

    print("Computing thresholds from train windows...")
    window_sec = cfg["windowing"]["window_seconds"]
    hop_sec = cfg["windowing"]["hop_seconds"]
    thresholds = compute_thresholds(
        df, splits["train"],
        window_seconds=window_sec, hop_seconds=hop_sec,
    )
    thresholds_path = Path("configs") / "thresholds.json"
    with open(thresholds_path, "w") as f:
        json.dump(thresholds, f, indent=2)
    print(f"  Thresholds saved to {thresholds_path}")
    for k, v in thresholds.items():
        print(f"    {k}: {v:.4f}")

    if args.precompute:
        print("Pre-computing log-mel features...")
        precompute_features(
            deam_dir, output_dir, all_track_ids,
            sr=cfg["audio"]["sr"],
            hop_length=cfg["features"]["hop_length"],
            n_mels=cfg["features"]["n_mels"],
        )
        print("  Done.")

    if args.compute_stats:
        from musicml.features import compute_feature_stats

        feature_dir = output_dir / "features"
        if not feature_dir.exists():
            print("Warning: features dir not found, skipping stats computation")
        else:
            print("Computing feature stats from train split...")
            mean, std = compute_feature_stats(
                str(feature_dir), track_ids=splits["train"],
            )
            stats_path = feature_dir / "stats.npz"
            np.savez(stats_path, mean=mean, std=std)
            print(f"  Stats saved to {stats_path}")
            print(f"  mean shape={mean.shape}, std shape={std.shape}")
            print(f"  mean range=[{mean.min():.2f}, {mean.max():.2f}]")
            print(f"  std range=[{std.min():.4f}, {std.max():.4f}]")

    print("DEAM preparation complete.")


if __name__ == "__main__":
    main()
