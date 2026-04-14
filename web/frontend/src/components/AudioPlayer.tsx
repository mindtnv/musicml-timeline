import { useCallback, useRef } from "react";
import type { AudioPlayerState } from "../hooks/useAudioPlayer";
import { formatTime } from "../utils/formatTime";

interface AudioPlayerProps {
  src: string;
  player: AudioPlayerState;
}

function AudioPlayer({ src, player }: AudioPlayerProps) {
  const { audioRef, isPlaying, currentTime, duration, toggle, seek } = player;
  const progressRef = useRef<HTMLDivElement>(null);

  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const bar = progressRef.current;
      if (!bar || !duration) return;
      const rect = bar.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      seek(ratio * duration);
    },
    [duration, seek]
  );

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="audio-player">
      <audio ref={audioRef} src={src} preload="metadata" />

      <button className="play-btn" onClick={toggle} aria-label={isPlaying ? "Пауза" : "Воспроизвести"}>
        {isPlaying ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="6,4 20,12 6,20" />
          </svg>
        )}
      </button>

      <span className="time-display">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>

      <div className="progress-bar" ref={progressRef} onClick={handleProgressClick}>
        <div className="progress-fill" style={{ width: `${progress}%` }} />
        <div className="progress-thumb" style={{ left: `${progress}%` }} />
      </div>
    </div>
  );
}

export default AudioPlayer;
