import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { Track } from "../api/types";
import { fetchTrack, deleteTrack, getAudioUrl } from "../api/client";
import AudioPlayer from "./AudioPlayer";
import LoadingState from "./LoadingState";
import ShortcutsHelp from "./ShortcutsHelp";
import ShareExportMenu from "./ShareExportMenu";
// ArcBadge is rendered inside EmotionPanel via its `actions` prop
import EmbeddingPanel from "../dashboard/panels/EmbeddingPanel";
import { computeMood } from "./MoodBadge";
import { DashboardSkeleton } from "./Skeleton";
import { DashboardProvider } from "../dashboard/DashboardContext";
import StructurePanel from "../dashboard/panels/StructurePanel";
import EmotionPanel from "../dashboard/panels/EmotionPanel";
import EmotionalProfilePanel from "../dashboard/panels/EmotionalProfilePanel";
import GenrePanel from "../dashboard/panels/GenrePanel";
import SpectrogramPanel from "../dashboard/panels/SpectrogramPanel";
import VibeMode from "../vibe/VibeMode";
import { getGenreColor } from "../utils/colors";
import { ru } from "../utils/labels";
import { displayName } from "../utils/displayName";
import { formatTime } from "../utils/formatTime";

function TrackCard() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [track, setTrack] = useState<Track | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [vibeOpen, setVibeOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const clearConfirmTimer = useCallback(() => {
    if (confirmTimerRef.current) {
      clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }
  }, []);

  const requestDelete = useCallback(() => {
    if (deleting) return;
    setConfirmDelete(true);
    clearConfirmTimer();
    // Auto-dismiss the confirmation after 4s to prevent accidental clicks later
    confirmTimerRef.current = setTimeout(() => setConfirmDelete(false), 4000);
  }, [deleting, clearConfirmTimer]);

  const cancelDelete = useCallback(() => {
    clearConfirmTimer();
    setConfirmDelete(false);
  }, [clearConfirmTimer]);

  const handleDelete = useCallback(async () => {
    if (!id || deleting) return;
    clearConfirmTimer();
    setConfirmDelete(false);
    setDeleting(true);
    try {
      await deleteTrack(id);
      navigate("/");
    } catch {
      setDeleting(false);
    }
  }, [id, deleting, navigate, clearConfirmTimer]);

  // Dismiss confirmation on Escape
  useEffect(() => {
    if (!confirmDelete) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelDelete();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [confirmDelete, cancelDelete]);

  // Cleanup confirmation timer on unmount
  useEffect(() => () => clearConfirmTimer(), [clearConfirmTimer]);

  // Keyboard shortcuts:
  //   Space              — play / pause
  //   ← / →              — seek −5 / +5 sec
  //   Shift + ← / →      — seek −15 / +15 sec
  //   Home / End         — jump to start / end
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;

      const audio = audioRef.current;
      if (!audio) return;

      if (e.code === "Space") {
        e.preventDefault();
        if (audio.paused) audio.play().catch(() => {});
        else audio.pause();
        return;
      }

      if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
        if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
        e.preventDefault();
        const base = e.shiftKey ? 15 : 5;
        const delta = e.code === "ArrowLeft" ? -base : base;
        audio.currentTime = Math.max(
          0,
          Math.min(audio.duration, audio.currentTime + delta)
        );
        return;
      }

      if (e.code === "Home") {
        e.preventDefault();
        audio.currentTime = 0;
        return;
      }

      if (e.code === "End") {
        if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
        e.preventDefault();
        audio.currentTime = Math.max(0, audio.duration - 0.1);
        return;
      }
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

  const mood = computeMood(tl?.arousal, tl?.valence);
  const segCount = tl?.segment?.length ?? 0;

  // Mood + genre colours feed the dashboard's ambient backdrop and hero glow
  // — the surface "knows" what track is playing, the way Apple Music's
  // now-playing screen takes on the album-art palette.
  const moodVar = mood?.color ?? "#7dd3fc";
  const genreVar = topGenre ? getGenreColor(topGenre.label) : moodVar;
  const dashStyle = {
    "--track-mood": moodVar,
    "--track-genre": genreVar,
  } as React.CSSProperties;

  return (
    <div className="dashboard-page fade-in" style={dashStyle}>
      {/* Hero — Apple Music NowPlaying-style focal zone.  Title floats on
          the mood-tinted backdrop, the affective signature lives on the
          right as a glowing A/V circle. */}
      <header className="dashboard-header dashboard-hero">
        <div className="dashboard-hero-bar">
          <button className="dashboard-back" onClick={() => navigate("/")}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
            </svg>
            К списку
          </button>
          <div className="dashboard-hero-actions">
            <ShortcutsHelp />
            {id && track.status === "ready" && tl && (
              <ShareExportMenu trackId={id} />
            )}
            {track.status === "ready" && tl && dur > 0 && (
              <button
                className="btn btn-sm btn-vibe"
                onClick={() => setVibeOpen(true)}
                title="Fullscreen-визуализация трека"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 3v18M3 12h18M5.64 5.64l12.72 12.72M5.64 18.36L18.36 5.64" />
                </svg>
                Вайб
              </button>
            )}
            {confirmDelete ? null : (
              <button
                className="btn btn-danger btn-sm"
                onClick={requestDelete}
                disabled={deleting}
                title="Удалить трек"
              >
                Удалить
              </button>
            )}
          </div>
        </div>

        <div className="dashboard-hero-body">
          {track.coverUrl && (
            <div className="dashboard-hero-cover">
              <img
                src={track.coverUrl}
                alt=""
                className="dashboard-hero-cover-img"
              />
              <div className="dashboard-hero-cover-glow" aria-hidden="true" />
            </div>
          )}
          <div className="dashboard-hero-text">
            <div className="dashboard-hero-eyebrow">Анализ трека</div>
            <h1 className="dashboard-hero-title" title={track.originalName}>
              {track.title || displayName(track.originalName)}
            </h1>
            {track.artist && (
              <div className="dashboard-hero-artist">{track.artist}</div>
            )}
            <div className="dashboard-hero-chips">
              {topGenre && (
                <span
                  className="dashboard-hero-chip dashboard-hero-chip--genre"
                  style={
                    {
                      "--chip-tint": getGenreColor(topGenre.label),
                    } as React.CSSProperties
                  }
                >
                  <span className="dashboard-hero-chip-dot" />
                  {ru(topGenre.label)}
                </span>
              )}
              {mood && (
                <span
                  className="dashboard-hero-chip dashboard-hero-chip--mood"
                  style={{ "--chip-tint": mood.color } as React.CSSProperties}
                  title={`valence ${Math.round(mood.valence * 100)}% · arousal ${Math.round(mood.arousal * 100)}%`}
                >
                  <span className="dashboard-hero-chip-dot" />
                  {mood.label}
                </span>
              )}
              {tl?.audio_features?.tempo_bpm != null && (
                <span className="dashboard-hero-chip">
                  {Math.round(tl.audio_features.tempo_bpm)} BPM
                </span>
              )}
              {tl?.audio_features?.key && (
                <span className="dashboard-hero-chip">
                  {tl.audio_features.key.key} {tl.audio_features.key.mode === "Major" ? "мажор" : "минор"}
                </span>
              )}
              {dur > 0 && (
                <span className="dashboard-hero-chip dashboard-hero-chip--muted">
                  {formatTime(dur)} · {segCount} сегм.
                </span>
              )}
            </div>
          </div>

        </div>

        {/* Inline delete-confirm appears in-flow under the hero bar */}
        {confirmDelete && (
          <div className="dashboard-hero-confirm">
            <div className="delete-confirm" role="group" aria-label="Подтвердите удаление">
              <span className="delete-confirm-text">Удалить трек?</span>
              <button
                className="btn btn-danger btn-sm delete-confirm-yes"
                onClick={handleDelete}
                disabled={deleting}
                autoFocus
              >
                {deleting ? "Удаление..." : "Да, удалить"}
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={cancelDelete}
                disabled={deleting}
                aria-label="Отменить"
              >
                Отмена
              </button>
            </div>
          </div>
        )}
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
          <AudioPlayer src={audioSrc} audioRef={audioRef} timeline={tl} />

          <div className="dashboard-grid">
            {tl.segment && <StructurePanel segments={tl.segment} />}
            <EmotionPanel
              framePredictions={fp}
              duration={dur}
              emotionalArc={tl.emotional_arc}
              keyMoments={tl.key_moments}
            />
            {id && tl.track_embedding && (
              <EmbeddingPanel trackId={id} />
            )}
            {fp?.arousal_reg && fp?.valence_reg && (
              <EmotionalProfilePanel
                arousalReg={fp.arousal_reg}
                valenceReg={fp.valence_reg}
                arousalProbs={fp.arousal_probs}
                valenceProbs={fp.valence_probs}
                hopSeconds={fp.frame_hop_seconds}
                duration={dur}
                segments={tl.segment}
                genreSegments={tl.genre}
                audioFeatures={tl.audio_features}
              />
            )}
            <GenrePanel
              genreSegments={tl.genre}
              framePredictions={fp}
              duration={dur}
            />
            {id && <SpectrogramPanel trackId={id} duration={dur} />}
          </div>
        </DashboardProvider>
      )}

      {vibeOpen && track.status === "ready" && tl && (
        <VibeMode
          audioRef={audioRef}
          timeline={tl}
          trackName={displayName(track.originalName)}
          onClose={() => setVibeOpen(false)}
        />
      )}
    </div>
  );
}

export default TrackCard;
