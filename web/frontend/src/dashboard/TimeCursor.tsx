import { useDashboard } from "./DashboardContext";
import type { TimeScale } from "./useTimeScale";
import { formatTime } from "../utils/formatTime";

interface TimeCursorProps {
  /** Height in pixels (height of the plotting area). */
  height: number;
  /** Shared time scale from the panel. */
  timeScale: TimeScale;
  /** Render a time label above the cursor (only on one "master" panel). */
  showLabel?: boolean;
  /** Offset top (e.g., if the cursor layer sits inside a padded chart). Default 0. */
  topOffset?: number;
}

/**
 * Absolute-positioned overlay of the three synchronized cursor lines:
 *  - Red solid playhead (always visible)
 *  - Blue solid pinned (sticky click)
 *  - Blue dashed hover (transient)
 *
 * Must be placed as a child of a position:relative container.
 * Uses z-index 3 to sit above canvases but below tooltips.
 */
function TimeCursor({ height, timeScale, showLabel, topOffset = 0 }: TimeCursorProps) {
  const { playheadTime, hoverTime, pinnedTime, duration } = useDashboard();

  if (duration <= 0) return null;

  const inBounds = (t: number | null | undefined): t is number =>
    t != null && t >= 0 && t <= duration;

  const playX = inBounds(playheadTime) ? timeScale.scale(playheadTime) : null;
  const pinX = inBounds(pinnedTime) ? timeScale.scale(pinnedTime) : null;
  const hoverX = inBounds(hoverTime) ? timeScale.scale(hoverTime) : null;

  return (
    <div className="time-cursor-layer" style={{ top: topOffset, height }}>
      {playX != null && (
        <div
          className="time-cursor time-cursor--play"
          style={{ left: `${playX}px`, height: `${height}px` }}
        />
      )}
      {pinX != null && (
        <div
          className="time-cursor time-cursor--pin"
          style={{ left: `${pinX}px`, height: `${height}px` }}
        >
          {showLabel && (
            <span className="time-cursor-label time-cursor-label--pin">
              {formatTime(pinnedTime!)}
            </span>
          )}
        </div>
      )}
      {hoverX != null && (
        <div
          className="time-cursor time-cursor--hover"
          style={{ left: `${hoverX}px`, height: `${height}px` }}
        >
          {showLabel && (
            <span className="time-cursor-label time-cursor-label--hover">
              {formatTime(hoverTime!)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default TimeCursor;
