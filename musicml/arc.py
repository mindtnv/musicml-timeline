"""Emotional arc classification from arousal/valence regression curves.

Classifies the track's emotional trajectory into one of 6 archetypes
inspired by Kurt Vonnegut's "shapes of stories". The classification is
purely geometric — no ML, just curve shape analysis.

Archetypes
----------
1. **rise**       (Rags to Riches)  — steady climb from low to high
2. **fall**       (Tragedy / Icarus) — starts high, descends
3. **hole**       (Man in a Hole)   — drops then recovers
4. **peak**       (Icarus peak)     — rises then drops back
5. **wave**       (Roller-coaster)  — 2+ significant oscillations
6. **steady**     (Plateau)         — stays roughly flat throughout

The algorithm:
  1. Smooth the combined (arousal + valence) / 2 signal.
  2. Normalise to [0, 1].
  3. Split into 4 quarter-segments, compute mean per quarter.
  4. Look at the "shape" of the 4 means → classify.

Returns a dict with:
  - archetype: str        — one of the 6 keys
  - label_ru: str         — Russian display name
  - label_en: str         — English display name
  - emoji: str            — single emoji
  - description_ru: str   — one-sentence explanation
  - curve: list[float]    — the 4 quarter-means (for mini-sparkline)
"""

from __future__ import annotations

import numpy as np


# ── Archetype definitions ────────────────────────────────────────────

ARCHETYPES: dict[str, dict[str, str]] = {
    "rise": {
        "label_ru": "Подъём",
        "label_en": "Rags to Riches",
        "emoji": "📈",
        "description_ru": (
            "Эмоциональная энергия плавно нарастает от начала к концу "
            "— трек набирает обороты."
        ),
    },
    "fall": {
        "label_ru": "Спад",
        "label_en": "Tragedy",
        "emoji": "📉",
        "description_ru": (
            "Трек начинается на пике и постепенно затухает "
            "— нисходящая арка."
        ),
    },
    "hole": {
        "label_ru": "Яма",
        "label_en": "Man in a Hole",
        "emoji": "🕳️",
        "description_ru": (
            "Энергия проседает в середине, но восстанавливается к концу "
            "— классическая U-образная арка."
        ),
    },
    "peak": {
        "label_ru": "Горка",
        "label_en": "Icarus",
        "emoji": "⛰️",
        "description_ru": (
            "Трек взлетает к середине и опускается к концу "
            "— перевёрнутая U."
        ),
    },
    "wave": {
        "label_ru": "Волна",
        "label_en": "Roller-coaster",
        "emoji": "🌊",
        "description_ru": (
            "Энергия колеблется волнами — несколько подъёмов и спадов."
        ),
    },
    "steady": {
        "label_ru": "Плато",
        "label_en": "Plateau",
        "emoji": "➡️",
        "description_ru": (
            "Эмоциональная энергия остаётся примерно на одном уровне "
            "на протяжении всего трека."
        ),
    },
}


# ── Core classifier ──────────────────────────────────────────────────

def _smooth(signal: np.ndarray, window: int = 15) -> np.ndarray:
    """Simple moving-average smoothing."""
    if len(signal) < window:
        return signal
    kernel = np.ones(window) / window
    return np.convolve(signal, kernel, mode="same")


def _quarter_means(signal: np.ndarray) -> list[float]:
    """Split signal into 4 equal quarters, return mean of each."""
    n = len(signal)
    if n < 4:
        v = float(signal.mean()) if n > 0 else 0.5
        return [v, v, v, v]
    q = n // 4
    return [
        float(signal[:q].mean()),
        float(signal[q : 2 * q].mean()),
        float(signal[2 * q : 3 * q].mean()),
        float(signal[3 * q :].mean()),
    ]


def _count_zero_crossings(signal: np.ndarray) -> int:
    """Count zero-crossings of the de-meaned signal (proxy for oscillations)."""
    centered = signal - signal.mean()
    return int(np.sum(np.diff(np.sign(centered)) != 0))


def classify_arc(
    arousal: list[float] | np.ndarray,
    valence: list[float] | np.ndarray,
) -> dict:
    """Classify the emotional arc of a track.

    Args:
        arousal: per-frame arousal regression values (any scale).
        valence: per-frame valence regression values (any scale).

    Returns:
        Dict with archetype key, labels, emoji, description, and the
        4-element ``curve`` used for classification (normalised 0–1).
    """
    ar = np.asarray(arousal, dtype=np.float64)
    va = np.asarray(valence, dtype=np.float64)

    # Combine arousal + valence into a single "emotional energy" signal.
    # Equal weighting — both contribute to the perceived arc.
    if len(ar) == 0 and len(va) == 0:
        return _make_result("steady", [0.5, 0.5, 0.5, 0.5])

    # Align lengths (they should match, but be safe)
    min_len = min(len(ar), len(va)) if len(ar) > 0 and len(va) > 0 else max(len(ar), len(va))
    if len(ar) > 0 and len(va) > 0:
        combined = (ar[:min_len] + va[:min_len]) / 2.0
    elif len(ar) > 0:
        combined = ar
    else:
        combined = va

    # Smooth to remove frame-level noise
    smoothed = _smooth(combined, window=max(5, len(combined) // 15))

    # Normalise to [0, 1]
    lo, hi = float(smoothed.min()), float(smoothed.max())
    if hi - lo > 1e-6:
        normed = (smoothed - lo) / (hi - lo)
    else:
        return _make_result("steady", [0.5, 0.5, 0.5, 0.5])

    qm = _quarter_means(normed)

    # ── Decision tree ──
    # Thresholds tuned by hand on ~20 Harmonix + DEAM tracks.
    span = max(qm) - min(qm)

    # Flat?
    if span < 0.12:
        return _make_result("steady", qm)

    # Oscillating?  Count zero-crossings on the smoothed de-meaned signal.
    zc = _count_zero_crossings(_smooth(normed - normed.mean(), 25))
    if zc >= 6 and span > 0.15:
        return _make_result("wave", qm)

    q1, q2, q3, q4 = qm

    # Rise: monotone upward trend
    if q4 - q1 > 0.18 and q4 >= q3 >= q2:
        return _make_result("rise", qm)

    # Fall: monotone downward trend
    if q1 - q4 > 0.18 and q1 >= q2 >= q3:
        return _make_result("fall", qm)

    # Hole (U-shape): middle lower than edges
    mid = (q2 + q3) / 2
    edges = (q1 + q4) / 2
    if edges - mid > 0.12 and q1 > mid and q4 > mid:
        return _make_result("hole", qm)

    # Peak (inverted U): middle higher than edges
    if mid - edges > 0.12 and mid > q1 and mid > q4:
        return _make_result("peak", qm)

    # Fallback: if q4 > q1 → rise, else fall
    if q4 > q1 + 0.05:
        return _make_result("rise", qm)
    if q1 > q4 + 0.05:
        return _make_result("fall", qm)

    return _make_result("steady", qm)


def _make_result(archetype: str, curve: list[float]) -> dict:
    info = ARCHETYPES[archetype]
    return {
        "archetype": archetype,
        "label_ru": info["label_ru"],
        "label_en": info["label_en"],
        "emoji": info["emoji"],
        "description_ru": info["description_ru"],
        "curve": [round(v, 3) for v in curve],
    }
