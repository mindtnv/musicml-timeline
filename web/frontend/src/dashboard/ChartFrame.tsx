import { useCallback, useRef, type ReactNode } from "react";
import { useDashboard } from "./DashboardContext";
import { useTimeScale, type TimeScale } from "./useTimeScale";
import TimeCursor from "./TimeCursor";

interface RenderArgs {
  timeScale: TimeScale;
  width: number;
  height: number;
}

interface ChartFrameProps {
  /** Plot height in pixels. */
  height: number;
  /** Inner left padding (for axis labels etc.). */
  paddingLeft?: number;
  /** Inner right padding. */
  paddingRight?: number;
  /** Show time label following cursor (only on one panel). */
  showCursorLabel?: boolean;
  /** Disable interactivity (e.g., for pure read-only previews). */
  passive?: boolean;
  /** Render children with measured timeScale. */
  children: (args: RenderArgs) => ReactNode;
  className?: string;
}

/**
 * Time-aware chart container.
 * - Measures its own width
 * - Provides a shared d3 time scale to children
 * - Handles click → seek+pin / mousemove → hover / mouseleave → clear
 * - Overlays the synchronized TimeCursor on top of children
 */
function ChartFrame({
  height,
  paddingLeft = 0,
  paddingRight = 0,
  showCursorLabel,
  passive,
  children,
  className,
}: ChartFrameProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ts = useTimeScale(containerRef, paddingLeft, paddingRight);
  const { duration, seek, setHoverTime, setPinnedTime } = useDashboard();

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (passive || duration <= 0) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      if (x < paddingLeft || x > rect.width - paddingRight) return;
      const t = Math.max(0, Math.min(duration, ts.invert(x)));
      seek(t);
      setPinnedTime(t);
    },
    [duration, paddingLeft, paddingRight, passive, seek, setPinnedTime, ts]
  );

  const handleMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (passive || duration <= 0) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      if (x < paddingLeft || x > rect.width - paddingRight) {
        setHoverTime(null);
        return;
      }
      const t = Math.max(0, Math.min(duration, ts.invert(x)));
      setHoverTime(t);
    },
    [duration, paddingLeft, paddingRight, passive, setHoverTime, ts]
  );

  const handleLeave = useCallback(() => {
    if (passive) return;
    setHoverTime(null);
  }, [passive, setHoverTime]);

  return (
    <div
      ref={containerRef}
      className={`chart-frame ${className ?? ""}`}
      style={{ height, position: "relative" }}
      onClick={handleClick}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
    >
      {ts.containerWidth > 0 &&
        children({ timeScale: ts, width: ts.containerWidth, height })}
      {ts.containerWidth > 0 && (
        <TimeCursor height={height} timeScale={ts} showLabel={showCursorLabel} />
      )}
    </div>
  );
}

export default ChartFrame;
