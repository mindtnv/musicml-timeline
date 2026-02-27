"""Convert DEAM archive wide-format CSVs to long-format annotations.csv.

The DEAM archive stores arousal and valence in separate wide CSV files:
  arousal.csv: song_id, sample_15000ms, sample_15500ms, ...
  valence.csv: song_id, sample_15000ms, sample_15500ms, ...

This script converts them into a single long-format CSV:
  track_id, time_sec, arousal, valence

Usage:
    python scripts/convert_deam.py \
        --archive-dir archive \
        --output-dir data/deam
"""

from __future__ import annotations

import argparse
import os
import re
from pathlib import Path

import pandas as pd


def parse_time_ms(col_name: str) -> float | None:
    """Extract time in seconds from column name like 'sample_15000ms'."""
    m = re.match(r"sample_(\d+)ms$", col_name)
    if m:
        return int(m.group(1)) / 1000.0
    return None


def wide_to_long(df: pd.DataFrame, value_name: str) -> pd.DataFrame:
    """Convert wide-format DEAM CSV to long format.

    Input columns: song_id, sample_15000ms, sample_15500ms, ...
    Output columns: track_id, time_sec, <value_name>
    """
    time_cols = [c for c in df.columns if c != "song_id"]
    melted = df.melt(
        id_vars=["song_id"],
        value_vars=time_cols,
        var_name="time_col",
        value_name=value_name,
    )
    melted = melted.dropna(subset=[value_name])
    melted["time_sec"] = melted["time_col"].apply(parse_time_ms)
    melted = melted.dropna(subset=["time_sec"])
    melted = melted.rename(columns={"song_id": "track_id"})
    return melted[["track_id", "time_sec", value_name]]


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Convert DEAM archive to annotations.csv",
    )
    parser.add_argument(
        "--archive-dir", required=True,
        help="Path to DEAM archive directory",
    )
    parser.add_argument(
        "--output-dir", default="data/deam",
        help="Output directory for annotations.csv and audio symlink",
    )
    parser.add_argument(
        "--link-audio", action="store_true",
        help="Create symlink to audio directory",
    )
    args = parser.parse_args()

    archive_dir = Path(args.archive_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    ann_base = (
        archive_dir / "DEAM_Annotations" / "annotations"
        / "annotations averaged per song"
        / "dynamic (per second annotations)"
    )
    arousal_csv = ann_base / "arousal.csv"
    valence_csv = ann_base / "valence.csv"

    if not arousal_csv.exists():
        print(f"Error: {arousal_csv} not found")
        return
    if not valence_csv.exists():
        print(f"Error: {valence_csv} not found")
        return

    print("Loading arousal annotations...")
    ar_df = pd.read_csv(arousal_csv)
    print(f"  {len(ar_df)} songs")

    print("Loading valence annotations...")
    va_df = pd.read_csv(valence_csv)
    print(f"  {len(va_df)} songs")

    print("Converting arousal to long format...")
    ar_long = wide_to_long(ar_df, "arousal")
    print(f"  {len(ar_long)} rows")

    print("Converting valence to long format...")
    va_long = wide_to_long(va_df, "valence")
    print(f"  {len(va_long)} rows")

    print("Merging arousal and valence...")
    merged = pd.merge(
        ar_long, va_long,
        on=["track_id", "time_sec"],
        how="inner",
    )
    merged = merged.sort_values(["track_id", "time_sec"]).reset_index(drop=True)
    merged["track_id"] = merged["track_id"].astype(int)
    print(f"  {len(merged)} merged rows, {merged['track_id'].nunique()} tracks")

    out_csv = output_dir / "annotations.csv"
    merged.to_csv(out_csv, index=False)
    print(f"Saved {out_csv}")

    if args.link_audio:
        audio_src = archive_dir / "DEAM_audio" / "MEMD_audio"
        audio_dst = output_dir / "audio"
        if audio_dst.exists() or audio_dst.is_symlink():
            print(f"  Audio link already exists: {audio_dst}")
        else:
            os.symlink(audio_src.resolve(), audio_dst)
            print(f"  Linked {audio_dst} -> {audio_src.resolve()}")

    print("Done!")
    print(f"\nNext step: python scripts/prepare_deam.py "
          f"--deam-dir {output_dir}")


if __name__ == "__main__":
    main()
