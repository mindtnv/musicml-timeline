import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchSimilarTracks, type SimilarTrack } from "../api/client";
import { ru } from "../utils/labels";
import { displayName } from "../utils/displayName";

interface Props {
  trackId: string;
}

/**
 * "Similar tracks" section shown on the track dashboard.  Fetches top-5
 * cosine-similar tracks from the backend (pure vector math, no ML call).
 * Each card links to the full track page.
 */
function SimilarTracks({ trackId }: Props) {
  const [similar, setSimilar] = useState<SimilarTrack[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchSimilarTracks(trackId, 5)
      .then((r) => { if (!cancelled) setSimilar(r.similar); })
      .catch(() => { if (!cancelled) setSimilar([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [trackId]);

  if (loading) {
    return (
      <section className="similar-tracks">
        <h3 className="similar-tracks-title">Похожие треки</h3>
        <div className="similar-tracks-loading">Поиск...</div>
      </section>
    );
  }

  if (similar.length === 0) return null;

  return (
    <section className="similar-tracks">
      <h3 className="similar-tracks-title">
        Похожие треки
        <span className="similar-tracks-badge">по эмбеддингам</span>
      </h3>
      <div className="similar-tracks-grid">
        {similar.map((t) => (
          <Link
            key={t.id}
            to={`/tracks/${t.id}`}
            className="similar-track-card"
          >
            {t.coverUrl ? (
              <img
                src={t.coverUrl}
                alt=""
                className="similar-track-cover"
              />
            ) : (
              <div className="similar-track-cover similar-track-cover--empty">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M9 18V5l12-2v13" />
                  <circle cx="6" cy="18" r="3" />
                  <circle cx="18" cy="16" r="3" />
                </svg>
              </div>
            )}
            <div className="similar-track-info">
              <div className="similar-track-name">
                {t.title || displayName(t.originalName)}
              </div>
              {t.artist && (
                <div className="similar-track-artist">{t.artist}</div>
              )}
              <div className="similar-track-meta">
                <span className="similar-track-score">
                  {Math.round(t.similarity * 100)}% сходство
                </span>
                {t.genre && (
                  <span className="similar-track-genre">
                    {ru(t.genre)}
                  </span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default SimilarTracks;
