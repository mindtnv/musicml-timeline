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


def viterbi_decode(
    all_probs: np.ndarray,
    transition_penalty: float = 2.5,
    position_priors: np.ndarray | None = None,
) -> np.ndarray:
    """Viterbi decoding: find most likely class sequence with transition penalty.

    Maximizes::

        sum_t [log P(class_t | frame_t) + position_prior_t[class_t]]
        - transition_penalty * sum_t [I(class_t != class_{t-1})]

    This penalizes rapid class changes — encouraging long stable segments while
    still allowing transitions at strong evidence points.

    Args:
        all_probs: Frame-level class probabilities, shape (T, K).
        transition_penalty: Log-prob penalty applied at every class change.
            Larger → longer, smoother segments. Typical range 1.0 – 4.0.
        position_priors: Optional (T, K) additive log-prior terms. Use to
            encourage e.g. Intro at the start, Outro at the end.

    Returns:
        Array of class indices of shape (T,).
    """
    T, K = all_probs.shape
    if T == 0:
        return np.empty((0,), dtype=np.int64)

    # Log probabilities for numerical stability
    log_probs = np.log(np.maximum(all_probs, 1e-9))
    if position_priors is not None:
        log_probs = log_probs + position_priors

    # Viterbi DP
    delta = np.full((T, K), -np.inf, dtype=np.float64)
    backptr = np.zeros((T, K), dtype=np.int64)
    delta[0] = log_probs[0]

    for t in range(1, T):
        # For each current class j:
        #   best_prev = argmax_i [delta[t-1, i] - pen * (i != j)]
        # Vectorized: compute two candidates per j:
        #   stay (i == j):  delta[t-1, j]
        #   switch (i != j): max_{i != j} delta[t-1, i] - pen
        best_prev = delta[t - 1].max()
        best_prev_idx = int(delta[t - 1].argmax())
        # If best_prev_idx != j: switch cost = best_prev - pen
        # else: stay at j = delta[t-1, j]
        stay = delta[t - 1]  # (K,)
        switch = np.full(K, best_prev - transition_penalty, dtype=np.float64)
        # For the j == best_prev_idx case, "switch" means second-best_prev_idx;
        # compute second-best:
        second_mask = np.ones(K, dtype=bool)
        second_mask[best_prev_idx] = False
        if second_mask.any():
            second_best = delta[t - 1][second_mask].max()
            switch[best_prev_idx] = second_best - transition_penalty
        else:
            switch[best_prev_idx] = -np.inf

        take_stay = stay >= switch  # (K,)
        delta[t] = log_probs[t] + np.where(take_stay, stay, switch)
        backptr[t] = np.where(
            take_stay,
            np.arange(K, dtype=np.int64),
            np.full(K, best_prev_idx, dtype=np.int64),
        )
        # Fix the j == best_prev_idx case: its "switch" backptr should be
        # second_best_idx, not best_prev_idx.
        if not take_stay[best_prev_idx] and second_mask.any():
            second_best_idx = int(np.argmax(np.where(second_mask, delta[t - 1], -np.inf)))
            backptr[t, best_prev_idx] = second_best_idx

    # Backtrace
    path = np.empty(T, dtype=np.int64)
    path[-1] = int(delta[-1].argmax())
    for t in range(T - 2, -1, -1):
        path[t] = int(backptr[t + 1, path[t + 1]])

    return path


