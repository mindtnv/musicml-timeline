"""Precompute embeddings from CNN or PANNs backbone.

Processes precomputed spectrogram features (or raw audio for PANNs)
and saves per-track embedding files as .npy arrays.

Usage:
    # CNN embeddings (256-dim) from trained checkpoint
    python scripts/precompute_embeddings.py \
        --backbone cnn --ckpt checkpoints/best.pt \
        --config configs/default.yaml \
        --feature-dir data/deam/features \
        --output-dir data/deam/cnn_embeddings

    # PANNs embeddings (2048-dim)
    python scripts/precompute_embeddings.py \
        --backbone panns \
        --feature-dir data/deam/features \
        --output-dir data/deam/panns_embeddings
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import torch
from tqdm import tqdm


def extract_cnn_embeddings(
    feature_dir: Path,
    output_dir: Path,
    ckpt_path: str,
    cfg: dict,
    device: str,
    batch_size: int = 64,
) -> None:
    """Extract embeddings from trained CNN backbone.

    Loads precomputed spectrograms from feature_dir, windows them,
    and runs through CNN extract_embeddings → (N, 256) per track.
    """
    from musicml.features import window_features
    from musicml.models import CNNMultiTask

    model = CNNMultiTask(**cfg["model"])
    checkpoint = torch.load(ckpt_path, map_location=device, weights_only=False)
    model.load_state_dict(checkpoint["model_state_dict"], strict=False)
    model.to(device)
    model.eval()

    feat_cfg = cfg["features"]
    win_cfg = cfg["windowing"]
    sr = cfg["audio"]["sr"]

    # Support both .npy and .npz feature files
    feat_files = sorted(
        list(feature_dir.glob("*.npy")) + list(feature_dir.glob("*.npz")),
    )
    feat_files = [f for f in feat_files if f.stem != "stats"]

    print(f"Processing {len(feat_files)} tracks with CNN backbone...")

    with torch.no_grad():
        for feat_path in tqdm(feat_files, desc="CNN embeddings"):
            track_id = feat_path.stem
            out_path = output_dir / f"{track_id}.npy"
            if out_path.exists():
                continue

            data = np.load(feat_path)
            # .npz files: extract the first array
            if isinstance(data, np.lib.npyio.NpzFile):
                key = list(data.keys())[0]
                features = data[key]
            else:
                features = data
            windows = window_features(
                features,
                sr=sr,
                hop_length=feat_cfg["hop_length"],
                window_seconds=win_cfg["window_seconds"],
                hop_seconds=win_cfg["hop_seconds"],
            )

            # windows: (N, C, F, W) → extract embeddings in batches
            n_windows = windows.shape[0]
            embeddings = []

            for start in range(0, n_windows, batch_size):
                end = min(start + batch_size, n_windows)
                batch = torch.from_numpy(windows[start:end]).float().to(device)
                emb = model.extract_embeddings(batch)
                embeddings.append(emb.cpu().numpy())

            embeddings = np.concatenate(embeddings, axis=0)
            np.save(out_path, embeddings)

    print(f"Saved CNN embeddings to {output_dir}")


def extract_panns_embeddings(
    feature_dir: Path,
    output_dir: Path,
    cfg: dict,
    device: str,
    batch_size: int = 32,
) -> None:
    """Extract embeddings from PANNs CNN14 pretrained model.

    PANNs expects raw audio at 32kHz. We load precomputed spectrograms,
    reconstruct approximate audio windows, or alternatively operate on
    raw audio directly.

    Since precomputed features are spectrograms (not audio), we use
    the feature-dir to find track IDs and then look for corresponding
    audio files. For a simpler approach, we process spectrograms through
    window_features and feed them to PANNs after mel → audio approximation.

    Actually, PANNs works on raw audio waveforms at 32kHz. So we need
    a different approach: process audio files directly.
    """
    try:
        from panns_inference import AudioTagging
    except ImportError:
        raise ImportError(
            "panns-inference is required for PANNs embeddings. "
            "Install with: pip install 'musicml[panns]'"
        )

    from musicml.features import load_audio

    win_cfg = cfg["windowing"]
    window_sec = win_cfg["window_seconds"]
    hop_sec = win_cfg["hop_seconds"]

    # PANNs expects 32kHz
    panns_sr = 32000
    at = AudioTagging(checkpoint_path=None, device=device)

    # Find all track IDs from feature directory (.npy or .npz)
    npy_files = sorted(
        list(feature_dir.glob("*.npy")) + list(feature_dir.glob("*.npz")),
    )
    npy_files = [f for f in npy_files if f.stem != "stats"]

    # We need the audio directory. It should be sibling to feature_dir.
    # data/{dataset}/features → data/{dataset}/audio
    audio_dir = feature_dir.parent / "audio"
    if not audio_dir.exists():
        # Some datasets might have audio alongside features
        print(f"Warning: audio directory not found at {audio_dir}")
        print("PANNs requires raw audio files. Skipping.")
        return

    print(f"Processing {len(npy_files)} tracks with PANNs CNN14...")

    with torch.no_grad():
        for npy_path in tqdm(npy_files, desc="PANNs embeddings"):
            track_id = npy_path.stem
            out_path = output_dir / f"{track_id}.npy"
            if out_path.exists():
                continue

            # Find audio file
            audio_path = None
            for ext in (".wav", ".mp3", ".flac", ".ogg", ".au"):
                candidate = audio_dir / f"{track_id}{ext}"
                if candidate.exists():
                    audio_path = candidate
                    break
            if audio_path is None:
                continue

            # Load audio at PANNs sample rate
            y, _sr = load_audio(str(audio_path), sr=panns_sr, mono=True)

            # Create audio windows
            window_samples = int(window_sec * panns_sr)
            hop_samples = int(hop_sec * panns_sr)
            n_windows = max(
                1, int((len(y) - window_samples) / hop_samples) + 1,
            )

            embeddings = []
            for wi in range(0, n_windows, batch_size):
                batch_windows = []
                for bi in range(wi, min(wi + batch_size, n_windows)):
                    start = bi * hop_samples
                    end = start + window_samples
                    if end > len(y):
                        # Pad last window
                        chunk = np.zeros(window_samples, dtype=np.float32)
                        chunk[: len(y) - start] = y[start:]
                    else:
                        chunk = y[start:end]
                    batch_windows.append(chunk)

                batch_np = np.stack(batch_windows)
                # PANNs inference: returns (clipwise_output, embedding)
                _, emb = at.inference(batch_np)
                embeddings.append(emb)

            embeddings = np.concatenate(embeddings, axis=0)
            np.save(out_path, embeddings)

    n_saved = len(list(output_dir.glob("*.npy")))
    print(f"Saved {n_saved} PANNs embedding files to {output_dir}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Precompute embeddings from CNN or PANNs backbone",
    )
    parser.add_argument(
        "--backbone", required=True, choices=["cnn", "panns"],
        help="Backbone type: 'cnn' (trained checkpoint) or 'panns' (pretrained CNN14)",
    )
    parser.add_argument(
        "--ckpt", default=None,
        help="Checkpoint path (required for CNN backbone)",
    )
    parser.add_argument(
        "--config", default="configs/default.yaml",
        help="Config file (for audio/feature/windowing settings)",
    )
    parser.add_argument(
        "--feature-dir", required=True,
        help="Directory with precomputed .npy feature files",
    )
    parser.add_argument(
        "--output-dir", required=True,
        help="Output directory for embedding .npy files",
    )
    parser.add_argument(
        "--batch-size", type=int, default=64,
        help="Batch size for embedding extraction",
    )
    args = parser.parse_args()

    from musicml.utils import get_device, load_config

    cfg = load_config(args.config)
    device = get_device()
    print(f"Device: {device}")

    feature_dir = Path(args.feature_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    if args.backbone == "cnn":
        if args.ckpt is None:
            parser.error("--ckpt is required for CNN backbone")
        extract_cnn_embeddings(
            feature_dir, output_dir,
            ckpt_path=args.ckpt,
            cfg=cfg,
            device=device,
            batch_size=args.batch_size,
        )
    elif args.backbone == "panns":
        extract_panns_embeddings(
            feature_dir, output_dir,
            cfg=cfg,
            device=device,
            batch_size=args.batch_size,
        )

    print("Done!")


if __name__ == "__main__":
    main()
