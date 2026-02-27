"""Evaluation: compute metrics, confusion matrices, CSV export."""

from __future__ import annotations

import csv
from pathlib import Path
from typing import Any

import numpy as np


def compute_head_metrics(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    class_names: list[str],
) -> dict[str, Any]:
    """Compute classification metrics for a single head.

    Args:
        y_true: Ground-truth class indices, shape (N,).
        y_pred: Predicted class indices, shape (N,).
        class_names: List of class name strings.

    Returns:
        Dict with accuracy, macro_f1, per_class metrics, and confusion_matrix.
    """
    from sklearn.metrics import (
        accuracy_score,
        confusion_matrix,
        f1_score,
        precision_recall_fscore_support,
    )

    accuracy = float(accuracy_score(y_true, y_pred))
    macro_f1 = float(f1_score(y_true, y_pred, average="macro", zero_division=0))

    labels = list(range(len(class_names)))
    precision, recall, f1, _ = precision_recall_fscore_support(
        y_true, y_pred, labels=labels, zero_division=0,
    )

    per_class = {}
    for i, name in enumerate(class_names):
        per_class[name] = {
            "precision": float(precision[i]),
            "recall": float(recall[i]),
            "f1": float(f1[i]),
        }

    cm = confusion_matrix(y_true, y_pred, labels=labels)

    return {
        "accuracy": accuracy,
        "macro_f1": macro_f1,
        "per_class": per_class,
        "confusion_matrix": cm.tolist(),
    }


def evaluate_dataset(
    model,
    dataset,
    head_key: str,
    class_names: list[str],
    device: str,
    batch_size: int = 32,
) -> dict[str, Any]:
    """Evaluate model on a dataset for a specific head.

    Args:
        model: CNNMultiTask in eval mode.
        dataset: Dataset returning dicts with "x" and label keys.
        head_key: One of "segment", "arousal", "valence".
        class_names: Class name list for the head.
        device: Device string.
        batch_size: Batch size for DataLoader.

    Returns:
        Metrics dict from compute_head_metrics.
    """
    import torch
    import torch.utils.data

    from musicml.datasets.multitask import collate_multitask

    label_key_map = {"segment": "y_seg", "arousal": "y_ar", "valence": "y_val"}
    label_key = label_key_map[head_key]

    head_index = {"segment": 0, "arousal": 1, "valence": 2}[head_key]

    loader = torch.utils.data.DataLoader(
        dataset, batch_size=batch_size, shuffle=False, collate_fn=collate_multitask,
    )

    all_true: list[int] = []
    all_pred: list[int] = []

    with torch.no_grad():
        for batch in loader:
            targets = batch.get(label_key)
            if targets is None:
                continue

            x = batch["x"].to(device)
            logits = model(x)
            preds = logits[head_index].argmax(dim=1).cpu()

            if isinstance(targets, torch.Tensor):
                targets_np = targets.numpy()
            else:
                targets_np = np.array(targets)

            for t, p in zip(targets_np, preds.numpy()):
                if t >= 0:
                    all_true.append(int(t))
                    all_pred.append(int(p))

    y_true = np.array(all_true, dtype=np.int64)
    y_pred = np.array(all_pred, dtype=np.int64)

    return compute_head_metrics(y_true, y_pred, class_names)


def evaluate_all_heads(
    model,
    deam_dataset,
    structure_dataset,
    cfg: dict[str, Any],
    device: str,
) -> dict[str, dict[str, Any]]:
    """Evaluate all 3 heads using appropriate datasets.

    Args:
        model: CNNMultiTask in eval mode.
        deam_dataset: DEAMDataset (for arousal/valence). Can be None.
        structure_dataset: StructureDataset (for segment). Can be None.
        cfg: Full config dict.
        device: Device string.

    Returns:
        Dict mapping head name to metrics dict.
    """
    batch_size = cfg["training"].get("batch_size", 32)
    results: dict[str, dict[str, Any]] = {}

    if structure_dataset is not None:
        results["segment"] = evaluate_dataset(
            model,
            structure_dataset,
            "segment",
            cfg.get("segment_classes", ["Calm", "Build-up", "Climax", "Outro"]),
            device,
            batch_size,
        )

    if deam_dataset is not None:
        results["arousal"] = evaluate_dataset(
            model,
            deam_dataset,
            "arousal",
            cfg.get("arousal_classes", ["Low", "Mid", "High"]),
            device,
            batch_size,
        )
        results["valence"] = evaluate_dataset(
            model,
            deam_dataset,
            "valence",
            cfg.get("valence_classes", ["Dark", "Neutral", "Bright"]),
            device,
            batch_size,
        )

    return results


