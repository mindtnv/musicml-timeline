"""Key-moment detection from arousal/valence regression curves.

Technical-analysis-style annotation of emotional curves: finds peaks,
drops, climaxes, tension points, and divergences — the "interesting
moments" of a track that a human would naturally point at.

All detection is pure signal processing (scipy-free — just numpy),
designed to run in <1ms on typical track lengths (200–400 frames).
"""

from __future__ import annotations

import numpy as np


# ── Moment types ─────────────────────────────────────────────────────

MOMENT_TYPES = {
    "peak_energy": {
        "label_ru": "Пик энергии",
        "label_en": "Peak energy",
        "emoji": "🔥",
        "color": "#ef4444",
    },
    "climax": {
        "label_ru": "Кульминация",
        "label_en": "Emotional climax",
        "emoji": "⚡",
        "color": "#f59e0b",
    },
    "drop": {
        "label_ru": "Дроп",
        "label_en": "Energy drop",
        "emoji": "💧",
        "color": "#3b82f6",
    },
    "tension": {
        "label_ru": "Напряжение",
        "label_en": "Tension",
        "emoji": "😤",
        "color": "#a855f7",
    },
    "release": {
        "label_ru": "Разрядка",
        "label_en": "Release",
        "emoji": "😌",
        "color": "#22c55e",
    },
    "divergence": {
        "label_ru": "Дивергенция",
        "label_en": "Divergence",
        "emoji": "🔀",
        "color": "#ec4899",
    },
    "most_dynamic": {
        "label_ru": "Самый динамичный",
        "label_en": "Most dynamic",
        "emoji": "🎢",
        "color": "#f97316",
    },
}


# ── Helpers ───────────────────────────────────────────────────────────

def _smooth(x: np.ndarray, w: int = 7) -> np.ndarray:
    if len(x) < w:
        return x.copy()
    k = np.ones(w) / w
    return np.convolve(x, k, mode="same")


def _gradient(x: np.ndarray, w: int = 5) -> np.ndarray:
    """Central-difference gradient, smoothed."""
    if len(x) < 3:
        return np.zeros_like(x)
    g = np.gradient(x)
    return _smooth(g, w)


def _local_maxima(x: np.ndarray, min_dist: int = 10) -> list[int]:
    """Simple peak-finder: local maxima with minimum distance between peaks."""
    peaks: list[int] = []
    for i in range(1, len(x) - 1):
        if x[i] > x[i - 1] and x[i] > x[i + 1]:
            if not peaks or i - peaks[-1] >= min_dist:
                peaks.append(i)
    return peaks


def _local_minima(x: np.ndarray, min_dist: int = 10) -> list[int]:
    return _local_maxima(-x, min_dist)


def _normalise(x: np.ndarray) -> np.ndarray:
    lo, hi = float(x.min()), float(x.max())
    if hi - lo < 1e-6:
        return np.full_like(x, 0.5)
    return (x - lo) / (hi - lo)


# ── Main detector ─────────────────────────────────────────────────────

