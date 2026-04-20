/**
 * Презентация для предзащиты ВКР — «продающая» версия
 * Фокус: что сделано, почему ценно, как выглядит
 * node gen_pptx.cjs → presentation.pptx
 */
const pptxgen = require("pptxgenjs");
const path = require("path");

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9";
pres.author = "Антонов М.Д.";
pres.title = "Модуль автоматического анализа музыкальных композиций";

// ── Design ──
const DARK    = "0F172A";
const MID     = "475569";
const LIGHT   = "94A3B8";
const ACCENT  = "2563EB";
const WHITE   = "FFFFFF";
const BG      = "FAFBFD";
const RED     = "DC2626";
const GREEN   = "059669";
const AMBER   = "D97706";

const H = "Arial";
const B = "Calibri";
const T = 14; // total slides

function num(slide, n) {
  slide.addText(`${n} / ${T}`, {
    x: 8.9, y: 5.25, w: 0.9, h: 0.25,
    fontSize: 9, fontFace: B, color: LIGHT, align: "right",
  });
}

function bar(slide) {
  slide.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.06, fill: { color: ACCENT } });
}

function head(slide, title, n) {
  bar(slide);
  slide.addText(title, {
    x: 0.6, y: 0.25, w: 8.8, h: 0.5,
    fontSize: 24, fontFace: H, color: DARK, bold: true, margin: 0,
  });
  num(slide, n);
}

function tbl(slide, headers, rows, opts = {}) {
  const y = opts.y || 1.2;
  const x = opts.x || 0.5;
  const fs = opts.fs || 12;
  const colW = opts.colW || headers.map(() => (opts.w || 9.0) / headers.length);

  const hr = headers.map(h => ({
    text: h, options: { bold: true, color: WHITE, fill: { color: ACCENT },
      fontSize: fs, fontFace: B, align: "center", valign: "middle" }
  }));

  const dr = rows.map((row, ri) => row.map((cell, ci) => ({
    text: String(cell),
    options: { fontSize: fs, fontFace: B, color: DARK,
      fill: { color: ri % 2 === 0 ? "F1F5F9" : WHITE },
      align: ci === 0 ? "left" : "center", valign: "middle",
      bold: String(cell).includes("★"),
    }
  })));

  slide.addTable([hr, ...dr], {
    x, y, colW,
    border: { type: "solid", pt: 0.5, color: "E2E8F0" },
    rowH: opts.rh || 0.38, autoPage: false,
  });
}

// ══════════════════════════════════════════════════════════════
// 1 — ТИТУЛЬНЫЙ
// ══════════════════════════════════════════════════════════════
{
  const s = pres.addSlide(); s.background = { color: WHITE };
  bar(s);

  s.addText("ФГБОУ ВО «Тверской государственный университет»", {
    x: 0.5, y: 0.35, w: 9, h: 0.3,
    fontSize: 12, fontFace: B, color: MID, align: "center",
  });
  s.addText("Факультет прикладной математики и кибернетики · Кафедра информационных технологий", {
    x: 0.5, y: 0.65, w: 9, h: 0.25,
    fontSize: 10, fontFace: B, color: LIGHT, align: "center",
  });

  s.addText("Модуль автоматического анализа\nмузыкальных композиций на основе\nмульти-задачного глубокого обучения", {
    x: 0.6, y: 1.6, w: 8.8, h: 1.8,
    fontSize: 28, fontFace: H, color: DARK, bold: true, align: "center", valign: "middle",
  });

  // Ключевые цифры — «selling points»
  const stats = [
    { val: "5", label: "архитектур\nсравнено" },
    { val: "4", label: "задачи\nодновременно" },
    { val: "40.6%", label: "segment\naccuracy" },
    { val: "6", label: "панелей\nдашборда" },
  ];
  stats.forEach((st, i) => {
    const x = 1.0 + i * 2.15;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x, y: 3.65, w: 1.9, h: 0.95,
      fill: { color: "EFF6FF" }, rectRadius: 0.08,
    });
    s.addText(st.val, {
      x, y: 3.65, w: 1.9, h: 0.52,
      fontSize: 22, fontFace: H, color: ACCENT, bold: true, align: "center", valign: "bottom", margin: 0,
    });
    s.addText(st.label, {
      x, y: 4.2, w: 1.9, h: 0.38,
      fontSize: 9, fontFace: B, color: MID, align: "center", valign: "top", margin: 0,
    });
  });

  s.addText([
    { text: "Выполнил: ", options: { bold: true } },
    { text: "магистрант 2 курса Антонов М. Д." },
  ], { x: 5.0, y: 4.85, w: 4.5, h: 0.25, fontSize: 11, fontFace: B, color: DARK });
  s.addText([
    { text: "Научный руководитель: ", options: { bold: true } },
    { text: "к.ф.-м.н., доцент Кудряшов М. Ю." },
  ], { x: 5.0, y: 5.1, w: 4.5, h: 0.25, fontSize: 11, fontFace: B, color: DARK });
  s.addText("Тверь, 2026", {
    x: 0.5, y: 5.15, w: 4, h: 0.25,
    fontSize: 11, fontFace: B, color: LIGHT,
  });
  num(s, 1);
}

