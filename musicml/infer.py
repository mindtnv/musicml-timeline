"""Inference: audio -> timeline JSON + visualization.

Provides functions to load a trained model, extract features from audio,
run batched inference, and build a structured timeline with visualization.
"""

from __future__ import annotations

from dataclasses import asdict
from pathlib import Path
from typing import Any

import numpy as np


def load_model(
    ckpt_path: str | Path,
    model_cfg: dict[str, Any],
    device: str = "cpu",
):
    """Load a trained CNNMultiTask from checkpoint.

    Args:
        ckpt_path: Path to checkpoint (.pt file with model_state_dict).
        model_cfg: Model kwargs (in_channels, n_segment_classes, etc.).
        device: Target device.

    Returns:
        Model in eval mode on the specified device.
    """
    import torch

    from musicml.models import CNNMultiTask

    model = CNNMultiTask(**model_cfg)
    checkpoint = torch.load(ckpt_path, map_location=device, weights_only=False)
    model.load_state_dict(checkpoint["model_state_dict"])
    model.to(device)
    model.eval()
    return model


def extract_features(
    audio_path: str | Path,
    cfg: dict[str, Any],
) -> tuple[np.ndarray, float]:
    """Extract windowed features from an audio file.

    Args:
        audio_path: Path to audio file.
        cfg: Full config dict (needs audio, features, windowing sections).

    Returns:
        (windows, duration_sec) where windows has shape (N, C, F, W).
    """
    from musicml.features import compute_features, load_audio, window_features

    audio_cfg = cfg["audio"]
    feat_cfg = cfg["features"]
    win_cfg = cfg["windowing"]

    y, sr = load_audio(str(audio_path), sr=audio_cfg["sr"], mono=audio_cfg["mono"])
    duration_sec = len(y) / sr

    mode = feat_cfg.get("mode", "log_mel")
    feats = compute_features(
        y,
        sr=sr,
        mode=mode,
        n_mels=feat_cfg["n_mels"],
        n_fft=feat_cfg["n_fft"],
        hop_length=feat_cfg["hop_length"],
        fmin=feat_cfg["fmin"],
        fmax=feat_cfg.get("fmax"),
    )

    windows = window_features(
        feats,
        sr=sr,
        hop_length=feat_cfg["hop_length"],
        window_seconds=win_cfg["window_seconds"],
        hop_seconds=win_cfg["hop_seconds"],
    )
    return windows, duration_sec


def predict_windows(
    model,
    windows: np.ndarray,
    device: str,
    batch_size: int = 32,
) -> dict[str, dict[str, np.ndarray]]:
    """Run batched inference on feature windows.

    Args:
        model: CNNMultiTask in eval mode.
        windows: Array of shape (N, C, F, W).
        device: Device string.
        batch_size: Batch size for inference.

    Returns:
        Dict with keys "segment", "arousal", "valence", each containing:
        - "predictions": int class indices, shape (N,)
        - "probabilities": max prob per frame, shape (N,)
        - "all_probs": full probability matrix, shape (N, n_classes)
    """
    import torch

    n_windows = windows.shape[0]
    all_preds: dict[str, list[int]] = {
        "segment": [], "arousal": [], "valence": [],
    }
    all_max_probs: dict[str, list[float]] = {
        "segment": [], "arousal": [], "valence": [],
    }
    all_full_probs: dict[str, list[list[float]]] = {
        "segment": [], "arousal": [], "valence": [],
    }

    head_names = ["segment", "arousal", "valence"]

    with torch.no_grad():
        for start in range(0, n_windows, batch_size):
            end = min(start + batch_size, n_windows)
            batch = torch.from_numpy(windows[start:end]).float().to(device)
            logits = model(batch)

            for i, name in enumerate(head_names):
                probs = torch.softmax(logits[i], dim=1)
                max_probs, preds = probs.max(dim=1)
                all_preds[name].extend(preds.cpu().numpy().tolist())
                all_max_probs[name].extend(
                    max_probs.cpu().numpy().tolist(),
                )
                all_full_probs[name].extend(
                    probs.cpu().numpy().tolist(),
                )

    result = {}
    for name in head_names:
        result[name] = {
            "predictions": np.array(all_preds[name], dtype=np.int64),
            "probabilities": np.array(
                all_max_probs[name], dtype=np.float64,
            ),
            "all_probs": np.array(
                all_full_probs[name], dtype=np.float64,
            ),
        }
    return result


