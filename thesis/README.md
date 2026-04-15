# Магистерская НИР — LaTeX-сборка

Текст отчёта по научно-исследовательской работе:
**«Модуль автоматического анализа музыкальных композиций на основе мульти-задачного глубокого обучения»**

Антонов М.Д., ТвГУ, 2026.

## Структура проекта

```
thesis/
├── main.tex                 главный файл (документ-класс, преамбула, \input глав)
├── title.tex                титульный лист (ГОСТ-стиль)
├── references.bib           38 источников в BibTeX-формате (стиль gost-numeric)
├── chapters/
│   ├── 00_introduction.tex      Введение
│   ├── 01_literature_review.tex Глава 1. Обзор предметной области
│   ├── 02_problem_statement.tex Глава 2. Постановка задачи
│   ├── 03_data.tex              Глава 3. Данные
│   ├── 04_architecture.tex      Глава 4. Архитектура
│   ├── 05_experiments.tex       Глава 5. Эксперименты
│   ├── 06_prototype.tex         Глава 6. Прототип системы
│   ├── 07_analysis.tex          Глава 7. Анализ и ограничения
│   ├── 99_conclusion.tex        Заключение
│   └── A_appendices.tex         Приложения A–F
├── figures/                 рисунки (PDF/PNG); подкачиваются из ../results/plots/
├── build.sh                 скрипт сборки
└── main.pdf                 итоговый PDF (генерируется)
```

## Требования

- **MiKTeX** (Windows) или TeX Live (Linux/Mac) — нужен `xelatex` + `biber`.
- **Strawberry Perl** (Windows) — нужен для `latexmk`.
- Шрифты **Times New Roman**, **Arial**, **Consolas** — на Windows есть из коробки.

## Сборка

### Из bash

```bash
cd thesis
./build.sh
```

### Вручную

```bash
xelatex main.tex
biber main
xelatex main.tex
xelatex main.tex      # второй проход — для корректных ссылок
```

### Через latexmk (один проход)

```bash
latexmk -xelatex main.tex
```

## Стиль документа

Преамбула соответствует **ГОСТ Р 7.0.11-2011** (стандарт оформления диссертаций):

- Класс: `extarticle` 14pt.
- Шрифт основной: Times New Roman 14pt.
- Межстрочный интервал: 1.5.
- Поля: 30 / 15 / 20 / 20 мм (левое / правое / верхнее / нижнее).
- Красная строка: 1.25 см.
- Стиль ссылок: `gost-numeric` через `biblatex` + `biber`.

## Цитирование источников

В тексте используется `\cite{KEY}`, где `KEY` — BibTeX-ключ из `references.bib`.

Например:
```latex
Согласно работе \cite{gong2021ast}, AST превосходит CNN на сегментации.
```

Список ключей источников см. в `references.bib`.

## Чистка артефактов

```bash
rm -f *.aux *.log *.toc *.bbl *.blg *.bcf *.run.xml *.synctex.gz
```

или

```bash
latexmk -c        # удаляет всё кроме PDF
latexmk -C        # удаляет вообще всё включая PDF
```
