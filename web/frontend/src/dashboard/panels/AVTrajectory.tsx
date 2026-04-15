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

const SIZE = 340;
const PADDING = 36;
const PLOT = SIZE - PADDING * 2;

function plotX(v: number) { return PADDING + Math.max(0, Math.min(1, v)) * PLOT; }
function plotY(v: number) { return PADDING + (1 - Math.max(0, Math.min(1, v))) * PLOT; }

function buildCoord(probs: number[][] | undefined, reg: number[], i: number): number {
  if (probs && probs[i] && probs[i].length >= 3) {
    const p = probs[i];
    const pos = p[2] ?? 0;
    const neg = p[0] ?? 0;
    return 0.5 + 0.5 * (pos - neg);
  }
  return Math.max(0, Math.min(1, reg[i] ?? 0.5));
}

function smooth(arr: number[], r: number): number[] {
  const n = arr.length;
  if (n === 0 || r <= 0) return arr.slice();
  const out = new Array<number>(n);
  let sum = 0;
  let count = 0;
  for (let i = 0; i <= Math.min(r, n - 1); i++) { sum += arr[i]; count++; }
  for (let i = 0; i < n; i++) {
    const addIdx = i + r;
    const dropIdx = i - r - 1;
    if (i !== 0) {
      if (addIdx < n)   { sum += arr[addIdx]; count++; }
      if (dropIdx >= 0) { sum -= arr[dropIdx]; count--; }
    }
    out[i] = sum / count;
  }
  return out;
}

