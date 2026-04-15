import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { Track } from "../api/types";
import { fetchTracks } from "../api/client";
import { getGenreColor } from "../utils/colors";
import { formatTime } from "../utils/formatTime";
import { ru } from "../utils/labels";
import UploadZone from "./UploadZone";
import { computeMood } from "./MoodBadge";
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

const SORT_STORAGE_KEY = "musicml.trackSort";
const GENRE_STORAGE_KEY = "musicml.trackGenre";

function readStoredSort(): SortMode {
  if (typeof window === "undefined") return "recent";
  const raw = window.localStorage.getItem(SORT_STORAGE_KEY);
  if (raw === "recent" || raw === "name" || raw === "duration" || raw === "genre") {
    return raw;
  }
  return "recent";
}

function readStoredGenre(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(GENRE_STORAGE_KEY);
}

function TrackListPage() {
  const navigate = useNavigate();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>(readStoredSort);
  const [genreFilter, setGenreFilter] = useState<string | null>(readStoredGenre);
  const searchInputRef = useRef<HTMLInputElement>(null);
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

  // Persist sort + genre filter across sessions.
  useEffect(() => {
    try { window.localStorage.setItem(SORT_STORAGE_KEY, sortMode); } catch { /* ignore */ }
  }, [sortMode]);

  useEffect(() => {
    try {
      if (genreFilter) window.localStorage.setItem(GENRE_STORAGE_KEY, genreFilter);
      else window.localStorage.removeItem(GENRE_STORAGE_KEY);
    } catch { /* ignore */ }
  }, [genreFilter]);

  // Keyboard shortcut: press `/` anywhere on the list page to focus search.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      e.preventDefault();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  // Count ready tracks per top genre so the filter rail shows usable chips
  // only. Genres with zero tracks are hidden.
  const genreCounts = tracks.reduce<Record<string, number>>((acc, t) => {
    const g = getTopGenre(t)?.toLowerCase();
    if (!g) return acc;
    acc[g] = (acc[g] ?? 0) + 1;
    return acc;
  }, {});

  const availableGenres = Object.entries(genreCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([genre]) => genre);

  // If the stored genre filter no longer matches any track (e.g. user deleted
  // the last classical track last session), silently drop it so the list
  // isn't mysteriously empty on next visit.
  useEffect(() => {
    if (genreFilter && !availableGenres.includes(genreFilter)) {
      setGenreFilter(null);
    }
  }, [genreFilter, availableGenres]);

  const filteredTracks = tracks
    .filter((t) => {
      if (genreFilter) {
        const g = getTopGenre(t)?.toLowerCase();
        if (g !== genreFilter) return false;
      }
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
      {/* Hero — editorial framing for the landing page */}
      <section className="landing-hero" aria-labelledby="hero-title">
        <p className="landing-hero-eyebrow">
          <span className="landing-hero-eyebrow-dot" aria-hidden="true" />
          Магистерская НИР · ТвГУ 2026
        </p>
        <h1 id="hero-title" className="landing-hero-title">
          Временная ось <em>музыкальной формы</em>
        </h1>
        <p className="landing-hero-lede">
          Одна мульти-задачная сеть размечает структуру, восстанавливает
          траекторию энергии и настроения и определяет жанр — в едином
          проходе по аудио.
        </p>
        <div className="landing-hero-tasks" aria-label="Решаемые задачи">
          <span className="landing-hero-task">
            <span className="landing-hero-task-dot" style={{ background: "#f59e0b" }} aria-hidden="true" />
            Структура
          </span>
          <span className="landing-hero-task">
            <span className="landing-hero-task-dot" style={{ background: "#dc2626" }} aria-hidden="true" />
            Энергия
          </span>
          <span className="landing-hero-task">
            <span className="landing-hero-task-dot" style={{ background: "#2563eb" }} aria-hidden="true" />
            Настроение
          </span>
          <span className="landing-hero-task">
            <span className="landing-hero-task-dot" style={{ background: "#16a34a" }} aria-hidden="true" />
            Жанр
          </span>
        </div>
      </section>

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
          <div className="system-info-block system-info-block--metrics">
            <h2 className="system-info-title">Лучшие метрики</h2>
            <ul className="metric-bars" aria-label="Точность по задачам">
              {[
                { label: "Сегментация", value: 40.6, classes: 6 },
                { label: "Энергия", value: 64.9, classes: 3 },
                { label: "Настроение", value: 55.9, classes: 3 },
                { label: "Жанр", value: 83.9, classes: 10 },
              ].map((m) => {
                const baseline = 100 / m.classes;
                const quality =
                  m.value >= 75 ? "high" : m.value >= 55 ? "mid" : "low";
                return (
                  <li
                    key={m.label}
                    className={`metric-bar metric-bar--${quality}`}
                    title={`${m.label}: ${m.value}% точности (${m.classes} классов, случайный baseline ${baseline.toFixed(0)}%)`}
                  >
                    <div className="metric-bar-row">
                      <span className="metric-bar-label">{m.label}</span>
                      <span className="metric-bar-value">{m.value.toFixed(1)}%</span>
                    </div>
                    <div
                      className="metric-bar-track"
                      role="progressbar"
                      aria-valuenow={m.value}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${m.label}: ${m.value}%`}
                    >
                      <div
                        className="metric-bar-baseline"
                        style={{ left: `${baseline}%` }}
                        aria-hidden="true"
                        title={`Случайный baseline: ${baseline.toFixed(0)}%`}
                      />
                      <div
                        className="metric-bar-fill"
                        style={{ width: `${m.value}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
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
                  ref={searchInputRef}
                  type="text"
                  className="tracks-search-input"
                  placeholder="Поиск — название или жанр"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape" && query) {
                      e.preventDefault();
                      setQuery("");
                    }
                  }}
                  aria-label="Поиск треков"
                />
                {!query && (
                  <kbd className="tracks-search-kbd" aria-hidden="true">/</kbd>
                )}
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

        {/* Genre filter rail — appears once the library is big enough to
            warrant quick slicing. Each chip is tinted by its genre's palette
            colour for instant visual recognition. */}
        {tracks.length >= 5 && availableGenres.length >= 2 && (
          <div className="genre-filter-rail" role="group" aria-label="Фильтр по жанру">
            <button
              type="button"
              className={`genre-filter-chip genre-filter-chip--all${genreFilter === null ? " is-active" : ""}`}
              onClick={() => setGenreFilter(null)}
            >
              <span className="genre-filter-label">Все</span>
              <span className="genre-filter-count">{tracks.length}</span>
            </button>
            {availableGenres.map((g) => {
              const color = getGenreColor(g);
              const active = genreFilter === g;
              return (
                <button
                  key={g}
                  type="button"
                  className={`genre-filter-chip${active ? " is-active" : ""}`}
                  style={
                    {
                      ["--chip-tint" as string]: color,
                      ["--chip-tint-bg" as string]: `${color}1a`,
                    } as React.CSSProperties
                  }
                  onClick={() => setGenreFilter(active ? null : g)}
                  aria-pressed={active}
                >
                  <span className="genre-filter-dot" aria-hidden="true" />
                  <span className="genre-filter-label">{ru(g)}</span>
                  <span className="genre-filter-count">{genreCounts[g]}</span>
                </button>
              );
            })}
          </div>
        )}

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
            <p>
              {query && genreFilter
                ? `По запросу «${query}» в жанре «${ru(genreFilter)}» ничего не найдено.`
                : query
                ? `По запросу «${query}» ничего не найдено.`
                : genreFilter
                ? `В жанре «${ru(genreFilter)}» пока нет треков.`
                : "Ничего не найдено."}
            </p>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setQuery("");
                setGenreFilter(null);
              }}
            >
              Сбросить фильтры
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

              const coverSrc = track.coverUrl ? track.coverUrl : null;
              const displayTitle = track.title || displayName(track.originalName);

              return (
                <div
                  key={track.id}
                  className="track-tile"
                  style={cardStyle}
                  onClick={() => navigate(`/tracks/${track.id}`)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="track-tile-cover">
                    {coverSrc ? (
                      <img
                        src={coverSrc}
                        alt=""
                        className="track-tile-cover-img"
                        loading="lazy"
                      />
                    ) : (
                      <div
                        className="track-tile-cover-fallback"
                        aria-hidden="true"
                      >
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 3v10.55A4 4 0 1014 17V7h4V3h-6z" />
                        </svg>
                      </div>
                    )}

                    {/* Play overlay on hover */}
                    <div className="track-tile-play" aria-hidden="true">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="7,4 20,12 7,20" />
                      </svg>
                    </div>

                    {dur > 0 && (
                      <span className="track-tile-duration">{formatTime(dur)}</span>
                    )}

                    {track.status !== "ready" && (
                      <span
                        className={statusBadgeClass(track.status) + " track-tile-status"}
                      >
                        {statusLabel(track.status)}
                      </span>
                    )}
                  </div>

                  <div className="track-tile-info">
                    <h3 className="track-tile-name" title={track.originalName}>
                      {displayTitle}
                    </h3>
                    <p className="track-tile-sub">
                      {track.artist ? (
                        <>
                          <span className="track-tile-artist">{track.artist}</span>
                          {genre && <span className="track-tile-sep">·</span>}
                        </>
                      ) : null}
                      {genre && <span className="track-tile-genre">{ru(genre)}</span>}
                    </p>
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
