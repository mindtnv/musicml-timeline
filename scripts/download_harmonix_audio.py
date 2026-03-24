"""Download Harmonix Set audio from YouTube as MP3.

Uses yt-dlp (install: pip install yt-dlp).

Usage:
    python scripts/download_harmonix_audio.py \
        --harmonix-dir data/harmonixset \
        --output-dir data/harmonixset/audio \
        --max-workers 4
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

import pandas as pd


def _find_ffmpeg() -> str | None:
    """Try to find ffmpeg binary."""
    import shutil

    path = shutil.which("ffmpeg")
    if path:
        return path
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        return None


def download_track(url: str, track_id: str, output_dir: Path,
                   ffmpeg_location: str | None = None) -> bool:
    """Download a single track as MP3 using yt-dlp."""
    output_path = output_dir / f"{track_id}.%(ext)s"
    cmd = [
        "yt-dlp",
        url,
        "-x",
        "--audio-format", "mp3",
        "--audio-quality", "128K",
        "-o", str(output_path),
        "--no-playlist",
        "--quiet",
    ]
    if ffmpeg_location:
        cmd.extend(["--ffmpeg-location", ffmpeg_location])
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=120,
        )
        return result.returncode == 0
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return False


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Download Harmonix Set audio from YouTube",
    )
    parser.add_argument(
        "--harmonix-dir",
        default="data/harmonixset",
        help="Path to harmonixset repo",
    )
    parser.add_argument(
        "--output-dir",
        default="data/harmonixset/audio",
        help="Output directory for MP3 files",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Limit number of downloads (0 = all)",
    )
    args = parser.parse_args()

    harmonix_dir = Path(args.harmonix_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    csv_path = harmonix_dir / "dataset" / "youtube_urls.csv"
    if not csv_path.exists():
        print(f"Error: {csv_path} not found")
        sys.exit(1)

    df = pd.read_csv(csv_path)
    total = len(df)
    if args.limit > 0:
        df = df.head(args.limit)
        total = len(df)

    ffmpeg_loc = _find_ffmpeg()
    if ffmpeg_loc:
        print(f"Using ffmpeg: {ffmpeg_loc}")
    else:
        print("Warning: ffmpeg not found, conversion may fail")

    print(f"Downloading {total} tracks to {output_dir}...")

    success = 0
    failed = 0
    skipped = 0

    for i, row in df.iterrows():
        track_id = row["File"]
        url = row["URL"]

        # Skip if already downloaded
        mp3_path = output_dir / f"{track_id}.mp3"
        if mp3_path.exists():
            skipped += 1
            continue

        ok = download_track(url, track_id, output_dir, ffmpeg_loc)
        if ok:
            success += 1
            print(f"  [{success + failed + skipped}/{total}] OK: {track_id}")
        else:
            failed += 1
            print(
                f"  [{success + failed + skipped}/{total}] "
                f"FAIL: {track_id} ({url})"
            )

    print(f"\nDone: {success} downloaded, {skipped} skipped, {failed} failed")


if __name__ == "__main__":
    main()
