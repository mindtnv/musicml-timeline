import { useEffect, useMemo, useRef, useState } from "react";
import type { Timeline } from "../api/types";
import { semanticsAtTime } from "./semanticFrame";
import { ru } from "../utils/labels";

interface Props {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  timeline: Timeline;
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Glass-card player along the bottom edge.  Combines media-player ergonomics
// (play/pause, scrub, hover preview, MM:SS readout) with the model's
// structural understanding: each segment is a monochrome block whose
// opacity reflects the model's confidence in that label, so you can see
// both the structure AND how sure the model is about it without colour
// competing with the shader.
function StructureRibbon({ audioRef, timeline }: Props) {
  const duration = timeline.metadata?.duration_sec ?? 0;
  const [playheadTime, setPlayheadTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hoverPct, setHoverPct] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);

  // Track audio.currentTime via rAF.
  useEffect(() => {
    let raf = 0;
    let running = true;
    const tick = () => {
      if (!running) return;
      const audio = audioRef.current;
      if (audio) {
        setPlayheadTime((prev) => {
          const t = audio.currentTime;
          return Math.abs(t - prev) > 0.05 ? t : prev;
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
    };
  }, [audioRef]);

  // Mirror play / pause state.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setIsPlaying(!audio.paused);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, [audioRef]);

  const segments = useMemo(() => {
    if (!timeline.segment || duration <= 0) return [];
    return timeline.segment.map((s) => ({
      label: s.label,
      left: (s.start / duration) * 100,
      width: ((s.end - s.start) / duration) * 100,
      // Monochrome: confidence drives alpha so high-confidence segments
      // are clearly visible while low-confidence ones recede.
      alpha: 0.12 + 0.32 * Math.max(0, Math.min(1, s.confidence)),
    }));
  }, [timeline, duration]);

  const playheadPct = duration > 0 ? (playheadTime / duration) * 100 : 0;

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    const bar = barRef.current;
    if (!audio || !bar || duration <= 0) return;
    const r = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    audio.currentTime = pct * duration;
  };

  const handleHover = (e: React.MouseEvent<HTMLDivElement>) => {
    const bar = barRef.current;
    if (!bar) return;
    const r = bar.getBoundingClientRect();
    setHoverPct(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)));
  };

  const hoverTime = hoverPct != null ? hoverPct * duration : null;
  const hoverSeg =
    hoverTime != null ? semanticsAtTime(hoverTime, timeline).segmentLabel : "";

  return (
    <div className="vibe-player">
      <button
        className="vibe-player-play"
        onClick={togglePlay}
        aria-label={isPlaying ? "Пауза" : "Воспроизвести"}
        title={isPlaying ? "Пауза (Space)" : "Воспроизвести (Space)"}
      >
        {isPlaying ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="7,4 20,12 7,20" />
          </svg>
        )}
      </button>

      <div className="vibe-player-time" aria-live="off">
        <span className="vibe-player-time-current">
          {formatTime(playheadTime)}
        </span>
        <span className="vibe-player-time-sep">/</span>
        <span className="vibe-player-time-total">{formatTime(duration)}</span>
      </div>

      <div
        ref={barRef}
        className="vibe-player-bar"
        onClick={handleSeek}
        onMouseMove={handleHover}
        onMouseLeave={() => setHoverPct(null)}
      >
        <div className="vibe-player-bar-track" />
        {segments.map((s, i) => (
          <div
            key={i}
            className="vibe-player-bar-seg"
            style={{
              left: `${s.left}%`,
              width: `${s.width}%`,
              opacity: s.alpha,
            }}
          />
        ))}
        <div
          className="vibe-player-bar-played"
          style={{ width: `${playheadPct}%` }}
        />
        <div
          className="vibe-player-bar-head"
          style={{ left: `${playheadPct}%` }}
        />
        {hoverPct != null && hoverTime != null && (
          <div
            className="vibe-player-bar-hover"
            style={{ left: `${hoverPct * 100}%` }}
          >
            <div className="vibe-player-bar-tip">
              <span className="vibe-player-bar-tip-time">
                {formatTime(hoverTime)}
              </span>
              {hoverSeg && (
                <span className="vibe-player-bar-tip-seg">{ru(hoverSeg)}</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default StructureRibbon;
