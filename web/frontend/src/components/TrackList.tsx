import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { Track } from "../api/types";
import { fetchTracks } from "../api/client";
import { getGenreColor } from "../utils/colors";
import { formatTime } from "../utils/formatTime";
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
      return "Ready";
    case "analyzing":
      return "Analyzing...";
    case "error":
      return "Error";
    default:
      return "Pending";
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

  // Poll for status updates when any track is analyzing
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
      <UploadZone />

      {loading && tracks.length === 0 && (
        <LoadingState message="Loading tracks..." />
      )}

      {error && <p className="error-message">{error}</p>}

      {!loading && tracks.length === 0 && !error && (
        <div className="empty-state">
          <p>No tracks yet. Upload an audio file to get started.</p>
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
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="var(--accent)">
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
                        {genre}
                      </span>
                    )}

                    {dur > 0 && (
                      <span className="track-preview-duration">{formatTime(dur)}</span>
                    )}
                  </div>
                </div>

                <div className="track-preview-arrow">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--text-secondary)">
                    <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z" />
                  </svg>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default TrackListPage;
