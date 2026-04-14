import { BrowserRouter, Routes, Route } from "react-router-dom";
import TrackListPage from "./components/TrackList";
import TrackCard from "./components/TrackCard";

function App() {
  return (
    <BrowserRouter>
      <div className="app-container">
        <header className="app-header">
          <a href="/" className="app-logo-link">
            <h1 className="app-title">MusicML Timeline</h1>
          </a>
          <p className="app-subtitle">Анализ музыкальных композиций на основе ИИ</p>
        </header>
        <main className="app-main">
          <Routes>
            <Route path="/" element={<TrackListPage />} />
            <Route path="/tracks/:id" element={<TrackCard />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
