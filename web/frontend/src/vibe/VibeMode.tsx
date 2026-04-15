import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Timeline } from "../api/types";
import VibeCanvas from "./VibeCanvas";
import AVTrajectoryMini from "./AVTrajectoryMini";
import StructureRibbon from "./StructureRibbon";
import { semanticsAtTime } from "./semanticFrame";
import { ru } from "../utils/labels";
import "./vibe.css";

interface Props {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  timeline: Timeline;
  trackName: string;
  onClose: () => void;
}

interface HudState {
  segment: string;
  arousal: number;
  valence: number;
  genre: string;
  genreConf: number;
}

function VibeMode({ audioRef, timeline, trackName, onClose }: Props) {
  const [hud, setHud] = useState<HudState>(() => ({
    segment: "",
    arousal: 0.5,
    valence: 0.5,
    genre: "",
    genreConf: 0,
  }));
  const [tickOn, setTickOn] = useState(false);

  // HUD text updates — polled at ~5 Hz to keep React work low.
  useEffect(() => {
    const id = setInterval(() => {
      const audio = audioRef.current;
      if (!audio) return;
      const s = semanticsAtTime(audio.currentTime, timeline);
      setHud({
        segment: s.segmentLabel,
        arousal: s.arousal,
        valence: s.valence,
        genre: s.genreLabel,
        genreConf: s.genreConfidence,
      });
    }, 200);
    return () => clearInterval(id);
  }, [audioRef, timeline]);

  // Model tick pulse — a pinhead light that fires each time a new frame
  // prediction would land.  Makes the discrete inference cadence visible
  // underneath the continuous audio.
  useEffect(() => {
    const hop = timeline.frame_predictions?.frame_hop_seconds ?? 1.0;
    if (hop <= 0) return;
    let raf = 0;
    let last = -1;
    let running = true;
    const tick = () => {
      if (!running) return;
      const audio = audioRef.current;
      if (audio) {
        const step = Math.floor(audio.currentTime / hop);
        if (step !== last) {
          last = step;
          setTickOn(true);
          setTimeout(() => setTickOn(false), 120);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
    };
  }, [audioRef, timeline]);

  // Esc closes, Space plays/pauses.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.code === "Space") {
        const audio = audioRef.current;
        if (!audio) return;
        e.preventDefault();
        if (audio.paused) audio.play().catch(() => {});
        else audio.pause();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [audioRef, onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const af = timeline.audio_features;
  const bpm = af?.tempo_bpm != null ? Math.round(af.tempo_bpm) : null;
  const key = af?.key ? `${af.key.key} ${af.key.mode === "Major" ? "мажор" : "минор"}` : null;

  const body = (
    <div className="vibe-root" role="dialog" aria-label="Режим визуализации">
      <VibeCanvas audioRef={audioRef} timeline={timeline} />

      {/* Top bar: title + meta chips + close */}
      <div className="vibe-hud vibe-hud-top">
        <div className="vibe-hud-title-block">
          <div className="vibe-hud-title">{trackName}</div>
          <div className="vibe-hud-chips">
            {hud.genre && (
              <span className="vibe-chip vibe-chip-genre">
                {ru(hud.genre)}
                <span className="vibe-chip-conf">
                  {Math.round(hud.genreConf * 100)}%
                </span>
              </span>
            )}
            {key && <span className="vibe-chip">{key}</span>}
            {bpm && <span className="vibe-chip">{bpm} BPM</span>}
            <span
              className={`vibe-tick ${tickOn ? "vibe-tick-on" : ""}`}
              title="Такт ML-инференса"
            />
          </div>
        </div>
        <button
          className="vibe-hud-close"
          onClick={onClose}
          aria-label="Выйти (Esc)"
          title="Выйти (Esc)"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </button>
      </div>

      {/* Bottom-left: A/V trajectory mini-map */}
      <div className="vibe-avmini-wrap">
        <AVTrajectoryMini audioRef={audioRef} timeline={timeline} />
      </div>

      {/* Bottom-right: semantic stats panel with subtle footer hint */}
      <div className="vibe-hud vibe-hud-bottom">
        <div className="vibe-hud-stats-row">
          <div className="vibe-hud-stat">
            <span className="vibe-hud-stat-label">Сегмент</span>
            <span className="vibe-hud-stat-val">
              {hud.segment ? ru(hud.segment) : "—"}
            </span>
          </div>
          <div className="vibe-hud-stat">
            <span className="vibe-hud-stat-label">Arousal</span>
            <span className="vibe-hud-stat-val">
              {Math.round(hud.arousal * 100)}%
            </span>
          </div>
          <div className="vibe-hud-stat">
            <span className="vibe-hud-stat-label">Valence</span>
            <span className="vibe-hud-stat-val">
              {Math.round(hud.valence * 100)}%
            </span>
          </div>
        </div>
        <div className="vibe-hud-hint">
          <kbd>Esc</kbd> выход <span className="vibe-hud-hint-sep">·</span>{" "}
          <kbd>Space</kbd> пауза
        </div>
      </div>

      {/* Full-width structural timeline */}
      <StructureRibbon audioRef={audioRef} timeline={timeline} />
    </div>
  );

  return createPortal(body, document.body);
}

export default VibeMode;
