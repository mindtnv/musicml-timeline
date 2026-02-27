"""Multi-task data utilities: collate function and round-robin loader."""

from __future__ import annotations

from itertools import cycle
from typing import Any, Iterator

import torch


def collate_multitask(batch: list[dict[str, Any]]) -> dict[str, Any]:
    """Collate function for mixed-label multi-task batches.

    Stacks ``x`` tensors. For each label key (``y_seg``, ``y_ar``, ``y_val``):
    if all values in the batch are None, the result is None;
    otherwise packs into a LongTensor (None entries are filled with -1).
    """
    x = torch.stack([s["x"] for s in batch])

    result: dict[str, Any] = {"x": x}
    for key in ("y_seg", "y_ar", "y_val"):
        values = [s[key] for s in batch]
        if all(v is None for v in values):
            result[key] = None
        else:
            result[key] = torch.tensor(
                [v if v is not None else -1 for v in values], dtype=torch.long,
            )

    return result


class RoundRobinLoader:
    """Yields batches from multiple DataLoaders in round-robin order.

    When a shorter loader is exhausted it restarts (cycles).
    One 'epoch' finishes when the longest loader has been fully consumed
    at least once.
    """

    def __init__(self, *loaders: torch.utils.data.DataLoader) -> None:
        if not loaders:
            raise ValueError("At least one DataLoader is required")
        self.loaders = loaders

    def __len__(self) -> int:
        return sum(len(loader) for loader in self.loaders)

    def __iter__(self) -> Iterator[dict[str, Any]]:
        max_len = max(len(loader) for loader in self.loaders)
        iterators = [cycle(loader) for loader in self.loaders]
        counts = [0] * len(self.loaders)

        while True:
            all_done = False
            for i, it in enumerate(iterators):
                if counts[i] >= max_len:
                    continue
                batch = next(it)
                counts[i] += 1
                yield batch

            if all(c >= max_len for c in counts):
                all_done = True
            if all_done:
                break
