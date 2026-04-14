import type { AudioFeatures, TimelineSegment } from "../api/types";
import { getGenreColor } from "../utils/colors";
import { formatTime } from "../utils/formatTime";
import { ru } from "../utils/labels";

interface InfoBadgesProps {
  duration: number;
  audioFeatures?: AudioFeatures;
  genreSegments?: TimelineSegment[];
}

function InfoBadges({ duration, audioFeatures, genreSegments }: InfoBadgesProps) {
  const topGenre = genreSegments && genreSegments.length > 0
    ? genreSegments.reduce((best, seg) =>
        seg.confidence > best.confidence ? seg : best
      , genreSegments[0])
    : null;

  return (
    <div className="info-badges">
      {topGenre && (
        <div
          className="badge badge-genre"
          style={{ backgroundColor: getGenreColor(topGenre.label), color: "#fff" }}
        >
          <span className="badge-label">Жанр</span>
          <span className="badge-value">{ru(topGenre.label)}</span>
        </div>
      )}

      {audioFeatures?.tempo_bpm != null && (
        <div className="badge">
          <span className="badge-label">Темп</span>
          <span className="badge-value">{Math.round(audioFeatures.tempo_bpm)} BPM</span>
        </div>
      )}

      {audioFeatures?.key != null && (
        <div className="badge">
          <span className="badge-label">Тональность</span>
          <span className="badge-value">
            {audioFeatures.key.key} {audioFeatures.key.mode === "Major" ? "мажор" : "минор"}
          </span>
        </div>
      )}

      {duration > 0 && (
        <div className="badge">
          <span className="badge-label">Длительность</span>
          <span className="badge-value">{formatTime(duration)}</span>
        </div>
      )}

      {audioFeatures?.key?.confidence != null && (
        <div className="badge">
          <span className="badge-label">Уверенность</span>
          <span className="badge-value">
            {(audioFeatures.key.confidence * 100).toFixed(0)}%
          </span>
        </div>
      )}
    </div>
  );
}

export default InfoBadges;