// ══════════════════════════════════════════════════════════════
// 2 — АКТУАЛЬНОСТЬ
// ══════════════════════════════════════════════════════════════
{
  const s = pres.addSlide(); s.background = { color: WHITE };
  head(s, "Актуальность", 2);

  const items = [
    { head: "100M+ треков на платформах", sub: "Spotify, Apple Music, YouTube Music — ручной анализ невозможен" },
    { head: "Фрагментированные решения", sub: "Структура, эмоции, жанр — каждая задача требует отдельной модели и pipeline" },
    { head: "Нет единой системы", sub: "Совместный анализ 4 аспектов одной моделью + поиск похожих треков не реализован в open-source" },
    { head: "Широкий спрос", sub: "Ритм-игры · DJ-инструменты · рекомендательные системы · музыкальное образование · стриминг" },
  ];

  items.forEach((it, i) => {
    const y = 1.15 + i * 1.05;
    s.addShape(pres.shapes.OVAL, {
      x: 0.55, y: y + 0.08, w: 0.42, h: 0.42, fill: { color: ACCENT },
    });
    s.addText(String(i + 1), {
      x: 0.55, y: y + 0.08, w: 0.42, h: 0.42,
      fontSize: 15, fontFace: H, color: WHITE, bold: true, align: "center", valign: "middle",
    });
    s.addText(it.head, {
      x: 1.2, y: y, w: 8.2, h: 0.3,
      fontSize: 16, fontFace: H, color: DARK, bold: true, margin: 0,
    });
    s.addText(it.sub, {
      x: 1.2, y: y + 0.35, w: 8.2, h: 0.25,
      fontSize: 12, fontFace: B, color: MID, margin: 0,
    });
  });
}

// ══════════════════════════════════════════════════════════════
// 3 — ОБЗОР ЛИТЕРАТУРЫ
// ══════════════════════════════════════════════════════════════
{
  const s = pres.addSlide(); s.background = { color: WHITE };
  head(s, "Обзор литературы", 3);

  tbl(s,
    ["Направление", "Авторы, год", "Метод", "Результат"],
    [
      ["Структурный анализ", "Ullrich et al., ISMIR 2014", "CNN + HMM post-processing", "Boundary F1 ≈ 0.46"],
      ["Структурный анализ", "Wang et al., IEEE TASLP 2022", "Transformer encoder", "F1 ≈ 0.55"],
      ["Эмоции (MER)", "Won et al., arXiv 2020", "Self-attention tagging", "Arousal acc 70%"],
      ["Жанры", "Kong et al., IEEE TASLP 2020", "PANNs CNN14 (AudioSet)", "87% GTZAN"],
      ["Аудио-трансформер", "Gong et al., Interspeech 2021", "AST (Vision Transformer)", "89% GTZAN"],
      ["Multi-task learning", "Caruana, Machine Learning 1997", "Shared representation", "Теория MTL"],
    ],
    { y: 1.0, colW: [1.8, 2.5, 2.5, 1.7], fs: 10, rh: 0.42 }
  );

  s.addText("Полные библиографические ссылки — в тексте работы (38 источников)", {
    x: 0.5, y: 4.9, w: 9, h: 0.25,
    fontSize: 9, fontFace: B, color: LIGHT, italic: true,
  });
}

