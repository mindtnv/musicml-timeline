"""Smoke tests: verify all modules are importable."""


def test_import_musicml():
    import musicml

    assert hasattr(musicml, "__version__")
    assert musicml.__version__ == "0.1.0"


def test_import_models():
    from musicml.models import CNNMultiTask

    model = CNNMultiTask()
    assert model.count_params() > 0


def test_import_features():
    from musicml import features

    assert callable(features.compute_log_mel)
    assert callable(features.load_audio)
    assert callable(features.window_features)


def test_import_postprocess():
    from musicml.postprocess import Segment, merge_segments, smooth_predictions

    assert callable(smooth_predictions)
    assert callable(merge_segments)
    assert Segment is not None


def test_import_utils():
    from musicml.utils import get_device, load_config, set_seed

    assert callable(set_seed)
    assert callable(get_device)
    assert callable(load_config)


def test_import_datasets():
    from musicml.datasets import deam, structure

    assert hasattr(deam, "DEAMDataset")
    assert hasattr(structure, "SEGMENT_CLASSES")
    assert hasattr(structure, "LABEL_MAP")
    assert len(structure.SEGMENT_CLASSES) == 4
