# Глава 6. Прототип системы

В рамках работы реализован полнофункциональный веб-прототип, демонстрирующий практическое применение разработанной модели. Прототип принимает на вход аудиофайл произвольного формата (MP3, WAV, FLAC, OGG), выполняет полный анализ через AST v2 + post-processing pipeline и отображает результаты в виде синхронизированного дашборда с шестью аналитическими панелями. Архитектура построена по принципу **трёхзвенного приложения**: Python-сервис ML inference, TypeScript-сервис управления данными, React-фронтенд. Дашборд использует кастомный фреймворк синхронизации на базе React Context + d3-scale, что обеспечивает плавную одновременную анимацию воспроизведения на всех панелях.

## 6.1 Архитектура веб-приложения

### 6.1.1 Трёхзвенная структура

Прототип состоит из трёх независимых сервисов, соединённых REST-API:

```
┌─────────────────┐    HTTP    ┌──────────────────┐   HTTP    ┌─────────────────┐
│  Frontend       │ ─────────► │  Backend         │ ────────► │  ML API         │
│  React + Vite   │            │  Elysia + Bun    │           │  FastAPI        │
│  port 5173      │ ◄───────── │  port 3000       │ ◄──────── │  port 8000      │
└─────────────────┘            └──────────────────┘           └─────────────────┘
                                       │
                                       ▼
                                ┌──────────────┐
                                │  uploads/    │
                                │  data/*.json │
                                └──────────────┘
```

**ML API (Python, FastAPI, port 8000).** Содержит загруженную в память модель AST v2 (574 МБ checkpoint). Endpoints:

- `POST /analyze` — принимает audio multipart upload, возвращает JSON timeline с полным анализом (segment, arousal, valence, genre + frame_predictions).
- `POST /spectrogram` — возвращает downsampled mel-спектрограмму как 2D-массив для отображения.
- `GET /health` — health check для мониторинга.

**Backend (TypeScript, Elysia, Bun runtime, port 3000).** Управляет жизненным циклом треков и пользовательскими uploads. Endpoints:

- `POST /api/tracks` — создаёт новый трек из загружаемого файла.
- `GET /api/tracks` — список всех треков с метаданными.
- `GET /api/tracks/:id` — детали конкретного трека (включая timeline).
- `POST /api/tracks/:id/analyze` — запускает анализ трека через ML API, сохраняет результат.
- `GET /api/tracks/:id/audio` — отдаёт аудиофайл для воспроизведения в браузере.
- `GET /api/tracks/:id/spectrogram` — проксирует запрос к ML API + кэширует результат в RAM.
- `DELETE /api/tracks/:id` — удаляет трек и связанные файлы.

Хранение: треки сохраняются как JSON-файлы в `web/backend/data/`, аудио — в `web/backend/uploads/`. База данных не используется — для прототипа достаточно файловой системы.

**Frontend (TypeScript, React 19, Vite, port 5173).** Двухстраничное SPA:

- `/` — список загруженных треков с поиском и сортировкой, форма upload.
- `/tracks/:id` — дашборд анализа трека (главное представление).

### 6.1.2 Объединённый запуск (dev-all.ts)

Для упрощения разработки реализован Bun-скрипт `scripts/dev-all.ts`, запускающий все три сервиса параллельно:

```typescript
const services = [
  { name: "ml-api",   cwd: ROOT,             cmd: ["python", "scripts/serve_ml.py", ...] },
  { name: "backend",  cwd: "web/backend",    cmd: ["bun", "run", "dev"] },
  { name: "frontend", cwd: "web/frontend",   cmd: ["bun", "run", "dev"] },
];
for (const svc of services) {
  const p = spawn({ cmd: svc.cmd, cwd: svc.cwd, ... });
  prefixStream(p.stdout, svc.name, svc.color);  // [ml-api] / [backend] / [frontend]
}
```

Запуск всего стека одной командой `bun run scripts/dev-all.ts` или через preview-конфиг `musicml`. Логи с цветными префиксами облегчают debugging.

