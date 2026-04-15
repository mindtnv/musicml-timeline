"""Tests for the v2 segmentation decoder and its building blocks."""

from __future__ import annotations

import numpy as np

CLASS_NAMES = ["Intro", "Verse", "Bridge", "Chorus", "Instrumental", "Outro"]


def _make_probs(labels: list[int], n_classes: int = 6, noise: float = 0.1):
    """Synthesize a (T, K) probs matrix where frame t peaks on labels[t]."""
    T = len(labels)
    rng = np.random.default_rng(0)
    probs = rng.uniform(0.02, noise, size=(T, n_classes))
    for t, c in enumerate(labels):
        probs[t, c] += 1.0
    probs = probs / probs.sum(axis=1, keepdims=True)
    return probs


def test_import_v2():
    from musicml.postprocess import (
        build_soft_position_priors,
        build_transition_cost_matrix,
        decode_segment_head_v2,
        enforce_class_min_duration,
        probability_novelty,
        snap_boundaries_to_novelty,
        viterbi_decode_matrix,
    )

    assert all(callable(f) for f in [
        build_soft_position_priors,
        build_transition_cost_matrix,
        decode_segment_head_v2,
        enforce_class_min_duration,
        probability_novelty,
        snap_boundaries_to_novelty,
        viterbi_decode_matrix,
    ])


def test_transition_matrix_self_loops_zero():
    from musicml.postprocess import build_transition_cost_matrix

    m = build_transition_cost_matrix(CLASS_NAMES, base_penalty=1.5)
    assert m.shape == (6, 6)
    # Self-loops are always 0 — staying in the same class is free
    for i in range(6):
        assert m[i, i] == 0.0


def test_transition_matrix_intro_absorbing():
    """Once past the intro, the matrix should heavily penalize re-entering it."""
    from musicml.postprocess import build_transition_cost_matrix

    m = build_transition_cost_matrix(CLASS_NAMES)
    verse_to_intro = m[CLASS_NAMES.index("Verse"), CLASS_NAMES.index("Intro")]
    intro_to_verse = m[CLASS_NAMES.index("Intro"), CLASS_NAMES.index("Verse")]
    assert verse_to_intro > 3.0
    assert intro_to_verse < 1.0


def test_soft_position_priors_shapes():
    from musicml.postprocess import build_soft_position_priors

    pri = build_soft_position_priors(T=100, class_names=CLASS_NAMES)
    assert pri.shape == (100, 6)
    intro_idx = CLASS_NAMES.index("Intro")
    outro_idx = CLASS_NAMES.index("Outro")
    # Intro prior is positive at the start and negative at the end
    assert pri[0, intro_idx] > 0
    assert pri[-1, intro_idx] < 0
    # Outro prior is negative at start, positive at end
    assert pri[0, outro_idx] < 0
    assert pri[-1, outro_idx] > 0
    # Neutral classes untouched
    assert np.allclose(pri[:, CLASS_NAMES.index("Verse")], 0.0)


def test_viterbi_matrix_stable_class():
    """Constant-label probs -> Viterbi picks that class everywhere."""
    from musicml.postprocess import (
        build_transition_cost_matrix,
        viterbi_decode_matrix,
    )

    T = 50
    probs = np.full((T, 6), 0.02)
    probs[:, 3] = 0.9  # Chorus dominant
    probs = probs / probs.sum(axis=1, keepdims=True)
    log_p = np.log(probs)
    m = build_transition_cost_matrix(CLASS_NAMES)
    path = viterbi_decode_matrix(log_p, m)
    assert len(path) == T
    assert (path == 3).all()


def test_viterbi_matrix_switch_penalized():
    """Low transition penalty -> allow a real class change when evidence strong."""
    from musicml.postprocess import (
        build_transition_cost_matrix,
        viterbi_decode_matrix,
    )

    T = 40
    probs = np.full((T, 6), 0.02)
    probs[:20, 1] = 0.9  # Verse first half
    probs[20:, 3] = 0.9  # Chorus second half
    probs = probs / probs.sum(axis=1, keepdims=True)
    log_p = np.log(probs)
    # Use a modest base penalty so the structural matrix does its job
    m = build_transition_cost_matrix(CLASS_NAMES, base_penalty=0.5)
    path = viterbi_decode_matrix(log_p, m)
    assert path[0] == 1
    assert path[-1] == 3
    # Exactly one change around t=20
    changes = np.where(np.diff(path) != 0)[0]
    assert len(changes) == 1
    assert 18 <= changes[0] <= 21


def test_enforce_class_min_duration_absorbs_short_segment():
    from musicml.postprocess import enforce_class_min_duration

    # Verse-Chorus-Verse where the middle Chorus is too short
    preds = np.array([1] * 20 + [3] * 2 + [1] * 20, dtype=np.int64)
    probs = np.full((len(preds), 6), 0.1)
    probs[:, 1] = 0.8  # Verse dominant everywhere
    probs[20:22, 3] = 0.85  # Chorus slightly stronger briefly
    # Require Chorus >= 6 frames
    min_frames = {3: 6, 1: 1}
    out = enforce_class_min_duration(preds, probs, min_frames)
    # Middle run should be absorbed by neighbours
    assert (out == 1).all()


