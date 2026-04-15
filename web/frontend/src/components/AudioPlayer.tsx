import { useEffect, useRef, useState } from "react";
import { useDashboard } from "../dashboard/DashboardContext";
import { formatTime } from "../utils/formatTime";

interface AudioPlayerProps {
  src: string;
  audioRef: React.RefObject<HTMLAudioElement | null>;
}

function AudioPlayer({ src, audioRef }: AudioPlayerProps) {
  const { duration, playheadTime, isPlaying, togglePlay, seek, pinnedTime, setPinnedTime } =
    useDashboard();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(0.9);
  const [muted, setMuted] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onCanPlay = () => setReady(true);
    const onError = () => setError("Не удалось загрузить аудио");
    const onLoaded = () => setReady(true);
    audio.addEventListener("canplay", onCanPlay);
    audio.addEventListener("loadeddata", onLoaded);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("loadeddata", onLoaded);
      audio.removeEventListener("error", onError);
    };
  }, [audioRef, src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = muted ? 0 : volume;
  }, [audioRef, volume, muted]);

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const bar = progressRef.current;
    if (!bar || duration <= 0) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seek(ratio * duration);
  };

  const progress = duration > 0 ? (playheadTime / duration) * 100 : 0;
  const pinPct = pinnedTime != null && duration > 0 ? (pinnedTime / duration) * 100 : null;

  return (
    <div className="player-v2">
      <audio ref={audioRef} src={src} preload="auto" />

      <button
        className="player-v2-play"
        onClick={togglePlay}
        disabled={!ready}
        aria-label={isPlaying ? "Пауза" : "Воспроизвести"}
        title={isPlaying ? "Пауза (Space)" : "Воспроизвести (Space)"}
      >
        {isPlaying ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="7,4 20,12 7,20" />
          </svg>
        )}
      </button>

      <div className="player-v2-time" aria-live="polite">
        <span className="player-v2-time-current">{formatTime(playheadTime)}</span>
        <span className="player-v2-time-sep">/</span>
        <span className="player-v2-time-total">{formatTime(duration)}</span>
      </div>

      <div
        className="player-v2-progress"
        ref={progressRef}
        onClick={handleProgressClick}
      >
        <div className="player-v2-progress-track" />
        <div
          className="player-v2-progress-played"
          style={{ width: `${progress}%` }}
        />
        {pinPct != null && (
          <div
            className="player-v2-progress-pin"
            style={{ left: `${pinPct}%` }}
            title={`Зафиксировано: ${formatTime(pinnedTime!)}`}
          />
        )}
        <div
          className="player-v2-progress-head"
          style={{ left: `${progress}%` }}
        />
      </div>

      <div className="player-v2-volume">
        <button
          className="player-v2-mute"
          onClick={() => setMuted((m) => !m)}
          aria-label={muted ? "Включить звук" : "Выключить звук"}
        >
          {muted || volume === 0 ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.796 8.796 0 0021 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 003.69-1.81L19.73 21 21 19.73l-9-9L4.27 3z" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
            </svg>
          )}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={muted ? 0 : volume}
          onChange={(e) => {
            setVolume(parseFloat(e.target.value));
            setMuted(false);
          }}
          className="player-v2-volume-slider"
          aria-label="Громкость"
        />
      </div>

      {pinnedTime != null && (
        <button
          className="player-v2-pin-clear"
          onClick={() => setPinnedTime(null)}
          title="Снять фиксацию"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
          PIN
        </button>
      )}

      {error && <div className="player-v2-error">{error}</div>}
    </div>
  );
}

export default AudioPlayer;