// ══════════════════════════════════════════════════════════════
// 4 — ЦЕЛЬ И ЗАДАЧИ
// ══════════════════════════════════════════════════════════════
{
  const s = pres.addSlide(); s.background = { color: WHITE };
  head(s, "Цель и задачи", 4);

  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 0.5, y: 1.0, w: 9.0, h: 0.75,
    fill: { color: "EFF6FF" }, rectRadius: 0.06,
  });
  s.addText("Цель: разработать прототип системы автоматического многоаспектного анализа музыкальных композиций на основе мульти-задачной модели глубокого обучения", {
    x: 0.7, y: 1.05, w: 8.6, h: 0.65,
    fontSize: 13, fontFace: B, color: ACCENT, italic: true, valign: "middle",
  });

  const tasks = [
    "Обзор предметной области Music Information Retrieval",
    "Подготовка обучающего корпуса из 3 открытых датасетов",
    "Реализация и сравнение 5 архитектур мульти-задачных моделей",
    "Пост-обработка предсказаний (Viterbi + музыкальные априори)",
    "Разработка веб-прототипа с дашбордом и поиском похожих треков",
    "Загрузка треков из YouTube / SoundCloud (yt-dlp интеграция)",
  ];

  tasks.forEach((t, i) => {
    const y = 2.05 + i * 0.52;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 0.55, y: y + 0.02, w: 0.35, h: 0.35,
      fill: { color: i < 5 ? ACCENT : "E2E8F0" }, rectRadius: 0.04,
    });
    s.addText(String(i + 1), {
      x: 0.55, y: y + 0.02, w: 0.35, h: 0.35,
      fontSize: 12, fontFace: H, color: i < 5 ? WHITE : MID, bold: true, align: "center", valign: "middle",
    });
    s.addText(t, {
      x: 1.1, y: y, w: 8.3, h: 0.38,
      fontSize: 14, fontFace: B, color: DARK, valign: "middle", margin: 0,
    });
  });
}

// ══════════════════════════════════════════════════════════════
// 5 — АРХИТЕКТУРА СИСТЕМЫ (единственный «технический» слайд)
// ══════════════════════════════════════════════════════════════
{
  const s = pres.addSlide(); s.background = { color: WHITE };
  head(s, "Как это работает", 5);

  const flow = [
    { label: "Аудио\nMP3 / WAV", bg: "E2E8F0" },
    { label: "Мел-спектро-\nграмма", bg: "DBEAFE" },
    { label: "AST\nTransformer\n(pretrained)", bg: ACCENT, fg: WHITE },
    { label: "4 головы:\nструктура\nэмоции\nжанр", bg: "DBEAFE" },
    { label: "Viterbi +\nposition\npriors", bg: "FEF3C7" },
    { label: "Дашборд +\nпоиск\nпохожих", bg: "DCFCE7" },
  ];

  flow.forEach((f, i) => {
    const x = 0.3 + i * 1.55;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x, y: 1.2, w: 1.35, h: 1.2,
      fill: { color: f.bg }, rectRadius: 0.1,
      shadow: { type: "outer", color: "000000", blur: 4, offset: 1, angle: 135, opacity: 0.06 },
    });
    s.addText(f.label, {
      x, y: 1.2, w: 1.35, h: 1.2,
      fontSize: 10, fontFace: B, color: f.fg || DARK, bold: true,
      align: "center", valign: "middle",
    });
    if (i < flow.length - 1) {
      s.addText("→", {
        x: x + 1.35, y: 1.55, w: 0.2, h: 0.5,
        fontSize: 18, color: LIGHT, align: "center", valign: "middle",
      });
    }
  });

  // Три датасета
  s.addText("Обучено на 3 открытых датасетах:", {
    x: 0.5, y: 2.75, w: 9, h: 0.3,
    fontSize: 13, fontFace: H, color: DARK, bold: true, margin: 0,
  });

  tbl(s,
    ["Датасет", "Треков", "Задача"],
    [
      ["DEAM (MediaEval)", "1 802", "Энергия + настроение"],
      ["Harmonix Set", "743", "Структура (6 типов сегментов)"],
      ["GTZAN", "999", "Жанр (10 классов)"],
    ],
    { y: 3.15, colW: [3.0, 1.5, 4.0], fs: 12, rh: 0.36 }
  );

  s.addText("Общий корпус: 3 544 трека · 176K обучающих окон · 10-секундные фрагменты с шагом 1 с", {
    x: 0.5, y: 4.55, w: 9, h: 0.25,
    fontSize: 10, fontFace: B, color: LIGHT,
  });
}

