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


# =============================================================================
# v2 decoder: algorithmic improvements on top of decode_segment_head.
#
# The v1 decoder ran a uniform-penalty Viterbi with hard-cliff position priors
# and class-agnostic min-duration merging. Its weaknesses, measured on the
# Harmonix test split (frame_acc=0.26, boundary_f1=0.15):
#
#   1. Uniform transition penalty ignores musical grammar — "Outro→Verse" and
#      "Chorus→Chorus" are equally cheap. A structure-aware transition matrix
#      concentrates probability on musically plausible paths.
#   2. Hard position priors add a cliff penalty (e.g. -10) — either the class
#      is allowed or forbidden. Real tracks have smooth Intro-fade transitions;
#      a Gaussian taper yields fewer artefacts at the boundary of the allowed
#      region.
#   3. The model's 10s window with 1s hop smears each label's onset forward by
#      ~window/2 — predicted boundaries land systematically late. Shifting
#      the raw predictions left by (window - hop) / 2 corrects this bias.
#   4. Viterbi operates on softmax probs that are often overconfident; a
#      temperature T>1 before log-probs expands the dynamic range and lets the
#      priors and transition matrix have meaningful influence.
#   5. Class min-duration: Intro/Bridge can be short (pre-chorus), Chorus
#      typically lasts a full hook (~10s+). One min_duration=6 does not fit.
#   6. After Viterbi, predicted boundaries still land on arbitrary 1s ticks;
#      snapping each boundary to the nearest local maximum of the probability
#      novelty curve aligns it with the actual frame where the class changed.
# =============================================================================


# Hand-tuned structural transition cost (self-loops are 0, asymmetric).
# Rows = from class, cols = to class. Used additively in Viterbi.
# Order: ["Intro", "Verse", "Bridge", "Chorus", "Instrumental", "Outro"].
_DEFAULT_TRANSITION_COST: dict[tuple[str, str], float] = {
    # Intro feeds naturally into Verse/Instrumental/Chorus, not Outro directly
    ("Intro", "Verse"): 0.0,
    ("Intro", "Chorus"): 0.5,
    ("Intro", "Instrumental"): 0.0,
    ("Intro", "Bridge"): 1.5,
    ("Intro", "Outro"): 6.0,
    # Verse is the "neutral" class — to anything
    ("Verse", "Chorus"): 0.0,
    ("Verse", "Bridge"): 0.0,
    ("Verse", "Verse"): 0.5,  # discourage Verse→Verse noise
    ("Verse", "Instrumental"): 0.5,
    ("Verse", "Intro"): 4.0,
    ("Verse", "Outro"): 1.0,
    # Bridge (pre-chorus) → Chorus overwhelmingly
    ("Bridge", "Chorus"): 0.0,
    ("Bridge", "Verse"): 1.0,
    ("Bridge", "Instrumental"): 1.5,
    ("Bridge", "Intro"): 5.0,
    ("Bridge", "Outro"): 3.0,
    # Chorus → Verse/Instrumental/Bridge/Outro all common
    ("Chorus", "Verse"): 0.0,
    ("Chorus", "Bridge"): 0.5,
    ("Chorus", "Instrumental"): 0.0,
    ("Chorus", "Chorus"): 0.5,
    ("Chorus", "Intro"): 5.0,
    ("Chorus", "Outro"): 0.5,
    # Instrumental is a wildcard
    ("Instrumental", "Verse"): 0.0,
    ("Instrumental", "Chorus"): 0.0,
    ("Instrumental", "Bridge"): 1.0,
    ("Instrumental", "Outro"): 0.5,
    ("Instrumental", "Intro"): 4.0,
    # Outro should almost never leave to something else
    ("Outro", "Verse"): 8.0,
    ("Outro", "Chorus"): 8.0,
    ("Outro", "Bridge"): 8.0,
    ("Outro", "Instrumental"): 6.0,
    ("Outro", "Intro"): 8.0,
}


