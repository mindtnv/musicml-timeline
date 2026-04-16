import { BrowserRouter, Routes, Route } from "react-router-dom";
import TrackListPage from "./components/TrackList";
import TrackCard from "./components/TrackCard";
import SharedTrackView from "./components/SharedTrackView";
import AppHeader from "./components/AppHeader";
import AppFooter from "./components/AppFooter";
import HowItWorksPage from "./components/HowItWorksPage";
import AboutPage from "./components/AboutPage";

function App() {
  return (
    <BrowserRouter>
      <div className="app-container">
        <AppHeader />
        <main className="app-main">
          <Routes>
            <Route path="/" element={<TrackListPage />} />
            <Route path="/tracks/:id" element={<TrackCard />} />
            <Route path="/s/:shareId" element={<SharedTrackView />} />
            <Route path="/how-it-works" element={<HowItWorksPage />} />
            <Route path="/about" element={<AboutPage />} />
          </Routes>
        </main>
        <AppFooter />
      </div>
    </BrowserRouter>
  );
}

export default App;
