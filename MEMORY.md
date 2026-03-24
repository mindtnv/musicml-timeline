# MEMORY — История проекта musicml-timeline

## Цель
Магистерская НИР (ТвГУ): multi-task модуль анализа музыкальных композиций.
4 задачи: сегментация структуры (6 кл.), arousal (3 кл.), valence (3 кл.), genre (10 кл.).

## Этап 0–3: Каркас и данные (февраль 2026)
- Создан проект: Python 3.12, PyTorch, librosa, scikit-learn
- Feature extraction: log-mel спектрограммы, chroma, MFCC, RMS, windowing
- Подготовлены 3 датасета:
  - **DEAM** (1802 трека) — arousal/valence аннотации, квантизация в 3 класса
  - **Harmonix Set** (912 треков, 746 с аудио) — структурные сегменты (Intro/Verse/Bridge/Chorus/Instrumental/Outro)
  - **GTZAN** (999 треков) — 10 жанров
- Скрипт download_harmonix_audio.py для скачивания через yt-dlp

## Этап 4–5: Модель и обучение
- CNN с SE-блоками: Conv2D(32→64→128→256) + BN + ReLU + SE + MaxPool + GAP
- Multi-task: 3 головы (segment, arousal/valence classification + regression, genre)
- RoundRobinLoader для чередования батчей из 3 датасетов
- Focal Loss с class weights, label smoothing
- AdamW + OneCycleLR

## Этап 6–7: Inference и Evaluation
- Inference pipeline: load_model → extract_features → predict_windows → build_timeline → plot
- Evaluation: accuracy, macro-F1, per-class precision/recall/F1, confusion matrix

## Этап 8: 2×2 Факторный эксперимент
Дизайн: CNN vs PANNs (features) × per-window vs BiLSTM (temporal)

4 конфигурации:
1. **CNN per-window** — наш CNN backbone, предсказание на каждом окне независимо
2. **CNN+BiLSTM** — CNN embeddings (512-dim) → BiLSTM (2 слоя, hidden=128) → heads
3. **PANNs per-window** — PANNs CNN14 pretrained embeddings (2048-dim) → linear heads
4. **PANNs+BiLSTM** — PANNs embeddings → BiLSTM (hidden=256) → heads

Precomputed embeddings для ускорения обучения конфигов 2-4.

### Результаты v1 (первый запуск, 30 эпох):

| Config | Segment acc/F1 | Arousal acc/F1 | Valence acc/F1 | Genre acc/F1 |
|--------|---------------|----------------|----------------|--------------|
| CNN | 24.3/23.1 | 65.9/65.3 | 55.8/53.4 | 82.7/81.9 |
| CNN+LSTM | 25.9/26.8 | 53.0/51.8 | 49.5/48.4 | 45.5/42.5 |
| PANNs | 23.2/20.5 | 60.9/61.4 | 54.3/52.7 | 81.6/81.2 |
| PANNs+LSTM | 31.4/31.5 | 62.8/62.9 | 55.9/56.0 | 81.0/80.5 |

**Проблемы v1:**
- Segment ~24% — модель подавляла мажоритарные классы (Verse recall=10%, Chorus recall=18%) из-за max_class_weight=4.0
- CNN+LSTM катастрофически плох на genre (45%) — overfitting на маленьком train set
- Valence neutral recall=28%

## Этап 9: Улучшение модели (Этап 14 в нумерации)

Диагностика и 5 направлений улучшения:

1. **Увеличение backbone**: 4→5 conv блоков (channels: 32→64→128→256→512), shared FC layer (512→256), ~800K params (было ~400K)
2. **Балансировка классов**: max_class_weight 4.0→2.5, focal_gamma 2.0→1.5
3. **Контекстное окно**: window_seconds 8.0→10.0
4. **Аугментация**: temporal jitter ±1.0s в DEAM и Structure datasets
5. **Планировщик**: CosineAnnealingWarmRestarts (T_0=10, T_mult=2) для CNN baseline; segment loss weight 1.0→1.5

### Результаты v2 (после улучшений, 50 эпох):

| Config | Segment acc/F1 | Arousal acc/F1 | Valence acc/F1 | Genre acc/F1 |
|--------|---------------|----------------|----------------|--------------|
| **CNN** | **35.3/29.5** | 62.0/61.0 | 51.7/51.1 | **83.9/83.3** |
| **CNN+LSTM** | **32.2/31.6** | **62.3/62.4** | **54.2/53.3** | **60.9/62.0** |
| PANNs | 24.0/21.7 | 61.2/61.6 | 53.8/53.3 | 81.9/81.4 |
| **PANNs+LSTM** | **32.9/32.7** | **64.9/64.0** | 55.0/53.0 | 77.7/77.9 |

