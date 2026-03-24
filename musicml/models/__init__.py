"""Models subpackage."""

from musicml.models.cnn_multitask import CNNMultiTask
from musicml.models.embedding_models import LinearMultiTask, LSTMMultiTask

__all__ = ["CNNMultiTask", "LinearMultiTask", "LSTMMultiTask"]
