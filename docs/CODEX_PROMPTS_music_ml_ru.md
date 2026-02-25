# Набор промптов для Codex / Claude Codex (пошагово)
Цель: по этим заданиям автоматически сгенерировать код репозитория, повторяя шаги последовательно.
Рекомендация: отправляй **один шаг = один промпт**, проверяй результат, затем следующий шаг.

---

## Шаг 0. Инициализация репозитория
**Промпт:**
Сгенерируй структуру Python‑проекта `musicml` (без внешних данных). Нужны:
- `pyproject.toml` (poetry или uv/pip — выбери один, но без сложностей)
- пакет `musicml/` с `__init__.py`
- подмодули: `features.py`, `postprocess.py`, `utils.py`
- папки: `musicml/models/`, `musicml/datasets/`, `scripts/`, `configs/`
- минимальный `README.md` (как запустить обучение и инференс).
Добавь type hints, docstrings и минимум зависимостей: numpy, librosa, soundfile, torch, sklearn, matplotlib.
Сделай так, чтобы проект можно было импортировать и запустить без датасетов.

Критерии готовности:
- `python -c "import musicml"` работает
- `pip install -e .` работает (или poetry install)

---

## Шаг 1. Извлечение признаков
**Промпт:**
Напиши модуль `musicml/features.py`:
- `load_audio(path: str, sr: int = 22050, mono: bool = True) -> tuple[np.ndarray, int]`
- `compute_log_mel(y: np.ndarray, sr: int, n_fft=2048, hop_length=512, n_mels=128) -> np.ndarray`
- опционально: `compute_chroma`, `compute_mfcc`, `compute_rms`
- `window_features(feat: np.ndarray, window_frames: int, hop_frames: int) -> np.ndarray` возвращает батч окон `N × C × F × T` (для CNN)
Покрой unit‑тестами (pytest) на синтетическом сигнале.
Не используй torch внутри features (только numpy/librosa).

Критерии:
- функции работают на `sine wave`, формы тензоров корректны.

---

## Шаг 2. Dataset: DEAM (эмоции)
**Промпт:**
Создай `musicml/datasets/deam.py` с классом `DEAMDataset(torch.utils.data.Dataset)`.
Требования:
- датасет читает CSV/TSV файл с аннотациями arousal/valence по времени (1 Гц) + путь к аудио.
- режет трек на окна `window_seconds`, шаг `hop_seconds`.
- метки arousal/valence агрегируются по окну (mean).
- дискретизация по квантилям train‑набора: Low/Mid/High (для arousal) и Dark/Neutral/Bright (для valence).
- `__getitem__` возвращает: `x: torch.FloatTensor [C,F,T]`, `y_ar: int`, `y_val: int`, а `y_seg=None`.
Сделай пример скрипта `scripts/prepare_deam.py` который строит квантильные пороги и сохраняет в `configs/thresholds.json`.

Критерии:
- датасет может работать на “игрушечном” CSV (без реального DEAM) и проходит smoke‑test.

---

## Шаг 3. Dataset: структура (SALAMI/Harmonix) через адаптер
**Промпт:**
Сделай модуль `musicml/datasets/structure.py`:
- универсальный класс `StructureDataset` который читает:
  - аудио пути
  - аннотации сегментов (start, end, label) из простого JSON/CSV формата
- реализуй функцию маппинга меток в {Calm, Build-up, Climax, Outro}:
  - chorus/drop->Climax; bridge/pre-chorus/build->Build-up; intro/verse/break->Calm; outro/ending->Outro; unknown->Calm
- режь аудио на окна внутри сегментов (или сами сегменты, если длины нормальные).
- возвращай: `x`, `y_seg: int`, а `y_ar=None`, `y_val=None`

Критерии:
- можно создать маленький synthetic dataset из 1 wav + json аннотаций и обучающий пайплайн не падает.

---

## Шаг 4. Модель CNN мультизадачная
**Промпт:**
Создай `musicml/models/cnn_multitask.py`:
- `CNNMultiTask(nn.Module)` с backbone conv+bn+relu+pool, global avg pooling.
- головы: `seg_head (4)`, `arousal_head (3)`, `valence_head (3)`.
- forward возвращает dict: `{"seg": logits|None, "arousal": logits|None, "valence": logits|None}`.
Добавь функцию `count_params()` и краткую печать модели.

Критерии:
- прогон на случайном тензоре работает; размеры выходов корректные.

---

## Шаг 5. Тренировка (multi-dataset)
**Промпт:**
Напиши `musicml/train.py`:
- поддержка двух даталоадеров: эмоции и структура
- чередование батчей (round-robin)
- loss считается только по доступным таргетам
- логирование: loss по каждой задаче, accuracy по каждой задаче
- сохранение checkpoint: модель + thresholds + config
- конфиг через YAML: sr, window_seconds, hop_seconds, batch_size, lr, epochs, weights (w_seg, w_ar, w_val)
Добавь `scripts/train.py` CLI.

Критерии:
- тренировка запускается на synthetic данных (2 маленьких датасета) и делает 1-2 эпохи без ошибок.

---

## Шаг 6. Инференс и постпроцессинг
**Промпт:**
Сделай `musicml/infer.py`:
- загрузка модели и thresholds
- вычисление признаков на всём треке, нарезка на окна
- получение вероятностей по окнам
- пост‑обработка в сегменты (`musicml/postprocess.py`):
  - сглаживание
  - склейка
  - минимальная длина сегмента
- экспорт `timeline.json`
- опционально: построение `timeline.png` (график сегментов + arousal/valence по времени)

Критерии:
- `infer` работает на одном треке (любой wav) и создаёт JSON.

---

## Шаг 7. Эксперименты и отчётные графики
**Промпт:**
Добавь `scripts/eval.py`:
- оценка эмоций: accuracy, macro-F1
- оценка структуры: window accuracy + boundary F1 с допуском 3 секунды (можно простой вариант)
- сохранение результатов в `results/*.csv`
- генерация графиков (confusion matrix, timeline examples)

Критерии:
- на synthetic данных метрики считаются, код не падает.

---

## Шаг 8. Документация
**Промпт:**
Обнови README:
- как подготовить данные (форматы CSV/JSON)
- как обучить
- как сделать инференс
- как интерпретировать JSON
Добавь `docs/REPORT_OUTLINE.md` — каркас глав отчёта.

Критерии:
- README позволяет воспроизвести pipeline.
