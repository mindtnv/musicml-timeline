import { useCallback, useRef, useMemo } from "react";
import type { AudioPlayerState } from "../hooks/useAudioPlayer";
import type { TimelineSegment } from "../api/types";
import { SEGMENT_COLORS, getSegmentColor } from "../utils/colors";
import { formatTime } from "../utils/formatTime";

interface AudioPlayerProps {
  src: string;
  player: AudioPlayerState;
  segments?: TimelineSegment[];
  duration?: number;
}

function AudioPlayer({ src, player, segments, duration: propDuration }: AudioPlayerProps) {
  const { audioRef, isPlaying, currentTime, duration: audioDuration, toggle, seek } = player;
  const progressRef = useRef<HTMLDivElement>(null);
  const dur = propDuration || audioDuration;

  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const bar = progressRef.current;
      if (!bar || !dur) return;
      const rect = bar.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      seek(ratio * dur);
    },
    [dur, seek]
  );

  const progress = dur > 0 ? (currentTime / dur) * 100 : 0;

  // Find current segment
  const currentSegment = useMemo(() => {
    if (!segments) return null;
    return segments.find(s => currentTime >= s.start && currentTime < s.end) ?? null;
  }, [segments, currentTime]);

  return (
    <div className="player">
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Top row: play button + info + time */}
      <div className="player-top">
        <button className="play-btn" onClick={toggle} aria-label={isPlaying ? "Пауза" : "Воспроизвести"}>
          {isPlaying ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="7,4 20,12 7,20" />
            </svg>
          )}
        </button>

        <div className="player-info">
          <span className="player-time">
            {formatTime(currentTime)}
            <span className="player-time-sep"> / </span>
            {formatTime(dur)}
          </span>
          {currentSegment && (
            <span
              className="player-segment-badge"
              style={{ backgroundColor: getSegmentColor(currentSegment.label) }}
            >
              {currentSegment.label}
            </span>
          )}
        </div>
      </div>

      {/* Progress bar with segment colors */}
      <div className="player-progress" ref={progressRef} onClick={handleProgressClick}>
        {/* Segment background */}
        {segments && dur > 0 && (
          <div className="player-segments">
            {segments.map((seg, i) => (
              <div
                key={i}
                className="player-segment-slice"
                style={{
                  left: `${(seg.start / dur) * 100}%`,
                  width: `${((seg.end - seg.start) / dur) * 100}%`,
                  backgroundColor: getSegmentColor(seg.label),
                }}
              />
            ))}
          </div>
        )}

        {/* If no segments, plain bar */}
        {(!segments || segments.length === 0) && (
          <div className="player-bar-bg" />
        )}

        {/* Played overlay */}
        <div className="player-played" style={{ width: `${progress}%` }} />

        {/* Playhead */}
        <div className="player-head" style={{ left: `${progress}%` }} />
      </div>
    </div>
  );
}

export default AudioPlayer;