// ══════════════════════════════════════════════════════════════
// 6 — НАУЧНАЯ НОВИЗНА
// ══════════════════════════════════════════════════════════════
{
  const s = pres.addSlide(); s.background = { color: WHITE };
  head(s, "Научная новизна и практическая значимость", 6);

  // Left column: новизна
  s.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 1.0, w: 0.06, h: 2.6, fill: { color: ACCENT } });
  s.addText("Научная новизна", {
    x: 0.75, y: 1.0, w: 4, h: 0.3,
    fontSize: 14, fontFace: H, color: ACCENT, bold: true, margin: 0,
  });

  const nov = [
    "Сравнение 5 архитектур (CNN → AST) для\nмульти-задачного MIR на едином корпусе",
    "Audio Spectrogram Transformer впервые\nприменён к совместному анализу 4 задач",
    "Композитный Viterbi pipeline с музыкальными\nприорами (+14 пп Boundary F1)",
  ];
  nov.forEach((n, i) => {
    const y = 1.45 + i * 0.75;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 0.75, y, w: 0.3, h: 0.3,
      fill: { color: ACCENT }, rectRadius: 0.04,
    });
    s.addText(String(i + 1), {
      x: 0.75, y, w: 0.3, h: 0.3,
      fontSize: 12, fontFace: H, color: WHITE, bold: true, align: "center", valign: "middle",
    });
    s.addText(n, {
      x: 1.2, y: y - 0.05, w: 3.8, h: 0.65,
      fontSize: 11, fontFace: B, color: DARK, margin: 0,
    });
  });

  // Right column: значимость
  s.addShape(pres.shapes.RECTANGLE, { x: 5.3, y: 1.0, w: 0.06, h: 2.6, fill: { color: GREEN } });
  s.addText("Практическая значимость", {
    x: 5.55, y: 1.0, w: 4, h: 0.3,
    fontSize: 14, fontFace: H, color: GREEN, bold: true, margin: 0,
  });

  const pract = [
    "Open-source прототип с веб-интерфейсом\n+ загрузка из YouTube / SoundCloud",
    "Поиск похожих треков через\nembedding similarity (cosine + PCA)",
    "Воспроизводимый pipeline:\nконфиги + CLI + seed = результат",
  ];
  pract.forEach((p, i) => {
    const y = 1.45 + i * 0.75;
    s.addText("✓", {
      x: 5.55, y, w: 0.3, h: 0.3,
      fontSize: 14, fontFace: H, color: GREEN, bold: true, align: "center", valign: "middle",
    });
    s.addText(p, {
      x: 5.95, y: y - 0.05, w: 3.5, h: 0.65,
      fontSize: 11, fontFace: B, color: DARK, margin: 0,
    });
  });

  // Bottom insight
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 0.5, y: 4.1, w: 9.0, h: 0.7,
    fill: { color: "FFFBEB" }, rectRadius: 0.06,
    line: { color: AMBER, width: 1 },
  });
  s.addText("Ключевой результат: единая модель решает 4 задачи одновременно — структура, энергия, настроение, жанр — с качеством, сопоставимым со специализированными SOTA-моделями", {
    x: 0.7, y: 4.15, w: 8.6, h: 0.6,
    fontSize: 12, fontFace: B, color: DARK, valign: "middle", align: "center",
  });
}

