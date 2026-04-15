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

const AROUSAL_COLOR = "#ef4444";
const VALENCE_COLOR = "#6366f1";
const GRID_COLOR = "rgba(15,23,42,0.06)";
const GRID_TEXT_COLOR = "rgba(71,85,105,0.7)";
const FONT = '11px "Inter", "Segoe UI", system-ui, sans-serif';

/**
 * Two overlaid emotion regression curves drawn in Canvas.
 * Cursor is overlaid by ChartFrame externally.
 */
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

    // Horizontal grid + labels (0, 0.25, 0.5, 0.75, 1.0)
    ctx.font = FONT;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = GRID_TEXT_COLOR;

    for (const val of [0, 0.25, 0.5, 0.75, 1.0]) {
      const y = plotTop + plotHeight * (1 - val);
      ctx.strokeStyle = GRID_COLOR;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(timeScale.paddingLeft, y);
      ctx.lineTo(timeScale.paddingLeft + timeScale.plotWidth, y);
      ctx.stroke();

      ctx.fillText(val.toFixed(2), timeScale.paddingLeft - 6, y);
    }

    function drawCurve(data: number[], color: string) {
      if (data.length === 0) return;
      ctx!.beginPath();
      ctx!.strokeStyle = color;
      ctx!.lineWidth = 2;
      ctx!.lineJoin = "round";
      ctx!.lineCap = "round";

      for (let i = 0; i < data.length; i++) {
        const t = i * hopSeconds;
        if (t > duration) break;
        const x = timeScale.scale(t);
        const y = plotTop + plotHeight * (1 - Math.max(0, Math.min(1, data[i])));
        if (i === 0) ctx!.moveTo(x, y);
        else ctx!.lineTo(x, y);
      }
      ctx!.stroke();
    }

    drawCurve(valenceReg, VALENCE_COLOR);
    drawCurve(arousalReg, AROUSAL_COLOR);
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
