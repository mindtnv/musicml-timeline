#!/usr/bin/env python3
"""Re-run segment postprocessing on all analysed tracks.

Uses the raw segment_probs already stored in each track's JSON — no model
inference needed, so it finishes in seconds for the entire library.

Usage:
    python scripts/reprocess_segments.py
    python scripts/reprocess_segments.py --data-dir web/backend/data
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Ensure musicml package is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np
from musicml.postprocess import decode_segment_head_v2, Segment

CLASS_NAMES = ["Intro", "Verse", "Bridge", "Chorus", "Instrumental", "Outro"]


def seg_to_dict(seg: Segment) -> dict:
    return {
        "start": round(seg.start, 2),
        "end": round(seg.end, 2),
        "label": seg.label,
        "confidence": round(seg.confidence, 4),
    }


def reprocess_track(path: Path) -> bool:
    """Re-decode segments for one track.  Returns True if updated."""
    raw = json.loads(path.read_text(encoding="utf-8"))

    tl = raw.get("timeline")
    if not tl:
        return False

    fp = tl.get("frame_predictions")
    if not fp:
        return False

    seg_probs = fp.get("segment_probs")
    if not seg_probs or len(seg_probs) == 0:
        return False

    hop = fp.get("frame_hop_seconds", 1.0)
    all_probs = np.asarray(seg_probs, dtype=np.float64)

    if all_probs.ndim != 2 or all_probs.shape[1] != len(CLASS_NAMES):
        print(f"  SKIP {path.name}: shape {all_probs.shape} != (T, {len(CLASS_NAMES)})")
        return False

    old_count = len(tl.get("segment", []))

    new_segments = decode_segment_head_v2(
        all_probs,
        class_names=CLASS_NAMES,
        hop_seconds=hop,
        # New tuned defaults are baked into the function signature now,
        # but we can override from here if needed.
    )

    tl["segment"] = [seg_to_dict(s) for s in new_segments]
    path.write_text(json.dumps(raw, ensure_ascii=False, indent=2), encoding="utf-8")

    name = raw.get("originalName", path.stem)
    print(f"  {name}: {old_count} → {len(new_segments)} segments")
    return True


def main():
    parser = argparse.ArgumentParser(description="Re-run segment postprocessing")
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=Path("web/backend/data"),
        help="Directory containing track JSON files",
    )
    args = parser.parse_args()

    data_dir: Path = args.data_dir
    if not data_dir.is_dir():
        print(f"Data directory not found: {data_dir}")
        sys.exit(1)

    jsons = sorted(data_dir.glob("*.json"))
    print(f"Found {len(jsons)} track files in {data_dir}\n")

    updated = 0
    for p in jsons:
        try:
            if reprocess_track(p):
                updated += 1
        except Exception as e:
            import traceback
            traceback.print_exc()

    print(f"\nDone. Updated {updated}/{len(jsons)} tracks.")


if __name__ == "__main__":
    main()