def extract_boundaries(
    predictions: np.ndarray,
    hop_seconds: float = 1.0,
) -> list[float]:
    """Extract boundary times from a sequence of class predictions.

    A boundary occurs wherever the predicted class changes.

    Args:
        predictions: Array of class indices, shape (T,).
        hop_seconds: Time step between predictions.

    Returns:
        Sorted list of boundary times (in seconds).
    """
    boundaries: list[float] = []
    for i in range(1, len(predictions)):
        if predictions[i] != predictions[i - 1]:
            boundaries.append(i * hop_seconds)
    return boundaries


def compute_boundary_f1(
    true_boundaries: list[float],
    pred_boundaries: list[float],
    tolerance: float = 3.0,
) -> dict[str, float]:
    """Compute Precision, Recall, F1 for boundary detection.

    A predicted boundary is a true positive if there exists a ground-truth
    boundary within ±tolerance seconds (each ground-truth boundary can
    match at most one prediction).

    Args:
        true_boundaries: Ground-truth boundary times.
        pred_boundaries: Predicted boundary times.
        tolerance: Matching tolerance in seconds.

    Returns:
        Dict with precision, recall, f1.
    """
    if len(pred_boundaries) == 0 and len(true_boundaries) == 0:
        return {"precision": 1.0, "recall": 1.0, "f1": 1.0}
    if len(pred_boundaries) == 0:
        return {"precision": 0.0, "recall": 0.0, "f1": 0.0}
    if len(true_boundaries) == 0:
        return {"precision": 0.0, "recall": 0.0, "f1": 0.0}

    true_matched = set()
    tp = 0

    for pred_t in sorted(pred_boundaries):
        best_idx = -1
        best_dist = float("inf")
        for i, true_t in enumerate(true_boundaries):
            if i in true_matched:
                continue
            dist = abs(pred_t - true_t)
            if dist <= tolerance and dist < best_dist:
                best_dist = dist
                best_idx = i
        if best_idx >= 0:
            tp += 1
            true_matched.add(best_idx)

    precision = tp / len(pred_boundaries) if pred_boundaries else 0.0
    recall = tp / len(true_boundaries) if true_boundaries else 0.0
    f1 = (
        2 * precision * recall / (precision + recall)
        if (precision + recall) > 0
        else 0.0
    )

    return {"precision": precision, "recall": recall, "f1": f1}


def metrics_to_csv(
    all_metrics: dict[str, dict[str, Any]],
    output_path: str | Path,
) -> None:
    """Export metrics to CSV file.

    Columns: head, class, precision, recall, f1, accuracy, macro_f1.

    Args:
        all_metrics: Output of evaluate_all_heads.
        output_path: Path to CSV file.
    """
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["head", "class", "precision", "recall", "f1",
                         "accuracy", "macro_f1"])

        for head_name, metrics in all_metrics.items():
            accuracy = metrics["accuracy"]
            macro_f1 = metrics["macro_f1"]
            for cls_name, cls_metrics in metrics["per_class"].items():
                writer.writerow([
                    head_name,
                    cls_name,
                    f"{cls_metrics['precision']:.4f}",
                    f"{cls_metrics['recall']:.4f}",
                    f"{cls_metrics['f1']:.4f}",
                    f"{accuracy:.4f}",
                    f"{macro_f1:.4f}",
                ])


def plot_confusion_matrix(
    cm: list[list[int]],
    class_names: list[str],
    title: str,
    output_path: str | Path,
) -> None:
    """Plot and save a confusion matrix heatmap.

    Args:
        cm: Confusion matrix as list of lists.
        class_names: Class labels for axes.
        title: Plot title.
        output_path: Path to save PNG.
    """
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    cm_arr = np.array(cm)
    fig, ax = plt.subplots(figsize=(6, 5))
    im = ax.imshow(cm_arr, interpolation="nearest", cmap="Blues")
    fig.colorbar(im, ax=ax)

    ax.set(
        xticks=range(len(class_names)),
        yticks=range(len(class_names)),
        xticklabels=class_names,
        yticklabels=class_names,
        ylabel="True label",
        xlabel="Predicted label",
        title=title,
    )
    plt.setp(ax.get_xticklabels(), rotation=45, ha="right")

    thresh = cm_arr.max() / 2.0
    for i in range(cm_arr.shape[0]):
        for j in range(cm_arr.shape[1]):
            ax.text(
                j, i, str(cm_arr[i, j]),
                ha="center", va="center",
                color="white" if cm_arr[i, j] > thresh else "black",
            )

    fig.tight_layout()
    fig.savefig(output_path, dpi=150, bbox_inches="tight")
    plt.close(fig)