def build_timeline(
    raw_predictions: dict[str, dict[str, np.ndarray]],
    cfg: dict[str, Any],
    audio_duration: float,
) -> dict[str, Any]:
    """Build structured timeline from raw predictions.

    Args:
        raw_predictions: Output of predict_windows.
        cfg: Full config dict.
        audio_duration: Duration of audio in seconds.

    Returns:
        Dict with "metadata", "segment", "arousal", "valence" keys.
    """
    from musicml.postprocess import merge_segments, smooth_predictions

    win_cfg = cfg["windowing"]
    post_cfg = cfg["postprocess"]

    class_names_map = {
        "segment": cfg.get("segment_classes", ["Calm", "Build-up", "Climax", "Outro"]),
        "arousal": cfg.get("arousal_classes", ["Low", "Mid", "High"]),
        "valence": cfg.get("valence_classes", ["Dark", "Neutral", "Bright"]),
    }

    hop_seconds = win_cfg["hop_seconds"]

    timeline: dict[str, Any] = {
        "metadata": {
            "duration_sec": audio_duration,
            "window_seconds": win_cfg["window_seconds"],
            "hop_seconds": hop_seconds,
        },
    }

    frame_predictions: dict[str, Any] = {
        "frame_hop_seconds": hop_seconds,
    }

    for head_name in ("segment", "arousal", "valence"):
        preds = raw_predictions[head_name]["predictions"]
        probs = raw_predictions[head_name]["probabilities"]

        smoothed = smooth_predictions(
            preds, kernel_size=post_cfg["smooth_kernel"],
        )
        segments = merge_segments(
            smoothed,
            probs,
            hop_seconds=hop_seconds,
            min_duration=post_cfg["min_segment_duration"],
            class_names=class_names_map[head_name],
        )
        timeline[head_name] = [asdict(seg) for seg in segments]

        all_probs = raw_predictions[head_name].get("all_probs")
        if all_probs is not None:
            frame_predictions[f"{head_name}_probs"] = [
                [round(float(p), 4) for p in row]
                for row in all_probs
            ]

    timeline["frame_predictions"] = frame_predictions

    return timeline


def run_inference(
    audio_path: str | Path,
    ckpt_path: str | Path,
    cfg: dict[str, Any],
    device: str | None = None,
) -> dict[str, Any]:
    """Full inference pipeline: audio -> timeline dict.

    Args:
        audio_path: Path to audio file.
        ckpt_path: Path to model checkpoint.
        cfg: Full config dict.
        device: Device string (auto-detected if None).

    Returns:
        Timeline dict with metadata and per-head segment lists.
    """
    if device is None:
        from musicml.utils import get_device

        device = get_device()

    model = load_model(ckpt_path, cfg["model"], device=device)
    windows, duration = extract_features(audio_path, cfg)

    batch_size = cfg["training"].get("batch_size", 32)
    raw_preds = predict_windows(model, windows, device, batch_size=batch_size)
    timeline = build_timeline(raw_preds, cfg, duration)
    return timeline


def plot_timeline(
    timeline: dict[str, Any],
    output_path: str | Path,
) -> None:
    """Render timeline as a horizontal bar chart and save to file.

    Creates 3 horizontal bar rows (segment, arousal, valence)
    with color-coded segments.

    Args:
        timeline: Output of build_timeline / run_inference.
        output_path: Path to save the plot (e.g. .png).
    """
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.patches import Rectangle

    color_maps = {
        "segment": {
            "Calm": "#4CAF50",
            "Build-up": "#FF9800",
            "Climax": "#F44336",
            "Outro": "#9E9E9E",
        },
        "arousal": {
            "Low": "#81D4FA",
            "Mid": "#FFF176",
            "High": "#EF5350",
        },
        "valence": {
            "Dark": "#7E57C2",
            "Neutral": "#BDBDBD",
            "Bright": "#FFEB3B",
        },
    }

    heads = ["segment", "arousal", "valence"]
    fig, axes = plt.subplots(len(heads), 1, figsize=(14, 4), sharex=True)
    if len(heads) == 1:
        axes = [axes]

    duration = timeline["metadata"]["duration_sec"]

    for ax, head_name in zip(axes, heads):
        segments = timeline.get(head_name, [])
        colors = color_maps.get(head_name, {})

        for seg in segments:
            start = seg["start"]
            width = seg["end"] - seg["start"]
            label = seg["label"]
            color = colors.get(label, "#CCCCCC")
            rect = Rectangle((start, 0), width, 1, facecolor=color, edgecolor="white")
            ax.add_patch(rect)
            if width > duration * 0.05:
                ax.text(
                    start + width / 2,
                    0.5,
                    label,
                    ha="center",
                    va="center",
                    fontsize=8,
                )

        ax.set_xlim(0, duration)
        ax.set_ylim(0, 1)
        ax.set_ylabel(head_name, fontsize=10)
        ax.set_yticks([])

    axes[-1].set_xlabel("Time (seconds)")
    fig.suptitle("Music Analysis Timeline", fontsize=12)
    fig.tight_layout()
    fig.savefig(output_path, dpi=150, bbox_inches="tight")
    plt.close(fig)