// Time-encoded palette: cool indigo (oldest) → warm gold (newest).  Premium
// trail aesthetic (Spotify Wrapped / Apple Replay) — colour communicates
// chronology so you can read the song's emotional arc at a glance.
function trailColor(t: number): string {
  const stops: [number, [number, number, number]][] = [
    [0.0, [99, 102, 241]],   // indigo
    [0.4, [217, 70, 239]],   // magenta
    [0.7, [251, 113, 133]],  // coral
    [1.0, [251, 191, 36]],   // amber
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    if (t <= t1) {
      const k = (t - t0) / Math.max(1e-6, t1 - t0);
      const r = Math.round(c0[0] + (c1[0] - c0[0]) * k);
      const g = Math.round(c0[1] + (c1[1] - c0[1]) * k);
      const b = Math.round(c0[2] + (c1[2] - c0[2]) * k);
      return `rgb(${r},${g},${b})`;
    }
  }
  const last = stops[stops.length - 1][1];
  return `rgb(${last[0]},${last[1]},${last[2]})`;
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

  const coords = useMemo(() => {
    const rawXs: number[] = new Array(n);
    const rawYs: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
      rawXs[i] = buildCoord(valenceProbs, valenceReg, i);
      rawYs[i] = buildCoord(arousalProbs, arousalReg, i);
    }
    const radius = Math.max(2, Math.min(8, Math.round(1.5 / Math.max(hopSeconds, 0.1))));
    return { xs: smooth(rawXs, radius), ys: smooth(rawYs, radius) };
  }, [n, arousalReg, valenceReg, arousalProbs, valenceProbs, hopSeconds]);

  // History — full trajectory tinted by chronology (cool→warm)
  const historySegs = useMemo(() => {
    if (n < 2) return [];
    const segs: Array<{ d: string; color: string }> = [];
    for (let i = 0; i < n - 1; i++) {
      const x1 = plotX(coords.xs[i]);
      const y1 = plotY(coords.ys[i]);
      const x2 = plotX(coords.xs[i + 1]);
      const y2 = plotY(coords.ys[i + 1]);
      segs.push({
        d: `M${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}`,
        color: trailColor(i / (n - 1)),
      });
    }
    return segs;
  }, [coords, n]);

  if (n === 0) return null;

  const curIdx = Math.max(0, Math.min(n - 1, Math.floor(playheadTime / hopSeconds)));

  // Comet trail of recent N seconds — brighter, thicker than history
  const TRAIL_SECONDS = 18;
  const trailFrames = Math.max(4, Math.ceil(TRAIL_SECONDS / Math.max(hopSeconds, 0.01)));
  const trailStart = Math.max(0, curIdx - trailFrames);
  const trailSegs: Array<{ d: string; o: number; w: number; color: string }> = [];
  for (let i = trailStart; i < curIdx; i++) {
    const t = (i - trailStart) / Math.max(1, curIdx - trailStart);
    const x1 = plotX(coords.xs[i]);
    const y1 = plotY(coords.ys[i]);
    const x2 = plotX(coords.xs[i + 1]);
    const y2 = plotY(coords.ys[i + 1]);
    trailSegs.push({
      d: `M${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}`,
      o: 0.30 + 0.70 * t,
      w: 1.4 + 2.4 * t,
      color: trailColor(curIdx / Math.max(1, n - 1)),
    });
  }

  const curX = plotX(coords.xs[curIdx] ?? 0.5);
  const curY = plotY(coords.ys[curIdx] ?? 0.5);
  const dotColor = trailColor(curIdx / Math.max(1, n - 1));

  const valencePct = ((coords.xs[curIdx] ?? 0.5) * 100).toFixed(0);
  const arousalPct = ((coords.ys[curIdx] ?? 0.5) * 100).toFixed(0);

  return (
    <Panel title="Эмоциональная траектория" subtitle="Russell circumplex · цвет хвоста — хронология (старое → новое)" span={2}>
      <div className="av-trajectory-wrap">
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="av-trajectory-svg"
        >
          <defs>
            {/* 4-quadrant emotional geography backdrop: anxious / happy /
                calm / sad — gives the plot visual semantics without text. */}
            <radialGradient id="av-q-anxious" cx="0%" cy="0%" r="80%">
              <stop offset="0%"   stopColor="#f87171" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#f87171" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="av-q-happy" cx="100%" cy="0%" r="80%">
              <stop offset="0%"   stopColor="#fbbf24" stopOpacity="0.20" />
              <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="av-q-calm" cx="100%" cy="100%" r="80%">
              <stop offset="0%"   stopColor="#4ade80" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#4ade80" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="av-q-sad" cx="0%" cy="100%" r="80%">
              <stop offset="0%"   stopColor="#60a5fa" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#60a5fa" stopOpacity="0" />
            </radialGradient>

            <radialGradient id="av-dot-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.85" />
              <stop offset="40%"  stopColor={dotColor}  stopOpacity="0.55" />
              <stop offset="100%" stopColor={dotColor}  stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Plot canvas — translucent over the panel's glass; quadrant tints
              compose on top to produce the emotional geography. */}
          <rect x={PADDING} y={PADDING} width={PLOT} height={PLOT}
                fill="rgba(255,255,255,0.025)" rx={10} />
          <rect x={PADDING} y={PADDING} width={PLOT} height={PLOT} fill="url(#av-q-anxious)" rx={10} />
          <rect x={PADDING} y={PADDING} width={PLOT} height={PLOT} fill="url(#av-q-happy)" rx={10} />
          <rect x={PADDING} y={PADDING} width={PLOT} height={PLOT} fill="url(#av-q-calm)" rx={10} />
          <rect x={PADDING} y={PADDING} width={PLOT} height={PLOT} fill="url(#av-q-sad)" rx={10} />

          {/* Quadrant guides — subtle dashed crosshair */}
          <line x1={PADDING + PLOT / 2} y1={PADDING} x2={PADDING + PLOT / 2} y2={PADDING + PLOT}
                stroke="rgba(255,255,255,0.10)" strokeDasharray="2 4" />
          <line x1={PADDING} y1={PADDING + PLOT / 2} x2={PADDING + PLOT} y2={PADDING + PLOT / 2}
                stroke="rgba(255,255,255,0.10)" strokeDasharray="2 4" />

          {/* Quadrant labels — mono uppercase, sit at the four corners */}
          <text x={PADDING + 8}        y={PADDING + 16}        textAnchor="start" className="av-q-label">ЗЛОЕ</text>
          <text x={PADDING + PLOT - 8} y={PADDING + 16}        textAnchor="end"   className="av-q-label">РАДОСТНОЕ</text>
          <text x={PADDING + 8}        y={PADDING + PLOT - 8}  textAnchor="start" className="av-q-label">ГРУСТНОЕ</text>
          <text x={PADDING + PLOT - 8} y={PADDING + PLOT - 8}  textAnchor="end"   className="av-q-label">УМИРОТВОРЁННОЕ</text>

          {/* Axis labels */}
          <text x={SIZE / 2} y={SIZE - 8} textAnchor="middle" className="av-axis-label">VALENCE →</text>
          <text x={-SIZE / 2} y={14} transform="rotate(-90)" textAnchor="middle" className="av-axis-label">AROUSAL →</text>

          {/* Full trajectory — chronology-tinted, faint */}
          {historySegs.map((s, i) => (
            <path key={i} d={s.d} fill="none"
                  stroke={s.color} strokeWidth={1.1}
                  strokeLinecap="round" opacity={0.32} />
          ))}

          {/* Comet trail — last ~18s, brighter */}
          {trailSegs.map((s, i) => (
            <path key={i} d={s.d} fill="none"
                  stroke={s.color}
                  strokeWidth={s.w} strokeLinecap="round"
                  opacity={s.o}
                  style={{ filter: "drop-shadow(0 0 4px " + s.color + ")" }} />
          ))}

          {/* Current point — multi-stop halo + ring + core */}
          <circle cx={curX} cy={curY} r={20} fill="url(#av-dot-glow)" />
          <circle cx={curX} cy={curY} r={9}  fill="none" stroke={dotColor} strokeWidth={1.2} opacity={0.55} />
          <circle cx={curX} cy={curY} r={5}  fill="#fff" stroke={dotColor} strokeWidth={1.5} />
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
