# Каркас отчёта НИР v2 + план работ

> **Тема**: Модуль автоматического анализа музыкальных композиций на основе мульти-задачного глубокого обучения
> **Университет**: ТвГУ, магистратура
> **Студент**: Антонов М.Д.
> **Научный руководитель**: Кудряшов М.Ю.
> **Защита**: 30.04.2026

---

## Отношение к существующим документам

| Документ | Что переиспользуем |
|---|---|
| `docs/REPORT.md` (578 стр) | Главы 3 (данные), 4 (метод), 5 (эксп. v1/v2), 6 (RQ1-4) — **80% контента** |
| `docs/EXPERIMENT_REPORT.md` (491) | Дублирует REPORT.md — отдельно не нужен |
| `docs/EVAL_PROTOCOL_music_ml_ru.md` | Определения метрик (boundary F1 ±3с, macro-F1) |
| `docs/DATA_PREPARATION.md` | Пайплайн загрузки DEAM/Harmonix |
| `docs/research_design.md` | Формулировки RQ1-RQ4 |
| `docs/MASTER_SPEC_*.md`, `CODEX_PROMPTS_*.md` | Не используем (внутренние, устарели) |

## Что нужно дописать с нуля

1. **Глава 1**: обзор литературы (есть только в outline)
2. **Глава 4.5**: Audio Spectrogram Transformer (AST v2) — финальная модель
3. **Глава 4.7**: Post-processing — Viterbi + position priors
4. **Глава 5.5**: CNN v3 failed retrain — академическая честность
5. **Глава 5.6**: Расширенная сравнительная таблица всех 6 моделей
6. **Глава 5.8**: Ablation post-processing
7. **Глава 6** целиком: Прототип системы (web dashboard)
8. **Глава 7.3**: OOD-ограничения (GTZAN на современной музыке)
9. **Введение и заключение** (пишутся последними)
10. **Приложения** D (UI скриншоты), F (CLI команды)

---

## Полный outline

