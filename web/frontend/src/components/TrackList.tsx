import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { Track } from "../api/types";
import { fetchTracks } from "../api/client";
import { getGenreColor } from "../utils/colors";
import { formatTime } from "../utils/formatTime";
import { ru } from "../utils/labels";
import UploadZone from "./UploadZone";
import MiniStructureStrip from "./MiniStructureStrip";
import MoodBadge, { computeMood } from "./MoodBadge";
import { TrackListSkeleton } from "./Skeleton";
import { displayName } from "../utils/displayName";

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

type SortMode = "recent" | "name" | "duration" | "genre";

function TrackListPage() {
  const navigate = useNavigate();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("recent");
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

  const filteredTracks = tracks
    .filter((t) => {
      if (!query.trim()) return true;
      const q = query.trim().toLowerCase();
      const display = displayName(t.originalName).toLowerCase();
      const genre = getTopGenre(t)?.toLowerCase() ?? "";
      return (
        display.includes(q) ||
        t.originalName.toLowerCase().includes(q) ||
        genre.includes(q) ||
        ru(genre).toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      switch (sortMode) {
        case "name":
          return displayName(a.originalName).localeCompare(displayName(b.originalName), "ru");
        case "duration":
          return getDuration(b) - getDuration(a);
        case "genre": {
          const ga = getTopGenre(a) ?? "";
          const gb = getTopGenre(b) ?? "";
          return ga.localeCompare(gb);
        }
        case "recent":
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

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
        <div className="tracks-section-header">
          <h2 className="section-heading">
            Обработанные треки
            {tracks.length > 0 && <span className="section-count">{tracks.length}</span>}
          </h2>

          {tracks.length > 0 && (
            <div className="tracks-toolbar">
              <div className="tracks-search">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                </svg>
                <input
                  type="text"
                  className="tracks-search-input"
                  placeholder="Поиск по названию или жанру..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Поиск треков"
                />
                {query && (
                  <button
                    type="button"
                    className="tracks-search-clear"
                    onClick={() => setQuery("")}
                    title="Очистить"
                    aria-label="Очистить поиск"
                  >
                    ×
                  </button>
                )}
              </div>

              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                className="tracks-sort"
                aria-label="Сортировка треков"
              >
                <option value="recent">Новые сверху</option>
                <option value="name">По названию</option>
                <option value="duration">По длительности</option>
                <option value="genre">По жанру</option>
              </select>
            </div>
          )}
        </div>

        {loading && tracks.length === 0 && <TrackListSkeleton count={5} />}

        {error && <p className="error-message">{error}</p>}

        {!loading && tracks.length === 0 && !error && (
          <div className="empty-state">
            <div className="empty-state-icon" aria-hidden="true">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 17V5l12-2v12" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="6" cy="17" r="3" />
                <circle cx="18" cy="15" r="3" />
              </svg>
            </div>
            <h3 className="empty-state-title">Треков пока нет</h3>
            <p className="empty-state-text">
              Загрузите аудиофайл выше — и система автоматически проанализирует его структуру,
              эмоции и жанр. Поддерживаются форматы MP3, WAV, FLAC, OGG.
            </p>
          </div>
        )}

        {!loading && tracks.length > 0 && filteredTracks.length === 0 && (
          <div className="empty-state empty-state--compact">
            <p>По запросу «{query}» ничего не найдено.</p>
            <button className="btn btn-ghost btn-sm" onClick={() => setQuery("")}>
              Очистить поиск
            </button>
          </div>
        )}

        {filteredTracks.length > 0 && (
          <div className="track-grid">
            {filteredTracks.map((track) => {
              const genre = getTopGenre(track);
              const dur = getDuration(track);
              const segments = track.timeline?.segment;
              const segCount = segments?.length ?? 0;
              const mood = computeMood(track.timeline?.arousal, track.timeline?.valence);
              const genreColor = genre ? getGenreColor(genre) : null;

              // CSS variables drive the icon tint (genre) and the left rail
              // (mood). When either is missing we fall back to the default
              // accent tokens so cards still look intentional.
              const cardStyle = {
                ...(genreColor
                  ? {
                      ["--track-tint" as string]: genreColor,
                      ["--track-tint-bg" as string]: `${genreColor}1a`,
                    }
                  : {}),
                ...(mood ? { ["--track-mood" as string]: mood.color } : {}),
              } as React.CSSProperties;

              return (
                <div
                  key={track.id}
                  className={`track-preview-card${mood ? " track-preview-card--has-mood" : ""}`}
                  style={cardStyle}
                  onClick={() => navigate(`/tracks/${track.id}`)}
                >
                  <div
                    className={`track-preview-icon${genreColor ? " track-preview-icon--tinted" : ""}`}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 3v10.55A4 4 0 1014 17V7h4V3h-6z" />
                    </svg>
                  </div>

                  <div className="track-preview-info">
                    <h3 className="track-preview-name" title={track.originalName}>
                      {displayName(track.originalName)}
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

                      <MoodBadge
                        arousalSegments={track.timeline?.arousal}
                        valenceSegments={track.timeline?.valence}
                      />

                      {segCount > 0 && (
                        <span className="track-preview-segcount">
                          {segCount}&nbsp;сегм.
                        </span>
                      )}

                      {dur > 0 && (
                        <span className="track-preview-duration">{formatTime(dur)}</span>
                      )}
                    </div>

                    {segments && segments.length > 0 && dur > 0 && (
                      <div className="track-preview-strip">
                        <MiniStructureStrip segments={segments} duration={dur} />
                      </div>
                    )}
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