## 6.2 Synchronized music dashboard

Главное технологическое решение прототипа — **синхронизированный дашборд** из шести аналитических панелей, разделяющих общее представление о времени. Курсор воспроизведения (playhead) одновременно движется по всем панелям, hover на любой панели подсвечивает соответствующий момент времени на остальных, клик ставит «закладку» (pinned cursor), сохраняющуюся пока пользователь её не снимет.

### 6.2.1 Архитектурный фреймворк синхронизации

Реализован собственный лёгкий фреймворк на основе React Context + d3-scale. Базовые компоненты:

**`DashboardContext`** — провайдер общего состояния:

```typescript
interface DashboardState {
  duration: number;             // длительность трека
  playheadTime: number;         // текущая позиция воспроизведения
  hoverTime: number | null;     // наведение мыши (null = вне области)
  pinnedTime: number | null;    // зафиксированный курсор
  isPlaying: boolean;
  seek(t: number): void;
  setHoverTime(t: number | null): void;
  setPinnedTime(t: number | null): void;
  togglePlay(): void;
}
```

Provider запускает rAF-loop (`requestAnimationFrame`), обновляющий `playheadTime` 60 раз в секунду в течение воспроизведения. Все панели подписываются через хук `useDashboard()`.

**`useTimeScale(containerRef, padding)`** — хук для конвертации time → pixel в каждой панели. Использует `scaleLinear` из d3-scale + `ResizeObserver` для перерасчёта при изменении размеров контейнера:

```typescript
const ts = useTimeScale(containerRef, paddingLeft, paddingRight);
const pixelX = ts.scale(timeInSeconds);     // time → pixel
const time = ts.invert(pixelXFromMouse);    // pixel → time
```

**`ChartFrame`** — обёртка-контейнер для каждой панели. Принимает `height` и render-prop с измеренным `timeScale`:

```jsx
<ChartFrame height={120}>
  {({ timeScale, width, height }) => (
    <MyCustomCanvas timeScale={timeScale} width={width} height={height} />
  )}
</ChartFrame>
```

Внутри ChartFrame обрабатываются click (→ `seek` + `setPinnedTime`), mousemove (→ `setHoverTime`), mouseleave (→ `setHoverTime(null)`). Поверх вынесён компонент `TimeCursor`, рисующий три типа курсоров (см. §6.2.3).

### 6.2.2 Шесть аналитических панелей

**Панель 1: Структура композиции (`StructurePanel`).** Отображает результат сегментации:

- Цветная полоска (canvas) с делением на сегменты по времени, метки внутри широких сегментов.
- Список всех сегментов справа с временами и confidence (`Куплет 0:08 → 0:24, 54%`).
- Клик на сегмент в списке — seek в соответствующее время + pin курсора.

**Панель 2: Эмоциональный анализ (`EmotionPanel`).** Совмещает классификацию и регрессию:

- Две короткие полоски-таймлайна: arousal (Low/Mid/High) и valence (Dark/Neutral/Bright) с цветовой кодировкой.
- Под ними — кривая регрессионных значений arousal_reg и valence_reg во времени (canvas), с сеткой по горизонтали.
- Легенда: красная линия — Arousal, фиолетовая — Valence.

**Панель 3: Эмоциональная траектория (`AVTrajectory`).** 2D-визуализация Russell circumplex:

- Квадрат 320×320 с разделением на 4 квадранта (Злое/Радостное/Грустное/Умиротворённое).
- Горизонтальная ось — Valence, вертикальная — Arousal.
- Серая полупрозрачная линия — траектория за весь трек.
- Красный «комет» — последние 20 секунд траектории с градиентом opacity (свежие точки ярче, старые тусклые).
- Красная точка с свечением — текущий моменtы воспроизведения.
- Справа — числовые значения Valence и Arousal в текущей точке.

Использование классификационных вероятностей вместо регрессии для координат:

$$
x_{\text{val}} = 0.5 + 0.5 \cdot \big( P(\text{Bright}) - P(\text{Dark}) \big), \quad
y_{\text{aro}} = 0.5 + 0.5 \cdot \big( P(\text{High}) - P(\text{Low}) \big).
$$

Регрессионные предсказания смещены к центру (систематический bias модели) — все треки скапливались бы в квадранте «Грустное». Классификационная разность даёт сбалансированное распределение по всему квадранту.

**Панель 4: Жанр композиции (`GenrePanel`).** Многоуровневое представление:

- **Сверху**: топ-3 жанров с прогресс-барами (`1. Поп 47%  2. Рок 23%  3. Хип-хоп 18%`). Каждый бар окрашен соответствующим жанровым цветом, ширина — пропорциональна вероятности.
- **Warning при низкой уверенности**: если top-1 < 45%, показывается жёлтая плашка «Низкая уверенность классификации. Трек вероятно вне 10 классов GTZAN (electronic, ambient, lo-fi и т.п.)».
- **Strip timeline**: цветная полоска dominant genre по времени.
- **Stacked area chart**: полная stacked area всех 10 жанров с d3-shape.stack (toggle через checkboxes легенды).

Top-3 + warning — ключевое UX-решение, адресующее out-of-distribution проблему GTZAN (см. §7.3).

**Панель 5: Мел-спектрограмма (`SpectrogramPanel`).** Отображение «входа модели»:

- Canvas 128 × T пикселей с viridis-окраской: тёмно-фиолетовый = тишина, синий = низкая энергия, зелёный = средняя, жёлтый = высокая.
- Низкие частоты внизу, высокие сверху.
- Применена gamma-коррекция (γ=0.4) для compensации сжатого dynamic range log-мел.
- Источник данных: endpoint `/spectrogram` ML API возвращает downsampled (max 512 frames) JSON-массив; frontend строит ImageData через viridis LUT и отрисовывает на canvas.

Эта панель академически ценна — она показывает **что именно «видит» модель** в качестве входа, превращая black box в интерпретируемое представление.

**Панель 6: Сводка (`SummaryPanel`).** Числовые статистики:

- Pie chart распределения времени по типам сегментов (`Куплет 35%, Припев 28%, Бридж 12%, ...`).
- Доминирующий жанр + confidence.
- Темп BPM (из librosa beat tracking).
- Тональность (из librosa key estimation).
- Средняя энергия (mean over arousal_probs derived score, см. §6.3).
- Среднее настроение (то же для valence_probs).
- Количество структурных переходов.

### 6.2.3 Shared cursor layer

Поверх каждой панели вынесен компонент `TimeCursor`, рисующий до трёх вертикальных линий:

