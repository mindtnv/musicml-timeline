import type { TimelineSegment } from "../api/types";
import { getSegmentColor } from "../utils/colors";

interface MiniStructureStripProps {
  segments: TimelineSegment[];
  duration: number;
  /** Height in px. Default 6. */
  height?: number;
  /** aria-label override */
  label?: string;
}

/**
 * Compact horizontal strip visualizing the segment structure of a track.
 * Used as a thumbnail preview in track list cards.
 *
 * Renders as a single SVG so it is crisp at any width, and each segment
 * is proportional to its duration.
 */
function MiniStructureStrip({
  segments,
  duration,
  height = 6,
  label,
}: MiniStructureStripProps) {
  if (!segments || segments.length === 0 || duration <= 0) return null;

  return (
    <svg
      className="mini-structure-strip"
      width="100%"
      height={height}
      viewBox={`0 0 ${duration} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label ?? `Структура: ${segments.length} сегментов`}
    >
      {segments.map((seg, i) => {
        const x = Math.max(0, Math.min(duration, seg.start));
        const w = Math.max(0, Math.min(duration, seg.end) - x);
        if (w <= 0) return null;
        return (
          <rect
            key={i}
            x={x}
            y={0}
            width={w}
            height={height}
            fill={getSegmentColor(seg.label)}
          >
            <title>
              {seg.label} · {Math.round(seg.start)}s → {Math.round(seg.end)}s
            </title>
          </rect>
        );
      })}
    </svg>
  );
}

export default MiniStructureStrip;
