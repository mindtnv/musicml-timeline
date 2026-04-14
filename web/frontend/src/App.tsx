import { BrowserRouter, Routes, Route } from "react-router-dom";
import TrackListPage from "./components/TrackList";
import TrackCard from "./components/TrackCard";

function App() {
  return (
    <BrowserRouter>
      <div className="app-container">
        <header className="app-header">
          <div className="app-header-left">
            <a href="/" className="app-logo-link">
              <h1 className="app-title">MusicML Timeline</h1>
            </a>
            <span className="app-version">v2.0</span>
          </div>
          <nav className="app-header-right">
            <span className="app-meta">CNN + SE + AST | PyTorch</span>
          </nav>
        </header>
        <main className="app-main">
          <Routes>
            <Route path="/" element={<TrackListPage />} />
            <Route path="/tracks/:id" element={<TrackCard />} />
          </Routes>
        </main>
        <footer className="app-footer">
          <span>Магистерская НИР, ТвГУ 2026</span>
          <span className="app-footer-sep">|</span>
          <span>Антонов М.Д.</span>
          <span className="app-footer-sep">|</span>
          <span>Науч. рук. Кудряшов М.Ю.</span>
        </footer>
      </div>
    </BrowserRouter>
  );
}

export default App;
