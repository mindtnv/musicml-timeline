import { useEffect, useMemo, useRef, useState } from "react";
import type { Timeline } from "../api/types";
import { useDashboard } from "../dashboard/DashboardContext";
import { formatTime } from "../utils/formatTime";
import { ru } from "../utils/labels";

interface AudioPlayerProps {
  src: string;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  timeline?: Timeline;
}

// Tick stride heuristic — pick the largest "round" interval that yields
// 4–10 visible ticks across the track.
function pickTickStride(duration: number): number {
  const candidates = [10, 15, 20, 30, 60, 120, 300];
  for (const c of candidates) {
    const n = Math.floor(duration / c);
    if (n >= 3 && n <= 10) return c;
  }
  return duration > 600 ? 120 : 30;
}

function AudioPlayer({ src, audioRef, timeline }: AudioPlayerProps) {
  const {
    duration,
    playheadTime,
    isPlaying,
    togglePlay,
    seek,
    pinnedTime,
    setPinnedTime,
    setHoverTime,
  } = useDashboard();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(0.9);
  const [muted, setMuted] = useState(false);
  const [hoverPct, setHoverPct] = useState<number | null>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const waveCanvasRef = useRef<HTMLCanvasElement | null>(null);

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

  // Pre-compute segment overlay geometry.  Segments inside the scrubber are
  // monochrome glass blocks whose alpha = the model's confidence in the
  // segment label — same encoding as the vibe-mode player.
  // Segments are now monochrome — colour previously distinguished
  // Verse/Chorus/Bridge/etc. but the noise outweighed the value.  All
  // segments render as soft white glass blocks with alpha encoding the
  // model's confidence; only the *active* one (highlighted via CSS) gets
  // tinted with the track's mood colour.
  const segmentBlocks = useMemo(() => {
    if (!timeline?.segment || duration <= 0) return [];
    return timeline.segment.map((s) => ({
      label: s.label,
      confidence: Math.max(0, Math.min(1, s.confidence)),
      left: (s.start / duration) * 100,
      widthPct: ((s.end - s.start) / duration) * 100,
      alpha: 0.06 + 0.16 * Math.max(0, Math.min(1, s.confidence)),
    }));
  }, [timeline, duration]);

  // Tick marks at "round" intervals
  const ticks = useMemo(() => {
    if (duration <= 0) return [];
    const stride = pickTickStride(duration);
    const out: { t: number; left: number }[] = [];
    for (let t = 0; t <= duration; t += stride) {
      out.push({ t, left: (t / duration) * 100 });
    }
    return out;
  }, [duration]);

  // Active segment under the playhead — used to softly glow the containing
  // block inside the scrubber, like a "now playing" highlight on a vinyl.
  const activeSegmentIdx = useMemo(() => {
    if (!timeline?.segment) return -1;
    for (let i = 0; i < timeline.segment.length; i++) {
      const s = timeline.segment[i];
      if (playheadTime >= s.start && playheadTime < s.end) return i;
    }
    return -1;
  }, [timeline, playheadTime]);

  // Render the loudness waveform onto a canvas behind the scrubber.
  // RMS values from audio_features are normalised peaks plotted as a
  // mirrored bar series — Soundcloud-style premium feel without
  // recomputing audio in the browser.
  useEffect(() => {
    const canvas = waveCanvasRef.current;
    const rms = timeline?.audio_features?.loudness_rms;
    if (!canvas || !rms || rms.length === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssW, cssH);

    // Normalise RMS to its 95th percentile so the loudest peaks fill the bar.
    const sorted = [...rms].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)] || 1;

    const N = rms.length;
    const barGap = 1;
    const barW = Math.max(1, cssW / N - barGap);
    const mid = cssH / 2;
    ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
    for (let i = 0; i < N; i++) {
      const v = Math.min(1, rms[i] / p95);
      const h = Math.max(1, v * (cssH * 0.85));
      const x = (i / N) * cssW;
      ctx.fillRect(x, mid - h / 2, barW, h);
    }
  }, [timeline]);

  // Lookup current segment under hover position for the tooltip
  const hoverInfo = useMemo(() => {
    if (hoverPct == null || duration <= 0) return null;
    const t = hoverPct * duration;
    let label = "";
    if (timeline?.segment) {
      for (const s of timeline.segment) {
        if (s.start <= t && t < s.end) { label = s.label; break; }
      }
    }
    return { t, label };
  }, [hoverPct, duration, timeline]);

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const bar = progressRef.current;
    if (!bar || duration <= 0) return;
    const r = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    seek(pct * duration);
  };

  const handleHover = (e: React.MouseEvent<HTMLDivElement>) => {
    const bar = progressRef.current;
    if (!bar) return;
    const r = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    setHoverPct(pct);
    if (duration > 0) setHoverTime(pct * duration);
  };

  const handleHoverLeave = () => {
    setHoverPct(null);
    setHoverTime(null);
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

      <div className="player-v2-time" aria-live="polite">
        {isPlaying && (
          <span
            className="player-v2-now-pulse"
            aria-hidden="true"
            title="Воспроизведение"
          />
        )}
        <span className="player-v2-time-current">{formatTime(playheadTime)}</span>
        <span className="player-v2-time-sep">/</span>
        <span className="player-v2-time-total">{formatTime(duration)}</span>
      </div>

      <div className="player-v2-bar">
        <div
          ref={progressRef}
          className="player-v2-scrubber"
          onClick={handleSeek}
          onMouseMove={handleHover}
          onMouseLeave={handleHoverLeave}
        >
          {/* Loudness waveform — sits behind everything as a Soundcloud-style
              peak meter, derived from audio_features.loudness_rms. */}
          <canvas
            ref={waveCanvasRef}
            className="player-v2-waveform"
            aria-hidden="true"
          />

          {/* Track + segment markers (monochrome glass tinted by segment colour).
              Each segment carries its label + confidence inside the bar — the
              former Структура композиции strip is now the scrubber itself. */}
          <div className="player-v2-track" />
          {segmentBlocks.map((s, i) => (
            <div
              key={i}
              className={`player-v2-segment${i === activeSegmentIdx ? " player-v2-segment--active" : ""}`}
              style={{
                left: `${s.left}%`,
                width: `${s.widthPct}%`,
                opacity: s.alpha,
              }}
              title={`${ru(s.label)} · ${(s.confidence * 100).toFixed(0)}%`}
              onClick={(e) => {
                // Seek to the segment start when the user clicks its label
                e.stopPropagation();
                seek(timeline!.segment![i].start);
                setPinnedTime(timeline!.segment![i].start);
              }}
            >
              <span className="player-v2-segment-label">
                {ru(s.label).toUpperCase()}
                {s.widthPct > 8 && (
                  <span className="player-v2-segment-conf">
                    {(s.confidence * 100).toFixed(0)}%
                  </span>
                )}
              </span>
            </div>
          ))}

          {/* Played progress overlay */}
          <div
            className="player-v2-played"
            style={{ width: `${progress}%` }}
          />

          {/* Tick marks at round intervals */}
          {ticks.map((tk, i) => (
            <div
              key={i}
              className="player-v2-tick"
              style={{ left: `${tk.left}%` }}
            />
          ))}

          {/* Pinned-time marker (still shown if user pinned a moment) */}
          {pinPct != null && (
            <div
              className="player-v2-pin"
              style={{ left: `${pinPct}%` }}
              title={`Зафиксировано: ${formatTime(pinnedTime!)}`}
            />
          )}

          {/* Hover indicator + tooltip */}
          {hoverPct != null && hoverInfo && (
            <div
              className="player-v2-hover"
              style={{ left: `${hoverPct * 100}%` }}
            >
              <div className="player-v2-hover-tip">
                <span className="player-v2-hover-tip-time">{formatTime(hoverInfo.t)}</span>
                {hoverInfo.label && (
                  <span className="player-v2-hover-tip-seg">{ru(hoverInfo.label)}</span>
                )}
              </div>
            </div>
          )}

          {/* Playhead */}
          <div
            className="player-v2-head"
            style={{ left: `${progress}%` }}
          />
        </div>

        {/* Tick time labels under the bar */}
        <div className="player-v2-ticks-row">
          {ticks.map((tk, i) => (
            <div
              key={i}
              className="player-v2-tick-label"
              style={{ left: `${tk.left}%` }}
            >
              {formatTime(tk.t)}
            </div>
          ))}
        </div>
      </div>

      {/* Volume */}
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
