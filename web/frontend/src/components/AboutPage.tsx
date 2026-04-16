import { Link } from "react-router-dom";

/**
 * "About" page — the credits + context block.  Lives at /about.
 *
 * Content is intentionally non-marketing: this is a master's thesis
 * project, and visitors who land here want to know WHO built it, WHY,
 * and on WHAT datasets.  We give them that in clean cards rather than
 * a wall of text.
 */
function AboutPage() {
  return (
    <div className="marketing-page fade-in">
      <section className="marketing-hero">
        <div className="marketing-eyebrow">О проекте</div>
        <h1 className="marketing-title">
          Магистерская научно-исследовательская работа
        </h1>
        <p className="marketing-lead">
          MusicML Timeline — модуль мульти-задачного анализа музыкальных
          композиций: структурная сегментация, оценка эмоционального
          профиля и жанровая классификация в едином pipeline на PyTorch.
        </p>
      </section>

      <section className="marketing-section">
        <h2 className="marketing-h2">Команда</h2>
        <div className="people-grid">
          <article className="person-card">
            <div className="person-card-role">Автор</div>
            <div className="person-card-name">Антонов Матвей Евгеньевич</div>
            <div className="person-card-meta">
              Студент магистратуры<br />
              Кафедра прикладной информатики
            </div>
          </article>
          <article className="person-card">
            <div className="person-card-role">Научный руководитель</div>
            <div className="person-card-name">Кудряшов Максим Юрьевич</div>
            <div className="person-card-meta">
              Кафедра прикладной информатики<br />
              ТвГУ, факультет ПМиК
            </div>
          </article>
          <article className="person-card">
            <div className="person-card-role">Университет</div>
            <div className="person-card-name">ТвГУ</div>
            <div className="person-card-meta">
              Тверской государственный университет<br />
              2026
            </div>
          </article>
        </div>
      </section>

      <section className="marketing-section">
        <h2 className="marketing-h2">Датасеты</h2>
        <div className="datasets-grid">
          <div className="dataset-card">
            <h3 className="dataset-card-title">DEAM</h3>
            <div className="dataset-card-stat">1 802 трека</div>
            <p className="dataset-card-desc">
              Database for Emotional Analysis of Music. Непрерывные
              аннотации arousal/valence с частотой 2&nbsp;Гц. Используется
              для обучения эмоциональных голов.
            </p>
          </div>
          <div className="dataset-card">
            <h3 className="dataset-card-title">Harmonix Set</h3>
            <div className="dataset-card-stat">743 трека</div>
            <p className="dataset-card-desc">
              Pop / rock / R&amp;B с разметкой структурных сегментов
              (Intro, Verse, Pre-chorus, Chorus, Bridge, Outro и др.).
              Используется для обучения структурной головы.
            </p>
          </div>
          <div className="dataset-card">
            <h3 className="dataset-card-title">GTZAN</h3>
            <div className="dataset-card-stat">1 000 треков</div>
            <p className="dataset-card-desc">
              10 жанров по 100 треков. Классический жанровый бенчмарк,
              используется для обучения жанровой головы.
            </p>
          </div>
        </div>
      </section>

      <section className="marketing-section">
        <h2 className="marketing-h2">Исследовательские вопросы</h2>
        <ul className="rq-list">
          <li className="rq-item">
            <span className="rq-tag">RQ1</span>
            <span className="rq-text">
              Может ли мульти-задачный CNN одновременно решать структурную,
              эмоциональную и жанровую задачи без потери качества
              относительно single-task baselines?
            </span>
          </li>
          <li className="rq-item">
            <span className="rq-tag">RQ2</span>
            <span className="rq-text">
              Помогает ли добавление temporal modeling (BiLSTM над
              покадровыми embeddings) для задач со слабой временной
              структурой?
            </span>
          </li>
          <li className="rq-item">
            <span className="rq-tag">RQ3</span>
            <span className="rq-text">
              Даёт ли предобученный PANNs-backbone (AudioSet-2M)
              преимущество над from-scratch CNN при малом кол-ве
              разметки?
            </span>
          </li>
          <li className="rq-item">
            <span className="rq-tag">RQ4</span>
            <span className="rq-text">
              Какой фактор важнее — качество признаков (backbone)
              или временное моделирование (sequence-head)?
            </span>
          </li>
        </ul>
      </section>

      <section className="marketing-section">
        <h2 className="marketing-h2">Технологический стек</h2>
        <div className="stack-grid">
          <div className="stack-col">
            <h3 className="stack-col-title">Машинное обучение</h3>
            <ul className="stack-list">
              <li>Python 3.12 · PyTorch 2.x</li>
              <li>librosa — аудио-фичи, novelty, beat-tracking</li>
              <li>scikit-learn — метрики, evaluation</li>
              <li>panns-inference — PANNs CNN14 embeddings</li>
              <li>transformers — AST (Audio Spectrogram Transformer)</li>
            </ul>
          </div>
          <div className="stack-col">
            <h3 className="stack-col-title">Серверная часть</h3>
            <ul className="stack-list">
              <li>FastAPI — ML inference сервис</li>
              <li>Elysia (Bun) — proxy, track metadata, storage</li>
              <li>yt-dlp — импорт с YouTube / SoundCloud</li>
              <li>mutagen — чтение ID3 / Vorbis тегов</li>
            </ul>
          </div>
          <div className="stack-col">
            <h3 className="stack-col-title">Интерфейс</h3>
            <ul className="stack-list">
              <li>React 19 · TypeScript 5.6 · Vite 6</li>
              <li>D3 (scale / chromatic) — цветовые шкалы</li>
              <li>Canvas 2D — timeline &amp; heatmap-рендеринг</li>
              <li>WebGL (custom shaders) — fullscreen вайб-режим</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="marketing-cta">
        <h2 className="marketing-cta-title">Узнать, как это работает</h2>
        <p className="marketing-cta-desc">
          Подробный разбор pipeline, архитектуры и метрик на Harmonix.
        </p>
        <Link to="/how-it-works" className="btn btn-primary marketing-cta-btn">
          Читать «Как работает»
        </Link>
      </section>
    </div>
  );
}

export default AboutPage;
