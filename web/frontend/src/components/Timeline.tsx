import { useRef, useEffect, useCallback, useState } from "react";
import type { TimelineSegment } from "../api/types";
import { formatTime } from "../utils/formatTime";
import { ru } from "../utils/labels";

interface TimelineProps {
  segments: TimelineSegment[];
  duration: number;
  currentTime: number;
  colorMap: Record<string, string>;
  label: string;
  onSeek?: (time: number) => void;
}

interface TooltipData {
  x: number;
  y: number;
  label: string;
  confidence: number;
  start: number;
  end: number;
}

const ROW_HEIGHT = 48;
const LABEL_FONT = '12px "Segoe UI", system-ui, sans-serif';
const FALLBACK_COLOR = "#607D8B";

function Timeline({
  segments,
  duration,
  currentTime,
  colorMap,
  label,
  onSeek,
}: TimelineProps) {
  const staticCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  // Draw segments (static layer)
  useEffect(() => {
    const canvas = staticCanvasRef.current;
    if (!canvas || duration <= 0 || segments.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = ROW_HEIGHT * dpr;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, ROW_HEIGHT);

    const w = rect.width;

    for (const seg of segments) {
      const x1 = (seg.start / duration) * w;
      const x2 = (seg.end / duration) * w;
      const segW = Math.max(x2 - x1, 1);

      ctx.fillStyle = colorMap[seg.label] ?? FALLBACK_COLOR;
      ctx.fillRect(x1, 0, segW, ROW_HEIGHT);

      // Label text if segment wide enough
      if (segW > 40) {
        ctx.fillStyle = "#fff";
        ctx.font = LABEL_FONT;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const text =
          segW > 80
            ? `${ru(seg.label)} (${(seg.confidence * 100).toFixed(0)}%)`
            : ru(seg.label);
        ctx.fillText(text, x1 + segW / 2, ROW_HEIGHT / 2, segW - 8);
      }

      // Border between segments
      ctx.strokeStyle = "rgba(0,0,0,0.3)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x1, 0, segW, ROW_HEIGHT);
    }
  }, [segments, duration, colorMap]);

  // Draw playhead (overlay layer)
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas || duration <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = ROW_HEIGHT * dpr;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, ROW_HEIGHT);

    const x = (currentTime / duration) * rect.width;

    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, ROW_HEIGHT);
    ctx.strokeStyle = "#FF1744";
    ctx.lineWidth = 2;
    ctx.shadowColor = "#FF1744";
    ctx.shadowBlur = 4;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }, [currentTime, duration]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!onSeek || duration <= 0) return;
      const canvas = overlayCanvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      onSeek(Math.max(0, Math.min(duration, ratio * duration)));
    },
    [onSeek, duration]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (duration <= 0 || segments.length === 0) return;
      const canvas = overlayCanvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const time = ((e.clientX - rect.left) / rect.width) * duration;

      const seg = segments.find((s) => time >= s.start && time < s.end);
      if (seg) {
        setTooltip({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
          label: seg.label,
          confidence: seg.confidence,
          start: seg.start,
          end: seg.end,
        });
      } else {
        setTooltip(null);
      }
    },
    [segments, duration]
  );

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  if (segments.length === 0) {
    return null;
  }

  return (
    <div className="timeline-row" ref={containerRef}>
      <div className="timeline-label">{label}</div>
      <div className="timeline-canvases">
        <canvas
          ref={staticCanvasRef}
          className="timeline-canvas timeline-canvas-static"
          style={{ height: ROW_HEIGHT }}
        />
        <canvas
          ref={overlayCanvasRef}
          className="timeline-canvas timeline-canvas-overlay"
          style={{ height: ROW_HEIGHT }}
          onClick={handleClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        />
        {tooltip && (
          <div
            className="timeline-tooltip"
            style={{
              left: Math.min(tooltip.x, (containerRef.current?.offsetWidth ?? 400) - 180),
              top: tooltip.y - 60,
            }}
          >
            <strong>{ru(tooltip.label)}</strong>
            <span>Уверенность: {(tooltip.confidence * 100).toFixed(1)}%</span>
            <span>
              {formatTime(tooltip.start)} - {formatTime(tooltip.end)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default Timeline;
