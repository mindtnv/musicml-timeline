import { useRef } from "react";
import { useDashboard } from "./DashboardContext";
import { useTimeScale } from "./useTimeScale";
import TimeCursor from "./TimeCursor";
import { formatTime } from "../utils/formatTime";

const HEIGHT = 32;
const TICK_LABEL_OFFSET = 18;

/**
 * Shared horizontal time axis for the dashboard.
 * Click → seek; hover → updates global hoverTime.
 * Always shows a time label following the cursor.
 */
function TimeAxis() {
  const { duration, seek, setHoverTime, setPinnedTime, pinnedTime } = useDashboard();
  const containerRef = useRef<HTMLDivElement>(null);
  const ts = useTimeScale(containerRef, 0, 0);

  if (duration <= 0) return null;

  // Tick step heuristic
  const step =
    duration > 240 ? 60 : duration > 120 ? 30 : duration > 60 ? 15 : duration > 20 ? 5 : 2;
  const ticks: number[] = [];
  for (let t = 0; t <= duration; t += step) ticks.push(t);
  if (ticks[ticks.length - 1] < duration - 0.5) ticks.push(duration);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const t = ts.invert(x);
    seek(t);
    setPinnedTime(t);
  };

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const t = Math.max(0, Math.min(duration, ts.invert(x)));
    setHoverTime(t);
  };

  return (
    <div
      ref={containerRef}
      className="time-axis"
      style={{ height: HEIGHT }}
      onClick={handleClick}
      onMouseMove={handleMove}
      onMouseLeave={() => setHoverTime(null)}
    >
      <svg className="time-axis-svg" width="100%" height={HEIGHT}>
        {ticks.map((t) => {
          const x = ts.scale(t);
          return (
            <g key={t} transform={`translate(${x}, 0)`}>
              <line y1={0} y2={6} stroke="currentColor" strokeOpacity={0.3} />
              <text
                y={TICK_LABEL_OFFSET}
                textAnchor={t === 0 ? "start" : t === duration ? "end" : "middle"}
                className="time-axis-tick"
              >
                {formatTime(t)}
              </text>
            </g>
          );
        })}
      </svg>
      <TimeCursor height={HEIGHT} timeScale={ts} showLabel />
      {pinnedTime != null && (
        <button
          className="time-axis-pin-clear"
          onClick={(e) => {
            e.stopPropagation();
            setPinnedTime(null);
          }}
          title="Снять фиксацию"
        >
          ×
        </button>
      )}
    </div>
  );
}

export default TimeAxis;
