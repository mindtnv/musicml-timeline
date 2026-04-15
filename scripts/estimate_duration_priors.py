"""Estimate per-class segment duration statistics from the train split.

Parses Harmonix annotations on the train split, collects the durations of each
mapped class (Intro, Verse, Bridge, Chorus, Instrumental, Outro), and saves
mean/median/std/quantiles to a JSON for use by the duration-aware decoder.
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--splits", default="data/structure/splits.json")
    p.add_argument("--ann-dir", default="data/structure/annotations")
    p.add_argument("--output", default="data/structure/duration_priors.json")
    args = p.parse_args()

    from musicml.datasets.structure import (
        boundaries_to_intervals,
        map_label,
        parse_annotations,
    )

    with open(args.splits) as f:
        splits = json.load(f)
    train_ids = splits["train"]

    durations: dict[str, list[float]] = defaultdict(list)
    for tid in train_ids:
        for ext in (".txt", ".tsv"):
            pth = Path(args.ann_dir) / f"{tid}{ext}"
            if pth.exists():
                entries = parse_annotations(pth)
                intervals = boundaries_to_intervals(entries)
                for s, e, raw in intervals:
                    if raw.lower() in ("end", "silence"):
                        continue
                    mapped = map_label(raw)
                    d = e - s
                    if d > 0:
                        durations[mapped].append(float(d))
                break

    stats = {}
    import numpy as np
    for cls, ds in durations.items():
        arr = np.array(ds)
        stats[cls] = {
            "count": int(len(arr)),
            "mean": float(arr.mean()),
            "median": float(np.median(arr)),
            "std": float(arr.std()),
            "q10": float(np.quantile(arr, 0.10)),
            "q25": float(np.quantile(arr, 0.25)),
            "q75": float(np.quantile(arr, 0.75)),
            "q90": float(np.quantile(arr, 0.90)),
            "min": float(arr.min()),
            "max": float(arr.max()),
        }

    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, "w") as f:
        json.dump(stats, f, indent=2)

    print(f"Classes: {list(stats.keys())}")
    for cls, s in stats.items():
        print(
            f"  {cls:14s}  n={s['count']:5d}  "
            f"median={s['median']:6.1f}s  "
            f"q25={s['q25']:5.1f}  q75={s['q75']:6.1f}"
        )
    print(f"Saved -> {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
