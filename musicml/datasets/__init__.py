"""Datasets subpackage for music analysis."""

from musicml.datasets.deam import DEAMDataset
from musicml.datasets.multitask import RoundRobinLoader, collate_multitask
from musicml.datasets.structure import StructureDataset

__all__ = ["DEAMDataset", "StructureDataset", "RoundRobinLoader", "collate_multitask"]