def build_segment_position_priors(
    T: int,
    class_names: list[str],
    intro_classes: tuple[str, ...] = ("Intro", "Вступление"),
    outro_classes: tuple[str, ...] = ("Outro", "Завершение"),
    boundary_fraction: float = 0.22,
    penalty: float = 10.0,
) -> np.ndarray:
    """Build position-based log-priors penalizing Intro outside the first
    `boundary_fraction` of the track and Outro outside the last `boundary_fraction`.

    Args:
        T: Number of frames.
        class_names: List of class labels indexed by class id.
        intro_classes: Class names that should appear near start only.
        outro_classes: Class names that should appear near end only.
        boundary_fraction: Fraction of track allowed for boundary classes.
        penalty: Log-prob penalty (subtracted) for out-of-place boundary classes.

    Returns:
        (T, K) array of additive log-priors.
    """
    K = len(class_names)
    priors = np.zeros((T, K), dtype=np.float64)

    boundary_frames = max(1, int(T * boundary_fraction))

    for ci, name in enumerate(class_names):
        if name in intro_classes:
            # Penalize Intro after first `boundary_fraction` of track
            priors[boundary_frames:, ci] -= penalty
        elif name in outro_classes:
            # Penalize Outro before last `boundary_fraction` of track
            priors[: T - boundary_frames, ci] -= penalty

    return priors


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

    # Iteratively merge short segments with neighbors until stable.
    # Choose the neighbor whose class-label probability was stronger for this
    # segment (weighted merge rather than blind "take previous").
    changed = True
    while changed:
        changed = False
        merged: list[Segment] = []
        i = 0
        while i < len(segments):
            seg = segments[i]
            dur = seg.end - seg.start
            if dur < min_duration:
                prev = merged[-1] if merged else None
                nxt = segments[i + 1] if i + 1 < len(segments) else None
                # Prefer merging with neighbor of same class if exists
                if prev and nxt and prev.label == nxt.label:
                    # Absorb seg into bridge
                    merged[-1] = Segment(
                        prev.start, nxt.end, prev.label,
                        (prev.confidence + nxt.confidence) / 2,
                    )
                    i += 2  # skip next (already consumed)
                    changed = True
                    continue
                elif prev and (not nxt or prev.confidence >= (nxt.confidence if nxt else 0)):
                    merged[-1] = Segment(prev.start, seg.end, prev.label, prev.confidence)
                    changed = True
                elif nxt:
                    # Push to next: replace label/conf
                    segments[i + 1] = Segment(seg.start, nxt.end, nxt.label, nxt.confidence)
                    changed = True
                else:
                    # No neighbors — keep as is
                    merged.append(seg)
            else:
                merged.append(seg)
            i += 1
        segments = merged

    return segments


def decode_segment_head(
    all_probs: np.ndarray,
    class_names: list[str],
    hop_seconds: float = 1.0,
    *,
    use_viterbi: bool = True,
    transition_penalty: float = 2.5,
    use_position_priors: bool = True,
    median_kernel: int = 5,
    min_duration: float = 6.0,
) -> list[Segment]:
    """High-level segment decoder: Viterbi + median filter + minimum-duration merge.

    Args:
        all_probs: (T, K) frame-level class probabilities.
        class_names: list of K class labels.
        hop_seconds: seconds between frames.
        use_viterbi: if True, use Viterbi instead of per-frame argmax.
        transition_penalty: log-prob penalty at class boundaries.
        use_position_priors: if True, discourage Intro/Outro in middle of track.
        median_kernel: median filter window size AFTER Viterbi (further smoothing).
        min_duration: minimum final segment duration (sec).

    Returns:
        List of merged Segments.
    """
    T, K = all_probs.shape
    if T == 0:
        return []

    if use_viterbi:
        priors = (
            build_segment_position_priors(T, class_names)
            if use_position_priors
            else None
        )
        preds = viterbi_decode(
            all_probs,
            transition_penalty=transition_penalty,
            position_priors=priors,
        )
    else:
        preds = np.argmax(all_probs, axis=1)

    if median_kernel and median_kernel > 1:
        preds = smooth_predictions(preds, kernel_size=median_kernel)

    # Max probability per frame for confidence
    max_probs = all_probs.max(axis=1)

    return merge_segments(
        preds,
        max_probs,
        hop_seconds=hop_seconds,
        min_duration=min_duration,
        class_names=class_names,
    )
