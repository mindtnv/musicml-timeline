# Подготовка данных для обучения

## 1. DEAM (Database for Emotional Analysis of Music)

### Скачивание

DEAM доступен на MediaEval: https://cvml.unige.ch/databases/DEAM/

Нужны:
- **Аудио**: 1802 трека (45-секундные фрагменты) в формате MP3
- **Аннотации**: arousal/valence с шагом 0.5s (per-second annotations)

### Подготовка аннотаций

DEAM предоставляет аннотации в двух форматах. Нужно привести к единому CSV:

```
track_id,time_sec,arousal,valence
2000,0.5,0.42,0.55
2000,1.0,0.44,0.53
...
```

Значения arousal/valence в диапазоне [0, 1] (или [-1, 1] — нормализуем).

Положить файл как `annotations.csv` в директорию DEAM.

### Структура директории DEAM

```
/path/to/DEAM/
  annotations.csv       # track_id, time_sec, arousal, valence
  audio/
    2000.mp3
    2001.mp3
    ...
```

### Запуск подготовки

```bash
source .venv/bin/activate

python scripts/prepare_deam.py \
    --deam-dir /path/to/DEAM \
    --output-dir data/deam \
    --precompute
```

Что происходит:
1. Считывает `annotations.csv`
2. Разбивает треки на train/val/test (70/15/15) по трекам (не окнам)
3. Вычисляет квантильные пороги (33%/66%) из train-окон
4. Сохраняет `splits.json` и обновляет `configs/thresholds.json`
5. `--precompute`: предвычисляет log-mel спектрограммы (.npz)

Результат:
```
data/deam/
  splits.json           # {"train": [...], "val": [...], "test": [...]}
  features/             # предвычисленные .npz (опционально)
    2000.npz
    ...
```

---

## 2. Harmonix Set (структурная сегментация)

### Скачивание

Harmonix Set: https://github.com/urinieto/harmonixset

```bash
git clone https://github.com/urinieto/harmonixset.git /path/to/harmonixset
```

Нужны:
- **Аннотации сегментов**: TSV-файлы в `dataset/segments/`
- **Аудио**: нужно получить отдельно (Harmonix Set не включает аудио)

Формат TSV (boundary annotations):
```
0.0	intro
12.5	verse
25.0	chorus
...
```

### Аудио

Harmonix Set содержит YouTube-идентификаторы треков. Аудио нужно получить самостоятельно и положить в директорию `audio/` с именами, совпадающими с TSV (без расширения).

```
/path/to/harmonixset/
  audio/           # добавить самостоятельно
    0001.mp3
    0002.mp3
    ...
  dataset/
    segments/
      0001.tsv
      0002.tsv
      ...
```

### Запуск подготовки

```bash
python scripts/prepare_structure.py \
    --harmonix-dir /path/to/harmonixset \
    --output-dir data/structure \
    --precompute \
    --audio-dir /path/to/harmonixset/audio
```

Что происходит:
1. Находит все TSV-файлы аннотаций
2. Разбивает треки на train/val/test (70/15/15)
3. Копирует аннотации в `data/structure/annotations/`
4. Выводит распределение классов (Calm/Build-up/Climax/Outro)
5. `--precompute`: предвычисляет log-mel спектрограммы

Маппинг меток:
- chorus, drop -> **Climax**
- bridge, pre-chorus, build, transition, solo -> **Build-up**
- intro, verse, break, interlude, inst -> **Calm**
- outro, ending -> **Outro**

---

## 3. Полный pipeline

```bash
# 1. Активировать окружение
source .venv/bin/activate

# 2. Подготовить данные
python scripts/prepare_deam.py --deam-dir /path/to/DEAM --output-dir data/deam --precompute
python scripts/prepare_structure.py --harmonix-dir /path/to/harmonixset --output-dir data/structure --precompute

# 3. Обучить модель
python scripts/train.py \
    --config configs/default.yaml \
    --deam-dir data/deam \
    --structure-dir data/structure \
    --output-dir checkpoints

# 4. Оценить на тесте
python scripts/eval.py \
    --ckpt checkpoints/best.pt \
    --deam-dir data/deam \
    --structure-dir data/structure \
    --output results/metrics.csv \
    --plot-dir results/plots

# 5. Инференс на новом треке
python scripts/infer.py \
    --audio song.wav \
    --ckpt checkpoints/best.pt \
    --out timeline.json \
    --plot timeline.png

# 6. Ablation-эксперименты (все 4)
python scripts/ablation.py \
    --config configs/default.yaml \
    --deam-dir data/deam \
    --structure-dir data/structure \
    --output-dir results/ablation

# или выборочно:
python scripts/ablation.py \
    --experiments baseline_multitask logmel_chroma_multitask \
    --deam-dir data/deam \
    --structure-dir data/structure \
    --output-dir results/ablation
```

---

## 4. Альтернатива: обучение без предвычисления features

Если не указать `--precompute`, features будут вычисляться на лету при обучении.
Это медленнее, но не требует дискового пространства под `.npz`.

Для on-the-fly вычисления DEAM-датасету нужен `audio_dir`:
```python
DEAMDataset(
    annotations_csv="data/deam/annotations.csv",
    thresholds_json="configs/thresholds.json",
    audio_dir="/path/to/DEAM/audio",
    track_ids=splits["train"],
)
```

---

## 5. Минимальный набор для тестирования pipeline

Если реальные данные ещё не готовы, можно создать минимальный синтетический набор:

```python
# Создать fake DEAM
import pandas as pd, numpy as np, json
track_ids = list(range(1, 11))  # 10 треков
rows = []
for tid in track_ids:
    for t in np.arange(0, 45, 0.5):
        rows.append({"track_id": tid, "time_sec": t,
                      "arousal": np.random.rand(), "valence": np.random.rand()})
pd.DataFrame(rows).to_csv("data/deam/annotations.csv", index=False)
json.dump({"train": [1,2,3,4,5,6,7], "val": [8,9], "test": [10]},
          open("data/deam/splits.json", "w"))
```

Это позволит прогнать весь pipeline на фейковых данных для проверки.
