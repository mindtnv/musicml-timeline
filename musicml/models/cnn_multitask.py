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
        Conv2D(256) + BN + ReLU + SE + GlobalAvgPool
        3 classification heads (segment, arousal, valence)

    Input shape: (batch, channels, n_mels, time_frames)
        Default: channels=1 (log-mel only)
    """

    def __init__(
        self,
        in_channels: int = 1,
        n_segment_classes: int = 4,
        n_arousal_classes: int = 3,
        n_valence_classes: int = 3,
        dropout: float = 0.3,
    ) -> None:
        super().__init__()

        self.backbone = nn.Sequential(
            nn.Conv2d(in_channels, 32, kernel_size=3, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(),
            SEBlock(32),
            nn.MaxPool2d(2),
            nn.Conv2d(32, 64, kernel_size=3, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(),
            SEBlock(64),
            nn.MaxPool2d(2),
            nn.Conv2d(64, 128, kernel_size=3, padding=1),
            nn.BatchNorm2d(128),
            nn.ReLU(),
            SEBlock(128),
            nn.MaxPool2d(2),
            nn.Conv2d(128, 256, kernel_size=3, padding=1),
            nn.BatchNorm2d(256),
            nn.ReLU(),
            SEBlock(256),
        )

        self.gap = nn.AdaptiveAvgPool2d(1)
        self.dropout = nn.Dropout(dropout)

        self.head_segment = nn.Linear(256, n_segment_classes)
        self.head_arousal = nn.Linear(256, n_arousal_classes)
        self.head_valence = nn.Linear(256, n_valence_classes)

    def forward(
        self, x: torch.Tensor
    ) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """Forward pass.

        Args:
            x: Input tensor of shape (B, C, F, T).

        Returns:
            Tuple of (segment_logits, arousal_logits, valence_logits).
        """
        features = self.backbone(x)
        features = self.gap(features).flatten(1)  # (B, 256)
        features = self.dropout(features)

        seg = self.head_segment(features)
        aro = self.head_arousal(features)
        val = self.head_valence(features)

        return seg, aro, val

    def count_params(self) -> int:
        """Count total trainable parameters."""
        return sum(p.numel() for p in self.parameters() if p.requires_grad)
