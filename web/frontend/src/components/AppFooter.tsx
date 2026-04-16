import { Link } from "react-router-dom";

/**
 * Application footer — a calm four-column grid with site links, project
 * credits, and a tech-stack row.  Designed so the site feels "finished"
 * even on a newcomer's first visit: no dangling empty columns, no
 * inline-joined tag-soup.
 */
function AppFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="app-footer">
      <div className="app-footer-grid">
        <section className="app-footer-col">
          <div className="app-footer-mark-row">
            <span className="app-footer-mark" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 22 22" fill="currentColor">
                <rect x="1"  y="9"  width="2" height="4"  rx="1" />
                <rect x="5"  y="6"  width="2" height="10" rx="1" />
                <rect x="9"  y="2"  width="2" height="18" rx="1" />
                <rect x="13" y="5"  width="2" height="12" rx="1" />
                <rect x="17" y="8"  width="2" height="6"  rx="1" />
              </svg>
            </span>
            <span className="app-footer-brand">MusicML Timeline</span>
          </div>
          <p className="app-footer-blurb">
            Мульти-задачный анализ структуры и аффекта музыкальных
            композиций на PyTorch.  Рендерит структуру (Intro / Verse /
            Chorus…), эмоциональный профиль (arousal / valence) и жанр
            в единую временную шкалу.
          </p>
        </section>

        <section className="app-footer-col">
          <h3 className="app-footer-heading">Продукт</h3>
          <ul className="app-footer-list">
            <li><Link to="/" className="app-footer-link">Библиотека треков</Link></li>
            <li><Link to="/how-it-works" className="app-footer-link">Как это работает</Link></li>
            <li><Link to="/about" className="app-footer-link">О проекте</Link></li>
          </ul>
        </section>

        <section className="app-footer-col">
          <h3 className="app-footer-heading">Научная работа</h3>
          <ul className="app-footer-list">
            <li className="app-footer-meta-row">
              <span className="app-footer-meta-label">Тема</span>
              <span className="app-footer-meta-value">
                Магистерская НИР
              </span>
            </li>
            <li className="app-footer-meta-row">
              <span className="app-footer-meta-label">Университет</span>
              <span className="app-footer-meta-value">
                Тверской государственный
              </span>
            </li>
            <li className="app-footer-meta-row">
              <span className="app-footer-meta-label">Автор</span>
              <span className="app-footer-meta-value">Антонов&nbsp;М.&nbsp;Е.</span>
            </li>
            <li className="app-footer-meta-row">
              <span className="app-footer-meta-label">Руководитель</span>
              <span className="app-footer-meta-value">Кудряшов&nbsp;М.&nbsp;Ю.</span>
            </li>
          </ul>
        </section>

        <section className="app-footer-col">
          <h3 className="app-footer-heading">Тех. стек</h3>
          <ul className="app-footer-stack-list">
            <li><span className="app-footer-stack-tag">PyTorch</span> CNN&nbsp;+&nbsp;SE-блоки</li>
            <li><span className="app-footer-stack-tag">librosa</span> фичи аудио</li>
            <li><span className="app-footer-stack-tag">FastAPI</span> ML-сервис</li>
            <li><span className="app-footer-stack-tag">Elysia</span> бэкенд на Bun</li>
            <li><span className="app-footer-stack-tag">React 19</span> dashboard UI</li>
          </ul>
        </section>
      </div>

      <div className="app-footer-bottom">
        <span className="app-footer-copyright">
          © {year} MusicML Timeline · Антонов М.&nbsp;Е.
        </span>
        <span className="app-footer-badge" title="Версия пост-процесса">
          post-process&nbsp;v2.1&nbsp;·&nbsp;Foote&nbsp;+&nbsp;repetition
        </span>
      </div>
    </footer>
  );
}

export default AppFooter;
