import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { Track } from "../api/types";
import { fetchTrack, deleteTrack, getAudioUrl } from "../api/client";
import AudioPlayer from "./AudioPlayer";
import LoadingState from "./LoadingState";
import { DashboardSkeleton } from "./Skeleton";
import { DashboardProvider } from "../dashboard/DashboardContext";
import TimeAxis from "../dashboard/TimeAxis";
import StructurePanel from "../dashboard/panels/StructurePanel";
import EmotionPanel from "../dashboard/panels/EmotionPanel";
import AVTrajectory from "../dashboard/panels/AVTrajectory";
import GenrePanel from "../dashboard/panels/GenrePanel";
import SummaryPanel from "../dashboard/panels/SummaryPanel";
import SpectrogramPanel from "../dashboard/panels/SpectrogramPanel";
import { getGenreColor } from "../utils/colors";
import { ru } from "../utils/labels";
import { displayName } from "../utils/displayName";

function TrackCard() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [track, setTrack] = useState<Track | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const audioSrc = id ? getAudioUrl(id) : "";

  const loadTrack = useCallback(async () => {
    if (!id) return;
    try {
      const data = await fetchTrack(id);
      setTrack(data);
      setError(null);
      if (data.status === "ready" || data.status === "error") {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить трек");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadTrack();
  }, [loadTrack]);

  useEffect(() => {
    if (track && (track.status === "analyzing" || track.status === "pending")) {
      pollRef.current = setInterval(loadTrack, 3000);
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [track?.status, loadTrack]);

  const handleDelete = useCallback(async () => {
    if (!id || deleting) return;
    if (!window.confirm("Удалить этот трек?")) return;
    setDeleting(true);
    try {
      await deleteTrack(id);
      navigate("/");
    } catch {
      setDeleting(false);
    }
  }, [id, deleting, navigate]);

  // Keyboard: space = play/pause (when not typing in input)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code !== "Space") return;
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      e.preventDefault();
      const audio = audioRef.current;
      if (!audio) return;
      if (audio.paused) audio.play().catch(() => {});
      else audio.pause();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (loading) return <DashboardSkeleton />;
  if (error)
    return (
      <div className="error-state">
        <p className="error-message">{error}</p>
        <button className="btn btn-secondary" onClick={() => navigate("/")}>
          К списку
        </button>
      </div>
    );
  if (!track)
    return (
      <div className="error-state">
        <p className="error-message">Трек не найден.</p>
        <button className="btn btn-secondary" onClick={() => navigate("/")}>
          К списку
        </button>
      </div>
    );

  const tl = track.timeline;
  const dur = tl?.metadata?.duration_sec ?? 0;
  const fp = tl?.frame_predictions;

  const topGenre = tl?.genre && tl.genre.length > 0
    ? tl.genre.reduce((best, seg) => (seg.confidence > best.confidence ? seg : best))
    : null;

  return (
    <div className="dashboard-page fade-in">
      {/* Sticky header */}
      <header className="dashboard-header">
        <div className="dashboard-header-left">
          <button className="btn btn-ghost" onClick={() => navigate("/")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
            </svg>
            К списку
          </button>
          <div className="dashboard-title-block">
            <h1 className="dashboard-title" title={track.originalName}>
              {displayName(track.originalName)}
            </h1>
            <div className="dashboard-meta">
              {topGenre && (
                <span
                  className="dashboard-meta-pill"
                  style={{
                    backgroundColor: getGenreColor(topGenre.label),
                    color: "#fff",
                  }}
                >
                  {ru(topGenre.label)}
                </span>
              )}
              {tl?.audio_features?.tempo_bpm != null && (
                <span className="dashboard-meta-pill">
                  {Math.round(tl.audio_features.tempo_bpm)} BPM
                </span>
              )}
              {tl?.audio_features?.key && (
                <span className="dashboard-meta-pill">
                  {tl.audio_features.key.key}{" "}
                  {tl.audio_features.key.mode === "Major" ? "мажор" : "минор"}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="dashboard-header-right">
          <button
            className="btn btn-danger btn-sm"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? "Удаление..." : "Удалить"}
          </button>
        </div>
      </header>

      {/* Loading/error banners */}
      {(track.status === "analyzing" || track.status === "pending") && (
        <LoadingState message="Анализ аудио... Это может занять некоторое время." />
      )}
      {track.status === "error" && (
        <div className="analysis-error">
          <p className="error-message">
            Ошибка анализа: {track.error || "Неизвестная ошибка"}
          </p>
        </div>
      )}

      {/* Dashboard */}
      {track.status === "ready" && tl && dur > 0 && (
        <DashboardProvider audioRef={audioRef} duration={dur}>
          <div className="dashboard-player-row">
            <AudioPlayer src={audioSrc} audioRef={audioRef} />
          </div>
          <TimeAxis />

          <div className="dashboard-grid">
            {tl.segment && <StructurePanel segments={tl.segment} />}
            <EmotionPanel
              arousalSegments={tl.arousal}
              valenceSegments={tl.valence}
              framePredictions={fp}
              duration={dur}
            />
            {fp?.arousal_reg && fp?.valence_reg && (
              <AVTrajectory
                arousalReg={fp.arousal_reg}
                valenceReg={fp.valence_reg}
                arousalProbs={fp.arousal_probs}
                valenceProbs={fp.valence_probs}
                hopSeconds={fp.frame_hop_seconds}
                duration={dur}
              />
            )}
            <SummaryPanel
              segments={tl.segment}
              genreSegments={tl.genre}
              framePredictions={fp}
              audioFeatures={tl.audio_features}
              duration={dur}
            />
            <GenrePanel
              genreSegments={tl.genre}
              framePredictions={fp}
              duration={dur}
            />
            {id && <SpectrogramPanel trackId={id} duration={dur} />}
          </div>
        </DashboardProvider>
      )}
    </div>
  );
}

export default TrackCard;