| Тип | Цвет | Стиль | Появление |
|---|---|---|---|
| **Playhead** | Красный (#dc2626) | 2px solid + glow | Всегда видим во время воспроизведения |
| **Pinned** | Синий (#2563eb) | 1.5px solid + label со временем | После клика, до явной отмены |
| **Hover** | Синий (#2563eb) | 1px dashed | Только при наведении мыши |

Все три используют общий `useDashboard()` + `useTimeScale()` — один источник правды, три типа отображения. При воспроизведении playhead движется на 60 fps плавно через rAF-обновления `playheadTime`.

## 6.3 Ключевые UX-решения

### 6.3.1 Top-3 жанров + confidence warning

Стандартная «правильная» подача жанровой классификации — показать top-1 с процентом. Это создаёт ложное впечатление уверенности модели на любых аудио, включая out-of-distribution (современная электроника, lo-fi, phonk не входят в 10 классов GTZAN).

Реализованное решение:

1. **Показ top-3** — пользователь видит, что модель не уверена и колеблется между несколькими жанрами.
2. **Confidence warning** при top-1 < 45% — явное информирование о низкой уверенности.
3. **Подпись к панели** «Классификация в 10 жанров GTZAN-2002. Современные жанры (electronic, indie, lo-fi и др.) сопоставляются с ближайшим» — устанавливает realistic expectations.

Это повышает доверие к системе через **академическую честность**: лучше показать «не уверен», чем уверенно ошибиться.

### 6.3.2 Russell circumplex по классификации, не регрессии

Изначальная реализация использовала arousal_reg и valence_reg как координаты — это привело к тому, что **все треки оседали в квадранте «Грустное»** (low arousal, low valence). Причина: регрессионные head обучены MSE-loss и систематически смещены к среднему распределения (центр шкалы).

Решение — использовать **классификационную разность** $P(\text{positive}) - P(\text{negative})$, центрированную в [0, 1]. Это даёт сбалансированное распределение по всему квадранту, точно отражающее эмоциональную динамику трека (см. §6.2.2).

### 6.3.3 Display name эвристика

Имена файлов в датасетах часто нечитабельны: `0375_dynamite.mp3`, `blues.00005.wav`, `01 Falling in Reverse - Ronald.mp3`. Реализована эвристика очистки в `displayName.ts`:

| Вход | Выход |
|---|---|
| `0375_dynamite.mp3` | `Dynamite` |
| `0017_badromance.mp3` | `Bad Romance` |
| `0356_californiagurls.mp3` | `California Gurls` |
| `01 Falling in Reverse - Ronald.mp3` | `Falling In Reverse — Ronald` |
| `blues.00005.wav` | `Blues #00005` |
| `2.mp3` | `Трек #2` |

Алгоритм: (1) убрать расширение и числовой префикс, (2) распознать GTZAN-формат `genre.NNNNN`, (3) для compound-имён применить DP-сегментацию по словарю общих английских слов. DP с штрафом за лишние сплиты предотвращает ложное разбиение типа `californiagurls → c a l i for n i a gurls`.

### 6.3.4 Loading skeletons и empty states

Для уменьшения perceived latency реализованы skeleton-screens, имитирующие layout реальных компонентов:

- **TrackListSkeleton** — 5 placeholder-карточек с shimmer-анимацией для списка треков.
- **DashboardSkeleton** — placeholder для dashboard-страницы (header + player + 6 панелей в правильном grid-layout).

Пользователь видит структуру UI до загрузки данных — это снижает ощущение «зависания» по сравнению с пустым экраном с текстом «Загрузка...».

Empty state списка треков содержит иллюстрацию (SVG с нотным символом), заголовок «Треков пока нет» и инструкцию по загрузке — превращая «пустоту» в onboarding-момент.

### 6.3.5 Поиск и сортировка треков

Список треков снабжён toolbar с:

- **Search input** с иконкой и кнопкой очистки. Поиск по: display name, original name, label жанра, русскому переводу жанра.
- **Sort dropdown**: Recent (по умолчанию), По названию, По длительности, По жанру.

Это критично, когда пользователь загрузил 20+ треков — без поиска ориентация в списке невозможна.

### 6.3.6 Приглушённая палитра

Изначальные цветовые карты сегментов/эмоций/жанров использовали насыщенные цвета (Material Design 500). При одновременном отображении 6 панелей это создавало ощущение хаоса. Палитра переработана на **приглушённую** (Tableau 10 muted):

```css
SEGMENT: #94a3b8, #64748b, #2563eb, #7c3aed, #0ea5e9, #475569
AROUSAL: #93c5fd → #cbd5e1 → #f87171  (cold-warm divergent)
VALENCE: #6366f1 → #cbd5e1 → #fbbf24  (dark-bright divergent)
GENRE:   Tableau 10 muted hand-picked
```

Один синий акцент `#2563eb` для интерактивных элементов (PIN cursor, кнопки), один красный `#dc2626` для playhead. Это даёт визуальную coherence уровня академических dashboards (Grafana, Datadog).

## 6.4 Endpoint мел-спектрограммы

Для отображения панели Mel-Spectrogram в ML API добавлен endpoint `POST /spectrogram`:

```python
@app.post("/spectrogram")
async def spectrogram(file: UploadFile = File(...)):
    audio, sr = load_audio(audio_path, sr=22050)
    mel = compute_log_mel(audio, sr=sr, n_mels=128, hop_length=512)
    # Downsample T → max 512 frames для размера payload
    if mel.shape[1] > 512:
        idx = (np.arange(512) * mel.shape[1] / 512).astype(int)
        mel = mel[:, idx]
    # Normalize 0..1 для viridis colormap на frontend
    mel_norm = (mel - mel.min()) / (mel.max() - mel.min() + 1e-6)
    return {"mel": np.round(mel_norm, 3).tolist(), "n_mels": 128, ...}
```

Backend проксирует запрос с in-memory кэшированием (`Map<trackId, spectrogramData>`). На frontend данные отрисовываются на canvas через precomputed viridis LUT (256 entries):

```typescript
// Build viridis LUT once
const lut = new Uint8Array(256 * 3);
const tmpCtx = document.createElement("canvas").getContext("2d");
for (let i = 0; i < 256; i++) {
  tmpCtx.fillStyle = interpolateViridis(i / 255);
  tmpCtx.fillRect(i, 0, 1, 1);
}
const lutData = tmpCtx.getImageData(0, 0, 256, 1).data;
// ... copy RGB into lut

// Render: для каждого пикселя берём mel value → LUT index → RGB
const pixelValue = Math.pow(melRow[x], 0.4);  // gamma correction
const lutIdx = Math.round(pixelValue * 255);
img.data[idx] = lut[lutIdx * 3];     // R
img.data[idx+1] = lut[lutIdx * 3 + 1]; // G
img.data[idx+2] = lut[lutIdx * 3 + 2]; // B
```

Gamma-коррекция (γ=0.4) брайтит средние значения, делая структуру спектрограммы видимой (без неё большая часть пикселей выглядела чёрной из-за компрессированного dynamic range log-mel).

## 6.5 Технологический стек и обоснование

| Слой | Технология | Обоснование |
|---|---|---|
| ML inference | Python 3.12 + PyTorch + FastAPI | Прямое использование checkpoint из обучения, минимум зависимостей |
| Backend | Bun + Elysia + TypeScript | Быстрый старт (~100 мс), нативная поддержка TypeScript, простой API |
| Frontend | React 19 + Vite + TypeScript | Стандарт индустрии, быстрый dev-server, hot reload |
| Визуализация | d3-scale + d3-shape + d3-scale-chromatic | Лёгкие модули d3 (~10 КБ) для scales, area paths и colormaps |
| Стили | Plain CSS с CSS variables | Без UI-фреймворка — полный контроль над академическим стилем |
| State management | React Context (DashboardContext) | Достаточно для прототипа, нет нужды в Redux/Zustand |

Альтернативы (рассмотрены и отвергнуты):

- **Redux/Zustand для state** — overkill для двух страниц.
- **TailwindCSS** — слишком много шаблонной разметки в classNames.
- **Recharts/Visx** — недостаточная гибкость для синхронизированного playhead через все панели.
- **Node.js backend вместо Bun** — Bun запускается в 4 раза быстрее, удобнее для прототипирования.

---

## 6.6 Визуальный редизайн и расширения интерфейса

В ходе итеративной доработки прототипа реализован ряд существенных улучшений, затрагивающих как визуальную систему, так и функциональность отдельных компонентов. Целью было превращение академического dashboard в продуктовый интерфейс, сравнимый по восприятию с коммерческими музыкальными сервисами (Apple Music, Spotify).

### 6.6.1 Dark Glass Theme (Glassmorphism)

Вся визуальная система переработана в стилистике glassmorphism — полупрозрачных поверхностей с размытием фона (`backdrop-filter: blur(24px) saturate(130%)`). Ключевые принципы:

- **Тёмная основа** (`#0a0c14`) с многослойными `radial-gradient` тинтами, окрашенными в цвет настроения трека (`--track-mood`) — при переключении между треками фон меняет палитру.
- **Карточки-панели** — градиентная заливка сверху вниз (`rgba(255,255,255,0.06)` → `0.015`) с тонкой верхней кромкой-бликом (имитация отражения света на стекле).
- **Монохромная палитра** для структурных сегментов — вместо цветовой кодировки (Intro=серый, Verse=синий, Chorus=фиолетовый) все сегменты отображаются как белые блоки с `opacity = confidence`, активный сегмент подсвечивается цветом настроения.
- **Моноширинные uppercase** метки (`letter-spacing: 0.20em`) для заголовков панелей и чипов, серифный шрифт (Fraunces) для заголовков и больших чисел — создаёт типографический контраст «editorial + data».

### 6.6.2 Режим Vibe Mode (WebGL-визуализатор)

Реализован полноэкранный музыкальный визуализатор на базе WebGL2, использующий все четыре головы модели в реальном времени.

**Архитектура рендеринга:**

- Fragment-шейдер (GLSL ES 3.00) реализует SDF raymarching тоннеля с domain-repeated арками — один полный raymarch на кадр.
- Вход шейдера — 13 uniform-переменных, обновляемых через `requestAnimationFrame`:
  - `uBass`, `uMid`, `uTreble` — FFT-полосы из `WebAudio AnalyserNode` (bass: 0–250 Hz, mid: 250 Hz–4 kHz, treble: 4–16 kHz).
  - `uBassEnv` — сглаженная огибающая баса (fast attack 0.70, slow release 0.12) для camera shake.
  - `uLoudnessEnv` — медленная огибающая общей громкости для «дыхания» радиуса тоннеля.
  - `uOnset` — peak detector на басе (600 мс decay) для вспышек при drop-ах.
  - `uArousal`, `uValence` — регрессионные выходы модели (0..1), с frame-rate-independent lerp-сглаживанием.
  - `uSegmentIntensity` — интенсивность текущего сегмента (Intro=0.25, Chorus=1.0), управляет скоростью камеры.
  - `uSegmentFlash` — пульс при смене сегмента.
  - `uGenreHue`, `uGenreRibs`, `uGenreSharp`, `uGenreSparkle`, `uGenreTwist` — пресеты шейдера по жанру (10 жанров × 5 параметров).

**Палитра** управляется IQ cosine palette с hue-сдвигом от жанрового пресета. Low valence → холодная сталь, high valence → тёплая радуга.

**WebAudio pipeline:** `MediaElementAudioSourceNode` привязывается к элементу `<audio>` через `WeakMap`-кэш (idempotent, один раз на элемент). FFT (`fftSize=1024`, `smoothingTimeConstant=0.82`) разбивается на 3 перцептивные полосы.

**Компенсация output latency:** семантические данные (segment, A/V) читаются с учётом `AudioContext.outputLatency` (~40–80 мс), чтобы реакция шейдера совпадала с тем, что слышит пользователь, а не с тем, что запланировано в буфере.

**HUD-оверлей:** сверху — название трека + glass-чипы (жанр с confidence, тональность, BPM, model tick pulse); снизу — glass-плеер с сегментами + тики + время; на широких экранах — A/V mini-map и panel со статами.

### 6.6.3 Унифицированный плеер с визуализацией

Стандартный audio-плеер и отдельный TimeAxis объединены в единую glass-карточку:

- **Waveform** — фоновый peak-meter из `audio_features.loudness_rms` (нормализован по 95-му перцентилю), отрисованный на `<canvas>` через `mix-blend-mode: screen`.
- **Segment markers** — монохромные блоки внутри скрабера с `opacity = confidence`. Моноширинные uppercase лейблы внутри каждого блока (`КУПЛЕТ · 53%`).
- **Active segment** — текущий проигрываемый сегмент подсвечивается белым с `box-shadow`.
- **Tick marks** — вертикальные hairline на каждых 30 с + mono-метки под скрабером.
- **Hover tooltip** — glass-карточка с `T: 2:08 · ПРИПЕВ` при наведении мыши.
- **Now-playing pulse** — зелёная пульсирующая точка рядом с текущим временем при воспроизведении.

### 6.6.4 Обновлённые аналитические панели

**Эмоциональный профиль (`EmotionalProfilePanel`)** — объединяет A/V trajectory и сводку в одну wide-панель (span 4):

- Слева: A/V trajectory с 4-квадрантной цветовой географией (ЗЛОЕ — красный, РАДОСТНОЕ — золотой, ГРУСТНОЕ — синий, УМИРОТВОРЁННОЕ — зелёный, каждый как `radialGradient` при 18–22% opacity). Хвост окрашен хронологически (индиго → магента → коралл → амбер) через функцию `trailColor(t)`.
- Справа: 4 hero-tile (Жанр + Темп + Тональность + Длительность), pie-chart сегментов, progress-бары средней энергии и настроения.

**Динамика эмоций** — line-chart arousal/valence без дублирующих classification strips:

- Arousal — mood-tinted линия с `ctx.shadowBlur = 8` (glow) + area fill под кривой.
- Valence — белая тонкая линия сверху.
- Сетка разрежена до 3 тиков (0.0, 0.5, 1.0).
- Rescale `[-1, 1] → [0, 1]` через `(x + 1) * 0.5` — исправляет кластеризацию кривых внизу графика.

**Мел-спектрограмма** — aurora colormap + bloom:

- Заменён viridis на кастомный 5-stop ramp: индиго → магента → коралл → амбер → белый (`buildAuroraLUT()`).
- **Bloom-pass**: после основной отрисовки canvas повторно рисуется с `filter: blur(6px)`, `globalCompositeOperation: screen`, `globalAlpha: 0.55` — highlights перетекают в мягкое свечение.
- **Hover crosshair**: вертикальная + горизонтальная линии + floating glass-tooltip с `T: 1:51 · F: 4.1 kHz · I: 64%`.
- **Octave tick labels** на оси Y: 200 Hz, 500 Hz, 1 kHz, 2 kHz, 5 kHz, 10 kHz (вместо произвольных mel-бинов).

**Жанр** — ★ winner highlight на top-1, `composite-operation: lighter` blend на stacked area.

### 6.6.5 Галерея треков

Страница списка треков переработана из списочного формата в **grid-галерею** (Apple Music / Spotify style):

- 2/3/4/5 колонок (responsive `repeat(N, minmax(0, 1fr))`).
- Квадратные cover-tiles с `aspect-ratio: 1/1`.
- Fallback при отсутствии обложки — абстрактный gradient из `--track-mood` × `--track-tint` (уникальная «подпись» для каждого трека).
- Duration chip в углу cover (glass pill).
- Play-button overlay при hover (fade-in + scale transition).
- Title (Fraunces serif) + subtitle (mono genre) под tile.

### 6.6.6 Извлечение метаданных треков

При загрузке аудиофайла автоматически извлекаются:

- **Из ID3 тегов** (npm `music-metadata`): artist, title, embedded cover art (APIC frame) → сохраняется как `covers/{id}.jpg`.
- **Из YouTube** (при загрузке по URL): `uploader` → artist, `thumbnail` URL → cover скачивается и сохраняется.
- **Backfill**: при первом запросе `GET /api/tracks` сервер асинхронно пытается извлечь метаданные из уже загруженных файлов.

**Резюме главы 6.** Реализован полнофункциональный веб-прототип с трёхзвенной архитектурой (ML API + Backend + Frontend). Главное достижение — синхронизированный музыкальный дашборд из шести панелей с общим состоянием времени через кастомный React Context фреймворк. Шесть панелей покрывают все аспекты анализа (структура, эмоции, жанр, 2D-траектория, спектрограмма, статистика). UX-решения учитывают академическую честность (top-3 + warning для OOD), смягчают известные bias модели (классификационные координаты вместо регрессионных) и обеспечивают полировку production-уровня (skeletons, empty states, search, муtted palette). Прототип служит и демонстратором результатов работы, и инструментом дальнейшего исследования для конечных пользователей.
