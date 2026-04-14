import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { Track } from "../api/types";
import { fetchTracks } from "../api/client";
import { getGenreColor } from "../utils/colors";
import { formatTime } from "../utils/formatTime";
import { ru } from "../utils/labels";
import UploadZone from "./UploadZone";
import LoadingState from "./LoadingState";

function statusBadgeClass(status: Track["status"]): string {
  switch (status) {
    case "ready":
      return "status-badge status-ready";
    case "analyzing":
      return "status-badge status-analyzing";
    case "error":
      return "status-badge status-error";
    default:
      return "status-badge status-pending";
  }
}

function statusLabel(status: Track["status"]): string {
  switch (status) {
    case "ready":
      return "Готов";
    case "analyzing":
      return "Анализ...";
    case "error":
      return "Ошибка";
    default:
      return "Ожидание";
  }
}

function TrackListPage() {
  const navigate = useNavigate();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadTracks = useCallback(async () => {
    try {
      const data = await fetchTracks();
      setTracks(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tracks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTracks();
  }, [loadTracks]);

  useEffect(() => {
    const hasAnalyzing = tracks.some((t) => t.status === "analyzing" || t.status === "pending");
    if (hasAnalyzing) {
      pollRef.current = setInterval(loadTracks, 5000);
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [tracks, loadTracks]);

  const getTopGenre = (track: Track): string | null => {
    const genres = track.timeline?.genre;
    if (!genres || genres.length === 0) return null;
    return genres.reduce((best, seg) =>
      seg.confidence > best.confidence ? seg : best
    , genres[0]).label;
  };

  const getDuration = (track: Track): number => {
    return track.timeline?.metadata?.duration_sec ?? 0;
  };

  return (
    <div className="track-list-page">
      {/* System description */}
      <section className="system-info">
        <div className="system-info-grid">
          <div className="system-info-block">
            <h2 className="system-info-title">О системе</h2>
            <p className="system-info-text">
              Модуль автоматического анализа музыкальных композиций на основе мульти-задачного
              глубокого обучения. Система одновременно решает 4 задачи: сегментация структуры,
              определение уровня энергии (arousal), эмоциональной окраски (valence) и жанра.
            </p>
          </div>
          <div className="system-info-block">
            <h2 className="system-info-title">Архитектура</h2>
            <table className="system-info-table">
              <tbody>
                <tr><td>Backbone</td><td>CNN (5 блоков, SE) + AST (ViT)</td></tr>
                <tr><td>Параметры</td><td>~800K (CNN) / ~14.4M (AST)</td></tr>
                <tr><td>Данные</td><td>DEAM + Harmonix + GTZAN</td></tr>
                <tr><td>Задачи</td><td>Segment, Arousal, Valence, Genre</td></tr>
              </tbody>
            </table>
          </div>
          <div className="system-info-block">
            <h2 className="system-info-title">Лучшие метрики</h2>
            <table className="system-info-table">
              <tbody>
                <tr><td>Сегментация</td><td className="metric-value">40.6% acc</td></tr>
                <tr><td>Энергия</td><td className="metric-value">64.9% acc</td></tr>
                <tr><td>Настроение</td><td className="metric-value">55.9% acc</td></tr>
                <tr><td>Жанр</td><td className="metric-value">83.9% acc</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Upload */}
      <section className="upload-section">
        <h2 className="section-heading">Анализ трека</h2>
        <UploadZone />
      </section>

      {/* Track list */}
      <section className="tracks-section">
        <h2 className="section-heading">
          Обработанные треки
          {tracks.length > 0 && <span className="section-count">{tracks.length}</span>}
        </h2>

        {loading && tracks.length === 0 && (
          <LoadingState message="Загрузка треков..." />
        )}

        {error && <p className="error-message">{error}</p>}

        {!loading && tracks.length === 0 && !error && (
          <div className="empty-state">
            <p>Треков пока нет. Загрузите аудиофайл для анализа.</p>
          </div>
        )}

        {tracks.length > 0 && (
          <div className="track-grid">
            {tracks.map((track) => {
              const genre = getTopGenre(track);
              const dur = getDuration(track);

              return (
                <div
                  key={track.id}
                  className="track-preview-card"
                  onClick={() => navigate(`/tracks/${track.id}`)}
                >
                  <div className="track-preview-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" opacity="0.5">
                      <path d="M12 3v10.55A4 4 0 1014 17V7h4V3h-6z" />
                    </svg>
                  </div>

                  <div className="track-preview-info">
                    <h3 className="track-preview-name" title={track.originalName}>
                      {track.originalName}
                    </h3>

                    <div className="track-preview-meta">
                      <span className={statusBadgeClass(track.status)}>
                        {statusLabel(track.status)}
                      </span>

                      {genre && (
                        <span
                          className="genre-mini-badge"
                          style={{ backgroundColor: getGenreColor(genre) }}
                        >
                          {ru(genre)}
                        </span>
                      )}

                      {dur > 0 && (
                        <span className="track-preview-duration">{formatTime(dur)}</span>
                      )}
                    </div>
                  </div>

                  <div className="track-preview-arrow">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z" />
                    </svg>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export default TrackListPage;
