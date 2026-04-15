import { useMemo } from "react";
import Panel from "../Panel";
import { useDashboard } from "../DashboardContext";
import { formatTime } from "../../utils/formatTime";

interface AVTrajectoryProps {
  arousalReg: number[];
  valenceReg: number[];
  /** Optional per-frame class probabilities: [P(Low), P(Mid), P(High)]. */
  arousalProbs?: number[][];
  /** Optional per-frame class probabilities: [P(Dark), P(Neutral), P(Bright)]. */
  valenceProbs?: number[][];
  hopSeconds: number;
  duration: number;
}

const SIZE = 320;
const PADDING = 32;
const PLOT = SIZE - PADDING * 2;
const BG = "#f8fafc";
const AXIS = "rgba(15,23,42,0.28)";
const TICK = "rgba(71,85,105,0.5)";
const HISTORY = "#cbd5e1";
const TRAIL_ACCENT = "#dc2626";
const DOT = "#dc2626";
const QUADRANT_TEXT = "rgba(71,85,105,0.75)";

/** Map value [0,1] → plot coord [padding, padding+PLOT]. */
function plotX(v: number) {
  return PADDING + Math.max(0, Math.min(1, v)) * PLOT;
}
/** y-axis inverted (0 bottom, 1 top). */
function plotY(v: number) {
  return PADDING + (1 - Math.max(0, Math.min(1, v))) * PLOT;
}

/** (P(high) − P(low)) mapped to [0, 1], with regression fallback. */
function buildCoord(
  probs: number[][] | undefined,
  reg: number[],
  i: number
): number {
  if (probs && probs[i] && probs[i].length >= 3) {
    const p = probs[i];
    const pos = p[2] ?? 0;
    const neg = p[0] ?? 0;
    return 0.5 + 0.5 * (pos - neg);
  }
  return Math.max(0, Math.min(1, reg[i] ?? 0.5));
}

/** Symmetric moving average, radius r. */
function smooth(arr: number[], r: number): number[] {
  const n = arr.length;
  if (n === 0 || r <= 0) return arr.slice();
  const out = new Array<number>(n);
  let sum = 0;
  let count = 0;
  // prime window
  for (let i = 0; i <= Math.min(r, n - 1); i++) {
    sum += arr[i];
    count++;
  }
  for (let i = 0; i < n; i++) {
    const addIdx = i + r;
    const dropIdx = i - r - 1;
    if (i !== 0) {
      if (addIdx < n) {
        sum += arr[addIdx];
        count++;
      }
      if (dropIdx >= 0) {
        sum -= arr[dropIdx];
        count--;
      }
    }
    out[i] = sum / count;
  }
  return out;
}

