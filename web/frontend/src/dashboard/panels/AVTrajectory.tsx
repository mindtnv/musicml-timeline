import { useMemo } from "react";
import Panel from "../Panel";
import { useDashboard } from "../DashboardContext";

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
const AXIS = "rgba(15,23,42,0.35)";
const LINE = "#94a3b8";
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

/**
 * Derive a 2D coordinate per frame.
 * Prefer classification probs (P(positive) - P(negative)) because the
 * regression head is known to be biased toward the lower range. The
 * 3-class head gives a zero-centered signal that fills the quadrants.
 * Falls back to regression if probs aren't available.
 */
function buildCoord(
  probs: number[][] | undefined,
  reg: number[],
  i: number
): number {
  if (probs && probs[i] && probs[i].length >= 3) {
    const p = probs[i];
    const pos = p[2] ?? 0; // High / Bright
    const neg = p[0] ?? 0; // Low / Dark
    // (pos - neg) ∈ [-1, +1] → [0, 1]
    return 0.5 + 0.5 * (pos - neg);
  }
  // Regression fallback (may be biased)
  return Math.max(0, Math.min(1, reg[i] ?? 0.5));
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

  // Compute 2D coords for every frame using classification-based score
  const coords = useMemo(() => {
    const xs: number[] = new Array(n);
    const ys: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
      xs[i] = buildCoord(valenceProbs, valenceReg, i);
      ys[i] = buildCoord(arousalProbs, arousalReg, i);
    }
    return { xs, ys };
  }, [n, arousalReg, valenceReg, arousalProbs, valenceProbs]);

  const pathD = useMemo(() => {
    const pts: string[] = [];
    for (let i = 0; i < n; i++) {
      const x = plotX(coords.xs[i]);
      const y = plotY(coords.ys[i]);
      pts.push(`${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    return pts.join(" ");
  }, [coords, n]);

  if (n === 0) return null;

  // Current point on trajectory
  const curIdx = Math.max(0, Math.min(n - 1, Math.floor(playheadTime / hopSeconds)));
  const curX = plotX(coords.xs[curIdx] ?? 0.5);
  const curY = plotY(coords.ys[curIdx] ?? 0.5);

  // Displayed values (also from classification-derived coords, in percent,
  // centered around 50 = neutral)
  const valencePct = ((coords.xs[curIdx] ?? 0.5) * 100).toFixed(0);
  const arousalPct = ((coords.ys[curIdx] ?? 0.5) * 100).toFixed(0);

  return (
    <Panel title="Эмоциональная траектория" subtitle="Russell circumplex" span={2}>
      <div className="av-trajectory-wrap">
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="av-trajectory-svg"
        >
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

          <path
            d={pathD}
            fill="none"
            stroke={LINE}
            strokeWidth={1.5}
            strokeLinejoin="round"
            opacity={0.6}
          />

          <circle cx={curX} cy={curY} r={6} fill={DOT} opacity={0.25} />
          <circle cx={curX} cy={curY} r={4} fill={DOT} stroke="#fff" strokeWidth={1.5} />
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
            <span className="av-stat-label">Длительность</span>
            <span className="av-stat-value">{duration.toFixed(0)} с</span>
          </div>
        </div>
      </div>
    </Panel>
  );
}

export default AVTrajectory;
