"""Tests for evaluation module (Step 7)."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import torch
import torch.utils.data

from musicml.evaluate import (
    compute_boundary_f1,
    compute_head_metrics,
    evaluate_dataset,
    extract_boundaries,
    metrics_to_csv,
    plot_confusion_matrix,
)


class FakeStructureDataset(torch.utils.data.Dataset):
    """Fake dataset that returns structure samples with known labels."""

    def __init__(self, size: int = 20) -> None:
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


def test_perfect_predictions() -> None:
    y_true = np.array([0, 1, 2, 0, 1, 2])
    y_pred = np.array([0, 1, 2, 0, 1, 2])
    metrics = compute_head_metrics(y_true, y_pred, ["A", "B", "C"])
    assert metrics["accuracy"] == 1.0
    assert metrics["macro_f1"] == 1.0


def test_all_wrong_predictions() -> None:
    y_true = np.array([0, 0, 0, 0])
    y_pred = np.array([1, 1, 1, 1])
    metrics = compute_head_metrics(y_true, y_pred, ["A", "B"])
    assert metrics["accuracy"] == 0.0


def test_confusion_matrix_shape() -> None:
    y_true = np.array([0, 1, 2, 0, 1, 2])
    y_pred = np.array([0, 1, 0, 0, 2, 1])
    metrics = compute_head_metrics(y_true, y_pred, ["A", "B", "C"])
    cm = metrics["confusion_matrix"]
    assert len(cm) == 3
    assert all(len(row) == 3 for row in cm)


def test_confusion_matrix_row_sums() -> None:
    y_true = np.array([0, 0, 1, 1, 1, 2])
    y_pred = np.array([0, 1, 1, 1, 2, 2])
    metrics = compute_head_metrics(y_true, y_pred, ["A", "B", "C"])
    cm = np.array(metrics["confusion_matrix"])
    row_sums = cm.sum(axis=1)
    # class 0 has 2 samples, class 1 has 3, class 2 has 1
    expected = np.array([2, 3, 1])
    np.testing.assert_array_equal(row_sums, expected)


def test_metrics_with_missing_class() -> None:
    """Class 2 has no true samples — recall should be 0."""
    y_true = np.array([0, 0, 1, 1])
    y_pred = np.array([0, 2, 1, 0])
    metrics = compute_head_metrics(y_true, y_pred, ["A", "B", "C"])
    assert metrics["per_class"]["C"]["recall"] == 0.0


def test_per_class_keys() -> None:
    y_true = np.array([0, 1, 2])
    y_pred = np.array([0, 1, 2])
    metrics = compute_head_metrics(y_true, y_pred, ["Low", "Mid", "High"])
    for name in ("Low", "Mid", "High"):
        assert name in metrics["per_class"]
        cls = metrics["per_class"][name]
        assert "precision" in cls
        assert "recall" in cls
        assert "f1" in cls


def test_metrics_to_csv_creates_file(tmp_path: Path) -> None:
    all_metrics = {
        "segment": {
            "accuracy": 0.75,
            "macro_f1": 0.7,
            "per_class": {
                "Calm": {"precision": 0.8, "recall": 0.7, "f1": 0.75},
                "Climax": {"precision": 0.7, "recall": 0.8, "f1": 0.75},
            },
            "confusion_matrix": [[7, 3], [2, 8]],
        },
    }
    csv_path = tmp_path / "metrics.csv"
    metrics_to_csv(all_metrics, csv_path)
    assert csv_path.exists()
    content = csv_path.read_text()
    assert "head" in content
    assert "precision" in content
    assert "segment" in content


def test_plot_confusion_matrix_creates_file(tmp_path: Path) -> None:
    cm = [[5, 2, 0], [1, 6, 1], [0, 1, 4]]
    plot_path = tmp_path / "cm.png"
    plot_confusion_matrix(cm, ["A", "B", "C"], "Test CM", plot_path)
    assert plot_path.exists()
    assert plot_path.stat().st_size > 0


def test_extract_boundaries_basic() -> None:
    preds = np.array([0, 0, 1, 1, 2, 2])
    boundaries = extract_boundaries(preds, hop_seconds=1.0)
    assert boundaries == [2.0, 4.0]


def test_extract_boundaries_no_change() -> None:
    preds = np.array([1, 1, 1, 1])
    boundaries = extract_boundaries(preds, hop_seconds=1.0)
    assert boundaries == []


def test_boundary_f1_perfect() -> None:
    true_b = [5.0, 10.0, 15.0]
    pred_b = [5.0, 10.0, 15.0]
    result = compute_boundary_f1(true_b, pred_b, tolerance=3.0)
    assert result["precision"] == 1.0
    assert result["recall"] == 1.0
    assert result["f1"] == 1.0


def test_boundary_f1_within_tolerance() -> None:
    true_b = [5.0, 10.0]
    pred_b = [6.5, 12.0]  # 6.5 within 3s of 5, 12.0 within 3s of 10
    result = compute_boundary_f1(true_b, pred_b, tolerance=3.0)
    assert result["precision"] == 1.0
    assert result["recall"] == 1.0


def test_boundary_f1_no_match() -> None:
    true_b = [5.0, 10.0]
    pred_b = [20.0, 30.0]
    result = compute_boundary_f1(true_b, pred_b, tolerance=3.0)
    assert result["precision"] == 0.0
    assert result["recall"] == 0.0
    assert result["f1"] == 0.0


def test_boundary_f1_partial_match() -> None:
    true_b = [5.0, 10.0, 20.0]
    pred_b = [5.5, 50.0]  # 5.5 matches 5.0; 50.0 matches nothing
    result = compute_boundary_f1(true_b, pred_b, tolerance=3.0)
    assert result["precision"] == 0.5  # 1/2
    assert abs(result["recall"] - 1 / 3) < 1e-6  # 1/3


def test_boundary_f1_empty_both() -> None:
    result = compute_boundary_f1([], [], tolerance=3.0)
    assert result["f1"] == 1.0


def test_evaluate_dataset_with_fake_model() -> None:
    from musicml.models import CNNMultiTask

    model = CNNMultiTask()
    model.eval()
    dataset = FakeStructureDataset(size=16)

    metrics = evaluate_dataset(
        model, dataset, "segment",
        ["Calm", "Build-up", "Climax", "Outro"],
        device="cpu", batch_size=8,
    )
    assert "accuracy" in metrics
    assert "macro_f1" in metrics
    assert 0.0 <= metrics["accuracy"] <= 1.0
    assert "per_class" in metrics
    assert "confusion_matrix" in metrics