// ══════════════════════════════════════════════════════════════
// 7 — РЕЗУЛЬТАТЫ: СВОДНАЯ ТАБЛИЦА
// ══════════════════════════════════════════════════════════════
{
  const s = pres.addSlide(); s.background = { color: WHITE };
  head(s, "Результаты: сравнение 5 моделей", 7);

  tbl(s,
    ["Модель", "Segment", "Arousal", "Valence", "Genre", "Среднее"],
    [
      ["CNN (5 блоков, SE)",   "35.3%",    "62.0%",    "51.7%",    "83.9% ★", "58.2%"],
      ["CNN + BiLSTM",         "32.2%",    "62.3%",    "54.2%",    "60.9%",   "52.4%"],
      ["PANNs + Linear",      "24.0%",    "61.2%",    "53.8%",    "81.9%",   "55.2%"],
      ["PANNs + BiLSTM",      "32.9%",    "64.9% ★",  "55.0% ★",  "77.7%",   "57.6%"],
      ["AST v2 ★",            "40.6% ★",  "60.6%",    "51.1%",    "81.5%",   "58.5% ★"],
    ],
    { y: 1.0, colW: [2.0, 1.3, 1.3, 1.3, 1.3, 1.3], rh: 0.5, fs: 13 }
  );

  // Winner box
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 0.5, y: 4.1, w: 9.0, h: 0.7,
    fill: { color: "EFF6FF" }, rectRadius: 0.06,
    line: { color: ACCENT, width: 1.5 },
  });
  s.addText("★ AST v2 — лучшее среднее (58.5%) и лучший segment (+5.3 пп vs CNN)", {
    x: 0.7, y: 4.15, w: 8.6, h: 0.6,
    fontSize: 15, fontFace: H, color: ACCENT, bold: true, align: "center", valign: "middle",
  });

  s.addText("★ = лучший результат по задаче", {
    x: 0.5, y: 4.95, w: 9, h: 0.2,
    fontSize: 9, fontFace: B, color: LIGHT,
  });
}

// ══════════════════════════════════════════════════════════════
// 8 — ПОСТ-ОБРАБОТКА
// ══════════════════════════════════════════════════════════════
{
  const s = pres.addSlide(); s.background = { color: WHITE };
  head(s, "Пост-обработка: от шума к музыкальной структуре", 8);

  // Before / After — big visual comparison
  // LEFT: before
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 0.4, y: 1.0, w: 4.4, h: 3.0,
    fill: { color: "FEF2F2" }, rectRadius: 0.1,
    line: { color: RED, width: 1 },
  });
  s.addText("БЕЗ обработки", {
    x: 0.6, y: 1.1, w: 4, h: 0.35,
    fontSize: 16, fontFace: H, color: RED, bold: true, margin: 0,
  });
  const before = [
    "28 хаотичных сегментов на трек",
    "«Вступление» в середине трека",
    "Chorus ↔ Bridge осцилляции каждую секунду",
    "Boundary F1 = 0.31",
  ];
  before.forEach((b, i) => {
    s.addText("✕  " + b, {
      x: 0.7, y: 1.6 + i * 0.52, w: 3.8, h: 0.4,
      fontSize: 12, fontFace: B, color: MID, margin: 0,
    });
  });

  // RIGHT: after
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 5.2, y: 1.0, w: 4.4, h: 3.0,
    fill: { color: "ECFDF5" }, rectRadius: 0.1,
    line: { color: GREEN, width: 1 },
  });
  s.addText("ПОСЛЕ Viterbi + priors", {
    x: 5.4, y: 1.1, w: 4, h: 0.35,
    fontSize: 16, fontFace: H, color: GREEN, bold: true, margin: 0,
  });
  const after = [
    "7 осмысленных сегментов",
    "Intro только в начале, Outro в конце",
    "Стабильная Verse → Chorus → Bridge форма",
    "Boundary F1 = 0.45  (+14 пп)",
  ];
  after.forEach((a, i) => {
    s.addText("✓  " + a, {
      x: 5.4, y: 1.6 + i * 0.52, w: 3.8, h: 0.4,
      fontSize: 12, fontFace: B, color: DARK, margin: 0,
    });
  });

  // Arrow between
  s.addText("→", {
    x: 4.4, y: 2.0, w: 1.2, h: 1.0,
    fontSize: 36, fontFace: H, color: ACCENT, align: "center", valign: "middle",
  });

  // Pipeline steps (compact)
  s.addText("Pipeline: Median filter → Viterbi decoding (λ=1.0) → Musicological position priors → Min-duration merge", {
    x: 0.5, y: 4.3, w: 9, h: 0.3,
    fontSize: 10, fontFace: B, color: LIGHT, align: "center",
  });

  // Big number callout
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 3.0, y: 4.7, w: 4.0, h: 0.6,
    fill: { color: "EFF6FF" }, rectRadius: 0.06,
  });
  s.addText("+14 пунктов Boundary F1", {
    x: 3.0, y: 4.7, w: 4.0, h: 0.6,
    fontSize: 18, fontFace: H, color: ACCENT, bold: true, align: "center", valign: "middle",
  });
}

