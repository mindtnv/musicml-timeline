"""Utility functions: seed, device, config loading."""

from __future__ import annotations

import random
from pathlib import Path
from typing import Any

import numpy as np
import yaml


def set_seed(seed: int = 42) -> None:
    """Set random seed for reproducibility across numpy, random, and torch."""
    random.seed(seed)
    np.random.seed(seed)
    try:
        import torch

        torch.manual_seed(seed)
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(seed)
            torch.backends.cudnn.deterministic = True
            torch.backends.cudnn.benchmark = False
    except ImportError:
        pass


def get_device() -> str:
    """Return best available device: 'cuda', 'mps', or 'cpu'."""
    try:
        import torch

        if torch.cuda.is_available():
            return "cuda"
        if torch.backends.mps.is_available():
            return "mps"
    except ImportError:
        pass
    return "cpu"


def load_config(path: str | Path = "configs/default.yaml") -> dict[str, Any]:
    """Load YAML configuration file."""
    with open(path) as f:
        return yaml.safe_load(f)
