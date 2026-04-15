import { useMemo } from "react";
import type { TimelineSegment } from "../../api/types";
import { formatTime } from "../../utils/formatTime";
import { ru } from "../../utils/labels";
import Panel from "../Panel";
import { useDashboard } from "../DashboardContext";

interface StructurePanelProps {
  segments: TimelineSegment[];
}

function StructurePanel({ segments }: StructurePanelProps) {
  const { seek, setPinnedTime, setHoverTime, playheadTime, hoverTime, duration } = useDashboard();

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

  // Cross-highlight: when the mouse hovers the player scrubber, the
  // matching segment row lights up here.  hoverTime comes from the same
  // DashboardContext, so the two surfaces feel like one component.
  const hoverIndex = useMemo(() => {
    if (hoverTime == null || !segments) return -1;
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i];
      if (hoverTime >= s.start && hoverTime < s.end) return i;
    }
    return -1;
  }, [segments, hoverTime]);

  if (!segments || segments.length === 0) return null;

  return (
    <Panel
      title="Структура композиции"
      subtitle={`${segments.length} сегментов · общая длительность ${formatTime(duration)} · визуальная разметка — в скрабере плеера выше`}
      span={4}
    >
      {/* Segment list — visual timeline lives inside the player scrubber now,
          so this panel focuses on per-segment detail (start→end · confidence). */}
      <div className="segment-list">
        {segments.map((seg, i) => {
          const segDur = seg.end - seg.start;
          const widthPct = maxSegDuration > 0 ? (segDur / maxSegDuration) * 100 : 0;
          const isActive = i === activeIndex;
          const isHover = i === hoverIndex && !isActive;
          return (
            <button
              key={i}
              className={
                "segment-list-item" +
                (isActive ? " segment-list-item--active" : "") +
                (isHover ? " segment-list-item--hover" : "")
              }
              onClick={() => {
                seek(seg.start);
                setPinnedTime(seg.start);
              }}
              onMouseEnter={() => setHoverTime((seg.start + seg.end) / 2)}
              onMouseLeave={() => setHoverTime(null)}
              title={`${ru(seg.label)} · ${formatTime(seg.start)} → ${formatTime(seg.end)} · ${segDur.toFixed(0)} с`}
              style={
                {
                  "--seg-fill": `${widthPct}%`,
                } as React.CSSProperties
              }
            >
              <span className="segment-list-dot" />
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