def build_transition_cost_matrix(
    class_names: list[str], base_penalty: float = 1.2,
) -> np.ndarray:
    """Build a (K, K) additive cost matrix. Self-loops are 0."""
    K = len(class_names)
    mat = np.zeros((K, K), dtype=np.float64)
    for i, a in enumerate(class_names):
        for j, b in enumerate(class_names):
            if i == j:
                mat[i, j] = 0.0
                continue
            key = (a, b)
            cost = _DEFAULT_TRANSITION_COST.get(key, base_penalty)
            mat[i, j] = cost
    return mat


def viterbi_decode_matrix(
    log_probs: np.ndarray,
    transition_cost: np.ndarray,
) -> np.ndarray:
    """Viterbi with a full (K, K) transition-cost matrix (subtracted)."""
    T, K = log_probs.shape
    if T == 0:
        return np.empty((0,), dtype=np.int64)

    delta = np.full((T, K), -np.inf, dtype=np.float64)
    backptr = np.zeros((T, K), dtype=np.int64)
    delta[0] = log_probs[0]

    for t in range(1, T):
        # scores[i, j] = delta[t-1, i] - transition_cost[i, j]
        scores = delta[t - 1][:, None] - transition_cost
        best_prev = scores.argmax(axis=0)  # (K,)
        best_val = scores[best_prev, np.arange(K)]
        delta[t] = log_probs[t] + best_val
        backptr[t] = best_prev

    path = np.empty(T, dtype=np.int64)
    path[-1] = int(delta[-1].argmax())
    for t in range(T - 2, -1, -1):
        path[t] = int(backptr[t + 1, path[t + 1]])
    return path


def build_soft_position_priors(
    T: int,
    class_names: list[str],
    intro_classes: tuple[str, ...] = ("Intro",),
    outro_classes: tuple[str, ...] = ("Outro",),
    boundary_fraction: float = 0.22,
    penalty: float = 10.0,
    taper_fraction: float = 0.05,
    boost: float = 0.7,
) -> np.ndarray:
    """Hard-cliff priors with a linear taper and an in-zone boost.

    - Inside the allowed zone (first/last ``boundary_fraction`` of T) we give
      Intro/Outro a small *positive* log-prior (``+boost``) so the decoder
      actively prefers them over neutral classes near the edges.
    - Outside the allowed zone the log-prior is ``-penalty`` — same cliff
      behaviour as v1.
    - Between, we linearly interpolate over ``taper_fraction * T`` frames so
      the transition is smooth enough to avoid noisy switches at the cliff.
    """
    K = len(class_names)
    priors = np.zeros((T, K), dtype=np.float64)
    if T == 0:
        return priors

    boundary_frames = max(1, int(T * boundary_fraction))
    taper_frames = max(1, int(T * taper_fraction))
    ts = np.arange(T, dtype=np.float64)

    # Intro weights: +boost for t < boundary_frames - taper; taper down to
    # -penalty over taper_frames, and -penalty after.
    intro_w = np.full(T, -penalty, dtype=np.float64)
    hard_end = max(0, boundary_frames - taper_frames)
    intro_w[:hard_end] = boost
    taper_mask = (ts >= hard_end) & (ts < boundary_frames)
    if taper_mask.any():
        frac = (ts[taper_mask] - hard_end) / max(1, taper_frames)
        intro_w[taper_mask] = boost * (1 - frac) + (-penalty) * frac

    # Outro weights: mirror of intro, boost at the end
    outro_w = np.full(T, -penalty, dtype=np.float64)
    hard_start = min(T, T - boundary_frames + taper_frames)
    taper_start = max(0, hard_start - taper_frames)
    outro_w[hard_start:] = boost
    if taper_frames > 0 and hard_start > taper_start:
        outro_w[taper_start:hard_start] = np.linspace(
            -penalty, boost, hard_start - taper_start
        )

    for ci, name in enumerate(class_names):
        if name in intro_classes:
            priors[:, ci] += intro_w
        elif name in outro_classes:
            priors[:, ci] += outro_w
    return priors


def probability_novelty(probs: np.ndarray, smooth: int = 3) -> np.ndarray:
    """Novelty curve from the probability matrix.

    Large values of ``|p_t - p_{t-1}|`` indicate the model's posterior just
    shifted — a candidate boundary. Works without raw audio.
    """
    if probs.shape[0] < 2:
        return np.zeros(probs.shape[0], dtype=np.float64)
    diff = np.linalg.norm(np.diff(probs, axis=0), axis=1)
    nov = np.concatenate([[0.0], diff])
    if smooth > 1:
        kernel = np.ones(smooth, dtype=np.float64) / smooth
        nov = np.convolve(nov, kernel, mode="same")
    return nov


