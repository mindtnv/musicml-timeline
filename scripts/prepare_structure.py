"""Prepare Harmonix Set for structure segmentation training.

Usage:
    python scripts/prepare_structure.py --harmonix-dir /path/to/harmonixset \
        --output-dir data/structure
    python scripts/prepare_structure.py --harmonix-dir /path/to/harmonixset \
        --output-dir data/structure --precompute
"""

from __future__ import annotations

import argparse
import json
import shutil
from collections import Counter
from pathlib import Path


def discover_tracks(harmonix_dir: Path) -> list[str]:
    """Discover track IDs from segment annotation files (.tsv or .txt)."""
    segments_dir = harmonix_dir / "dataset" / "segments"
    if not segments_dir.exists():
        raise FileNotFoundError(
            f"Segments directory not found: {segments_dir}. "
            "Expected Harmonix Set structure: harmonix_dir/dataset/segments/"
        )
    ids = set()
    for path in segments_dir.iterdir():
        if path.suffix in (".tsv", ".txt"):
            ids.add(path.stem)
    return sorted(ids)


def split_tracks(
    track_ids: list[str],
    seed: int = 42,
    train_ratio: float = 0.7,
    val_ratio: float = 0.15,
) -> dict[str, list[str]]:
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
        "train": sorted(train_ids),
        "val": sorted(val_ids),
        "test": sorted(test_ids),
    }


def copy_annotations(
    harmonix_dir: Path, output_dir: Path, track_ids: list[str],
) -> None:
    """Copy annotation files to output directory."""
    src_dir = harmonix_dir / "dataset" / "segments"
    dst_dir = output_dir / "annotations"
    dst_dir.mkdir(parents=True, exist_ok=True)

    for tid in track_ids:
        for ext in (".tsv", ".txt"):
            src = src_dir / f"{tid}{ext}"
            if src.exists():
                dst = dst_dir / f"{tid}{ext}"
                shutil.copy2(src, dst)
                break


def count_class_distribution(
    annotations_dir: Path,
    track_ids: list[str],
    window_seconds: float = 8.0,
    hop_seconds: float = 1.0,
) -> Counter:
    """Count windows per segment class for given tracks."""
    from musicml.datasets.structure import (
        SEGMENT_CLASSES,
        boundaries_to_intervals,
        dominant_label,
        parse_annotations,
    )

    counter: Counter = Counter()
    for tid in track_ids:
        ann_path = None
        for ext in (".tsv", ".txt"):
            candidate = annotations_dir / f"{tid}{ext}"
            if candidate.exists():
                ann_path = candidate
                break
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
        while start + window_seconds <= duration + 1e-6:
            window_end = start + window_seconds
            label = dominant_label(start, window_end, intervals)
            counter[label] += 1
            start += hop_seconds

    # Ensure all classes present
    for cls in SEGMENT_CLASSES:
        if cls not in counter:
            counter[cls] = 0

    return counter


def precompute_features(
    audio_dir: Path,
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
            print(f"  Warning: audio for track {track_id} not found, skipping")
            continue

        y, sr_out = load_audio(str(audio_path), sr=sr)
        log_mel = compute_log_mel(
            y, sr=sr_out, hop_length=hop_length, n_mels=n_mels,
        )
        import numpy as np

        np.savez_compressed(npz_path, log_mel=log_mel)
        print(f"  Saved {npz_path.name} ({log_mel.shape})")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Prepare Harmonix Set for structure segmentation",
    )
    parser.add_argument(
        "--harmonix-dir", required=True,
        help="Path to Harmonix Set repository root",
    )
    parser.add_argument(
        "--output-dir", default="data/structure",
        help="Output directory",
    )
    parser.add_argument(
        "--config", default="configs/default.yaml",
        help="Config file",
    )
    parser.add_argument(
        "--precompute", action="store_true",
        help="Pre-compute log-mel features (requires audio files)",
    )
    parser.add_argument(
        "--audio-dir", default=None,
        help="Audio directory (for --precompute, default: harmonix_dir/audio)",
    )
    parser.add_argument(
        "--compute-stats", action="store_true",
        help="Compute feature mean/std from train split and save stats.npz",
    )
    args = parser.parse_args()

    from musicml.utils import load_config

    cfg = load_config(args.config)
    harmonix_dir = Path(args.harmonix_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    print("Discovering Harmonix Set tracks...")
    all_track_ids = discover_tracks(harmonix_dir)
    print(f"  Found {len(all_track_ids)} tracks")

    seed = cfg["training"]["seed"]
    splits = split_tracks(all_track_ids, seed=seed)
    splits_path = output_dir / "splits.json"
    with open(splits_path, "w") as f:
        json.dump(splits, f, indent=2)
    print(
        f"  Splits saved: train={len(splits['train'])}, "
        f"val={len(splits['val'])}, test={len(splits['test'])}"
    )

    print("Copying annotations...")
    copy_annotations(harmonix_dir, output_dir, all_track_ids)

    annotations_dir = output_dir / "annotations"
    window_sec = cfg["windowing"]["window_seconds"]
    hop_sec = cfg["windowing"]["hop_seconds"]

    print("Class distribution (train):")
    dist = count_class_distribution(
        annotations_dir, splits["train"],
        window_seconds=window_sec, hop_seconds=hop_sec,
    )
    for cls, count in sorted(dist.items()):
        print(f"  {cls}: {count}")

    if args.precompute:
        audio_dir = Path(args.audio_dir) if args.audio_dir else harmonix_dir / "audio"
        print("Pre-computing log-mel features...")
        precompute_features(
            audio_dir, output_dir, all_track_ids,
            sr=cfg["audio"]["sr"],
            hop_length=cfg["features"]["hop_length"],
            n_mels=cfg["features"]["n_mels"],
        )
        print("  Done.")

    if args.compute_stats:
        import numpy as np

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

    print("Harmonix Set preparation complete.")


if __name__ == "__main__":
    main()