**Ключевые улучшения v1→v2:**
- CNN segment: 24.3→35.3% (+11.0%) — Verse recall 10→28%, Chorus recall 18→40%
- CNN+LSTM genre: 45.5→60.9% (+15.4%) — всё ещё слабо, но значительный рост
- CNN+LSTM arousal: 53.0→62.3% (+9.3%)
- PANNs+LSTM segment: 31.4→32.9% (+1.5%)

**Лучшие конфиги по задачам:**
- Segment: CNN per-window (35.3%)
- Arousal: PANNs+LSTM (64.9%)
- Valence: PANNs+LSTM v1 (55.9%) / PANNs+LSTM v2 (55.0%)
- Genre: CNN per-window (83.9%)

## Этап 10: AST (Audio Spectrogram Transformer)

Добавлен 5-й конфиг: pretrained AST (MIT/ast-finetuned-audioset, 85M params).
- freeze_layers: 10 из 12 (fine-tune только 2 верхних + heads)
- Differential LR: backbone 5e-5, heads 1e-3
- hop_seconds=5.0 (вместо 1.0) для ускорения — 1335 батчей/эпоха вместо 9894
- 14.4M trainable params
- Обучение: 8 эпох (early stopping patience=4), ~108 мин

### Результаты AST:

| Checkpoint | Segment acc/F1 | Arousal acc/F1 | Valence acc/F1 | Genre acc/F1 |
|------------|---------------|----------------|----------------|--------------|
| AST last | **40.3/31.5** | 61.9/61.9 | 48.8/49.0 | 81.1/79.7 |
| AST best | 33.0/28.2 | 59.9/60.0 | 51.6/51.9 | 81.3/80.4 |

**Segment 40.3% — лучший результат проекта** (+5.0% над CNN v2).
Но arousal/valence/genre не улучшились — переобучение (train acc 96-100%, val ~60%).
Причина: hop=5.0 уменьшил train set в 5x, pretrained модели чувствительны к объёму данных.

## Итоговая сводка лучших результатов

| Задача | Лучший конфиг | Accuracy | F1 | vs Random |
|--------|--------------|----------|----|-----------|
| Segment (6 кл.) | **AST last** | **40.3%** | 31.5% | ×2.4 |
| Arousal (3 кл.) | PANNs+LSTM v2 | **64.9%** | 64.0% | ×1.9 |
| Valence (3 кл.) | PANNs+LSTM v1 | **55.9%** | 56.0% | ×1.7 |
| Genre (10 кл.) | CNN v2 | **83.9%** | 83.3% | ×8.4 |

## Нерешённые проблемы
- Segment 40% — лучше, но абсолютно невысоко для 6 классов
- Valence ~55% — нейтральный класс плохо различается
- AST переобучается из-за малого train set (hop=5.0)
- BiLSTM конфиги слабее per-window на genre (переобучение)
- PANNs per-window не дал преимущества над обученным CNN

## Технические проблемы и решения
- yt-dlp: ffmpeg не найден в venv → pip install imageio-ffmpeg
- PANNs embeddings для Structure: аудио не скачано → download first
- CNN embeddings 256→512 dim: старые файлы не перезаписывались (skip if exists) → rm + recompute
- Early stopping выбирал не лучшую модель для segment → использован last.pt вместо best.pt

## Файловая структура результатов
- `results/eval_cnn.csv` — CNN v1
- `results/eval_cnn_v2_last.csv` — CNN v2 (лучший)
- `results/eval_cnn_lstm.csv` / `eval_cnn_lstm_v2.csv` — CNN+BiLSTM v1/v2
- `results/eval_panns_linear.csv` / `eval_panns_linear_v2.csv` — PANNs v1/v2
- `results/eval_panns_lstm.csv` / `eval_panns_lstm_v2.csv` — PANNs+BiLSTM v1/v2
- `checkpoints/last.pt` — лучший CNN backbone (v2)
- `checkpoints/cnn_lstm/best.pt` — лучший CNN+BiLSTM
- `checkpoints/panns_linear/best.pt` — лучший PANNs linear
- `checkpoints/panns_lstm/best.pt` — лучший PANNs+BiLSTM
- `checkpoints/ast/last.pt` — лучший AST (segment 40.3%)
- `results/eval_ast_best.csv` / `eval_ast_last.csv` — AST eval
- `logs/ast_train.log` / `ast_train_resume.log` — логи обучения AST
