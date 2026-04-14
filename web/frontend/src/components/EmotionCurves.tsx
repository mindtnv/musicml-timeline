import { useRef, useEffect } from "react";

interface EmotionCurvesProps {
  arousalReg: number[];
  valenceReg: number[];
  hopSeconds: number;
  duration: number;
  currentTime: number;
  onSeek?: (time: number) => void;
}

const CHART_HEIGHT = 180;
const PADDING = { top: 20, right: 16, bottom: 24, left: 40 };
const AROUSAL_COLOR = "#EF5350";
const VALENCE_COLOR = "#7E57C2";
const GRID_COLOR = "rgba(255,255,255,0.08)";
const GRID_TEXT_COLOR = "rgba(255,255,255,0.35)";
const PLAYHEAD_COLOR = "#FF1744";
const FONT = '11px "Segoe UI", system-ui, sans-serif';

function EmotionCurves({
  arousalReg,
  valenceReg,
  hopSeconds,
  duration,
  currentTime,
  onSeek,
}: EmotionCurvesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || duration <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = CHART_HEIGHT * dpr;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = CHART_HEIGHT;
    const plotW = w - PADDING.left - PADDING.right;
    const plotH = h - PADDING.top - PADDING.bottom;

    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.fillRect(PADDING.left, PADDING.top, plotW, plotH);

    // Grid lines & labels
    ctx.font = FONT;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (const val of [0, 0.25, 0.5, 0.75, 1.0]) {
      const y = PADDING.top + plotH * (1 - val);

      ctx.beginPath();
      ctx.moveTo(PADDING.left, y);
      ctx.lineTo(PADDING.left + plotW, y);
      ctx.strokeStyle = GRID_COLOR;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = GRID_TEXT_COLOR;
      ctx.fillText(val.toFixed(2), PADDING.left - 6, y);
    }

    // Draw curve helper
    function drawCurve(
      c: CanvasRenderingContext2D,
      data: number[],
      color: string,
      lw: number,
    ) {
      if (data.length === 0) return;
      c.beginPath();
      c.strokeStyle = color;
      c.lineWidth = lw;
      c.lineJoin = "round";

      for (let i = 0; i < data.length; i++) {
        const t = i * hopSeconds;
        const x = PADDING.left + (t / duration) * plotW;
        const y = PADDING.top + plotH * (1 - Math.max(0, Math.min(1, data[i])));
        if (i === 0) {
          c.moveTo(x, y);
        } else {
          c.lineTo(x, y);
        }
      }
      c.stroke();
    }

    // Draw arousal
    drawCurve(ctx, arousalReg, AROUSAL_COLOR, 2);

    // Draw valence
    drawCurve(ctx, valenceReg, VALENCE_COLOR, 2);

    // Playhead
    if (currentTime > 0 && currentTime <= duration) {
      const px = PADDING.left + (currentTime / duration) * plotW;
      ctx.beginPath();
      ctx.moveTo(px, PADDING.top);
      ctx.lineTo(px, PADDING.top + plotH);
      ctx.strokeStyle = PLAYHEAD_COLOR;
      ctx.lineWidth = 2;
      ctx.shadowColor = PLAYHEAD_COLOR;
      ctx.shadowBlur = 4;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Time axis labels
    ctx.fillStyle = GRID_TEXT_COLOR;
    ctx.font = FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const timeStep = duration > 120 ? 30 : duration > 60 ? 15 : 10;
    for (let t = 0; t <= duration; t += timeStep) {
      const x = PADDING.left + (t / duration) * plotW;
      const m = Math.floor(t / 60);
      const s = Math.floor(t % 60)
        .toString()
        .padStart(2, "0");
      ctx.fillText(`${m}:${s}`, x, PADDING.top + plotH + 6);
    }
  }, [arousalReg, valenceReg, hopSeconds, duration, currentTime]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onSeek || duration <= 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const plotW = rect.width - PADDING.left - PADDING.right;
    const relX = e.clientX - rect.left - PADDING.left;
    const ratio = Math.max(0, Math.min(1, relX / plotW));
    onSeek(ratio * duration);
  };

  if (arousalReg.length === 0 && valenceReg.length === 0) {
    return null;
  }

  return (
    <div className="emotion-curves">
      <div className="emotion-curves-header">
        <h3 className="section-title">Кривые эмоций</h3>
        <div className="emotion-curves-legend">
          <span className="legend-item">
            <span className="legend-dot" style={{ background: AROUSAL_COLOR }} />
            Энергия (arousal)
          </span>
          <span className="legend-item">
            <span className="legend-dot" style={{ background: VALENCE_COLOR }} />
            Настроение (valence)
          </span>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        className="emotion-curves-canvas"
        style={{ height: CHART_HEIGHT }}
        onClick={handleClick}
      />
    </div>
  );
}

export default EmotionCurves;