def audio_novelty_from_features(
    features: np.ndarray,
    frame_hop_seconds: float,
    target_hop_seconds: float,
    kernel_size_sec: float = 4.0,
) -> np.ndarray:
    """Foote-style novelty from a frame-level feature matrix.

    Given mel / MFCC features of shape ``(F, T_feat)`` sampled at
    ``frame_hop_seconds`` per frame, compute a self-similarity matrix and
    convolve its diagonal with a checkerboard kernel. Novelty peaks mark
    points where the signal statistics change sharply — candidates for true
    segment boundaries, even when the model's predictions are fuzzy.

    The returned curve is resampled to the prediction grid
    (``target_hop_seconds``) so it aligns with the decoded class path.
    """
    if features.size == 0 or features.shape[1] < 4:
        return np.zeros(0, dtype=np.float64)

    # L2-normalize feature columns for cosine-similarity
    X = features.astype(np.float64)
    norms = np.linalg.norm(X, axis=0, keepdims=True)
    norms = np.where(norms < 1e-9, 1.0, norms)
    Xn = X / norms
    ssm = Xn.T @ Xn  # (T_feat, T_feat)

    # Checkerboard kernel (size M x M with M frames)
    M = max(4, int(round(kernel_size_sec / frame_hop_seconds)))
    if M % 2 == 1:
        M += 1
    half = M // 2
    sigma = half / 2.0
    ts = np.arange(-half, half, dtype=np.float64)
    tau = np.exp(-0.5 * (ts / sigma) ** 2)
    gauss = np.outer(tau, tau)
    sign = np.ones((M, M), dtype=np.float64)
    sign[:half, half:] = -1.0
    sign[half:, :half] = -1.0
    kernel = gauss * sign

    T_feat = ssm.shape[0]
    nov = np.zeros(T_feat, dtype=np.float64)
    for t in range(half, T_feat - half):
        nov[t] = float((ssm[t - half : t + half, t - half : t + half] * kernel).sum())

    # Normalize to [0, 1]
    nmin, nmax = float(nov.min()), float(nov.max())
    if nmax > nmin:
        nov = (nov - nmin) / (nmax - nmin)

    # Resample to target_hop_seconds grid
    T_pred = max(1, int(round(T_feat * frame_hop_seconds / target_hop_seconds)))
    src_idx = (
        np.arange(T_pred) * (target_hop_seconds / frame_hop_seconds)
    ).astype(np.int64)
    src_idx = np.clip(src_idx, 0, T_feat - 1)
    return nov[src_idx]


