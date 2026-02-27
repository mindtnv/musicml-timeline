"""Tests for multi-task collate and RoundRobinLoader."""

from __future__ import annotations

import torch
import torch.utils.data

from musicml.datasets.multitask import RoundRobinLoader, collate_multitask


class FakeDeamDataset(torch.utils.data.Dataset):
    """Fake DEAM-like dataset: y_seg=None, y_ar/y_val present."""

    def __init__(self, size: int = 10) -> None:
        self.size = size

    def __len__(self) -> int:
        return self.size

    def __getitem__(self, idx: int) -> dict:
        return {
            "x": torch.randn(1, 128, 344),
            "y_seg": None,
            "y_ar": idx % 3,
            "y_val": idx % 3,
        }


class FakeStructureDataset(torch.utils.data.Dataset):
    """Fake Structure-like dataset: y_ar=None, y_val=None, y_seg present."""

    def __init__(self, size: int = 10) -> None:
        self.size = size

    def __len__(self) -> int:
        return self.size

    def __getitem__(self, idx: int) -> dict:
        return {
            "x": torch.randn(1, 128, 344),
            "y_seg": idx % 4,
            "y_ar": None,
            "y_val": None,
        }


def test_collate_deam_batch() -> None:
    """DEAM batch: y_seg should be None, y_ar/y_val should be tensors."""
    batch = [FakeDeamDataset()[i] for i in range(4)]
    collated = collate_multitask(batch)

    assert collated["x"].shape == (4, 1, 128, 344)
    assert collated["y_seg"] is None
    assert isinstance(collated["y_ar"], torch.Tensor)
    assert isinstance(collated["y_val"], torch.Tensor)
    assert collated["y_ar"].shape == (4,)


def test_collate_structure_batch() -> None:
    """Structure batch: y_seg should be tensor, y_ar/y_val should be None."""
    batch = [FakeStructureDataset()[i] for i in range(4)]
    collated = collate_multitask(batch)

    assert collated["x"].shape == (4, 1, 128, 344)
    assert isinstance(collated["y_seg"], torch.Tensor)
    assert collated["y_seg"].shape == (4,)
    assert collated["y_ar"] is None
    assert collated["y_val"] is None


def test_round_robin_alternates() -> None:
    """Batches should alternate between loaders."""
    ds1 = FakeDeamDataset(size=4)
    ds2 = FakeStructureDataset(size=4)
    loader1 = torch.utils.data.DataLoader(
        ds1, batch_size=2, collate_fn=collate_multitask,
    )
    loader2 = torch.utils.data.DataLoader(
        ds2, batch_size=2, collate_fn=collate_multitask,
    )
    rr = RoundRobinLoader(loader1, loader2)

    batches = list(rr)
    assert len(batches) >= 4

    # First batch from loader1 (DEAM): y_seg is None
    assert batches[0]["y_seg"] is None
    # Second batch from loader2 (Structure): y_ar is None
    assert batches[1]["y_ar"] is None


def test_round_robin_cycles_shorter() -> None:
    """Shorter loader should cycle to match longer loader."""
    ds_short = FakeDeamDataset(size=2)
    ds_long = FakeStructureDataset(size=6)
    loader_short = torch.utils.data.DataLoader(
        ds_short, batch_size=2, collate_fn=collate_multitask,
    )
    loader_long = torch.utils.data.DataLoader(
        ds_long, batch_size=2, collate_fn=collate_multitask,
    )
    rr = RoundRobinLoader(loader_short, loader_long)

    batches = list(rr)
    # loader_long has 3 batches (max), loader_short cycles to match
    assert len(batches) == 6  # 3 from each


def test_round_robin_len() -> None:
    """__len__ should return sum of individual loader lengths."""
    ds1 = FakeDeamDataset(size=4)
    ds2 = FakeStructureDataset(size=6)
    loader1 = torch.utils.data.DataLoader(
        ds1, batch_size=2, collate_fn=collate_multitask,
    )
    loader2 = torch.utils.data.DataLoader(
        ds2, batch_size=2, collate_fn=collate_multitask,
    )
    rr = RoundRobinLoader(loader1, loader2)
    assert len(rr) == 5  # 2 + 3
