"""Multi-task CNN for music analysis: structure + arousal + valence."""

from __future__ import annotations

import torch
import torch.nn as nn


class SEBlock(nn.Module):
    """Squeeze-and-Excitation block for channel attention."""

    def __init__(self, channels: int, reduction: int = 16) -> None:
        super().__init__()
        self.squeeze = nn.AdaptiveAvgPool2d(1)
        self.excitation = nn.Sequential(
            nn.Linear(channels, max(channels // reduction, 1)),
            nn.ReLU(),
            nn.Linear(max(channels // reduction, 1), channels),
            nn.Sigmoid(),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        b, c, _, _ = x.shape
        w = self.squeeze(x).view(b, c)
        w = self.excitation(w).view(b, c, 1, 1)
        return x * w


class CNNMultiTask(nn.Module):
    """Multi-task CNN on log-mel spectrograms.

    Architecture:
        Conv2D(32) + BN + ReLU + SE + MaxPool
        Conv2D(64) + BN + ReLU + SE + MaxPool
        Conv2D(128) + BN + ReLU + SE + MaxPool
        Conv2D(256) + BN + ReLU + SE + MaxPool
        Conv2D(512) + BN + ReLU + SE + GlobalAvgPool
        Shared FC: Linear(512→256) + BN + ReLU + Dropout
        Classification heads (segment, arousal, valence, genre)
        Optional regression heads (arousal_reg, valence_reg)

    Input shape: (batch, channels, n_mels, time_frames)
        Default: channels=1 (log-mel only)
    """

    def __init__(
        self,
        in_channels: int = 1,
        n_segment_classes: int = 6,
        n_arousal_classes: int = 3,
        n_valence_classes: int = 3,
        n_genre_classes: int = 0,
        dropout: float = 0.3,
        backbone_dropout: float = 0.0,
        enable_regression: bool = False,
    ) -> None:
        super().__init__()

        layers: list[nn.Module] = []
        channels = [in_channels, 32, 64, 128, 256, 512]
        for i in range(5):
            layers.extend([
                nn.Conv2d(channels[i], channels[i + 1], kernel_size=3, padding=1),
                nn.BatchNorm2d(channels[i + 1]),
                nn.ReLU(),
                SEBlock(channels[i + 1]),
            ])
            if i < 4:
                layers.append(nn.MaxPool2d(2))
            if backbone_dropout > 0:
                layers.append(nn.Dropout2d(backbone_dropout))

        self.backbone = nn.Sequential(*layers)

        self.gap = nn.AdaptiveAvgPool2d(1)

        # Shared FC layer for richer task-specific representations
        self.shared_fc = nn.Sequential(
            nn.Linear(512, 256),
            nn.BatchNorm1d(256),
            nn.ReLU(),
            nn.Dropout(dropout),
        )

        self.head_segment = nn.Linear(256, n_segment_classes)
        self.head_arousal = nn.Linear(256, n_arousal_classes)
        self.head_valence = nn.Linear(256, n_valence_classes)

        # Optional regression heads for continuous arousal/valence
        self.head_arousal_reg: nn.Linear | None = None
        self.head_valence_reg: nn.Linear | None = None
        if enable_regression:
            self.head_arousal_reg = nn.Linear(256, 1)
            self.head_valence_reg = nn.Linear(256, 1)

        self.head_genre: nn.Linear | None = None
        if n_genre_classes > 0:
            self.head_genre = nn.Linear(256, n_genre_classes)

    def forward(self, x: torch.Tensor) -> dict[str, torch.Tensor]:
        """Forward pass.

        Args:
            x: Input tensor of shape (B, C, F, T).

        Returns:
            Dict with keys "segment", "arousal_cls", "valence_cls",
            and optionally "arousal_reg", "valence_reg".
        """
        features = self.backbone(x)
        features = self.gap(features).flatten(1)  # (B, 512)
        features = self.shared_fc(features)  # (B, 256)

        result: dict[str, torch.Tensor] = {
            "segment": self.head_segment(features),
            "arousal_cls": self.head_arousal(features),
            "valence_cls": self.head_valence(features),
        }

        if self.head_arousal_reg is not None:
            result["arousal_reg"] = self.head_arousal_reg(features)
        if self.head_valence_reg is not None:
            result["valence_reg"] = self.head_valence_reg(features)

        if self.head_genre is not None:
            result["genre"] = self.head_genre(features)

        return result

    def extract_embeddings(self, x: torch.Tensor) -> torch.Tensor:
        """Extract 512-dim GAP embeddings without classification heads.

        Args:
            x: Input tensor of shape (B, C, F, T).

        Returns:
            Embedding tensor of shape (B, 512).
        """
        features = self.backbone(x)
        return self.gap(features).flatten(1)

    def count_params(self) -> int:
        """Count total trainable parameters."""
        return sum(p.numel() for p in self.parameters() if p.requires_grad)