function AVTrajectory({
  arousalReg,
  valenceReg,
  arousalProbs,
  valenceProbs,
  hopSeconds,
  duration,
}: AVTrajectoryProps) {
  const { playheadTime } = useDashboard();

  const n = Math.min(
    arousalReg.length || arousalProbs?.length || 0,
    valenceReg.length || valenceProbs?.length || 0
  );

  // Compute 2D coords for every frame, then smooth to tame noise
  const coords = useMemo(() => {
    const rawXs: number[] = new Array(n);
    const rawYs: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
      rawXs[i] = buildCoord(valenceProbs, valenceReg, i);
      rawYs[i] = buildCoord(arousalProbs, arousalReg, i);
    }
    // Smoothing radius ≈ 2 seconds of context (symmetric), capped
    const radius = Math.max(2, Math.min(8, Math.round(1.5 / Math.max(hopSeconds, 0.1))));
    return { xs: smooth(rawXs, radius), ys: smooth(rawYs, radius) };
  }, [n, arousalReg, valenceReg, arousalProbs, valenceProbs, hopSeconds]);

  // History path (entire trajectory, faint reference)
  const historyPath = useMemo(() => {
    if (n === 0) return "";
    const pts: string[] = [];
    for (let i = 0; i < n; i++) {
      const x = plotX(coords.xs[i]);
      const y = plotY(coords.ys[i]);
      pts.push(`${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    return pts.join(" ");
  }, [coords, n]);

  if (n === 0) return null;

  const curIdx = Math.max(0, Math.min(n - 1, Math.floor(playheadTime / hopSeconds)));

  // Build comet trail as a sequence of segments with increasing opacity
  // so the current position has a bright tail behind it.
  const TRAIL_SECONDS = 20;
  const trailFrames = Math.max(4, Math.ceil(TRAIL_SECONDS / Math.max(hopSeconds, 0.01)));
  const trailStart = Math.max(0, curIdx - trailFrames);
  const trailSegs: Array<{ d: string; o: number; w: number }> = [];
  for (let i = trailStart; i < curIdx; i++) {
    const t = (i - trailStart) / Math.max(1, curIdx - trailStart);
    const x1 = plotX(coords.xs[i]);
    const y1 = plotY(coords.ys[i]);
    const x2 = plotX(coords.xs[i + 1]);
    const y2 = plotY(coords.ys[i + 1]);
    trailSegs.push({
      d: `M${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}`,
      o: 0.15 + 0.85 * t,
      w: 1.2 + 1.6 * t,
    });
  }

  const curX = plotX(coords.xs[curIdx] ?? 0.5);
  const curY = plotY(coords.ys[curIdx] ?? 0.5);

  // Displayed values (classification-derived coords → percent, 50 = neutral)
  const valencePct = ((coords.xs[curIdx] ?? 0.5) * 100).toFixed(0);
  const arousalPct = ((coords.ys[curIdx] ?? 0.5) * 100).toFixed(0);

  return (
    <Panel title="Эмоциональная траектория" subtitle="Russell circumplex · сглажено, красный хвост — последние 20 с" span={2}>
      <div className="av-trajectory-wrap">
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="av-trajectory-svg"
        >
          <defs>
            <radialGradient id="av-dot-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={DOT} stopOpacity="0.55" />
              <stop offset="60%" stopColor={DOT} stopOpacity="0.18" />
              <stop offset="100%" stopColor={DOT} stopOpacity="0" />
            </radialGradient>
          </defs>

          <rect x={PADDING} y={PADDING} width={PLOT} height={PLOT} fill={BG} rx={4} />

          {/* Quadrant guides */}
          <line
            x1={PADDING + PLOT / 2}
            y1={PADDING}
            x2={PADDING + PLOT / 2}
            y2={PADDING + PLOT}
            stroke={AXIS}
            strokeDasharray="2 3"
          />
          <line
            x1={PADDING}
            y1={PADDING + PLOT / 2}
            x2={PADDING + PLOT}
            y2={PADDING + PLOT / 2}
            stroke={AXIS}
            strokeDasharray="2 3"
          />

          {/* Axis tick labels */}
          <text x={PADDING - 4} y={PADDING + PLOT / 2 + 3} textAnchor="end" className="av-tick" fill={TICK}>0</text>
          <text x={PADDING - 4} y={PADDING + 4} textAnchor="end" className="av-tick" fill={TICK}>+1</text>
          <text x={PADDING - 4} y={PADDING + PLOT + 2} textAnchor="end" className="av-tick" fill={TICK}>−1</text>
          <text x={PADDING + PLOT / 2} y={PADDING + PLOT + 14} textAnchor="middle" className="av-tick" fill={TICK}>0</text>
          <text x={PADDING} y={PADDING + PLOT + 14} textAnchor="middle" className="av-tick" fill={TICK}>−1</text>
          <text x={PADDING + PLOT} y={PADDING + PLOT + 14} textAnchor="middle" className="av-tick" fill={TICK}>+1</text>

          <text x={PADDING + PLOT * 0.25} y={PADDING + 14} textAnchor="middle" className="av-q-label" fill={QUADRANT_TEXT}>
            Злое
          </text>
          <text x={PADDING + PLOT * 0.75} y={PADDING + 14} textAnchor="middle" className="av-q-label" fill={QUADRANT_TEXT}>
            Радостное
          </text>
          <text x={PADDING + PLOT * 0.25} y={PADDING + PLOT - 6} textAnchor="middle" className="av-q-label" fill={QUADRANT_TEXT}>
            Грустное
          </text>
          <text x={PADDING + PLOT * 0.75} y={PADDING + PLOT - 6} textAnchor="middle" className="av-q-label" fill={QUADRANT_TEXT}>
            Умиротворённое
          </text>

          <text x={SIZE / 2} y={SIZE - 6} textAnchor="middle" className="av-axis-label" fill={QUADRANT_TEXT}>
            Настроение (valence) →
          </text>
          <text
            x={-SIZE / 2}
            y={12}
            transform={`rotate(-90)`}
            textAnchor="middle"
            className="av-axis-label"
            fill={QUADRANT_TEXT}
          >
            Энергия (arousal) →
          </text>

          {/* History — full trajectory, faint reference */}
          <path
            d={historyPath}
            fill="none"
            stroke={HISTORY}
            strokeWidth={1}
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={0.55}
          />

          {/* Comet trail: last ~20s, gradient of opacity + width */}
          {trailSegs.map((s, i) => (
            <path
              key={i}
              d={s.d}
              fill="none"
              stroke={TRAIL_ACCENT}
              strokeWidth={s.w}
              strokeLinecap="round"
              opacity={s.o}
            />
          ))}

          {/* Current point — glow + ring + core */}
          <circle cx={curX} cy={curY} r={14} fill="url(#av-dot-glow)" />
          <circle cx={curX} cy={curY} r={7} fill="none" stroke={DOT} strokeWidth={1.25} opacity={0.55} />
          <circle cx={curX} cy={curY} r={4.5} fill={DOT} stroke="#fff" strokeWidth={1.75} />
        </svg>
        <div className="av-trajectory-stats">
          <div className="av-stat">
            <span className="av-stat-label">Valence</span>
            <span className="av-stat-value">{valencePct}%</span>
          </div>
          <div className="av-stat">
            <span className="av-stat-label">Arousal</span>
            <span className="av-stat-value">{arousalPct}%</span>
          </div>
          <div className="av-stat av-stat--time">
            <span className="av-stat-label">Сейчас</span>
            <span className="av-stat-value">
              {formatTime(playheadTime)}
              <span className="av-stat-sep"> / </span>
              <span className="av-stat-total">{formatTime(duration)}</span>
            </span>
          </div>
        </div>
      </div>
    </Panel>
  );
}

export default AVTrajectory;
