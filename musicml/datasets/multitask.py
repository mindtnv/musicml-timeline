"""Multi-task data utilities: collate function and round-robin loader."""

from __future__ import annotations

from itertools import cycle
from typing import Any, Iterator

import torch


def collate_multitask(batch: list[dict[str, Any]]) -> dict[str, Any]:
    """Collate function for mixed-label multi-task batches.

    Stacks ``x`` tensors. For each integer label key (``y_seg``, ``y_ar``, ``y_val``):
    if all values in the batch are None, the result is None;
    otherwise packs into a LongTensor (None entries are filled with -1).

    For float regression keys (``y_ar_cont``, ``y_val_cont``):
    if all values are None, the result is None;
    otherwise packs into a FloatTensor (None entries are filled with NaN).
    """
    x = torch.stack([s["x"] for s in batch])

    result: dict[str, Any] = {"x": x}

    # Integer classification targets
    for key in ("y_seg", "y_ar", "y_val", "y_genre"):
        values = [s.get(key) for s in batch]
        if all(v is None for v in values):
            result[key] = None
        else:
            result[key] = torch.tensor(
                [v if v is not None else -1 for v in values], dtype=torch.long,
            )

    # Float regression targets
    for key in ("y_ar_cont", "y_val_cont"):
        values = [s.get(key) for s in batch]
        if all(v is None for v in values):
            result[key] = None
        else:
            result[key] = torch.tensor(
                [v if v is not None else float("nan") for v in values],
                dtype=torch.float32,
            )

    return result


def collate_sequences(batch: list[dict[str, Any]]) -> dict[str, Any]:
    """Collate variable-length embedding sequences with padding.

    Pads ``x`` to ``(B, T_max, D)`` with zeros.
    Pads integer labels to ``(B, T_max)`` with -1 (``ignore_index``).
    Pads float labels to ``(B, T_max)`` with NaN.
    Returns ``lengths`` tensor ``(B,)`` for ``pack_padded_sequence``.
    """
    lengths = torch.tensor(
        [s["length"] for s in batch], dtype=torch.long,
    )
    t_max = int(lengths.max().item())
    embedding_dim = batch[0]["x"].shape[-1]

    # Pad x
    padded_x = torch.zeros(len(batch), t_max, embedding_dim)
    for i, s in enumerate(batch):
        seq_len = s["x"].shape[0]
        padded_x[i, :seq_len] = s["x"]

    result: dict[str, Any] = {"x": padded_x, "lengths": lengths}

    # Integer classification targets
    for key in ("y_seg", "y_ar", "y_val", "y_genre"):
        values = [s.get(key) for s in batch]
        if all(v is None for v in values):
            result[key] = None
        else:
            padded = torch.full((len(batch), t_max), -1, dtype=torch.long)
            for i, v in enumerate(values):
                if v is not None and isinstance(v, torch.Tensor):
                    padded[i, :v.shape[0]] = v
            result[key] = padded

    # Float regression targets
    for key in ("y_ar_cont", "y_val_cont"):
        values = [s.get(key) for s in batch]
        if all(v is None for v in values):
            result[key] = None
        else:
            padded = torch.full(
                (len(batch), t_max), float("nan"), dtype=torch.float32,
            )
            for i, v in enumerate(values):
                if v is not None and isinstance(v, torch.Tensor):
                    padded[i, :v.shape[0]] = v
            result[key] = padded

    return result


class RoundRobinLoader:
    """Yields batches from multiple DataLoaders in round-robin order."""

    def __init__(self, *loaders: torch.utils.data.DataLoader) -> None:
        if not loaders:
            raise ValueError("At least one DataLoader is required")
        self.loaders = loaders

    def __len__(self) -> int:
        max_len = max(len(loader) for loader in self.loaders)
        return max_len * len(self.loaders)

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
