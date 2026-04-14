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
    architecture: str = "cnn",
):
    """Load a trained model from checkpoint.

    Dispatches to the correct model class based on ``architecture``:
    - ``"cnn"``: CNNMultiTask
    - ``"cnn_lstm"`` / ``"panns_lstm"``: LSTMMultiTask
    - ``"panns_linear"``: LinearMultiTask
    """
    import torch

    from musicml.models import CNNMultiTask, LinearMultiTask, LSTMMultiTask

    if architecture == "cnn":
        model = CNNMultiTask(**model_cfg)
    elif architecture == "ast":
        from musicml.models.ast_multitask import ASTMultiTask
        model = ASTMultiTask(**model_cfg)
    elif architecture in ("cnn_lstm", "panns_lstm"):
        model = LSTMMultiTask(**model_cfg)
    elif architecture == "panns_linear":
        model = LinearMultiTask(**model_cfg)
    else:
        raise ValueError(f"Unknown architecture: {architecture}")

    checkpoint = torch.load(ckpt_path, map_location=device, weights_only=False)
    model.load_state_dict(checkpoint["model_state_dict"], strict=False)
    model.to(device)
    model.eval()
    return model


def extract_features(
    audio_path: str | Path,
    cfg: dict[str, Any],
    stats_path: str | Path | None = None,
) -> tuple[np.ndarray, float]:
    """Extract windowed features from an audio file.

    Args:
        stats_path: Path to stats.npz with mean/std for normalization.
            If None, attempts to find stats in default data directories.

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

    # Normalize features using training set statistics
    if stats_path is None:
        for candidate in ["data/deam/features/stats.npz",
                          "data/gtzan/features/stats.npz",
                          "data/structure/features/stats.npz"]:
            if Path(candidate).exists():
                stats_path = candidate
                break
    if stats_path is not None:
        stats = np.load(stats_path)
        feat_mean = stats["mean"]  # (n_mels, 1)
        feat_std = stats["std"]    # (n_mels, 1)
        feat_std = np.where(feat_std < 1e-6, 1.0, feat_std)
        feats = (feats - feat_mean) / feat_std

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
    do_extract_embeddings: bool = False,
) -> dict[str, Any]:
    """Run batched inference on feature windows.

    Returns:
        Dict with keys "segment", "arousal", "valence", each containing:
        - "predictions": int class indices, shape (N,)
        - "probabilities": max prob per frame, shape (N,)
        - "all_probs": full probability matrix, shape (N, n_classes)
        Optionally "arousal_reg", "valence_reg" arrays and "embeddings".
    """
    import torch

    n_windows = windows.shape[0]

    cls_heads = [
        ("segment", "segment"),
        ("arousal", "arousal_cls"),
        ("valence", "valence_cls"),
        ("genre", "genre"),
    ]

    all_preds: dict[str, list[int]] = {n: [] for n, _ in cls_heads}
    all_max_probs: dict[str, list[float]] = {n: [] for n, _ in cls_heads}
    all_full_probs: dict[str, list[list[float]]] = {n: [] for n, _ in cls_heads}
    all_reg: dict[str, list[float]] = {"arousal_reg": [], "valence_reg": []}
    all_embeddings: list[list[float]] = []

    with torch.no_grad():
        for start in range(0, n_windows, batch_size):
            end = min(start + batch_size, n_windows)
            batch = torch.from_numpy(windows[start:end]).float().to(device)
            output = model(batch)

            for name, key in cls_heads:
                probs = torch.softmax(output[key], dim=1)
                max_probs, preds = probs.max(dim=1)
                all_preds[name].extend(preds.cpu().numpy().tolist())
                all_max_probs[name].extend(
                    max_probs.cpu().numpy().tolist(),
                )
                all_full_probs[name].extend(
                    probs.cpu().numpy().tolist(),
                )

            # Regression outputs
            for reg_key in ("arousal_reg", "valence_reg"):
                if reg_key in output:
                    vals = output[reg_key].squeeze(-1).cpu().numpy().tolist()
                    all_reg[reg_key].extend(vals)

            # Embeddings
            if do_extract_embeddings:
                emb = model.extract_embeddings(batch)
                all_embeddings.extend(emb.cpu().numpy().tolist())

    result: dict[str, Any] = {}
    for name, _ in cls_heads:
        result[name] = {
            "predictions": np.array(all_preds[name], dtype=np.int64),
            "probabilities": np.array(
                all_max_probs[name], dtype=np.float64,
            ),
            "all_probs": np.array(
                all_full_probs[name], dtype=np.float64,
            ),
        }

    for reg_key in ("arousal_reg", "valence_reg"):
        if all_reg[reg_key]:
            result[reg_key] = np.array(all_reg[reg_key], dtype=np.float64)

    if all_embeddings:
        result["embeddings"] = np.array(all_embeddings, dtype=np.float32)

    return result


def predict_with_embeddings(
    model,
    audio_path: str | Path,
    cfg: dict[str, Any],
    device: str,
    architecture: str,
    batch_size: int = 32,
) -> dict[str, Any]:
    """Run inference on audio using an embedding-based model.

    1. Extract features + window them (as for CNN)
    2. Run through backbone (CNN or PANNs) → embeddings
    3. Feed embeddings through the model (Linear or LSTM)
    4. Return predictions in the same format as predict_windows()
    """
    import torch

    from musicml.features import load_audio

    # Step 1: Extract windowed spectrograms
    windows, duration = extract_features(audio_path, cfg)
    n_windows = windows.shape[0]

    # Step 2: Get embeddings from backbone
    if architecture.startswith("cnn"):
        # CNN backbone — load the CNN checkpoint for embedding extraction
        from musicml.models import CNNMultiTask

        cnn_ckpt = cfg.get("cnn_backbone_ckpt", "checkpoints/best.pt")
        cnn_model = CNNMultiTask(**cfg.get("cnn_model", cfg["model"]))
        ckpt_data = torch.load(
            cnn_ckpt, map_location=device, weights_only=False,
        )
        # Try loading CNN state dict (may have different keys)
        try:
            cnn_model.load_state_dict(
                ckpt_data["model_state_dict"], strict=False,
            )
        except Exception:
            pass
        cnn_model.to(device)
        cnn_model.eval()

        embeddings = []
        with torch.no_grad():
            for start in range(0, n_windows, batch_size):
                end = min(start + batch_size, n_windows)
                batch = torch.from_numpy(
                    windows[start:end],
                ).float().to(device)
                emb = cnn_model.extract_embeddings(batch)
                embeddings.append(emb.cpu().numpy())
        embeddings_np = np.concatenate(embeddings, axis=0)

    elif architecture.startswith("panns"):
        # PANNs backbone — process raw audio windows at 32kHz
        try:
            from panns_inference import AudioTagging
        except ImportError:
            raise ImportError(
                "panns-inference is required for PANNs models. "
                "Install with: pip install 'musicml[panns]'"
            )

        panns_sr = 32000
        y, sr = load_audio(str(audio_path), sr=panns_sr, mono=True)

        win_cfg = cfg["windowing"]
        window_samples = int(win_cfg["window_seconds"] * panns_sr)
        hop_samples = int(win_cfg["hop_seconds"] * panns_sr)

        at = AudioTagging(checkpoint_path=None, device=device)
        embeddings = []

        with torch.no_grad():
            for start_i in range(0, n_windows, batch_size):
                batch_windows = []
                for wi in range(
                    start_i, min(start_i + batch_size, n_windows),
                ):
                    s = wi * hop_samples
                    e = s + window_samples
                    if e > len(y):
                        chunk = np.zeros(window_samples, dtype=np.float32)
                        chunk[: len(y) - s] = y[s:]
                    else:
                        chunk = y[s:e]
                    batch_windows.append(chunk)
                batch_np = np.stack(batch_windows)
                _, emb = at.inference(batch_np)
                embeddings.append(emb)

        embeddings_np = np.concatenate(embeddings, axis=0)
    else:
        raise ValueError(f"Unknown architecture: {architecture}")

    # Step 3: Run through the model
    cls_heads = [
        ("segment", "segment"),
        ("arousal", "arousal_cls"),
        ("valence", "valence_cls"),
        ("genre", "genre"),
    ]

    all_preds: dict[str, list[int]] = {n: [] for n, _ in cls_heads}
    all_max_probs: dict[str, list[float]] = {n: [] for n, _ in cls_heads}
    all_full_probs: dict[str, list[list[float]]] = {n: [] for n, _ in cls_heads}
    all_reg: dict[str, list[float]] = {"arousal_reg": [], "valence_reg": []}

    is_sequence = "lstm" in architecture

    with torch.no_grad():
        if is_sequence:
            # Feed entire track as single sequence: (1, N, D)
            emb_tensor = torch.from_numpy(
                embeddings_np,
            ).float().unsqueeze(0).to(device)
            output = model(emb_tensor)

            for name, key in cls_heads:
                if key not in output:
                    continue
                # (1, N, C) → (N, C)
                logits = output[key].squeeze(0)
                probs = torch.softmax(logits, dim=1)
                max_probs, preds = probs.max(dim=1)
                all_preds[name] = preds.cpu().numpy().tolist()
                all_max_probs[name] = max_probs.cpu().numpy().tolist()
                all_full_probs[name] = probs.cpu().numpy().tolist()

            for reg_key in ("arousal_reg", "valence_reg"):
                if reg_key in output:
                    vals = output[reg_key].squeeze(0).squeeze(-1)
                    all_reg[reg_key] = vals.cpu().numpy().tolist()
        else:
            # Per-window: (N, D) in batches
            for start in range(0, n_windows, batch_size):
                end = min(start + batch_size, n_windows)
                batch = torch.from_numpy(
                    embeddings_np[start:end],
                ).float().to(device)
                output = model(batch)

                for name, key in cls_heads:
                    if key not in output:
                        continue
                    probs = torch.softmax(output[key], dim=1)
                    max_probs, preds = probs.max(dim=1)
                    all_preds[name].extend(preds.cpu().numpy().tolist())
                    all_max_probs[name].extend(
                        max_probs.cpu().numpy().tolist(),
                    )
                    all_full_probs[name].extend(
                        probs.cpu().numpy().tolist(),
                    )

                for reg_key in ("arousal_reg", "valence_reg"):
                    if reg_key in output:
                        vals = output[reg_key].squeeze(-1)
                        all_reg[reg_key].extend(
                            vals.cpu().numpy().tolist(),
                        )

    result: dict[str, Any] = {}
    for name, _ in cls_heads:
        if all_preds[name]:
            result[name] = {
                "predictions": np.array(all_preds[name], dtype=np.int64),
                "probabilities": np.array(
                    all_max_probs[name], dtype=np.float64,
                ),
                "all_probs": np.array(
                    all_full_probs[name], dtype=np.float64,
                ),
            }

    for reg_key in ("arousal_reg", "valence_reg"):
        if all_reg[reg_key]:
            result[reg_key] = np.array(all_reg[reg_key], dtype=np.float64)

    return result, duration


def extract_audio_features(
    audio_path: str | Path,
    cfg: dict[str, Any],
) -> dict[str, Any]:
    """Extract signal-processing features directly from audio.

    Returns dict with tempo, key, loudness_rms, spectral_centroid,
    onset_strength, and feature_hop_seconds.
    """
    from musicml.features import (
        compute_onset_strength,
        compute_rms,
        compute_spectral_centroid,
        estimate_key,
        estimate_tempo,
        load_audio,
    )

    audio_cfg = cfg["audio"]
    feat_cfg = cfg["features"]

    y, sr = load_audio(str(audio_path), sr=audio_cfg["sr"])
    hop_length = feat_cfg["hop_length"]

    tempo = estimate_tempo(y, sr=sr, hop_length=hop_length)
    key_info = estimate_key(y, sr=sr)
    rms = compute_rms(y, hop_length=hop_length)
    centroid = compute_spectral_centroid(y, sr=sr, hop_length=hop_length)
    onset = compute_onset_strength(y, sr=sr, hop_length=hop_length)

    frames_per_sec = sr / hop_length

    return {
        "tempo_bpm": tempo,
        "key": key_info,
        "loudness_rms": rms.squeeze().tolist(),
        "spectral_centroid": centroid.squeeze().tolist(),
        "onset_strength": onset.tolist(),
        "feature_hop_seconds": 1.0 / frames_per_sec,
    }


def build_timeline(
    raw_predictions: dict[str, Any],
    cfg: dict[str, Any],
    audio_duration: float,
    audio_features: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build structured timeline from raw predictions."""
    from musicml.postprocess import merge_segments, smooth_predictions

    win_cfg = cfg["windowing"]
    post_cfg = cfg["postprocess"]

    class_names_map = {
        "segment": cfg.get(
            "segment_classes",
            ["Intro", "Verse", "Bridge", "Chorus", "Instrumental", "Outro"],
        ),
        "arousal": cfg.get("arousal_classes", ["Low", "Mid", "High"]),
        "valence": cfg.get("valence_classes", ["Dark", "Neutral", "Bright"]),
        "genre": cfg.get("genre_classes", [
            "blues", "classical", "country", "disco", "hiphop",
            "jazz", "metal", "pop", "reggae", "rock",
        ]),
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

    for head_name in ("segment", "arousal", "valence", "genre"):
        head_data = raw_predictions.get(head_name)
        if head_data is None:
            continue
        preds = head_data["predictions"]
        probs = head_data["probabilities"]

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
        # Extend last segment to full audio duration
        if segments and segments[-1].end < audio_duration:
            segments[-1] = type(segments[-1])(
                start=segments[-1].start,
                end=round(audio_duration, 1),
                label=segments[-1].label,
                confidence=segments[-1].confidence,
            )
        timeline[head_name] = [asdict(seg) for seg in segments]

        all_probs = head_data.get("all_probs")
        if all_probs is not None:
            frame_predictions[f"{head_name}_probs"] = [
                [round(float(p), 4) for p in row]
                for row in all_probs
            ]

    # Regression curves — pad to full duration
    expected_frames = int(audio_duration / hop_seconds) + 1
    for reg_key in ("arousal_reg", "valence_reg"):
        reg_data = raw_predictions.get(reg_key)
        if reg_data is not None:
            values = [round(float(v), 4) for v in reg_data]
            # Pad with last value to cover full duration
            while len(values) < expected_frames:
                values.append(values[-1] if values else 0.0)
            frame_predictions[reg_key] = values

    timeline["frame_predictions"] = frame_predictions

    # Audio-level features
    if audio_features is not None:
        timeline["audio_features"] = audio_features

    # Embeddings
    embeddings = raw_predictions.get("embeddings")
    if embeddings is not None:
        timeline["embeddings"] = embeddings.tolist()

    return timeline


def run_inference(
    audio_path: str | Path,
    ckpt_path: str | Path,
    cfg: dict[str, Any],
    device: str | None = None,
    do_extract_embeddings: bool = False,
    include_audio_features: bool = True,
) -> dict[str, Any]:
    """Full inference pipeline: audio -> timeline dict.

    Dispatches to the appropriate model and prediction path based
    on ``cfg["architecture"]``.
    """
    if device is None:
        from musicml.utils import get_device

        device = get_device()

    arch = cfg.get("architecture", "cnn")
    batch_size = cfg["training"].get("batch_size", 32)

    if arch == "cnn":
        model = load_model(
            ckpt_path, cfg["model"], device=device, architecture=arch,
        )
        windows, duration = extract_features(audio_path, cfg)
        raw_preds = predict_windows(
            model, windows, device, batch_size=batch_size,
            do_extract_embeddings=do_extract_embeddings,
        )
    else:
        model = load_model(
            ckpt_path, cfg["model"], device=device, architecture=arch,
        )
        raw_preds, duration = predict_with_embeddings(
            model, audio_path, cfg, device, architecture=arch,
            batch_size=batch_size,
        )

    audio_feats = None
    if include_audio_features:
        audio_feats = extract_audio_features(audio_path, cfg)

    timeline = build_timeline(
        raw_preds, cfg, duration, audio_features=audio_feats,
    )
    return timeline


def plot_timeline(
    timeline: dict[str, Any],
    output_path: str | Path,
) -> None:
    """Render timeline as a horizontal bar chart and save to file."""
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.patches import Rectangle

    color_maps = {
        "segment": {
            # 6-class colors
            "Intro": "#81C784",
            "Verse": "#4CAF50",
            "Bridge": "#FF9800",
            "Chorus": "#F44336",
            "Instrumental": "#42A5F5",
            "Outro": "#9E9E9E",
            # Legacy 4-class colors
            "Calm": "#4CAF50",
            "Build-up": "#FF9800",
            "Climax": "#F44336",
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
        "genre": {
            "blues": "#1565C0",
            "classical": "#7B1FA2",
            "country": "#F9A825",
            "disco": "#E91E63",
            "hiphop": "#FF6F00",
            "jazz": "#00838F",
            "metal": "#37474F",
            "pop": "#EC407A",
            "reggae": "#2E7D32",
            "rock": "#D32F2F",
        },
    }

    heads = ["segment", "arousal", "valence", "genre"]
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
            rect = Rectangle(
                (start, 0), width, 1,
                facecolor=color, edgecolor="white",
            )
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
