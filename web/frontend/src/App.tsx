import { BrowserRouter, Routes, Route } from "react-router-dom";
import TrackListPage from "./components/TrackList";
import TrackCard from "./components/TrackCard";

function App() {
  return (
    <BrowserRouter>
      <div className="app-container">
        <header className="app-header">
          <a href="/" className="app-logo-link" aria-label="MusicML Timeline · на главную">
            <span className="app-logo-mark" aria-hidden="true">
              {/* Stylised mel-spectrogram bars — 6 vertical lines of varying
                  height suggesting a frequency profile.  Premium minimal mark. */}
              <svg width="22" height="22" viewBox="0 0 22 22" fill="currentColor">
                <rect x="1"  y="9"  width="2" height="4"  rx="1" />
                <rect x="5"  y="6"  width="2" height="10" rx="1" />
                <rect x="9"  y="2"  width="2" height="18" rx="1" />
                <rect x="13" y="5"  width="2" height="12" rx="1" />
                <rect x="17" y="8"  width="2" height="6"  rx="1" />
              </svg>
            </span>
            <span className="app-logo-text">
              <span className="app-logo-title">MusicML Timeline</span>
              <span className="app-logo-sub">Multi-task music structure &amp; affect analysis</span>
            </span>
            <span className="app-version">v2.0</span>
          </a>
          <nav className="app-header-right" aria-label="Технологический стек модели">
            <span className="app-stack" title="Стек модели">
              <span className="app-stack-item">CNN</span>
              <span className="app-stack-sep">·</span>
              <span className="app-stack-item">SE</span>
              <span className="app-stack-sep">·</span>
              <span className="app-stack-item">AST</span>
              <span className="app-stack-sep">·</span>
              <span className="app-stack-item app-stack-item--accent">PyTorch</span>
            </span>
          </nav>
        </header>
        <main className="app-main">
          <Routes>
            <Route path="/" element={<TrackListPage />} />
            <Route path="/tracks/:id" element={<TrackCard />} />
          </Routes>
        </main>
        <footer className="app-footer">
          <div className="app-footer-grid">
            <div className="app-footer-section">
              <span className="app-footer-label">Магистерская НИР</span>
              <span className="app-footer-value">Тверской государственный университет</span>
              <span className="app-footer-meta">2026</span>
            </div>
            <div className="app-footer-section">
              <span className="app-footer-label">Автор</span>
              <span className="app-footer-value">Антонов М.&nbsp;Е.</span>
              <span className="app-footer-meta">студент магистратуры</span>
            </div>
            <div className="app-footer-section">
              <span className="app-footer-label">Научный руководитель</span>
              <span className="app-footer-value">Кудряшов М.&nbsp;Ю.</span>
              <span className="app-footer-meta">кафедра ПИ</span>
            </div>
          </div>
          <div className="app-footer-byline">
            <span className="app-footer-mark" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 22 22" fill="currentColor">
                <rect x="1"  y="9"  width="2" height="4"  rx="1" />
                <rect x="5"  y="6"  width="2" height="10" rx="1" />
                <rect x="9"  y="2"  width="2" height="18" rx="1" />
                <rect x="13" y="5"  width="2" height="12" rx="1" />
                <rect x="17" y="8"  width="2" height="6"  rx="1" />
              </svg>
            </span>
            <span>MusicML Timeline · построено на PyTorch, librosa, React</span>
          </div>
        </footer>
      </div>
    </BrowserRouter>
  );
}

export default App;
