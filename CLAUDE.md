# musicml-timeline

Магистерская НИР (ТвГУ) — модуль анализа музыкальных композиций.

## Стек

- Python 3.12, pip + venv
- PyTorch (CNN), librosa (аудио), scikit-learn (метрики)
- numpy, pandas, matplotlib, pyyaml

## Структура

- `musicml/` — основной пакет (features, models, datasets, postprocess, train, infer, evaluate, utils)
- `configs/` — YAML-конфиги с гиперпараметрами
- `scripts/` — CLI-точки входа (prepare_deam, prepare_structure, train, infer, eval, ablation)
- `tests/` — pytest-тесты
- `docs/` — спецификации проекта

## Команды

```bash
# Окружение
source .venv/bin/activate
pip install -e ".[dev]"

# Тесты
pytest tests/ -v

# Линтер
ruff check musicml/ scripts/ tests/
```

## Конвенции

- Все гиперпараметры — в `configs/default.yaml`, не хардкодить
- Тяжёлые зависимости (librosa, torch) — ленивый импорт внутри функций
- `musicml/__init__.py` — только `__version__`, без реэкспорта подмодулей
- Seed фиксируется через `musicml.utils.set_seed()`
- `matplotlib.use('Agg')` для headless-совместимости в infer.py и evaluate.py

## Архитектура модели

- CNN: Conv2D(32->64->128->256) + BN + ReLU + SE-Block + MaxPool + GAP
- SE-Block (Squeeze-and-Excitation) после каждого conv блока
- 3 головы: segment (4 класса), arousal (3 класса), valence (3 класса)
- ~250K параметров, dropout=0.4
- Multi-dataset training: DEAM (эмоции) + Harmonix (структура)
- Поддержка in_channels=1 (log-mel) и in_channels=2 (log-mel + chroma) для ablation

## Обучение

- AdamW + OneCycleLR (warmup 30% + aggressive anneal, step per batch)
- Weighted CrossEntropyLoss (inverse-frequency) + label smoothing=0.1
- Gradient clipping (max_norm=1.0)
- SpecAugment (freq/time masking, training only)
- Feature normalization (global mean/std по train split)
- batch_size=64

## Реализованные Steps

- Step 0: Каркас проекта
- Step 1: Feature extraction pipeline (log-mel, chroma, MFCC, RMS, windowing)
- Step 2: DEAM dataset preparation
- Step 3: Structure dataset preparation (Harmonix Set)
- Step 4: Dataset classes + dataloader (RoundRobinLoader)
- Step 5: Training loop (multi-task, early stopping, cosine scheduler)
- Step 6: Inference pipeline (load_model, extract_features, predict_windows, build_timeline, plot)
- Step 7: Evaluation + metrics (accuracy, macro-F1, confusion matrix, boundary F1)
- Step 8: Ablation experiments (4 эксперимента: baseline, chroma, singletask emotion/structure)
- Step 9: Model quality improvements (SE-blocks, SpecAugment, normalization, weighted loss, AdamW+OneCycleLR)
