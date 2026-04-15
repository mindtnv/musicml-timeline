import { useRef, useEffect } from "react";
import type { TimeScale } from "../dashboard/useTimeScale";

interface EmotionCurvesProps {
  arousalReg: number[];
  valenceReg: number[];
  hopSeconds: number;
  duration: number;
  timeScale: TimeScale;
  width: number;
  height: number;
}

const FONT = '600 10px "JetBrains Mono", "SF Mono", "Fira Code", monospace';
const VALENCE_COLOR = "rgba(255, 255, 255, 0.78)";
const GRID_COLOR = "rgba(255, 255, 255, 0.06)";
const GRID_TEXT_COLOR = "rgba(255, 255, 255, 0.35)";

// Regression heads emit values in [-1, 1]; rescale to [0, 1] so 0.5 reads as
// neutral (matches the rest of the dashboard).
function rescale(x: number): number {
  return Math.max(0, Math.min(1, (x + 1) * 0.5));
}

/** Resolve --track-mood from the nearest styled ancestor; fallback to amber. */
function getMoodColor(el: HTMLElement | null): string {
  if (!el) return "#fbbf24";
  const v = getComputedStyle(el).getPropertyValue("--track-mood").trim();
  return v || "#fbbf24";
}

function hexToRgba(hex: string, alpha: number): string {
  const m = hex.replace("#", "");
  if (m.length !== 6) return `rgba(251, 191, 36, ${alpha})`;
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function EmotionCurves({
  arousalReg,
  valenceReg,
  hopSeconds,
  duration,
  timeScale,
  width,
  height,
}: EmotionCurvesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || duration <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const plotTop = 8;
    const plotBottom = height - 20;
    const plotHeight = plotBottom - plotTop;

    const moodColor = getMoodColor(canvas);
    const arousalStroke = hexToRgba(moodColor, 0.92);
    const arousalFill   = hexToRgba(moodColor, 0.18);

    // Horizontal grid + labels — sparse (3 ticks: 0, 0.5, 1) for premium calm.
    ctx.font = FONT;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = GRID_TEXT_COLOR;

    for (const val of [0, 0.5, 1.0]) {
      const y = plotTop + plotHeight * (1 - val);
      ctx.strokeStyle = GRID_COLOR;
      ctx.lineWidth = val === 0.5 ? 1 : 0.5;
      ctx.beginPath();
      ctx.moveTo(timeScale.paddingLeft, y);
      ctx.lineTo(timeScale.paddingLeft + timeScale.plotWidth, y);
      ctx.stroke();
      ctx.fillText(val.toFixed(1), timeScale.paddingLeft - 8, y);
    }

    function curvePath(data: number[]): Path2D | null {
      if (data.length === 0) return null;
      const path = new Path2D();
      let started = false;
      for (let i = 0; i < data.length; i++) {
        const t = i * hopSeconds;
        if (t > duration) break;
        const x = timeScale.scale(t);
        const y = plotTop + plotHeight * (1 - rescale(data[i]));
        if (!started) { path.moveTo(x, y); started = true; }
        else path.lineTo(x, y);
      }
      return path;
    }

    function fillBelowCurve(data: number[], color: string) {
      if (data.length === 0) return;
      ctx!.beginPath();
      ctx!.fillStyle = color;
      let started = false;
      let lastX = 0;
      for (let i = 0; i < data.length; i++) {
        const t = i * hopSeconds;
        if (t > duration) break;
        const x = timeScale.scale(t);
        const y = plotTop + plotHeight * (1 - rescale(data[i]));
        if (!started) { ctx!.moveTo(x, plotBottom); ctx!.lineTo(x, y); started = true; }
        else ctx!.lineTo(x, y);
        lastX = x;
      }
      ctx!.lineTo(lastX, plotBottom);
      ctx!.closePath();
      ctx!.fill();
    }

    // Soft area fill under arousal — gives the curve weight against dark glass
    fillBelowCurve(arousalReg, arousalFill);

    // Valence — white, thin, on top
    const vpath = curvePath(valenceReg);
    if (vpath) {
      ctx.lineWidth = 1.6;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.strokeStyle = VALENCE_COLOR;
      ctx.stroke(vpath);
    }

    // Arousal — mood-tinted, thicker, drawn last so it pops
    const apath = curvePath(arousalReg);
    if (apath) {
      ctx.lineWidth = 2.0;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      // Glow pass for premium feel
      ctx.shadowColor = arousalStroke;
      ctx.shadowBlur = 8;
      ctx.strokeStyle = arousalStroke;
      ctx.stroke(apath);
      ctx.shadowBlur = 0;
    }
  }, [arousalReg, valenceReg, hopSeconds, duration, timeScale, width, height]);

  return (
    <canvas
      ref={canvasRef}
      className="emotion-curves-canvas"
      style={{ width, height, display: "block" }}
    />
  );
}

export default EmotionCurves;
