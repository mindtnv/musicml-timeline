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
  const { seek, setPinnedTime } = useDashboard();

  if (!segments || segments.length === 0) return null;

  return (
    <Panel
      title="Структура композиции"
      subtitle={`${segments.length} сегментов`}
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
        {segments.map((seg, i) => (
          <button
            key={i}
            className="segment-list-item"
            onClick={() => {
              seek(seg.start);
              setPinnedTime(seg.start);
            }}
          >
            <span
              className="segment-list-dot"
              style={{ backgroundColor: getSegmentColor(seg.label) }}
            />
            <span className="segment-list-label">{ru(seg.label)}</span>
            <span className="segment-list-time">
              {formatTime(seg.start)} → {formatTime(seg.end)}
            </span>
            <span className="segment-list-conf">
              {(seg.confidence * 100).toFixed(0)}%
            </span>
          </button>
        ))}
      </div>
    </Panel>
  );
}

export default StructurePanel;