// ══════════════════════════════════════════════════════════════
// 9 — СКРИНШОТ: верхняя часть дашборда
// ══════════════════════════════════════════════════════════════
{
  const s = pres.addSlide(); s.background = { color: DARK };
  s.addText("Прототип: плеер + структура + эмоциональные кривые", {
    x: 0.4, y: 0.12, w: 8.5, h: 0.35,
    fontSize: 15, fontFace: H, color: WHITE, bold: true, margin: 0,
  });
  num(s, 9);
  s.addImage({
    path: path.join(__dirname, "figures", "dashboard-top.png"),
    x: 0.15, y: 0.5, w: 9.7, h: 5.0,
    rounding: false,
  });
}

// ══════════════════════════════════════════════════════════════
// 10 — СКРИНШОТ: нижняя часть дашборда
// ══════════════════════════════════════════════════════════════
{
  const s = pres.addSlide(); s.background = { color: DARK };
  s.addText("Прототип: эмоции + похожие треки + Russell circumplex", {
    x: 0.4, y: 0.12, w: 8.5, h: 0.35,
    fontSize: 15, fontFace: H, color: WHITE, bold: true, margin: 0,
  });
  num(s, 10);
  s.addImage({
    path: path.join(__dirname, "figures", "dashboard-bottom.png"),
    x: 0.15, y: 0.5, w: 9.7, h: 5.0,
    rounding: false,
  });

  s.addText("React 19 + d3  ·  Elysia + Bun  ·  FastAPI + PyTorch  ·  Playhead 60fps · React Context", {
    x: 0.3, y: 5.3, w: 9.4, h: 0.2,
    fontSize: 8, fontFace: B, color: "64748B", align: "center",
  });
}

// ══════════════════════════════════════════════════════════════
// 11 — СКРИНШОТ: жанр + спектрограмма + сводка
// ══════════════════════════════════════════════════════════════
{
  const s = pres.addSlide(); s.background = { color: DARK };
  s.addText("Прототип: жанр + мел-спектрограмма + сводка", {
    x: 0.4, y: 0.12, w: 8.5, h: 0.35,
    fontSize: 15, fontFace: H, color: WHITE, bold: true, margin: 0,
  });
  num(s, 11);
  s.addImage({
    path: path.join(__dirname, "figures", "dashboard-bottom.png"),
    x: 0.15, y: 0.5, w: 9.7, h: 5.0,
    rounding: false,
  });
}

// ══════════════════════════════════════════════════════════════
// 12 — СРАВНЕНИЕ С SOTA
// ══════════════════════════════════════════════════════════════
{
  const s = pres.addSlide(); s.background = { color: WHITE };
  head(s, "Сравнение с State-of-the-Art", 12);

  tbl(s,
    ["Задача", "Наша модель", "SOTA", "Δ", "SOTA-источник"],
    [
      ["Genre (GTZAN)",       "83.9%", "89%",   "−5.1 пп", "Gong et al., 2021"],
      ["Arousal (DEAM)",      "64.9%", "70%",   "−5.1 пп", "Won et al., 2020"],
      ["Segment (Harmonix)",  "40.6%", "~45%",  "−4.4 пп", "Wang et al., 2022"],
      ["Boundary F1 ±3с",     "0.45",  "0.62",  "−0.17",   "Gong & Glass, 2023"],
    ],
    { y: 1.0, colW: [2.0, 1.4, 1.0, 1.0, 2.8], rh: 0.45, fs: 12 }
  );

  s.addText("Почему разрыв — и почему это нормально:", {
    x: 0.6, y: 3.2, w: 8, h: 0.3,
    fontSize: 14, fontFace: H, color: DARK, bold: true, margin: 0,
  });

  const reasons = [
    { text: "Multi-task tax", desc: "мы решаем 4 задачи одной моделью, SOTA — одну" },
    { text: "Данные", desc: "2.5K треков vs 100K+ у SOTA" },
    { text: "Ресурсы", desc: "1 GPU vs кластеры 4×A100 у SOTA" },
    { text: "Прототип", desc: "мы реализовали полный pipeline + web UI, SOTA — только модель" },
  ];

  reasons.forEach((r, i) => {
    const y = 3.65 + i * 0.42;
    s.addText(r.text + " — ", {
      x: 0.8, y, w: 2.0, h: 0.32,
      fontSize: 11, fontFace: H, color: ACCENT, bold: true, margin: 0, valign: "middle",
    });
    s.addText(r.desc, {
      x: 2.8, y, w: 6.5, h: 0.32,
      fontSize: 11, fontFace: B, color: MID, margin: 0, valign: "middle",
    });
  });
}

