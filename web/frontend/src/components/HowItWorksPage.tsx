import { Link } from "react-router-dom";

/**
 * "How it works" — explains the pipeline from audio to timeline.
 *
 * Four sections:
 *   1. Pipeline — horizontal flow of stages
 *   2. Four tasks — what each dashboard panel represents
 *   3. Model architecture — CNN backbone + SE-blocks + multi-task heads
 *   4. Post-processing v2 — with real Harmonix metrics showing the lift
 *      (shipping this page "because the model is great" is fine; shipping it
 *      with the numbers right there is a different level of trust)
 */
function HowItWorksPage() {
  return (
    <div className="marketing-page fade-in">
      <section className="marketing-hero">
        <div className="marketing-eyebrow">Как это работает</div>
        <h1 className="marketing-title">
          От звуковой волны до структуры трека —
          <br />
          в четырёх шагах
        </h1>
        <p className="marketing-lead">
          Сервис принимает аудио-файл или URL с YouTube / SoundCloud,
          строит log-mel спектрограмму, прогоняет её через CNN
          с мульти-задачными головами и собирает из предсказаний единую
          временную шкалу: структура, эмоции, жанр.
        </p>
      </section>

      <section className="marketing-section">
        <h2 className="marketing-h2">Пайплайн</h2>
        <ol className="pipeline-steps">
          <li className="pipeline-step">
            <div className="pipeline-step-num">01</div>
            <div className="pipeline-step-body">
              <h3 className="pipeline-step-title">Аудио → log-mel</h3>
              <p className="pipeline-step-desc">
                Моно 22.05 kHz, 128 мел-бэндов, hop 512 сэмплов.
                librosa считает power-спектрограмму и переводит её в dB.
              </p>
            </div>
          </li>
          <li className="pipeline-step">
            <div className="pipeline-step-num">02</div>
            <div className="pipeline-step-body">
              <h3 className="pipeline-step-title">Окна 10 с с шагом 1 с</h3>
              <p className="pipeline-step-desc">
                Трек разрезается на пересекающиеся окна. Модель смотрит
                на 10 секунд контекста, а метка ставится каждую секунду —
                так у нас 1-секундное разрешение без потери контекста.
              </p>
            </div>
          </li>
          <li className="pipeline-step">
            <div className="pipeline-step-num">03</div>
            <div className="pipeline-step-body">
              <h3 className="pipeline-step-title">CNN + 4 головы</h3>
              <p className="pipeline-step-desc">
                Один backbone (Conv2D 32→64→128→256→512 + SE-блоки),
                четыре отдельные головы: сегмент, arousal, valence, жанр.
                Они обучаются одновременно и делятся представлениями.
              </p>
            </div>
          </li>
          <li className="pipeline-step">
            <div className="pipeline-step-num">04</div>
            <div className="pipeline-step-body">
              <h3 className="pipeline-step-title">
                Пост-процесс v2 + Foote-novelty
              </h3>
              <p className="pipeline-step-desc">
                Структурная transition-matrix, soft position priors,
                Foote-novelty из self-similarity log-mel и выравнивание
                повторов. Собирает из 1-секундных меток аккуратные сегменты.
              </p>
            </div>
          </li>
        </ol>
      </section>

      <section className="marketing-section">
        <h2 className="marketing-h2">Что вы получаете на выходе</h2>
        <div className="feature-grid">
          <div className="feature-card" style={{ "--accent": "#4CAF50" } as React.CSSProperties}>
            <div className="feature-card-badge">Структура</div>
            <h3 className="feature-card-title">Intro · Verse · Chorus</h3>
            <p className="feature-card-desc">
              Шесть классов структурной разметки, с принудительным
              Intro в начале, Outro в конце и консистентной меткой
              для повторяющихся припевов.
            </p>
          </div>
          <div className="feature-card" style={{ "--accent": "#EF5350" } as React.CSSProperties}>
            <div className="feature-card-badge">Эмоция</div>
            <h3 className="feature-card-title">Arousal &amp; Valence</h3>
            <p className="feature-card-desc">
              Непрерывные регрессионные кривые и 3-классовая
              дискретизация (Low/Mid/High, Dark/Neutral/Bright)
              с 2D-траекторией эмоционального профиля.
            </p>
          </div>
          <div className="feature-card" style={{ "--accent": "#EC407A" } as React.CSSProperties}>
            <div className="feature-card-badge">Жанр</div>
            <h3 className="feature-card-title">10 классов GTZAN</h3>
            <p className="feature-card-desc">
              Pop, rock, hip-hop, classical, jazz, metal, disco,
              country, reggae, blues — с вероятностью по фреймам
              и timeline доминирующего жанра.
            </p>
          </div>
          <div className="feature-card" style={{ "--accent": "#7dd3fc" } as React.CSSProperties}>
            <div className="feature-card-badge">Аудио</div>
            <h3 className="feature-card-title">Темп, тональность, мел</h3>
            <p className="feature-card-desc">
              Beat-tracking на onset-novelty, оценка key/mode,
              RMS-громкость, спектральный центроид и интерактивная
              мел-спектрограмма.
            </p>
          </div>
        </div>
      </section>

      <section className="marketing-section">
        <h2 className="marketing-h2">Модель</h2>
        <div className="arch-card">
          <div className="arch-card-stats">
            <div className="arch-stat">
              <div className="arch-stat-value">≈ 800K</div>
              <div className="arch-stat-label">параметров</div>
            </div>
            <div className="arch-stat">
              <div className="arch-stat-value">5</div>
              <div className="arch-stat-label">conv-блоков</div>
            </div>
            <div className="arch-stat">
              <div className="arch-stat-value">4</div>
              <div className="arch-stat-label">задачи одновременно</div>
            </div>
            <div className="arch-stat">
              <div className="arch-stat-value">10 с</div>
              <div className="arch-stat-label">окно контекста</div>
            </div>
          </div>
          <ul className="arch-list">
            <li>Conv2D 32 → 64 → 128 → 256 → 512, BatchNorm, ReLU</li>
            <li>SE-блок (Squeeze-and-Excitation) после каждого conv</li>
            <li>Global Average Pooling + shared FC (512 → 256)</li>
            <li>AdamW + CosineAnnealingWarmRestarts (T₀=10, T_mult=2)</li>
            <li>Focal Loss (γ=1.5), label smoothing 0.1, Mixup α=0.2</li>
            <li>SpecAugment, temporal jitter ±1 с</li>
          </ul>
        </div>
      </section>

      <section className="marketing-section">
        <h2 className="marketing-h2">Пост-процесс v2: что даёт алгоритм</h2>
        <p className="marketing-section-lead">
          Модель выдаёт шумные покадровые вероятности. Хороший декодер
          превращает их в чистый таймлайн, не трогая саму модель.
          Вот что получилось на 115 тестовых треках Harmonix Set
          (тесто-сплит, не виденный при обучении):
        </p>
        <div className="metrics-table">
          <div className="metrics-table-row metrics-table-head">
            <div>Метрика</div>
            <div>Baseline&nbsp;(v1)</div>
            <div>v2&nbsp;+&nbsp;audio</div>
            <div>Δ</div>
          </div>
          <div className="metrics-table-row">
            <div>Frame accuracy</div>
            <div className="mono">29.3%</div>
            <div className="mono mono-bold">32.9%</div>
            <div className="mono delta delta-up">+3.6&nbsp;п.п.</div>
          </div>
          <div className="metrics-table-row">
            <div>Macro-F1</div>
            <div className="mono">31.2%</div>
            <div className="mono mono-bold">35.4%</div>
            <div className="mono delta delta-up">+4.2&nbsp;п.п.</div>
          </div>
          <div className="metrics-table-row">
            <div>Boundary F1 (tol=3 с)</div>
            <div className="mono">18.9%</div>
            <div className="mono mono-bold">27.4%</div>
            <div className="mono delta delta-up">+8.5&nbsp;п.п.&nbsp;(+45%)</div>
          </div>
          <div className="metrics-table-row">
            <div>Intro F1</div>
            <div className="mono">0.53</div>
            <div className="mono mono-bold">0.62</div>
            <div className="mono delta delta-up">+0.09</div>
          </div>
          <div className="metrics-table-row">
            <div>Outro F1</div>
            <div className="mono">0.29</div>
            <div className="mono mono-bold">0.41</div>
            <div className="mono delta delta-up">+0.12</div>
          </div>
          <div className="metrics-table-row">
            <div>Chorus F1</div>
            <div className="mono">0.30</div>
            <div className="mono mono-bold">0.35</div>
            <div className="mono delta delta-up">+0.05</div>
          </div>
        </div>

        <div className="pp-improvements">
          <h3 className="pp-improvements-title">Что именно делает v2</h3>
          <ol className="pp-improvements-list">
            <li>
              <strong>Viterbi со структурной transition-matrix.</strong>{" "}
              Intro&nbsp;→&nbsp;Outro дорого, Bridge&nbsp;→&nbsp;Chorus почти
              бесплатно — музыкальная грамматика как априорное знание.
            </li>
            <li>
              <strong>Soft position priors с активным бустом.</strong>{" "}
              Intro поощряется в первых 18% трека, Outro — в последних;
              за пределами зоны запрещено жёстким штрафом.
            </li>
            <li>
              <strong>Foote-novelty из self-similarity log-mel.</strong>{" "}
              Границы сегментов подтягиваются к реальным акустическим
              сменам, а не к «сменам» в пробах модели, смазанным
              10-секундным окном.
            </li>
            <li>
              <strong>Repetition-consistency.</strong>{" "}
              SSM на блоках по 8&nbsp;с находит акустически повторяющиеся
              секции; если повторы получили разные метки — все
              подтягиваются к одной (обычно Chorus).
            </li>
            <li>
              <strong>Per-class min duration.</strong>{" "}
              Короткие pre-chorus живут (3&nbsp;с), но мусорные
              1-секундные «островки» припева поглощаются соседями
              по confidence.
            </li>
          </ol>
        </div>
      </section>

      <section className="marketing-cta">
        <h2 className="marketing-cta-title">Попробуйте на своём треке</h2>
        <p className="marketing-cta-desc">
          Загрузите mp3 / wav или вставьте ссылку на YouTube — анализ
          занимает меньше минуты.
        </p>
        <Link to="/" className="btn btn-primary marketing-cta-btn">
          Открыть библиотеку
        </Link>
      </section>
    </div>
  );
}

export default HowItWorksPage;