```
Введение
├─ Актуальность темы
├─ Цель и задачи работы
├─ Объект и предмет исследования
├─ Научная новизна
├─ Практическая значимость
└─ Структура работы

Глава 1. Обзор предметной области
├─ 1.1 Music Information Retrieval (MIR): задачи и подходы
├─ 1.2 Структурная сегментация музыки (Music Structure Analysis)
│   ├─ Классические подходы (SSM, novelty curve)
│   └─ DL-подходы (Ullrich 2014, Wang 2022, Gong 2023)
├─ 1.3 Распознавание эмоций в музыке
│   ├─ Russell circumplex model
│   ├─ DEAM датасет и MediaEval challenge
│   └─ Дискретный vs непрерывный подход
├─ 1.4 Классификация жанров
│   ├─ GTZAN benchmark (Tzanetakis 2002)
│   └─ Современные подходы (FMA, MagnaTagATune)
├─ 1.5 Архитектуры аудио-классификаторов
│   ├─ CNN baseline (VGG-style)
│   ├─ Squeeze-and-Excitation blocks
│   ├─ BiLSTM для temporal modeling
│   ├─ PANNs (CNN14 + AudioSet pretraining)
│   └─ Audio Spectrogram Transformer (AST)
├─ 1.6 Multi-task learning в MIR
└─ 1.7 Pretraining + fine-tuning
    ├─ Transfer learning через AudioSet
    └─ Differential learning rate

Глава 2. Постановка задачи
├─ 2.1 Цель и формальная постановка
├─ 2.2 Исследовательские вопросы (RQ1-RQ5)
└─ 2.3 Обоснование multi-task подхода

Глава 3. Данные
├─ 3.1 Используемые датасеты (DEAM / Harmonix / GTZAN)
├─ 3.2 Извлечение признаков
│   ├─ Log-mel спектрограмма (128 bins)
│   ├─ Окновая нарезка (10s/1s)
│   └─ Глобальная нормализация (mean/std stats.npz)
├─ 3.3 Маппинг меток
│   ├─ Дискретизация arousal/valence (3 класса)
│   └─ 6-классовая таксономия структуры
└─ 3.4 Стратегия train/val/test split

Глава 4. Архитектура и методы
├─ 4.1 Обзор многоархитектурного эксперимента
├─ 4.2 CNN backbone v2
│   ├─ 5 conv blocks (32→64→128→256→512)
│   ├─ Squeeze-and-Excitation
│   └─ Shared FC + 4 task heads
├─ 4.3 CNN+BiLSTM (sequence model)
├─ 4.4 PANNs+Linear / PANNs+BiLSTM
├─ 4.5 Audio Spectrogram Transformer (AST v2) ★ НОВОЕ
│   ├─ Теория: ViT для аудио (Gong 2021)
│   ├─ Pretrained checkpoint: MIT/ast-finetuned-audioset
│   ├─ Fine-tuning стратегия: freeze 8/12 слоёв
│   ├─ Differential learning rate
│   └─ Gradient accumulation (effective batch=64)
├─ 4.6 Multi-task heads + loss
│   ├─ Focal Loss (γ=1.5)
│   ├─ Class weights (inverse frequency, capped)
│   └─ Per-task loss weights
├─ 4.7 Post-processing pipeline ★ НОВОЕ
│   ├─ Median filter (smooth_kernel=5)
│   ├─ Viterbi decoding
│   │   ├─ Transition penalty λ=1.0
│   │   └─ Backtrace для оптимальной последовательности
│   ├─ Musicological position priors
│   │   ├─ Intro penalty вне первых 22% трека
│   │   ├─ Outro penalty вне последних 22%
│   │   └─ Penalty=10 (log-prob)
│   └─ Iterative min-duration merge
└─ 4.8 Inference нормализация

Глава 5. Эксперименты
├─ 5.1 Протокол оценки
│   ├─ Метрики: accuracy, macro-F1, per-class precision/recall
│   └─ Train/val/test splits
├─ 5.2 Гиперпараметры обучения
├─ 5.3 Эксперимент v1 (baseline)
├─ 5.4 Эксперимент v2 (улучшенный) — все 5 архитектур
├─ 5.5 Эксперимент CNN v3 — failed retrain ★ НОВОЕ
│   ├─ Гипотеза: усиленные веса segment task → +5pp
│   ├─ Реальный результат: segment упал 35→22%
│   └─ Анализ: overfitting от агрессивного reweighting
├─ 5.6 Сводная таблица: 6 конфигураций × 4 задачи ★ НОВОЕ
├─ 5.7 Per-class confusion matrices
└─ 5.8 Ablation post-processing (Viterbi с/без priors) ★ НОВОЕ

Глава 6. Прототип системы ★ НОВОЕ ЦЕЛИКОМ
├─ 6.1 Архитектура трёхзвенного приложения
│   ├─ ML API (FastAPI, Python) — port 8000
│   ├─ Backend (Elysia, Bun/TS) — port 3000
│   └─ Frontend (React, Vite/TS) — port 5173
├─ 6.2 Synchronized music dashboard
│   ├─ DashboardContext (rAF playhead, hover, pin)
│   ├─ Time scale via d3-scale
│   ├─ 6 синхронизированных панелей
│   │   ├─ Structure (segment list + canvas timeline)
│   │   ├─ Emotion (arousal/valence + curves)
│   │   ├─ Genre (stacked area + top-3 + dominant strip)
│   │   ├─ AV trajectory (Russell circumplex)
│   │   ├─ Mel-spectrogram (viridis heatmap)
│   │   └─ Summary (pie chart + numeric stats)
│   └─ Shared cursors (playhead, pinned, hover)
├─ 6.3 UX-решения
│   ├─ Russell circumplex по probs, не reg (mitigates bias)
│   ├─ Top-3 жанров с confidence warning (OOD honesty)
│   ├─ Display name heuristics (compound word splitting)
│   ├─ Search + sort + skeletons + empty states
│   └─ Muted academic palette
├─ 6.4 Spectrogram endpoint (downsampled mel JSON)
└─ 6.5 Combined launcher (dev-all.ts)

Глава 7. Анализ результатов
├─ 7.1 Ответы на RQ1-RQ5
├─ 7.2 Финальная модель: AST v2 + Viterbi
│   ├─ Segment: 40.6% (vs 35.3% baseline) → +5.3 пп
│   ├─ Genre: 81.5% (vs 83.9% baseline)
│   └─ Avg по 4 задачам: 58.5% — лучший результат
├─ 7.3 Ограничения системы ★ НОВОЕ
│   ├─ GTZAN out-of-distribution
│   │   ├─ Современная музыка (electronic/lo-fi/phonk)
│   │   ├─ "Classical" как fallback acoustic
│   │   └─ UX-решение: top-3 + warning
│   ├─ Segment accuracy нижний предел
│   │   └─ Mitigation: Viterbi + position priors
│   ├─ Размер AST checkpoint (574 MB)
│   └─ Inference latency (8s на 3-мин трек)
└─ 7.4 Сравнение с SOTA

Заключение
├─ Основные результаты
├─ Научная новизна
└─ Направления дальнейшей работы

Список литературы (35-40 источников)

Приложения
├─ A. Описание датасетов (статистика классов, размеры)
├─ B. Гиперпараметры экспериментов
├─ C. Confusion matrices (PNG из results/plots/)
├─ D. UI скриншоты прототипа ★ НОВОЕ
├─ E. JSON-схема timeline
└─ F. CLI команды (train, eval, infer, serve_ml, dev-all) ★ НОВОЕ
```