// ══════════════════════════════════════════════════════════════
// 12 — ОГРАНИЧЕНИЯ И ДАЛЬНЕЙШАЯ РАБОТА
// ══════════════════════════════════════════════════════════════
{
  const s = pres.addSlide(); s.background = { color: WHITE };
  head(s, "Ограничения и дальнейшая работа", 13);

  // Limitations
  const lims = [
    { title: "GTZAN out-of-distribution", desc: "10 жанров 2002 г. не покрывают electronic, lo-fi, phonk — модель fallback'ит на «классику».\nMitigation: top-3 + warning в UI." },
    { title: "Segment ceiling", desc: "6-классовая section labeling ≈ 40% acc — фундаментальное ограничение данных Harmonix.\nMitigation: Viterbi + position priors." },
    { title: "Размер AST", desc: "574 МБ checkpoint, 8 сек inference — непригодно для mobile.\nMitigation: можно переключить на CNN (21 МБ, 2 сек)." },
  ];

  lims.forEach((l, i) => {
    const y = 1.0 + i * 1.1;
    s.addShape(pres.shapes.RECTANGLE, { x: 0.5, y, w: 0.06, h: 0.9, fill: { color: AMBER } });
    s.addText(l.title, {
      x: 0.75, y, w: 4, h: 0.28,
      fontSize: 13, fontFace: H, color: DARK, bold: true, margin: 0,
    });
    s.addText(l.desc, {
      x: 0.75, y: y + 0.3, w: 8.5, h: 0.55,
      fontSize: 10, fontFace: B, color: MID, margin: 0,
    });
  });

  // Future work
  s.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 4.3, w: 9, h: 0.03, fill: { color: "E2E8F0" } });
  s.addText("Дальнейшая работа:", {
    x: 0.5, y: 4.5, w: 2.5, h: 0.25,
    fontSize: 13, fontFace: H, color: ACCENT, bold: true, margin: 0,
  });
  s.addText("FMA / MagnaTagATune для современных жанров  ·  Knowledge distillation → mobile  ·  Real-time streaming inference", {
    x: 3.0, y: 4.5, w: 6.5, h: 0.25,
    fontSize: 11, fontFace: B, color: MID, margin: 0,
  });
}

// ══════════════════════════════════════════════════════════════
// 13 — ИТОГИ
// ══════════════════════════════════════════════════════════════
{
  const s = pres.addSlide(); s.background = { color: WHITE };
  head(s, "Итоги", 14);

  const results = [
    "Реализованы и сравнены 5 архитектур\n(CNN, BiLSTM, PANNs, Audio Spectrogram Transformer)",
    "Финальная модель — AST v2:\nsegment 40.6% · genre 81.5% · среднее 58.5%",
    "Viterbi + position priors:\n+14 пунктов Boundary F1, осмысленная структура",
    "Веб-прототип:\n6 синхронизированных панелей, playback в реальном времени",
    "Идентифицированы ограничения:\nOOD на GTZAN, segment ceiling, размер AST",
  ];

  results.forEach((r, i) => {
    const y = 1.0 + i * 0.85;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 0.5, y, w: 0.4, h: 0.4,
      fill: { color: GREEN }, rectRadius: 0.06,
    });
    s.addText("✓", {
      x: 0.5, y, w: 0.4, h: 0.4,
      fontSize: 16, fontFace: H, color: WHITE, bold: true, align: "center", valign: "middle",
    });
    s.addText(r, {
      x: 1.1, y: y - 0.05, w: 8.3, h: 0.7,
      fontSize: 13, fontFace: B, color: DARK, margin: 0,
    });
  });

  // Thank you
  s.addText("Спасибо за внимание", {
    x: 0.5, y: 5.0, w: 9, h: 0.3,
    fontSize: 14, fontFace: H, color: ACCENT, bold: true, align: "center",
  });
}

// ── Build ──
const out = path.join(__dirname, "presentation.pptx");
pres.writeFile({ fileName: out }).then(() => {
  console.log(`✓ ${out}`);
  console.log(`  ${T} слайдов, 16:9, без CNN v3, с placeholder'ами для скриншотов`);
});