def test_snap_boundaries_to_novelty_moves_to_peak():
    from musicml.postprocess import snap_boundaries_to_novelty

    # Predicted boundary at frame 10, but novelty peak is at frame 12.
    preds = np.array([1] * 10 + [3] * 10, dtype=np.int64)
    novelty = np.zeros(len(preds))
    novelty[12] = 1.0
    out = snap_boundaries_to_novelty(preds, novelty, search_radius=3)
    # Frames 10, 11 should now be re-labeled to 1 (earlier label)
    # because the boundary has moved to 12
    assert out[10] == 1
    assert out[11] == 1
    assert out[12] == 3


def test_decode_v2_end_to_end_builds_sane_segments():
    """Run v2 on a synthetic Intro→Verse→Chorus→Outro track."""
    from musicml.postprocess import decode_segment_head_v2

    labels = [0] * 10 + [1] * 30 + [3] * 30 + [1] * 10 + [3] * 20 + [5] * 10
    probs = _make_probs(labels)

    segs = decode_segment_head_v2(
        probs, class_names=CLASS_NAMES, hop_seconds=1.0,
        window_seconds=10.0,
    )
    assert len(segs) >= 2
    # First segment should be Intro, last should be Outro
    assert segs[0].label == "Intro"
    assert segs[-1].label == "Outro"
    # Segments are non-overlapping and in order
    for a, b in zip(segs, segs[1:]):
        assert a.end == b.start
    # Total duration matches
    assert segs[-1].end == len(labels)


def test_decode_v2_empty_input():
    from musicml.postprocess import decode_segment_head_v2

    empty = np.zeros((0, 6))
    assert decode_segment_head_v2(empty, CLASS_NAMES) == []


def test_probability_novelty_basics():
    from musicml.postprocess import probability_novelty

    probs = np.full((30, 6), 1 / 6)
    # Sharp change at frame 15: jump from uniform to peaked-on-class-3
    probs[15:, :] = 0.02
    probs[15:, 3] = 0.9
    probs = probs / probs.sum(axis=1, keepdims=True)
    nov = probability_novelty(probs, smooth=1)
    # Novelty should peak near frame 15
    peak = int(np.argmax(nov))
    assert 14 <= peak <= 16


def test_audio_novelty_detects_sharp_change():
    from musicml.postprocess import audio_novelty_from_features

    # Synthetic feature sequence: 2 distinct "timbres" with a sharp switch
    rng = np.random.default_rng(0)
    T = 200
    F = 16
    a = rng.normal(1.0, 0.05, size=(F, T // 2))
    b = rng.normal(-1.0, 0.05, size=(F, T // 2))
    feats = np.concatenate([a, b], axis=1)

    nov = audio_novelty_from_features(
        feats,
        frame_hop_seconds=0.02,  # 50 Hz feature rate
        target_hop_seconds=0.02,
        kernel_size_sec=1.0,
    )
    assert len(nov) >= T - 2
    # Peak should be very close to the switching point (T // 2)
    peak = int(np.argmax(nov))
    assert abs(peak - T // 2) < 10


def test_repetition_finds_similar_spans():
    from musicml.postprocess import find_repeating_sections

    # Build features: A | B | A | B, each segment 20 frames, feature dim 8
    rng = np.random.default_rng(0)
    F = 8
    A = rng.normal(1.0, 0.01, size=(F, 20))
    B = rng.normal(-1.0, 0.01, size=(F, 20))
    feats = np.concatenate([A, B, A, B], axis=1)

    pairs = find_repeating_sections(
        feats,
        frame_hop_seconds=0.5,
        target_hop_seconds=0.5,
        min_section_sec=10.0,  # => 20 frames
        similarity_threshold=0.8,
    )
    # We expect at least one A-A or B-B pair
    assert len(pairs) >= 1


def test_enforce_repetition_consistency_aligns_labels():
    from musicml.postprocess import enforce_repetition_consistency

    # Predictions: first span labeled Verse (1), second span labeled Chorus (3)
    preds = np.array([1] * 20 + [0] * 20 + [3] * 20, dtype=np.int64)
    # Probs: both the 0..20 and 40..60 spans slightly prefer Chorus on average
    probs = np.full((60, 6), 0.05)
    probs[:, 3] = 0.55  # Chorus slightly preferred everywhere
    probs[:, 1] = 0.20  # Verse
    probs = probs / probs.sum(axis=1, keepdims=True)
    # Pair says frames [0, 20) repeats at [40, 60)
    out = enforce_repetition_consistency(
        preds, probs, [(0, 20, 40, 60)], preferred_classes=(3,),
    )
    # Both spans should now carry the same label (Chorus)
    assert (out[:20] == out[40:60]).all()
    # And the preferred label should have won
    assert out[0] == 3
