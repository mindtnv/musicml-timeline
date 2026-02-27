# musicml-timeline

Модуль анализа музыкальных композиций: структурная сегментация + распознавание эмоций.

По входному аудиотреку строит временную разметку:
- **Структура:** Calm, Build-up, Climax, Outro
- **Arousal (энергия):** Low, Mid, High
- **Valence (настроение):** Dark, Neutral, Bright

Архитектура — мультизадачная CNN на лог-мел спектрограммах.

## Установка

```bash
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

## Quick Start

### Подготовка данных

```bash
# DEAM (arousal/valence)
python scripts/prepare_deam.py --deam-dir /path/to/DEAM --output-dir data/deam --precompute

# Harmonix Set (структура)
python scripts/prepare_structure.py --harmonix-dir /path/to/harmonixset --output-dir data/structure --precompute
```

### Обучение

```bash
python scripts/train.py --config configs/default.yaml \
    --deam-dir data/deam --structure-dir data/structure \
    --output-dir checkpoints
```

### Инференс

```bash
python scripts/infer.py --audio song.wav --ckpt checkpoints/best.pt \
    --out timeline.json --plot timeline.png
```

### Оценка

```bash
python scripts/eval.py --ckpt checkpoints/best.pt \
    --deam-dir data/deam --structure-dir data/structure \
    --output results/metrics.csv --plot-dir results/plots
```

### Ablation-эксперименты

```bash
python scripts/ablation.py --config configs/default.yaml \
    --deam-dir data/deam --structure-dir data/structure \
    --output-dir results/ablation
```

## Структура проекта

```
musicml/                 # Основной пакет
  __init__.py
  features.py            # Извлечение признаков (log-mel, chroma, MFCC, RMS)
  postprocess.py         # Сглаживание + склейка сегментов
  utils.py               # Seed, device, config
  train.py               # Цикл обучения
  infer.py               # Инференс pipeline
  evaluate.py            # Метрики (accuracy, F1, boundary F1, confusion matrix)
  models/
    cnn_multitask.py     # CNN: backbone + 3 головы
  datasets/
    deam.py              # DEAM dataset (arousal/valence)
    structure.py         # Structure dataset (Harmonix Set)
    multitask.py         # RoundRobinLoader + collate
configs/
  default.yaml           # Все гиперпараметры
  thresholds.json        # Пороги дискретизации arousal/valence
scripts/                 # CLI-скрипты
  prepare_deam.py        # Подготовка DEAM
  prepare_structure.py   # Подготовка Harmonix Set
  train.py               # Обучение
  infer.py               # Инференс
  eval.py                # Оценка
  ablation.py            # Ablation-эксперименты
tests/                   # pytest-тесты
docs/                    # Спецификации и каркас отчёта
results/                 # Метрики и графики
```

## Формат выхода (timeline.json)

```json
{
  "metadata": {
    "duration_sec": 180.0,
    "window_seconds": 8.0,
    "hop_seconds": 1.0
  },
  "segment": [
    {"start": 0.0, "end": 12.0, "label": "Calm", "confidence": 0.82}
  ],
  "arousal": [
    {"start": 0.0, "end": 12.0, "label": "Low", "confidence": 0.74}
  ],
  "valence": [
    {"start": 0.0, "end": 12.0, "label": "Dark", "confidence": 0.61}
  ],
  "frame_predictions": {
    "frame_hop_seconds": 1.0,
    "segment_probs": [[0.82, 0.10, 0.05, 0.03], ...],
    "arousal_probs": [[0.74, 0.20, 0.06], ...],
    "valence_probs": [[0.61, 0.30, 0.09], ...]
  }
}
```

## Тесты

```bash
pytest tests/ -v
ruff check musicml/ scripts/ tests/
```
