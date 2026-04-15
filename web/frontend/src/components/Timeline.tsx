import { useRef, useEffect } from "react";
import type { TimelineSegment } from "../api/types";
import type { TimeScale } from "../dashboard/useTimeScale";
import { ru } from "../utils/labels";

interface TimelineStripProps {
  segments: TimelineSegment[];
  duration: number;
  timeScale: TimeScale;
  width: number;
  height: number;
  colorMap: Record<string, string>;
  /** Show label text inside segments (disabled for dense strips). */
  showLabels?: boolean;
}

// Tuned for the dark glass theme: monospace caps that read on top of
// translucent fills without competing with the panel typography.
const LABEL_FONT = '600 10px "JetBrains Mono", "SF Mono", "Fira Code", monospace';
const FALLBACK_COLOR = "#94a3b8";
const SEGMENT_ALPHA = 0.55;            // less shouty than 0.85
const DIVIDER_COLOR = "rgba(255,255,255,0.10)";
const LABEL_COLOR = "rgba(255,255,255,0.92)";

/**
 * Pure static canvas strip — renders segments at positions derived from timeScale.
 * Cursor/interaction is handled by ChartFrame + TimeCursor externally.
 */
function TimelineStrip({
  segments,
  duration,
  timeScale,
  width,
  height,
  colorMap,
  showLabels = true,
}: TimelineStripProps) {
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

    for (const seg of segments) {
      const x1 = timeScale.scale(seg.start);
      const x2 = timeScale.scale(seg.end);
      const segW = Math.max(x2 - x1, 1);

      ctx.fillStyle = colorMap[seg.label] ?? FALLBACK_COLOR;
      ctx.globalAlpha = SEGMENT_ALPHA;
      ctx.fillRect(x1, 0, segW, height);
      ctx.globalAlpha = 1;

      if (showLabels && segW > 38) {
        ctx.fillStyle = LABEL_COLOR;
        ctx.font = LABEL_FONT;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        // Letter-spacing isn't supported in canvas — fake it by sparing the
        // confidence number unless the segment is wide enough to breathe.
        const labelText = ru(seg.label).toUpperCase();
        const text =
          segW > 110
            ? `${labelText}  ·  ${(seg.confidence * 100).toFixed(0)}%`
            : labelText;
        ctx.fillText(text, x1 + segW / 2, height / 2, segW - 10);
      }

      // Hairline divider — light on dark
      ctx.strokeStyle = DIVIDER_COLOR;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x2, 0);
      ctx.lineTo(x2, height);
      ctx.stroke();
    }
  }, [segments, duration, timeScale, width, height, colorMap, showLabels]);

  return (
    <canvas
      ref={canvasRef}
      className="timeline-strip-canvas"
      style={{ width, height, display: "block" }}
    />
  );
}

export default TimelineStrip;
