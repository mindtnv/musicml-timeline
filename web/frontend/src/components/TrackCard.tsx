import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { Track } from "../api/types";
import { fetchTrack, deleteTrack, getAudioUrl } from "../api/client";
import { useAudioPlayer } from "../hooks/useAudioPlayer";
import { usePlayheadSync } from "../hooks/usePlayheadSync";
import {
  SEGMENT_COLORS,
  AROUSAL_COLORS,
  VALENCE_COLORS,
  GENRE_COLORS,
} from "../utils/colors";
import AudioPlayer from "./AudioPlayer";
import InfoBadges from "./InfoBadges";
import Timeline from "./Timeline";
import EmotionCurves from "./EmotionCurves";
import LoadingState from "./LoadingState";

function TrackCard() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [track, setTrack] = useState<Track | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const audioSrc = id ? getAudioUrl(id) : "";
  const player = useAudioPlayer(audioSrc);
  const smoothTime = usePlayheadSync(player.audioRef);

  const loadTrack = useCallback(async () => {
    if (!id) return;
    try {
      const data = await fetchTrack(id);
      setTrack(data);
      setError(null);

      // Stop polling once analysis is complete
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

  // Poll while analyzing
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

  const handleSeek = useCallback(
    (time: number) => {
      player.seek(time);
    },
    [player]
  );

  if (loading) {
    return <LoadingState message="Загрузка трека..." />;
  }

  if (error) {
    return (
      <div className="error-state">
        <p className="error-message">{error}</p>
        <button className="btn btn-secondary" onClick={() => navigate("/")}>
          К списку
        </button>
      </div>
    );
  }

  if (!track) {
    return (
      <div className="error-state">
        <p className="error-message">Трек не найден.</p>
        <button className="btn btn-secondary" onClick={() => navigate("/")}>
          К списку
        </button>
      </div>
    );
  }

  const tl = track.timeline;
  const dur = tl?.metadata?.duration_sec ?? player.duration;
  const fp = tl?.frame_predictions;

  return (
    <div className="track-card fade-in">
      <div className="track-card-header">
        <button className="btn btn-ghost" onClick={() => navigate("/")}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
          </svg>
          К списку
        </button>
        <button
          className="btn btn-danger"
          onClick={handleDelete}
          disabled={deleting}
        >
          {deleting ? "Удаление..." : "Удалить"}
        </button>
      </div>

      <h2 className="track-card-title">{track.originalName}</h2>

      {/* Audio Player */}
      {track.status === "ready" && (
        <AudioPlayer
          src={audioSrc}
          player={player}
          segments={tl?.segment}
          duration={dur}
        />
      )}

      {/* Loading / Error states */}
      {(track.status === "analyzing" || track.status === "pending") && (
        <LoadingState message="Анализ аудио... Это может занять некоторое время." />
      )}

      {track.status === "error" && (
        <div className="analysis-error">
          <p className="error-message">Ошибка анализа: {track.error || "Неизвестная ошибка"}</p>
        </div>
      )}

      {/* Info Badges */}
      {track.status === "ready" && tl && (
        <div className="track-card-section fade-in">
          <InfoBadges
            duration={dur}
            audioFeatures={tl.audio_features}
            genreSegments={tl.genre}
          />
        </div>
      )}

      {/* Timelines */}
      {track.status === "ready" && tl && (
        <div className="track-card-section fade-in">
          <h3 className="section-title">Таймлайн</h3>
          <div className="timeline-container">
            {tl.segment && tl.segment.length > 0 && (
              <Timeline
                segments={tl.segment}
                duration={dur}
                currentTime={smoothTime}
                colorMap={SEGMENT_COLORS}
                label="Структура"
                onSeek={handleSeek}
              />
            )}
            {tl.arousal && tl.arousal.length > 0 && (
              <Timeline
                segments={tl.arousal}
                duration={dur}
                currentTime={smoothTime}
                colorMap={AROUSAL_COLORS}
                label="Энергия"
                onSeek={handleSeek}
              />
            )}
            {tl.valence && tl.valence.length > 0 && (
              <Timeline
                segments={tl.valence}
                duration={dur}
                currentTime={smoothTime}
                colorMap={VALENCE_COLORS}
                label="Настроение"
                onSeek={handleSeek}
              />
            )}
            {tl.genre && tl.genre.length > 0 && (
              <Timeline
                segments={tl.genre}
                duration={dur}
                currentTime={smoothTime}
                colorMap={GENRE_COLORS}
                label="Жанр"
                onSeek={handleSeek}
              />
            )}
          </div>
        </div>
      )}

      {/* Emotion Curves */}
      {track.status === "ready" && fp && (fp.arousal_reg || fp.valence_reg) && (
        <div className="track-card-section fade-in">
          <EmotionCurves
            arousalReg={fp.arousal_reg ?? []}
            valenceReg={fp.valence_reg ?? []}
            hopSeconds={fp.frame_hop_seconds}
            duration={dur}
            currentTime={smoothTime}
            onSeek={handleSeek}
          />
        </div>
      )}
    </div>
  );
}

export default TrackCard;