def find_repeating_sections(
    features: np.ndarray,
    frame_hop_seconds: float,
    target_hop_seconds: float,
    min_section_sec: float = 8.0,
    similarity_threshold: float = 0.80,
    max_pairs: int = 6,
) -> list[tuple[int, int, int, int]]:
    """Find repeating regions in a track from its SSM.

    Returns a list of repeat pairs ``(s1, e1, s2, e2)`` in *prediction-grid*
    frame indices. Each pair represents two non-overlapping spans of the
    same length whose average cosine similarity exceeds the threshold.

    Uses a lag-matrix approach: pool the SSM into blocks of
    ``min_section_sec`` and look for high-similarity off-diagonal blocks.
    """
    if features.shape[1] < 4:
        return []

    X = features.astype(np.float64)
    norms = np.linalg.norm(X, axis=0, keepdims=True)
    norms = np.where(norms < 1e-9, 1.0, norms)
    Xn = X / norms

    T_feat = Xn.shape[1]
    block = max(2, int(round(min_section_sec / frame_hop_seconds)))
    n_blocks = T_feat // block
    if n_blocks < 2:
        return []

    # Mean feature per block (the "section signature")
    centroids = np.zeros((Xn.shape[0], n_blocks), dtype=np.float64)
    for i in range(n_blocks):
        centroids[:, i] = Xn[:, i * block : (i + 1) * block].mean(axis=1)
    c_norms = np.linalg.norm(centroids, axis=0, keepdims=True)
    c_norms = np.where(c_norms < 1e-9, 1.0, c_norms)
    centroids = centroids / c_norms
    block_ssm = centroids.T @ centroids

    # Collect upper-triangular pairs above threshold (skip near-diagonal)
    pairs: list[tuple[float, int, int]] = []
    for i in range(n_blocks):
        for j in range(i + 2, n_blocks):  # gap of at least 1 block
            if block_ssm[i, j] > similarity_threshold:
                pairs.append((float(block_ssm[i, j]), i, j))
    pairs.sort(key=lambda x: -x[0])

    # Keep top-K non-redundant pairs (no block used more than twice)
    used: dict[int, int] = {}
    ratio = target_hop_seconds / frame_hop_seconds
    out: list[tuple[int, int, int, int]] = []
    for _, i, j in pairs:
        if used.get(i, 0) >= 2 or used.get(j, 0) >= 2:
            continue
        used[i] = used.get(i, 0) + 1
        used[j] = used.get(j, 0) + 1
        s1 = int(round(i * block / ratio))
        e1 = int(round((i + 1) * block / ratio))
        s2 = int(round(j * block / ratio))
        e2 = int(round((j + 1) * block / ratio))
        out.append((s1, e1, s2, e2))
        if len(out) >= max_pairs:
            break
    return out


def enforce_repetition_consistency(
    preds: np.ndarray,
    probs: np.ndarray,
    repeat_pairs: list[tuple[int, int, int, int]],
    preferred_classes: tuple[int, ...] = (),
) -> np.ndarray:
    """Force repeating sections to share one label.

    For each pair ``(s1, e1, s2, e2)``:

    1. Compute per-class average posterior over both spans combined.
    2. Choose the label with the highest average posterior; break ties in
       favour of labels listed in ``preferred_classes``.
    3. Relabel both spans to that label.

    This corrects cases where the model labels one chorus repetition as
    "Chorus" and another as "Verse" even though the two sections are
    acoustically identical.
    """
    if not repeat_pairs:
        return preds
    out = preds.copy()
    T = len(out)
    for s1, e1, s2, e2 in repeat_pairs:
        s1, e1 = max(0, s1), min(T, e1)
        s2, e2 = max(0, s2), min(T, e2)
        if e1 <= s1 or e2 <= s2:
            continue
        mean1 = probs[s1:e1].mean(axis=0)
        mean2 = probs[s2:e2].mean(axis=0)
        joint = (mean1 + mean2) / 2.0
        order = np.argsort(-joint)
        # Prefer listed classes if they are within 10% of the top score
        top = float(joint[order[0]])
        best = int(order[0])
        for c in preferred_classes:
            if joint[c] >= 0.9 * top:
                best = c
                break
        out[s1:e1] = best
        out[s2:e2] = best
    return out


def snap_boundaries_to_novelty(
    preds: np.ndarray, novelty: np.ndarray, search_radius: int = 3,
) -> np.ndarray:
    """Shift each class change to the nearest local max of the novelty curve.

    For every index t where preds[t] != preds[t-1], look in [t-R, t+R] and pick
    the index with the highest novelty. All frames between the new boundary and
    the old are re-labeled to either side depending on which side the peak
    falls on.
    """
    if len(preds) < 2 or search_radius <= 0:
        return preds
    out = preds.copy()
    T = len(preds)
    for t in range(1, T):
        if out[t] == out[t - 1]:
            continue
        lo = max(1, t - search_radius)
        hi = min(T, t + search_radius + 1)
        window = novelty[lo:hi]
        if len(window) == 0:
            continue
        # Choose index of maximum novelty in window
        best = int(np.argmax(window)) + lo
        if best == t:
            continue
        # Reassign labels between min(t, best) and max(t, best)
        if best < t:
            # Boundary moves earlier → frames in [best, t) get the later label
            new_label = out[t]
            out[best:t] = new_label
        else:
            # Boundary moves later → frames in [t, best) get the earlier label
            new_label = out[t - 1]
            out[t:best] = new_label
    return out