def detect_moments(
    arousal: list[float] | np.ndarray,
    valence: list[float] | np.ndarray,
    hop_seconds: float = 1.0,
    *,
    min_gap_sec: float = 15.0,
    max_moments: int = 8,
) -> list[dict]:
    """Detect key emotional moments in a track.

    Args:
        arousal: per-frame arousal regression values.
        valence: per-frame valence regression values.
        hop_seconds: seconds between frames.
        min_gap_sec: minimum distance between moments (avoids clutter).
        max_moments: hard cap on total moments returned.

    Returns:
        List of moment dicts sorted by time, each containing:
        ``type``, ``time_sec``, ``frame``, ``label_ru``, ``label_en``,
        ``emoji``, ``color``, ``description_ru``, ``arousal``, ``valence``.
    """
    ar = np.asarray(arousal, dtype=np.float64)
    va = np.asarray(valence, dtype=np.float64)
    n = min(len(ar), len(va))
    if n < 10:
        return []

    ar = ar[:n]
    va = va[:n]

    # Smooth for stable detection
    ar_s = _smooth(ar, max(3, n // 30))
    va_s = _smooth(va, max(3, n // 30))

    # Normalised versions for threshold comparisons
    ar_n = _normalise(ar_s)
    va_n = _normalise(va_s)

    # Combined energy
    energy = (ar_n + va_n) / 2.0
    energy_s = _smooth(energy, max(3, n // 20))

    # Gradient of arousal (for drops)
    ar_grad = _gradient(ar_s, max(3, n // 25))

    min_gap = max(1, int(min_gap_sec / hop_seconds))

    candidates: list[dict] = []

    def _add(typ: str, frame: int, score: float, desc: str):
        info = MOMENT_TYPES[typ]
        candidates.append({
            "type": typ,
            "frame": int(frame),
            "time_sec": round(float(frame * hop_seconds), 1),
            "score": float(score),
            "label_ru": info["label_ru"],
            "label_en": info["label_en"],
            "emoji": info["emoji"],
            "color": info["color"],
            "description_ru": desc,
            "arousal": round(float(ar_s[frame]), 4),
            "valence": round(float(va_s[frame]), 4),
        })

    # Edge zone: first/last 8% are often intro silence / outro fade —
    # moments there are expected and uninteresting.
    edge_lo = int(0.08 * n)
    edge_hi = int(0.92 * n)

    # ── 1. Peak energy: global max of arousal ─────────────────────
    peak_frame = int(np.argmax(ar_s))
    if edge_lo < peak_frame < edge_hi:
        _add(
            "peak_energy", peak_frame, float(ar_n[peak_frame]),
            "Точка максимальной энергии (arousal) за весь трек",
        )

    # ── 2. Climax: max of combined energy (arousal + valence both high)
    climax_frame = int(np.argmax(energy_s))
    if abs(climax_frame - peak_frame) > min_gap // 2:
        if edge_lo < climax_frame < edge_hi:
            _add(
                "climax", climax_frame, float(energy_s[climax_frame]),
                "Пик общей эмоциональной энергии — arousal и valence оба максимальны",
            )

    # ── 3. Drops: steepest negative gradient in arousal ───────────
    #    Skip drops in the edge zones (intro silence / outro fade are boring).
    drop_candidates = _local_minima(ar_grad, min_dist=min_gap)
    drop_candidates = [dc for dc in drop_candidates if edge_lo < dc < edge_hi]
    for dc in sorted(drop_candidates, key=lambda i: ar_grad[i])[:2]:
        if ar_grad[dc] < -np.std(ar_grad) * 0.8:
            _add(
                "drop", dc, float(-ar_grad[dc]),
                "Точка самого резкого падения энергии (максимальный отрицательный градиент)",
            )

    # ── 4. Tension: high arousal + low valence ────────────────────
    tension_score = ar_n - va_n
    tension_peaks = [p for p in _local_maxima(tension_score, min_dist=min_gap)
                     if edge_lo < p < edge_hi]
    for tp in sorted(tension_peaks, key=lambda i: -tension_score[i])[:1]:
        if tension_score[tp] > 0.35:
            _add(
                "tension", tp, float(tension_score[tp]),
                "Пик разрыва: энергия высокая, а настроение мрачное — максимальное напряжение",
            )

    # ── 5. Release: low arousal + high valence (opposite of tension)
    release_score = va_n - ar_n
    release_peaks = [p for p in _local_maxima(release_score, min_dist=min_gap)
                     if edge_lo < p < edge_hi]
    for rp in sorted(release_peaks, key=lambda i: -release_score[i])[:1]:
        if release_score[rp] > 0.30:
            _add(
                "release", rp, float(release_score[rp]),
                "Пик разрядки: энергия низкая, настроение светлое — момент покоя",
            )

    # ── 6. Divergence: arousal and valence moving in opposite dirs ─
    ar_g = _gradient(ar_n, max(3, n // 20))
    va_g = _gradient(va_n, max(3, n // 20))
    div_score = np.abs(ar_g - va_g)
    div_s = _smooth(div_score, max(3, n // 15))
    div_peaks = [p for p in _local_maxima(div_s, min_dist=min_gap)
                 if edge_lo < p < edge_hi]
    for dp in sorted(div_peaks, key=lambda i: -div_s[i])[:1]:
        if div_s[dp] > np.mean(div_s) + np.std(div_s) * 1.2:
            going = "энергия растёт, настроение падает" if ar_g[dp] > va_g[dp] \
                else "настроение растёт, энергия падает"
            _add(
                "divergence", dp, float(div_s[dp]),
                f"Точка расхождения: {going}",
            )

    # ── 7. Most dynamic section: window with max energy variance ──
    win = max(min_gap, int(20 / hop_seconds))
    if n > win * 2:
        variances = np.array([
            energy_s[i:i + win].var() for i in range(n - win)
        ])
        best_start = int(np.argmax(variances))
        mid = best_start + win // 2
        dur_s = round(win * hop_seconds)
        _add(
            "most_dynamic", mid, float(variances[best_start]),
            f"Центр {dur_s}-сек отрезка с максимальной амплитудой эмоций",
        )

    # ── Deduplicate: enforce min_gap between final moments ────────
    candidates.sort(key=lambda m: -m["score"])
    used_frames: list[int] = []
    final: list[dict] = []
    for m in candidates:
        if any(abs(m["frame"] - uf) < min_gap for uf in used_frames):
            continue
        used_frames.append(m["frame"])
        # Remove internal score field
        out = {k: v for k, v in m.items() if k != "score"}
        final.append(out)
        if len(final) >= max_moments:
            break

    final.sort(key=lambda m: m["time_sec"])
    return final
