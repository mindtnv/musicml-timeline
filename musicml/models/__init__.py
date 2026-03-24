"""Models subpackage."""

from musicml.models.cnn_multitask import CNNMultiTask
from musicml.models.embedding_models import LinearMultiTask, LSTMMultiTask

__all__ = ["CNNMultiTask", "LinearMultiTask", "LSTMMultiTask", "ASTMultiTask"]


def ASTMultiTask(**kwargs):  # noqa: N802
    """Lazy import to avoid requiring transformers at import time."""
    from musicml.models.ast_multitask import ASTMultiTask as _AST

    return _AST(**kwargs)
