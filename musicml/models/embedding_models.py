"""Multi-task models operating on precomputed embeddings.

LinearMultiTask: per-window classification (Config 3: PANNs + Linear).
LSTMMultiTask: sequence-level classification with BiLSTM (Configs 2 & 4).
"""

from __future__ import annotations

import torch
import torch.nn as nn


class LinearMultiTask(nn.Module):
    """Per-window multi-task classification on precomputed embeddings.

    Input:  (B, D) where D = embedding_dim (e.g. 2048 for PANNs).
    Output: dict of (B, n_classes) logits per head.
    """

    def __init__(
        self,
        embedding_dim: int = 2048,
        projection_dim: int = 512,
        n_segment_classes: int = 6,
        n_arousal_classes: int = 3,
        n_valence_classes: int = 3,
        n_genre_classes: int = 0,
        dropout: float = 0.4,
        enable_regression: bool = False,
        # Accept and ignore LSTM-specific kwargs for config compat
        **_kwargs,
    ) -> None:
        super().__init__()

        self.projection = nn.Sequential(
            nn.Linear(embedding_dim, projection_dim),
            nn.LayerNorm(projection_dim),
            nn.ReLU(),
            nn.Dropout(dropout),
        )

        self.head_segment = nn.Linear(projection_dim, n_segment_classes)
        self.head_arousal = nn.Linear(projection_dim, n_arousal_classes)
        self.head_valence = nn.Linear(projection_dim, n_valence_classes)

        self.head_genre: nn.Linear | None = None
        if n_genre_classes > 0:
            self.head_genre = nn.Linear(projection_dim, n_genre_classes)

        self.head_arousal_reg: nn.Linear | None = None
        self.head_valence_reg: nn.Linear | None = None
        if enable_regression:
            self.head_arousal_reg = nn.Linear(projection_dim, 1)
            self.head_valence_reg = nn.Linear(projection_dim, 1)

    def forward(self, x: torch.Tensor) -> dict[str, torch.Tensor]:
        """Forward pass.

        Args:
            x: (B, D) precomputed embeddings.

        Returns:
            Dict with keys "segment", "arousal_cls", "valence_cls",
            and optionally "arousal_reg", "valence_reg", "genre".
        """
        h = self.projection(x)  # (B, projection_dim)

        result: dict[str, torch.Tensor] = {
            "segment": self.head_segment(h),
            "arousal_cls": self.head_arousal(h),
            "valence_cls": self.head_valence(h),
        }

        if self.head_arousal_reg is not None:
            result["arousal_reg"] = self.head_arousal_reg(h)
        if self.head_valence_reg is not None:
            result["valence_reg"] = self.head_valence_reg(h)
        if self.head_genre is not None:
            result["genre"] = self.head_genre(h)

        return result

    def count_params(self) -> int:
        """Count total trainable parameters."""
        return sum(p.numel() for p in self.parameters() if p.requires_grad)


class LSTMMultiTask(nn.Module):
    """BiLSTM multi-task model on precomputed embedding sequences.

    Input:  (B, T, D) padded sequences of embeddings.
    Output: dict of (B, T, n_classes) logits per head.
    """

    def __init__(
        self,
        embedding_dim: int = 2048,
        projection_dim: int = 512,
        lstm_hidden: int = 256,
        lstm_layers: int = 2,
        lstm_dropout: float = 0.3,
        head_dropout: float = 0.4,
        n_segment_classes: int = 6,
        n_arousal_classes: int = 3,
        n_valence_classes: int = 3,
        n_genre_classes: int = 0,
        enable_regression: bool = False,
        # Accept and ignore extra kwargs for config compat
        **_kwargs,
    ) -> None:
        super().__init__()

        self.projection = nn.Sequential(
            nn.Linear(embedding_dim, projection_dim),
            nn.LayerNorm(projection_dim),
            nn.ReLU(),
        )

        # BiLSTM: (B, T, projection_dim) → (B, T, lstm_hidden * 2)
        self.lstm = nn.LSTM(
            input_size=projection_dim,
            hidden_size=lstm_hidden,
            num_layers=lstm_layers,
            batch_first=True,
            bidirectional=True,
            dropout=lstm_dropout if lstm_layers > 1 else 0.0,
        )

        lstm_out_dim = lstm_hidden * 2  # bidirectional
        self.dropout = nn.Dropout(head_dropout)

        self.head_segment = nn.Linear(lstm_out_dim, n_segment_classes)
        self.head_arousal = nn.Linear(lstm_out_dim, n_arousal_classes)
        self.head_valence = nn.Linear(lstm_out_dim, n_valence_classes)

        self.head_genre: nn.Linear | None = None
        if n_genre_classes > 0:
            self.head_genre = nn.Linear(lstm_out_dim, n_genre_classes)

        self.head_arousal_reg: nn.Linear | None = None
        self.head_valence_reg: nn.Linear | None = None
        if enable_regression:
            self.head_arousal_reg = nn.Linear(lstm_out_dim, 1)
            self.head_valence_reg = nn.Linear(lstm_out_dim, 1)

    def forward(
        self,
        x: torch.Tensor,
        lengths: torch.Tensor | None = None,
    ) -> dict[str, torch.Tensor]:
        """Forward pass.

        Args:
            x: (B, T, D) padded embedding sequences.
            lengths: (B,) actual lengths before padding.
                     Used for pack_padded_sequence efficiency.

        Returns:
            Dict with keys "segment", "arousal_cls", "valence_cls",
            and optionally "arousal_reg", "valence_reg", "genre".
            Each value has shape (B, T, n_classes).
        """
        h = self.projection(x)  # (B, T, projection_dim)

        if lengths is not None:
            packed = nn.utils.rnn.pack_padded_sequence(
                h, lengths.cpu(), batch_first=True, enforce_sorted=False,
            )
            lstm_out, _ = self.lstm(packed)
            h, _ = nn.utils.rnn.pad_packed_sequence(
                lstm_out, batch_first=True,
            )
        else:
            h, _ = self.lstm(h)  # (B, T, lstm_hidden * 2)

        h = self.dropout(h)

        result: dict[str, torch.Tensor] = {
            "segment": self.head_segment(h),       # (B, T, n_seg)
            "arousal_cls": self.head_arousal(h),    # (B, T, n_ar)
            "valence_cls": self.head_valence(h),    # (B, T, n_val)
        }

        if self.head_arousal_reg is not None:
            result["arousal_reg"] = self.head_arousal_reg(h)
        if self.head_valence_reg is not None:
            result["valence_reg"] = self.head_valence_reg(h)
        if self.head_genre is not None:
            result["genre"] = self.head_genre(h)

        return result

    def count_params(self) -> int:
        """Count total trainable parameters."""
        return sum(p.numel() for p in self.parameters() if p.requires_grad)
