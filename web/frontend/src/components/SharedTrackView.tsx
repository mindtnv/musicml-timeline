import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchSharedTrack, type SharedTrack } from "../api/client";
import AudioPlayer from "./AudioPlayer";
import { DashboardSkeleton } from "./Skeleton";
import { computeMood } from "./MoodBadge";
import { DashboardProvider } from "../dashboard/DashboardContext";
import StructurePanel from "../dashboard/panels/StructurePanel";
import EmotionPanel from "../dashboard/panels/EmotionPanel";
import EmotionalProfilePanel from "../dashboard/panels/EmotionalProfilePanel";
import GenrePanel from "../dashboard/panels/GenrePanel";
import { getGenreColor } from "../utils/colors";
import { ru } from "../utils/labels";
import { displayName } from "../utils/displayName";
import { formatTime } from "../utils/formatTime";

/**
 * Public, read-only view of a shared analysis.
 *
 * Re-uses the same dashboard panels as the owner's `TrackCard` — only the
 * hero chrome differs (no delete / analyze / vibe / export buttons, a small
 * "Public link · read-only" badge to explain what the page is). The
 * spectrogram panel is intentionally omitted because it requires an
 * owner-scoped spectrogram endpoint; adding a public equivalent is a
 * separate, opt-in feature.
 */
function SharedTrackView() {
  const { shareId } = useParams<{ shareId: string }>();

  const [track, setTrack] = useState<SharedTrack | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!shareId) return;
    setLoading(true);
    fetchSharedTrack(shareId)
      .then((t) => setTrack(t))
      .catch((err) =>
        setError(
          err instanceof Error
            ? err.message
            : "Не удалось загрузить трек по ссылке",
        ),
      )
      .finally(() => setLoading(false));
  }, [shareId]);

  if (loading) return <DashboardSkeleton />;
  if (error || !track) {
    return (
      <div className="error-state">
        <p className="error-message">
          {error ?? "Ссылка недействительна или анализ был удалён."}
        </p>
        <a className="btn btn-secondary" href="/">
          На главную
        </a>
      </div>
    );
  }

  const tl = track.timeline;
  const dur = tl?.metadata?.duration_sec ?? 0;
  const fp = tl?.frame_predictions;

  const topGenre = tl?.genre && tl.genre.length > 0
    ? tl.genre.reduce((best, seg) => (seg.confidence > best.confidence ? seg : best))
    : null;
  const mood = computeMood(tl?.arousal, tl?.valence);
  const segCount = tl?.segment?.length ?? 0;

  const moodVar = mood?.color ?? "#7dd3fc";
  const genreVar = topGenre ? getGenreColor(topGenre.label) : moodVar;
  const dashStyle = {
    "--track-mood": moodVar,
    "--track-genre": genreVar,
  } as React.CSSProperties;

  return (
    <div className="dashboard-page fade-in" style={dashStyle}>
      <header className="dashboard-header dashboard-hero">
        <div className="dashboard-hero-bar">
          <div className="shared-banner" aria-label="Публичная read-only ссылка">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            <span>Открыто по ссылке · режим чтения</span>
          </div>
          <div className="dashboard-hero-actions">
            <a className="btn btn-sm btn-secondary" href="/">
              Открыть приложение
            </a>
          </div>
        </div>

        <div className="dashboard-hero-body">
          {track.coverUrl && (
            <div className="dashboard-hero-cover">
              <img src={track.coverUrl} alt="" className="dashboard-hero-cover-img" />
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
                  style={{ "--chip-tint": getGenreColor(topGenre.label) } as React.CSSProperties}
                >
                  <span className="dashboard-hero-chip-dot" />
                  {ru(topGenre.label)}
                </span>
              )}
              {mood && (
                <span
                  className="dashboard-hero-chip dashboard-hero-chip--mood"
                  style={{ "--chip-tint": mood.color } as React.CSSProperties}
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
                  {tl.audio_features.key.key}{" "}
                  {tl.audio_features.key.mode === "Major" ? "мажор" : "минор"}
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
      </header>

      {track.status === "ready" && tl && dur > 0 && (
        <DashboardProvider audioRef={audioRef} duration={dur}>
          <AudioPlayer src={track.audioUrl} audioRef={audioRef} timeline={tl} />

          <div className="dashboard-grid">
            {tl.segment && <StructurePanel segments={tl.segment} />}
            <EmotionPanel framePredictions={fp} duration={dur} />
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
          </div>
        </DashboardProvider>
      )}
    </div>
  );
}

export default SharedTrackView;
