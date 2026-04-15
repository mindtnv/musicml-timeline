# Приложения

## Приложение A. Описание датасетов

### A.1 DEAM (Database for Emotional Analysis of Music)

| Характеристика | Значение |
|---|---|
| Источник | MediaEval 2013–2018 challenges, http://cvml.unige.ch/databases/DEAM |
| Лицензия | Creative Commons (треки из Free Music Archive) |
| Размер | 1802 фрагмента × 45 секунд каждый |
| Sample rate | 44100 Гц (мы передискретизируем до 22050 Гц) |
| Аннотации | Покадровые непрерывные arousal/valence (~ 60 фреймов на трек, шаг 500 мс) |
| Inter-annotator agreement (Pearson ρ) | arousal: 0.59, valence: 0.55 |
| Распределение жанров (примерно) | Pop ~25%, Rock ~20%, Electronic ~15%, Classical ~10%, Hip-hop ~8%, Other ~22% |

**Применение в работе.** Используется для обучения голов arousal_cls (3 класса), valence_cls (3 класса), arousal_reg (regression), valence_reg (regression). Дискретизация порогами ±0.2.

### A.2 Harmonix Set

| Характеристика | Значение |
|---|---|
| Источник | Nieto et al., 2019; https://github.com/urinieto/harmonixset |
| Лицензия | Аннотации — MIT, аудио — отсутствует (требуется загрузка через YouTube) |
| Размер исходный | 912 треков с структурной разметкой |
| Размер использован | 743 трека (после загрузки через yt-dlp; 169 удалены с YouTube) |
| Длительность среднего трека | 3:43 |
| Аннотации | Beat positions, downbeats, section labels (17 категорий → сжаты до 6) |
| Inter-annotator agreement | section labels: ~75% |

**Маппинг 17 → 6 классов:**

```
intro, intro_a, intro_b               → Intro
verse, verse_a, verse_b, theme        → Verse
bridge, transition, transition_*      → Bridge
chorus, chorus_a, chorus_b, hook      → Chorus
instrumental, solo, breakdown         → Instrumental
outro, fadeout                        → Outro
```

### A.3 GTZAN

| Характеристика | Значение |
|---|---|
| Источник | Tzanetakis & Cook, 2002; http://marsyas.info/downloads/datasets.html |
| Лицензия | Public domain (academic use) |
| Размер | 1000 файлов wav, 30 секунд каждый |
| Sample rate | 22050 Гц (mono) |
| Жанры | blues, classical, country, disco, hiphop, jazz, metal, pop, reggae, rock (по 100 треков) |
| Использовано | 999 (один файл повреждён) |
| Известные дубликаты | ~5% |

## Приложение B. Гиперпараметры экспериментов

### B.1 Финальная конфигурация (default.yaml для CNN/PANNs/BiLSTM)

```yaml
audio:
  sr: 22050
  mono: true

features:
  mode: "log_mel"
  n_fft: 2048
  hop_length: 512
  win_length: 2048
  n_mels: 128
  fmin: 30.0
  fmax: null

windowing:
  window_seconds: 10.0
  hop_seconds: 1.0

model:
  in_channels: 1
  n_segment_classes: 6
  n_arousal_classes: 3
  n_valence_classes: 3
  n_genre_classes: 10
  dropout: 0.4
  backbone_dropout: 0.25
  enable_regression: true

training:
  seed: 42
  lr: 1.0e-3
  weight_decay: 5.0e-4
  batch_size: 64
  epochs: 50
  early_stopping_patience: 15
  scheduler: cosine_warm_restarts
  loss_type: focal
  focal_gamma: 1.5
  mixup_alpha: 0.2
  max_class_weight: 2.5

spec_augment:
  freq_mask: 27
  time_mask: 60
  n_masks: 2

loss_weights:
  segment: 1.5
  arousal_cls: 1.0
  valence_cls: 1.0
  arousal_reg: 0.5
  valence_reg: 0.5
  genre: 1.0

postprocess:
  smooth_kernel: 5
  min_segment_duration: 4.0
  use_viterbi: true
  transition_penalty: 1.0
  use_position_priors: true
  smooth_kernel_segment: 5
  min_segment_duration_segment: 6.0
```

### B.2 AST v2 (ast.yaml)

Отличается от default следующим:

```yaml
architecture: "ast"

model:
  pretrained_model: "MIT/ast-finetuned-audioset-10-10-0.4593"
  freeze_layers: 8
  hidden_dim: 768
  shared_fc_dim: 256
  dropout: 0.3

training:
  lr: 5.0e-5         # backbone
  lr_head: 1.0e-3    # heads
  batch_size: 16
  grad_accumulation_steps: 4
  epochs: 30
  early_stopping_patience: 10
  weight_decay: 0.01
```

### B.3 CNN v3 (failed experiment, cnn_v3.yaml)

Отличается от default только следующим:

```yaml
training:
  focal_gamma: 2.5            # 1.5 в default
  max_class_weight: 3.5       # 2.5 в default

loss_weights:
  segment: 3.5                # 1.5 в default
```

## Приложение C. Confusion matrices

См. графические результаты в `results/plots/`:

