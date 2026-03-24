"""Multi-task Audio Spectrogram Transformer for music analysis.

Uses pretrained AST (MIT/ast-finetuned-audioset) as backbone with
frozen transformer layers + fine-tuned heads for segment, arousal,
valence, and genre classification.
"""

from __future__ import annotations

import torch
import torch.nn as nn


class ASTMultiTask(nn.Module):
    """Multi-task model using pretrained Audio Spectrogram Transformer.

    Architecture:
        Pretrained AST (768-dim) → shared FC (768→256) → 4 task heads

    Input shape: (batch, 1, n_mels, time_frames) — same as CNNMultiTask.
    Internally reshaped to (batch, time_frames, n_mels) for AST.
    """

    def __init__(
        self,
        pretrained_model: str = "MIT/ast-finetuned-audioset-10-10-0.4593",
        freeze_layers: int = 10,
        hidden_dim: int = 768,
        shared_fc_dim: int = 256,
        n_segment_classes: int = 6,
        n_arousal_classes: int = 3,
        n_valence_classes: int = 3,
        n_genre_classes: int = 0,
        dropout: float = 0.3,
        enable_regression: bool = False,
        # Accept and ignore CNN-specific params for config compatibility
        **kwargs,
    ) -> None:
        super().__init__()

        from transformers import ASTModel

        self.ast = ASTModel.from_pretrained(pretrained_model)
        self.hidden_dim = hidden_dim

        # Freeze embedding layers
        for param in self.ast.embeddings.parameters():
            param.requires_grad = False

        # Freeze first N transformer layers
        for i, layer in enumerate(self.ast.encoder.layer):
            if i < freeze_layers:
                for param in layer.parameters():
                    param.requires_grad = False

        # Shared FC: AST hidden_dim → shared_fc_dim
        self.shared_fc = nn.Sequential(
            nn.Linear(hidden_dim, shared_fc_dim),
            nn.BatchNorm1d(shared_fc_dim),
            nn.ReLU(),
            nn.Dropout(dropout),
        )

        # Classification heads (same interface as CNNMultiTask)
        self.head_segment = nn.Linear(shared_fc_dim, n_segment_classes)
        self.head_arousal = nn.Linear(shared_fc_dim, n_arousal_classes)
        self.head_valence = nn.Linear(shared_fc_dim, n_valence_classes)

        self.head_arousal_reg: nn.Linear | None = None
        self.head_valence_reg: nn.Linear | None = None
        if enable_regression:
            self.head_arousal_reg = nn.Linear(shared_fc_dim, 1)
            self.head_valence_reg = nn.Linear(shared_fc_dim, 1)

        self.head_genre: nn.Linear | None = None
        if n_genre_classes > 0:
            self.head_genre = nn.Linear(shared_fc_dim, n_genre_classes)

    def _prepare_input(self, x: torch.Tensor) -> torch.Tensor:
        """Convert CNN-format input to AST-format.

        AST expects (B, 1024, 128) — 1024 time frames × 128 mel bins.
        Our spectrograms are (B, 1, 128, T) where T varies (~430 for 10s).
        We pad or truncate to 1024 time frames.

        Args:
            x: (B, 1, n_mels, T) log-mel spectrogram

        Returns:
            (B, 1024, n_mels) tensor ready for AST
        """
        # (B, 1, F, T) → (B, F, T) → (B, T, F)
        out = x.squeeze(1).transpose(1, 2)  # (B, T, F)
        t = out.shape[1]
        target_t = 1024
        if t < target_t:
            # Pad with zeros on the time axis
            pad = torch.zeros(
                out.shape[0], target_t - t, out.shape[2],
                device=out.device, dtype=out.dtype,
            )
            out = torch.cat([out, pad], dim=1)
        elif t > target_t:
            out = out[:, :target_t, :]
        return out

    def _get_cls_embedding(self, x: torch.Tensor) -> torch.Tensor:
        """Run AST and return CLS token embedding.

        Args:
            x: (B, 1, n_mels, T) input

        Returns:
            (B, hidden_dim) CLS embedding
        """
        input_values = self._prepare_input(x)
        outputs = self.ast(input_values=input_values)
        # AST returns last_hidden_state: (B, seq_len, hidden_dim)
        # Use CLS token (index 0) as the global representation
        return outputs.last_hidden_state[:, 0, :]

    def forward(self, x: torch.Tensor) -> dict[str, torch.Tensor]:
        """Forward pass.

        Args:
            x: Input tensor of shape (B, C, F, T).

        Returns:
            Dict with keys "segment", "arousal_cls", "valence_cls",
            and optionally "arousal_reg", "valence_reg", "genre".
        """
        cls_emb = self._get_cls_embedding(x)  # (B, 768)
        features = self.shared_fc(cls_emb)  # (B, 256)

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
        """Extract 768-dim CLS embeddings without classification heads.

        Args:
            x: Input tensor of shape (B, C, F, T).

        Returns:
            Embedding tensor of shape (B, 768).
        """
        return self._get_cls_embedding(x)

    def count_params(self) -> int:
        """Count total trainable parameters."""
        return sum(p.numel() for p in self.parameters() if p.requires_grad)

    def get_param_groups(self, lr_backbone: float, lr_head: float) -> list[dict]:
        """Return parameter groups for differential learning rate.

        Args:
            lr_backbone: Learning rate for unfrozen AST layers.
            lr_head: Learning rate for shared FC and task heads.

        Returns:
            List of param group dicts for optimizer.
        """
        backbone_params = []
        head_params = []

        for name, param in self.named_parameters():
            if not param.requires_grad:
                continue
            if name.startswith("ast."):
                backbone_params.append(param)
            else:
                head_params.append(param)

        return [
            {"params": backbone_params, "lr": lr_backbone},
            {"params": head_params, "lr": lr_head},
        ]
