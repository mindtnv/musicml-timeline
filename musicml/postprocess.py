"""Post-processing: smoothing predictions and merging into segments."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass
class Segment:
    """A contiguous segment with class label and confidence."""

    start: float
    end: float
    label: str
    confidence: float


def smooth_predictions(
    predictions: np.ndarray,
    kernel_size: int = 5,
) -> np.ndarray:
    """Apply median filter to smooth frame-level class predictions.

    Args:
        predictions: Array of integer class indices, shape (T,).
        kernel_size: Size of the median filter window (must be odd).

    Returns:
        Smoothed predictions array of shape (T,).
    """
    if kernel_size % 2 == 0:
        kernel_size += 1

    padded = np.pad(predictions, kernel_size // 2, mode="edge")
    smoothed = np.empty_like(predictions)
    for i in range(len(predictions)):
        window = padded[i : i + kernel_size]
        values, counts = np.unique(window, return_counts=True)
        smoothed[i] = values[np.argmax(counts)]
    return smoothed


def merge_segments(
    predictions: np.ndarray,
    probabilities: np.ndarray,
    hop_seconds: float = 1.0,
    min_duration: float = 6.0,
    class_names: list[str] | None = None,
) -> list[Segment]:
    """Merge consecutive identical predictions into segments.

    Args:
        predictions: Smoothed class indices, shape (T,).
        probabilities: Max probability per frame, shape (T,).
        hop_seconds: Time step between frames.
        min_duration: Minimum segment duration in seconds.
        class_names: Mapping from class index to label string.

    Returns:
        List of Segment objects.
    """
    if len(predictions) == 0:
        return []

    segments: list[Segment] = []
    current_label = int(predictions[0])
    start_idx = 0

    for i in range(1, len(predictions)):
        if int(predictions[i]) != current_label:
            label_str = (
                class_names[current_label] if class_names else str(current_label)
            )
            conf = float(np.mean(probabilities[start_idx:i]))
            segments.append(
                Segment(
                    start=start_idx * hop_seconds,
                    end=i * hop_seconds,
                    label=label_str,
                    confidence=conf,
                )
            )
            current_label = int(predictions[i])
            start_idx = i

    # Last segment
    label_str = class_names[current_label] if class_names else str(current_label)
    conf = float(np.mean(probabilities[start_idx:]))
    segments.append(
        Segment(
            start=start_idx * hop_seconds,
            end=len(predictions) * hop_seconds,
            label=label_str,
            confidence=conf,
        )
    )

    # Merge short segments with neighbors
    merged: list[Segment] = []
    for seg in segments:
        if merged and (seg.end - seg.start) < min_duration:
            # Merge with previous segment (take higher confidence label)
            prev = merged[-1]
            if prev.confidence >= seg.confidence:
                merged[-1] = Segment(prev.start, seg.end, prev.label, prev.confidence)
            else:
                merged[-1] = Segment(prev.start, seg.end, seg.label, seg.confidence)
        else:
            merged.append(seg)

    return merged