- `confusion_segment_cnn_v2.png` — CNN v2, сегментная задача
- `confusion_segment_ast_v2.png` — AST v2, сегментная задача (для сравнения)
- `confusion_arousal_v2.png`, `confusion_valence_v2.png`, `confusion_genre_v2.png` — для CNN v2
- `comparison_4tasks.png` — сравнение 6 моделей по 4 задачам в виде гистограммы
- `delta_v1_v2.png` — изменения метрик v1 → v2

## Приложение D. Скриншоты прототипа

Снимки экрана веб-прототипа (можно делать через preview_screenshot или браузерную консоль):

1. **Главная страница** — список треков с поиском, кнопкой загрузки.
2. **Dashboard трека** (Dynamite) — все 6 панелей: структура, эмоции, AV-trajectory, жанр, спектрограмма, сводка.
3. **Top-3 жанров с warning** — пример low-confidence классификации с жёлтой плашкой.
4. **AV-trajectory с кометой** — Russell circumplex с движущейся точкой и шлейфом за последние 20 секунд.
5. **Mel-spectrogram** — viridis-окрашенная спектрограмма на 3-минутном треке.
6. **Loading skeletons** — пример отображения skeleton-screens во время загрузки.

## Приложение E. JSON-схема timeline

Структура ответа `/api/tracks/:id`:

```json
{
  "id": "uuid-string",
  "filename": "uuid-string.mp3",
  "originalName": "0375_dynamite.mp3",
  "status": "ready",
  "createdAt": "2026-04-15T...",
  "timeline": {
    "metadata": {
      "duration_sec": 204.1,
      "window_seconds": 10.0,
      "hop_seconds": 1.0
    },
    "segment": [
      { "start": 0.0, "end": 8.0, "label": "Chorus", "confidence": 0.63 },
      { "start": 8.0, "end": 24.0, "label": "Verse", "confidence": 0.54 },
      ...
    ],
    "arousal": [ /* same shape */ ],
    "valence": [ /* same shape */ ],
    "genre":   [ /* same shape */ ],
    "frame_predictions": {
      "frame_hop_seconds": 1.0,
      "segment_probs": [[0.18, 0.13, 0.05, 0.11, 0.11, 0.41], ...],
      "arousal_probs": [[0.06, 0.27, 0.67], ...],
      "valence_probs": [[0.06, 0.40, 0.53], ...],
      "genre_probs":   [[0.05, 0.10, ...], ...],
      "arousal_reg":   [0.36, 0.38, 0.41, ...],
      "valence_reg":   [0.42, 0.45, 0.50, ...]
    },
    "audio_features": {
      "tempo_bpm": 123.0,
      "key": { "key": "F", "mode": "Minor", "confidence": 0.78 }
    }
  }
}
```

## Приложение F. CLI-команды для воспроизведения

### F.1 Подготовка данных

```bash
# Активация окружения
source .venv/bin/activate          # Linux/Mac
.venv/Scripts/activate             # Windows

# DEAM
python scripts/prepare_deam.py --data-dir data/deam

# Harmonix (требует yt-dlp + ffmpeg)
python scripts/download_harmonix_audio.py --data-dir data/structure
python scripts/prepare_structure.py --data-dir data/structure

# GTZAN
python scripts/prepare_gtzan.py --data-dir data/gtzan
```

### F.2 Обучение моделей

```bash
# CNN v2 (default)
python scripts/train.py \
    --config configs/default.yaml \
    --deam-dir data/deam --structure-dir data/structure --gtzan-dir data/gtzan \
    --output-dir checkpoints/cnn_v2

# AST v2 (финальная)
python scripts/train.py \
    --config configs/ast.yaml \
    --deam-dir data/deam --structure-dir data/structure --gtzan-dir data/gtzan \
    --output-dir checkpoints/ast_v2

# CNN v3 (failed)
python scripts/train.py \
    --config configs/cnn_v3.yaml \
    --deam-dir data/deam --structure-dir data/structure --gtzan-dir data/gtzan \
    --output-dir checkpoints/cnn_v3
```

### F.3 Оценка моделей

```bash
python scripts/eval.py \
    --ckpt checkpoints/ast_v2/best.pt \
    --config configs/ast.yaml \
    --output results/eval_ast_v2.csv \
    --deam-dir data/deam --structure-dir data/structure --gtzan-dir data/gtzan
```

### F.4 Инференс на одном файле

```bash
python scripts/infer.py \
    --audio path/to/song.mp3 \
    --ckpt checkpoints/ast_v2/best.pt \
    --config configs/ast.yaml \
    --output results/timeline.json \
    --plot results/timeline.png
```

### F.5 Запуск веб-прототипа

```bash
# Все три сервиса одной командой:
bun run scripts/dev-all.ts

# Или по отдельности:
python scripts/serve_ml.py --ckpt checkpoints/ast_v2/best.pt --config configs/ast.yaml --port 8000
cd web/backend && bun run dev    # порт 3000
cd web/frontend && bun run dev   # порт 5173
```

Открыть в браузере: `http://localhost:5173`.

### F.6 Тесты и качество кода

```bash
pytest tests/ -v                   # 128 тестов
ruff check musicml/ scripts/ tests/
```