def enforce_class_min_duration(
    preds: np.ndarray,
    probs: np.ndarray,
    min_frames_per_class: dict[int, int],
) -> np.ndarray:
    """Iteratively absorb segments shorter than class-specific minimum.

    A short segment is replaced with the more confident of its two neighbors
    (averaged probability over the short segment's frames for that class).
    """
    preds = preds.copy()
    changed = True
    while changed:
        changed = False
        T = len(preds)
        # Find runs
        runs: list[tuple[int, int, int]] = []
        i = 0
        while i < T:
            j = i
            while j + 1 < T and preds[j + 1] == preds[i]:
                j += 1
            runs.append((i, j + 1, int(preds[i])))
            i = j + 1

        for idx, (s, e, c) in enumerate(runs):
            min_frames = min_frames_per_class.get(c, 4)
            if e - s >= min_frames:
                continue
            left = runs[idx - 1] if idx > 0 else None
            right = runs[idx + 1] if idx + 1 < len(runs) else None
            # Choose absorbing neighbor
            best_label = None
            best_score = -np.inf
            for neigh in (left, right):
                if neigh is None:
                    continue
                cand_label = neigh[2]
                score = float(probs[s:e, cand_label].mean())
                if score > best_score:
                    best_score = score
                    best_label = cand_label
            if best_label is None:
                continue
            preds[s:e] = best_label
            changed = True
            break  # restart scan since runs shifted
    return preds


def correct_window_latency(
    preds: np.ndarray, shift_frames: int,
) -> np.ndarray:
    """Shift predictions left by ``shift_frames`` to undo window-center bias.

    Window features assign the label of the *dominant class in a 10s window
    starting at t*, which tends to mis-locate an onset ~window/2 late.
    """
    if shift_frames <= 0 or len(preds) == 0:
        return preds
    shift = min(shift_frames, len(preds) - 1)
    # Frame t ← frame (t + shift) [clipped]
    shifted = np.empty_like(preds)
    T = len(preds)
    for t in range(T):
        src = min(T - 1, t + shift)
        shifted[t] = preds[src]
    # Tail keeps the last original label (avoid extending "Outro" backwards)
    # by copying the tail from the original.
    return shifted