**Ожидаемый объём**: 80-100 страниц A4 (Times New Roman 14pt, 1.5 interval).

---

## 15-дневный план работы

| Дни | Дата | Задача | Что выходит |
|---|---|---|---|
| 1 | **15.04** (сегодня) | Аудит + outline + начало главы 1 | Каркас (этот файл) + черновик 1.1-1.4 |
| 2 | 16.04 | Глава 1 (обзор лит.) + Глава 2 (постановка) | ~15 стр |
| 3 | 17.04 | Глава 3 (данные) — адаптация существующего | ~10 стр |
| 4 | 18.04 | Глава 4 (метод) — переработка + AST + post-processing | ~20 стр |
| 5 | 19.04 | Глава 5 (эксперименты) — все 6 моделей + ablation | ~15 стр |
| 6 | 20.04 | Глава 6 (прототип) — целиком новая | ~12 стр |
| 7 | 21.04 | Глава 7, Заключение, Введение, references | ~10 стр |
| 8-9 | 22-23.04 | Вычитка + формат + LaTeX-сборка | Финальный PDF |
| 10-11 | 24-25.04 | Научная статья (выжимка 6-10 стр) | Article PDF |
| 12-13 | 26-27.04 | Презентация (12-18 слайдов) | PPTX |
| 14 | 28-29.04 | Репетиция доклада + правки | — |
| 15 | **30.04** | **Защита** | 🎓 |

**Буфер**: ~2 дня заложено (24-25 для статьи можно сжать до 1 дня).

---

## Текущее распределение готовности

| Глава | Готовность | Источник |
|---|---|---|
| Введение | 0% | пишется после всех глав |
| 1. Обзор | 5% | только outline |
| 2. Постановка | 90% | REPORT.md §1 |
| 3. Данные | 95% | REPORT.md §2 + DATA_PREPARATION.md |
| 4. Архитектура | 60% | REPORT.md §3 + добавить AST + Viterbi |
| 5. Эксперименты | 70% | REPORT.md §5-6 + добавить CNN v3 + ablation |
| 6. Прототип | 0% | новая глава с нуля |
| 7. Анализ | 50% | REPORT.md §6 + добавить OOD |
| Заключение | 0% | пишется последним |
| Приложения | 30% | confusion matrices есть |

**Общая готовность диплома**: ~40%. За 7 дней реально довести до 100%.
