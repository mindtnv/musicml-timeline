import { useMemo } from "react";
import type { TimelineSegment } from "../../api/types";
import { SEGMENT_COLORS, getSegmentColor } from "../../utils/colors";
import { formatTime } from "../../utils/formatTime";
import { ru } from "../../utils/labels";
import Panel from "../Panel";
import ChartFrame from "../ChartFrame";
import TimelineStrip from "../../components/Timeline";
import { useDashboard } from "../DashboardContext";

interface StructurePanelProps {
  segments: TimelineSegment[];
}

const HEIGHT = 56;

function StructurePanel({ segments }: StructurePanelProps) {
  const { seek, setPinnedTime, playheadTime, duration } = useDashboard();

  // Longest segment duration — used to scale the in-item width bar so even
  // the longest segment visually fills most of its row.
  const maxSegDuration = useMemo(() => {
    if (!segments || segments.length === 0) return 0;
    return segments.reduce((m, s) => Math.max(m, s.end - s.start), 0);
  }, [segments]);

  // Which segment is "now" playing — used for highlighting. The dashboard's
  // rAF loop pushes playheadTime updates, so the highlight follows playback
  // without any extra subscription here.
  const activeIndex = useMemo(() => {
    if (!segments || segments.length === 0) return -1;
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i];
      if (playheadTime >= s.start && playheadTime < s.end) return i;
    }
    // Clamp to last segment if we're past the end (rAF can overshoot by a tick)
    if (playheadTime >= segments[segments.length - 1].end) return segments.length - 1;
    return -1;
  }, [segments, playheadTime]);

  if (!segments || segments.length === 0) return null;

  return (
    <Panel
      title="Структура композиции"
      subtitle={`${segments.length} сегментов · общая длительность ${formatTime(duration)}`}
      span={4}
    >
      <ChartFrame height={HEIGHT}>
        {({ timeScale, width, height }) => (
          <TimelineStrip
            segments={segments}
            duration={timeScale.invert(width)}
            timeScale={timeScale}
            width={width}
            height={height}
            colorMap={SEGMENT_COLORS}
            showLabels
          />
        )}
      </ChartFrame>

      {/* Segment list */}
      <div className="segment-list">
        {segments.map((seg, i) => {
          const segDur = seg.end - seg.start;
          const widthPct = maxSegDuration > 0 ? (segDur / maxSegDuration) * 100 : 0;
          const color = getSegmentColor(seg.label);
          const isActive = i === activeIndex;
          return (
            <button
              key={i}
              className={`segment-list-item${isActive ? " segment-list-item--active" : ""}`}
              onClick={() => {
                seek(seg.start);
                setPinnedTime(seg.start);
              }}
              title={`${ru(seg.label)} · ${formatTime(seg.start)} → ${formatTime(seg.end)} · ${segDur.toFixed(0)} с`}
              style={
                {
                  // Subtle color fill proportional to segment duration
                  "--seg-color": color,
                  "--seg-fill": `${widthPct}%`,
                } as React.CSSProperties
              }
            >
              <span
                className="segment-list-dot"
                style={{ backgroundColor: color }}
              />
              <span className="segment-list-label">{ru(seg.label)}</span>
              <span className="segment-list-time">
                {formatTime(seg.start)} → {formatTime(seg.end)}
              </span>
              <span className="segment-list-conf">
                {(seg.confidence * 100).toFixed(0)}%
              </span>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

export default StructurePanel;
