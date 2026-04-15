import { useEffect, useRef } from "react";
import type { Timeline } from "../api/types";
import { rescaleReg } from "./semanticFrame";

interface Props {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  timeline: Timeline;
  size?: number;
}

// Russell's circumplex live-trail.
//
// A 2D canvas showing where the track sits in valence × arousal space right
// now, how it got here over the last 30 s, and a dashed lookahead for the
// next 15 s using the model's per-frame regression outputs.  This is the
// clearest possible artefact of the multi-task regression head — the whole
// affective signature of the track gets drawn live as a shape.
function AVTrajectoryMini({ audioRef, timeline, size = 148 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const audio = audioRef.current;
    if (!canvas || !audio) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);

    const fp = timeline.frame_predictions;
    const hop = fp?.frame_hop_seconds ?? 0;
    const aReg = fp?.arousal_reg ?? [];
    const vReg = fp?.valence_reg ?? [];
    const haveData = hop > 0 && aReg.length > 0 && vReg.length > 0;

    const pad = 12;
    const W = size;
    const H = size;
    const cx = W / 2;
    const cy = H / 2;
    // Outer ring (visual frame) and inner plot radius — leave headroom so
    // the marker / halo at v=0 or a=1 still sit well inside the ring
    // instead of clipping it.
    const R = Math.min(W, H) / 2 - pad;
    const PLOT_R = R * 0.80;

    function toCanvas(v: number, a: number): [number, number] {
      const nx = (Math.max(0, Math.min(1, v)) - 0.5) * 2;  // -1..1
      const ny = -(Math.max(0, Math.min(1, a)) - 0.5) * 2; // y inverted
      return [cx + nx * PLOT_R, cy + ny * PLOT_R];
    }

    let raf = 0;
    let running = true;

    function frame() {
      if (!running) return;

      ctx.clearRect(0, 0, W, H);

      // --- Background: circular plot ---
      ctx.fillStyle = "rgba(8, 10, 18, 0.55)";
      ctx.beginPath();
      ctx.arc(cx, cy, R + 4, 0, Math.PI * 2);
      ctx.fill();

      // Subtle radial rings
      ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
      ctx.lineWidth = 1;
      for (const frac of [0.33, 0.66, 1.0]) {
        ctx.beginPath();
        ctx.arc(cx, cy, R * frac, 0, Math.PI * 2);
        ctx.stroke();
      }
      // Axes
      ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
      ctx.beginPath();
      ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy);
      ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R);
      ctx.stroke();

      // Quadrant hints (subtle)
      ctx.fillStyle = "rgba(255, 255, 255, 0.32)";
      ctx.font = "9px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("AROUSAL", cx, cy - R - 7);
      ctx.save();
      ctx.translate(cx - R - 8, cy);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText("VALENCE", 0, 0);
      ctx.restore();

      if (!haveData) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
        ctx.font = "10px 'JetBrains Mono', monospace";
        ctx.fillText("no regression data", cx, cy);
        raf = requestAnimationFrame(frame);
        return;
      }

      const tNow = audio!.currentTime;
      const idxNow = Math.max(0, Math.min(aReg.length - 1, Math.floor(tNow / hop)));

      // --- Trail (last 30 s) ---
      const trailSecs = 30;
      const trailSteps = Math.max(1, Math.floor(trailSecs / hop));
      const trailStart = Math.max(0, idxNow - trailSteps);
      ctx.lineWidth = 1.6;
      for (let i = trailStart + 1; i <= idxNow; i++) {
        const age = (idxNow - i) / trailSteps; // 0 at now, 1 oldest
        const alpha = 0.85 * (1 - age);
        const [x0, y0] = toCanvas(rescaleReg(vReg[i - 1] ?? 0), rescaleReg(aReg[i - 1] ?? 0));
        const [x1, y1] = toCanvas(rescaleReg(vReg[i] ?? 0), rescaleReg(aReg[i] ?? 0));
        ctx.strokeStyle = `rgba(220, 120, 255, ${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }

      // --- Lookahead (next 15 s) ---
      const aheadSecs = 15;
      const aheadSteps = Math.max(1, Math.floor(aheadSecs / hop));
      const aheadEnd = Math.min(aReg.length - 1, idxNow + aheadSteps);
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = "rgba(120, 200, 255, 0.4)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      let started = false;
      for (let i = idxNow; i <= aheadEnd; i++) {
        const [x, y] = toCanvas(rescaleReg(vReg[i] ?? 0), rescaleReg(aReg[i] ?? 0));
        if (!started) { ctx.moveTo(x, y); started = true; }
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // --- Current point ---
      const [nx, ny] = toCanvas(rescaleReg(vReg[idxNow] ?? 0), rescaleReg(aReg[idxNow] ?? 0));
      // Halo
      const haloR = 9 + 3 * Math.sin(tNow * 4);
      const grad = ctx.createRadialGradient(nx, ny, 0, nx, ny, haloR + 6);
      grad.addColorStop(0, "rgba(255, 200, 255, 0.55)");
      grad.addColorStop(1, "rgba(255, 200, 255, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(nx, ny, haloR + 6, 0, Math.PI * 2);
      ctx.fill();
      // Core
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(nx, ny, 3.2, 0, Math.PI * 2);
      ctx.fill();

      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
    };
  }, [audioRef, timeline, size]);

  return (
    <canvas
      ref={canvasRef}
      className="vibe-avmini"
      style={{ width: size, height: size }}
    />
  );
}

export default AVTrajectoryMini;
