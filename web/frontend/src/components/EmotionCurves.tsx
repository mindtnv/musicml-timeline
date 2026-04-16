import { useRef, useEffect, useState, useCallback } from "react";
import type { TimeScale } from "../dashboard/useTimeScale";
import type { KeyMoment } from "../api/types";

interface EmotionCurvesProps {
  arousalReg: number[];
  valenceReg: number[];
  hopSeconds: number;
  duration: number;
  timeScale: TimeScale;
  width: number;
  height: number;
  /** Key moments to render as markers on the chart. */
  keyMoments?: KeyMoment[];
  /** Called when a moment marker is clicked (seek to that time). */
  onMomentClick?: (timeSec: number) => void;
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
  keyMoments,
  onMomentClick,
}: EmotionCurvesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredMoment, setHoveredMoment] = useState<KeyMoment | null>(null);

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
    // ── Key moment markers ──
    if (keyMoments && keyMoments.length > 0) {
      const markerR = 6;
      for (const m of keyMoments) {
        const mx = timeScale.scale(m.time_sec);
        // Place marker at arousal level for that frame
        const fi = Math.min(Math.round(m.time_sec / hopSeconds), arousalReg.length - 1);
        const arVal = fi >= 0 ? rescale(arousalReg[fi]) : 0.5;
        const my = plotTop + plotHeight * (1 - arVal);

        // Vertical dashed line
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = m.color + "44";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(mx, plotTop);
        ctx.lineTo(mx, plotBottom);
        ctx.stroke();
        ctx.setLineDash([]);

        // Marker: outer ring + filled center
        ctx.beginPath();
        ctx.arc(mx, my, markerR + 2, 0, Math.PI * 2);
        ctx.fillStyle = m.color + "30";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(mx, my, markerR, 0, Math.PI * 2);
        ctx.fillStyle = m.color;
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.5)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
    }
  }, [arousalReg, valenceReg, hopSeconds, duration, timeScale, width, height, keyMoments]);

  // Hit-test moments on mouse events
  const findMoment = useCallback(
    (e: React.MouseEvent): KeyMoment | null => {
      if (!keyMoments?.length || !canvasRef.current) return null;
      const rect = canvasRef.current.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const hitR = 22; // generous hit area so markers are easy to hover
      for (const m of keyMoments) {
        const markerX = timeScale.scale(m.time_sec);
        if (Math.abs(markerX - mx) < hitR) return m;
      }
      return null;
    },
    [keyMoments, timeScale],
  );

  // Render interactive overlay hit-zones for each moment.
  // The canvas itself has pointer-events:none (ChartFrame rule), so we use
  // absolutely-positioned divs that sit ON TOP of the canvas and the
  // TimeCursor layer, catching hover/click independently.
  const plotTop = 8;
  const plotBottom = height - 20;
  const plotHeight = plotBottom - plotTop;
  const overlayRef = useRef<HTMLDivElement>(null);

  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="emotion-curves-canvas"
        style={{ width, height, display: "block" }}
      />
      {/* Clickable hit-zones for each moment marker */}
      {keyMoments && keyMoments.length > 0 && (
        <div
          ref={overlayRef}
          className="moment-overlay"
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        >
          {keyMoments.map((m) => {
            const mx = timeScale.scale(m.time_sec);
            const fi = Math.min(
              Math.round(m.time_sec / hopSeconds),
              arousalReg.length - 1,
            );
            const arVal = fi >= 0 ? rescale(arousalReg[fi]) : 0.5;
            const my = plotTop + plotHeight * (1 - arVal);
            return (
              <div
                key={`${m.type}-${m.time_sec}`}
                className="moment-hitzone"
                style={{
                  position: "absolute",
                  left: mx - 16,
                  top: my - 16,
                  width: 32,
                  height: 32,
                  pointerEvents: "auto",
                  cursor: "pointer",
                  zIndex: 10,
                }}
                onMouseEnter={(e) => {
                  setHoveredMoment(m);
                  setMousePos({ x: e.clientX, y: e.clientY });
                }}
                onMouseMove={(e) => {
                  setMousePos({ x: e.clientX, y: e.clientY });
                }}
                onMouseLeave={() => setHoveredMoment(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  if (onMomentClick) onMomentClick(m.time_sec);
                }}
              />
            );
          })}
        </div>
      )}
      {/* Tooltip — fixed position to escape overflow:hidden */}
      {hoveredMoment && mousePos && (
        <div
          className="moment-tooltip"
          style={{
            position: "fixed",
            left: mousePos.x,
            top: mousePos.y - 16,
            transform: "translate(-50%, -100%)",
          }}
        >
          <span className="moment-tooltip-head">
            <span
              className="moment-tooltip-dot"
              style={{ background: hoveredMoment.color }}
            />
            {hoveredMoment.label_ru}
            <span className="moment-tooltip-time">
              {Math.floor(hoveredMoment.time_sec / 60)}:
              {String(Math.floor(hoveredMoment.time_sec % 60)).padStart(2, "0")}
            </span>
          </span>
          <span className="moment-tooltip-desc">
            {hoveredMoment.description_ru}
          </span>
        </div>
      )}
    </>
  );
}

export default EmotionCurves;