def decode_segment_head_v2(
    all_probs: np.ndarray,
    class_names: list[str],
    hop_seconds: float = 1.0,
    *,
    temperature: float = 1.0,
    base_transition_penalty: float = 1.2,
    use_position_priors: bool = True,
    position_penalty: float = 10.0,
    position_boost: float = 0.7,
    boundary_fraction: float = 0.18,
    apply_latency_shift: bool = False,
    window_seconds: float = 10.0,
    novelty_snap_radius_sec: float = 2.0,
    per_class_min_duration_sec: dict[str, float] | None = None,
    audio_features: np.ndarray | None = None,
    feature_hop_seconds: float | None = None,
    audio_novelty_weight: float = 0.6,
    enable_repetition: bool = True,
    repetition_min_section_sec: float = 8.0,
    repetition_similarity_threshold: float = 0.82,
) -> list[Segment]:
    """Improved segmentation decoder.

    Stages:
        1. Temperature-smooth probabilities.
        2. Build structural (K,K) transition-cost matrix.
        3. Add hard-cliff-with-taper position priors (with boost inside zone).
        4. Viterbi decode.
        5. Snap each predicted boundary to nearest novelty peak. When raw
           audio features (``audio_features``) are provided we blend the
           probability-novelty curve with a Foote-style audio-novelty curve —
           the audio curve catches real acoustic boundaries the model missed.
        6. Enforce per-class minimum-duration via confidence-weighted absorb.
        7. Enforce repetition consistency: if two acoustically identical
           spans were labeled differently, relabel them to a shared class
           (usually Chorus).
        8. Merge runs into Segment objects.
    """
    T, K = all_probs.shape
    if T == 0:
        return []

    # 1. Temperature
    if temperature != 1.0:
        log_p = np.log(np.maximum(all_probs, 1e-9)) / temperature
        probs = np.exp(log_p - log_p.max(axis=1, keepdims=True))
        probs = probs / probs.sum(axis=1, keepdims=True)
    else:
        probs = all_probs
    log_probs = np.log(np.maximum(probs, 1e-9))

    # 2. Transition cost matrix
    trans_cost = build_transition_cost_matrix(
        class_names, base_penalty=base_transition_penalty,
    )

    # 3. Position priors
    if use_position_priors:
        priors = build_soft_position_priors(
            T, class_names,
            penalty=position_penalty,
            boost=position_boost,
            boundary_fraction=boundary_fraction,
        )
        log_probs = log_probs + priors

    # 4. Viterbi
    preds = viterbi_decode_matrix(log_probs, trans_cost)

    # 5. Optional window-latency correction
    if apply_latency_shift:
        latency_frames = max(
            0, int(round((window_seconds - hop_seconds) / 2 / hop_seconds))
        )
        preds = correct_window_latency(preds, latency_frames)

    # 6. Novelty snapping (optionally blend audio novelty)
    if novelty_snap_radius_sec > 0:
        prob_nov = probability_novelty(probs, smooth=3)
        novelty = prob_nov
        if (
            audio_features is not None
            and feature_hop_seconds is not None
            and audio_novelty_weight > 0
        ):
            audio_nov = audio_novelty_from_features(
                audio_features,
                frame_hop_seconds=feature_hop_seconds,
                target_hop_seconds=hop_seconds,
            )
            # Align lengths (resample returns ~ right length but can differ by 1)
            L = min(len(novelty), len(audio_nov))
            if L > 0:
                pn = prob_nov[:L]
                an = audio_nov[:L]
                # Normalize each to [0,1] for fair blending
                if pn.max() > pn.min():
                    pn = (pn - pn.min()) / (pn.max() - pn.min())
                novelty = (
                    (1 - audio_novelty_weight) * pn
                    + audio_novelty_weight * an
                )
                # Pad back to predictions length
                if len(novelty) < len(preds):
                    novelty = np.concatenate([
                        novelty,
                        np.zeros(len(preds) - len(novelty)),
                    ])
        snap_r = max(0, int(round(novelty_snap_radius_sec / hop_seconds)))
        preds = snap_boundaries_to_novelty(preds, novelty, search_radius=snap_r)

    # 7. Per-class min duration
    if per_class_min_duration_sec is None:
        per_class_min_duration_sec = {
            "Intro": 3.0,
            "Verse": 6.0,
            "Bridge": 3.0,
            "Chorus": 6.0,
            "Instrumental": 6.0,
            "Outro": 3.0,
        }
    min_frames_per_class = {
        class_names.index(name): max(1, int(round(sec / hop_seconds)))
        for name, sec in per_class_min_duration_sec.items()
        if name in class_names
    }
    preds = enforce_class_min_duration(preds, probs, min_frames_per_class)

    # 7b. Repetition consistency (optional, needs audio features)
    if (
        enable_repetition
        and audio_features is not None
        and feature_hop_seconds is not None
    ):
        pairs = find_repeating_sections(
            audio_features,
            frame_hop_seconds=feature_hop_seconds,
            target_hop_seconds=hop_seconds,
            min_section_sec=repetition_min_section_sec,
            similarity_threshold=repetition_similarity_threshold,
        )
        preferred: tuple[int, ...] = ()
        if "Chorus" in class_names:
            preferred = (class_names.index("Chorus"),)
        preds = enforce_repetition_consistency(
            preds, probs, pairs, preferred_classes=preferred,
        )
        # Re-apply min-duration after repetition relabel
        preds = enforce_class_min_duration(preds, probs, min_frames_per_class)

    # 8. Build segments from final predictions
    max_probs = all_probs.max(axis=1)
    segments: list[Segment] = []
    i = 0
    T_final = len(preds)
    while i < T_final:
        j = i
        while j + 1 < T_final and preds[j + 1] == preds[i]:
            j += 1
        label = class_names[int(preds[i])]
        conf = float(max_probs[i : j + 1].mean())
        segments.append(
            Segment(
                start=i * hop_seconds,
                end=(j + 1) * hop_seconds,
                label=label,
                confidence=conf,
            )
        )
        i = j + 1
    return segments
