"""Prepare GTZAN dataset: discover genres, save splits, precompute.

Usage:
    python scripts/prepare_gtzan.py \
        --gtzan-dir /path/to/gtzan --output-dir data/gtzan
    python scripts/prepare_gtzan.py \
        --gtzan-dir /path/to/gtzan --output-dir data/gtzan \
        --precompute
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

GENRE_CLASSES = [
    "blues", "classical", "country", "disco", "hiphop",
    "jazz", "metal", "pop", "reggae", "rock",
]


def discover_tracks(gtzan_dir: Path) -> dict[str, int]:
    """Discover tracks from GTZAN directory structure.

    Expects layout: genres_original/{genre}/{genre}.{number}.wav
    Returns mapping of track_id -> genre_index.
    """
    genres_dir = gtzan_dir / "genres_original"
    if not genres_dir.exists():
        raise FileNotFoundError(
            f"genres_original/ not found in {gtzan_dir}. "
            "Expected GTZAN directory structure: "
            "genres_original/{genre}/{genre}.NNNNN.wav"
        )

    genre_map: dict[str, int] = {}
    for genre_idx, genre_name in enumerate(GENRE_CLASSES):
        genre_dir = genres_dir / genre_name
        if not genre_dir.exists():
            print(f"Warning: genre directory {genre_dir} not found, skipping")
            continue
        for wav_path in sorted(genre_dir.glob(f"{genre_name}.*.wav")):
            track_id = wav_path.stem  # e.g. "blues.00000"
            genre_map[track_id] = genre_idx

    return genre_map


def split_tracks(
    track_ids: list[str],
    genres: list[int],
    seed: int = 42,
    train_ratio: float = 0.7,
    val_ratio: float = 0.15,
) -> dict[str, list[str]]:
    """Split track IDs into train/val/test sets with stratification by genre."""
    from sklearn.model_selection import train_test_split

    train_ids, temp_ids, train_genres, temp_genres = train_test_split(
        track_ids, genres,
        train_size=train_ratio, random_state=seed, stratify=genres,
    )
    relative_val = val_ratio / (1.0 - train_ratio)
    val_ids, test_ids = train_test_split(
        temp_ids,
        train_size=relative_val, random_state=seed, stratify=temp_genres,
    )
    return {
        "train": sorted(train_ids),
        "val": sorted(val_ids),
        "test": sorted(test_ids),
    }


def precompute_features(
    gtzan_dir: Path,
    output_dir: Path,
    track_ids: list[str],
    sr: int = 22050,
    hop_length: int = 512,
    n_mels: int = 128,
) -> None:
    """Pre-compute log-mel spectrograms and save as .npz files."""
    from musicml.features import compute_log_mel, load_audio

    cache_dir = output_dir / "features"
    cache_dir.mkdir(parents=True, exist_ok=True)

    genres_dir = gtzan_dir / "genres_original"
    for track_id in track_ids:
        npz_path = cache_dir / f"{track_id}.npz"
        if npz_path.exists():
            continue

        genre = track_id.split(".")[0]
        audio_path = genres_dir / genre / f"{track_id}.wav"

        if not audio_path.exists():
            print(f"Warning: audio for track {track_id} not found, skipping")
            continue

        try:
            y, sr_out = load_audio(str(audio_path), sr=sr)
        except Exception as exc:
            print(f"  Warning: cannot load {track_id}, skipping ({exc})")
            continue
        log_mel = compute_log_mel(y, sr=sr_out, hop_length=hop_length, n_mels=n_mels)
        np.savez_compressed(npz_path, log_mel=log_mel)
        print(f"  Saved {npz_path.name} ({log_mel.shape})")


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare GTZAN dataset")
    parser.add_argument(
        "--gtzan-dir", required=True, help="Path to GTZAN dataset root",
    )
    parser.add_argument(
        "--output-dir", default="data/gtzan", help="Output directory",
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
    gtzan_dir = Path(args.gtzan_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    print("Discovering GTZAN tracks...")
    genre_map = discover_tracks(gtzan_dir)
    all_track_ids = sorted(genre_map.keys())
    print(f"  Found {len(all_track_ids)} tracks across {len(GENRE_CLASSES)} genres")

    # Save genre_map.json
    genre_map_path = output_dir / "genre_map.json"
    with open(genre_map_path, "w") as f:
        json.dump(genre_map, f, indent=2)
    print(f"  Genre map saved to {genre_map_path}")

    # Split with stratification
    seed = cfg["training"]["seed"]
    genres = [genre_map[tid] for tid in all_track_ids]
    splits = split_tracks(all_track_ids, genres, seed=seed)
    splits_path = output_dir / "splits.json"
    with open(splits_path, "w") as f:
        json.dump(splits, f, indent=2)
    print(f"  Splits saved: train={len(splits['train'])}, "
          f"val={len(splits['val'])}, test={len(splits['test'])}")

    if args.precompute:
        print("Pre-computing log-mel features...")
        precompute_features(
            gtzan_dir, output_dir, all_track_ids,
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

    print("GTZAN preparation complete.")


if __name__ == "__main__":
    main()
