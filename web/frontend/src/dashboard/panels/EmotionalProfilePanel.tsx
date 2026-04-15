import { useMemo } from "react";
import { pie, arc } from "d3-shape";
import type {
  TimelineSegment,
  FramePredictions,
  AudioFeatures,
} from "../../api/types";
import { ru } from "../../utils/labels";

// Monochrome alpha ramp for the segment pie — light at the dominant
// segment, fading down through gray for smaller slices.  Removes the
// rainbow noise the per-segment colours used to introduce.
function monoSegmentFill(rank: number, total: number): string {
  const t = total <= 1 ? 1 : 1 - rank / total;
  const alpha = 0.18 + 0.55 * t;
  return `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
}
import { formatTime } from "../../utils/formatTime";
import Panel from "../Panel";
import { useDashboard } from "../DashboardContext";

interface Props {
  arousalReg: number[];
  valenceReg: number[];
  arousalProbs?: number[][];
  valenceProbs?: number[][];
  hopSeconds: number;
  duration: number;
  segments?: TimelineSegment[];
  genreSegments?: TimelineSegment[];
  audioFeatures?: AudioFeatures;
}

const SVG_SIZE = 280;
const PADDING = 30;
const PLOT = SVG_SIZE - PADDING * 2;
const PIE_SIZE = 130;
const PIE_RADIUS = 58;
const PIE_INNER = 32;

function plotX(v: number) { return PADDING + Math.max(0, Math.min(1, v)) * PLOT; }
function plotY(v: number) { return PADDING + (1 - Math.max(0, Math.min(1, v))) * PLOT; }

function buildCoord(probs: number[][] | undefined, reg: number[], i: number): number {
  if (probs && probs[i] && probs[i].length >= 3) {
    const p = probs[i];
    return 0.5 + 0.5 * ((p[2] ?? 0) - (p[0] ?? 0));
  }
  return Math.max(0, Math.min(1, reg[i] ?? 0.5));
}

function smooth(arr: number[], r: number): number[] {
  const n = arr.length;
  if (n === 0 || r <= 0) return arr.slice();
  const out = new Array<number>(n);
  let sum = 0; let count = 0;
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

function mean(values: number[]): number {
  if (!values || values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function meanClassScore(probs?: number[][]): number | null {
  if (!probs || probs.length === 0) return null;
  let sum = 0; let n = 0;
  for (const p of probs) {
    if (!p || p.length < 3) continue;
    sum += 0.5 + 0.5 * ((p[2] ?? 0) - (p[0] ?? 0));
    n++;
  }
  return n > 0 ? sum / n : null;
}

function EmotionalProfilePanel({
  arousalReg, valenceReg, arousalProbs, valenceProbs, hopSeconds, duration,
  segments, genreSegments, audioFeatures,
}: Props) {
  const { playheadTime } = useDashboard();

  // ---- Trajectory ----
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

  const historySegs = useMemo(() => {
    if (n < 2) return [];
    const segs: Array<{ d: string; color: string }> = [];
    for (let i = 0; i < n - 1; i++) {
      const x1 = plotX(coords.xs[i]); const y1 = plotY(coords.ys[i]);
      const x2 = plotX(coords.xs[i + 1]); const y2 = plotY(coords.ys[i + 1]);
      segs.push({
        d: `M${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}`,
        color: trailColor(i / (n - 1)),
      });
    }
    return segs;
  }, [coords, n]);

  const curIdx = Math.max(0, Math.min(n - 1, Math.floor(playheadTime / hopSeconds)));

  const TRAIL_SECONDS = 18;
  const trailFrames = Math.max(4, Math.ceil(TRAIL_SECONDS / Math.max(hopSeconds, 0.01)));
  const trailStart = Math.max(0, curIdx - trailFrames);
  const trailSegs: Array<{ d: string; o: number; w: number; color: string }> = [];
  for (let i = trailStart; i < curIdx; i++) {
    const t = (i - trailStart) / Math.max(1, curIdx - trailStart);
    const x1 = plotX(coords.xs[i]); const y1 = plotY(coords.ys[i]);
    const x2 = plotX(coords.xs[i + 1]); const y2 = plotY(coords.ys[i + 1]);
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

  // ---- Summary stats ----
  const segShare = useMemo(() => {
    const map = new Map<string, number>();
    (segments ?? []).forEach((s) => {
      map.set(s.label, (map.get(s.label) ?? 0) + (s.end - s.start));
    });
    const entries = Array.from(map.entries()).map(([label, secs]) => ({
      label, seconds: secs, share: duration > 0 ? secs / duration : 0,
    }));
    entries.sort((a, b) => b.seconds - a.seconds);
    return entries;
  }, [segments, duration]);

  const avgArousal =
    meanClassScore(arousalProbs) ?? mean(arousalReg);
  const avgValence =
    meanClassScore(valenceProbs) ?? mean(valenceReg);
  const transitions = (segments?.length ?? 1) - 1;

  const topGenre = useMemo(() => {
    if (!genreSegments || genreSegments.length === 0) return null;
    return genreSegments.reduce((best, seg) =>
      seg.confidence > best.confidence ? seg : best
    );
  }, [genreSegments]);

  const pieGen = pie<(typeof segShare)[number]>().value((d) => d.seconds).sort(null);
  const arcGen = arc<{ startAngle: number; endAngle: number }>()
    .innerRadius(PIE_INNER).outerRadius(PIE_RADIUS).padAngle(0.018).cornerRadius(2);
  const arcs = pieGen(segShare);

  return (
    <Panel
      title="Эмоциональный профиль"
      subtitle="Russell circumplex · сводные метрики · цвет хвоста — хронология (старое → новое)"
      span={4}
    >
      <div className="profile-grid">
        {/* LEFT: trajectory */}
        <div className="profile-trail">
          <svg
            width={SVG_SIZE} height={SVG_SIZE}
            viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
            className="av-trajectory-svg"
          >
            <defs>
              <radialGradient id="profile-q-anxious" cx="0%" cy="0%" r="80%">
                <stop offset="0%" stopColor="#f87171" stopOpacity="0.20" />
                <stop offset="100%" stopColor="#f87171" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="profile-q-happy" cx="100%" cy="0%" r="80%">
                <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="profile-q-calm" cx="100%" cy="100%" r="80%">
                <stop offset="0%" stopColor="#4ade80" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#4ade80" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="profile-q-sad" cx="0%" cy="100%" r="80%">
                <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#60a5fa" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="profile-dot-glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.85" />
                <stop offset="40%"  stopColor={dotColor} stopOpacity="0.55" />
                <stop offset="100%" stopColor={dotColor} stopOpacity="0" />
              </radialGradient>
            </defs>

            <rect x={PADDING} y={PADDING} width={PLOT} height={PLOT}
                  fill="rgba(255,255,255,0.025)" rx={10} />
            <rect x={PADDING} y={PADDING} width={PLOT} height={PLOT} fill="url(#profile-q-anxious)" rx={10} />
            <rect x={PADDING} y={PADDING} width={PLOT} height={PLOT} fill="url(#profile-q-happy)" rx={10} />
            <rect x={PADDING} y={PADDING} width={PLOT} height={PLOT} fill="url(#profile-q-calm)" rx={10} />
            <rect x={PADDING} y={PADDING} width={PLOT} height={PLOT} fill="url(#profile-q-sad)" rx={10} />

            <line x1={PADDING + PLOT / 2} y1={PADDING} x2={PADDING + PLOT / 2} y2={PADDING + PLOT}
                  stroke="rgba(255,255,255,0.10)" strokeDasharray="2 4" />
            <line x1={PADDING} y1={PADDING + PLOT / 2} x2={PADDING + PLOT} y2={PADDING + PLOT / 2}
                  stroke="rgba(255,255,255,0.10)" strokeDasharray="2 4" />

            <text x={PADDING + 8}        y={PADDING + 14}        textAnchor="start" className="av-q-label">ЗЛОЕ</text>
            <text x={PADDING + PLOT - 8} y={PADDING + 14}        textAnchor="end"   className="av-q-label">РАДОСТНОЕ</text>
            <text x={PADDING + 8}        y={PADDING + PLOT - 6}  textAnchor="start" className="av-q-label">ГРУСТНОЕ</text>
            <text x={PADDING + PLOT - 8} y={PADDING + PLOT - 6}  textAnchor="end"   className="av-q-label">УМИРОТВОРЁННОЕ</text>

            {historySegs.map((s, i) => (
              <path key={i} d={s.d} fill="none"
                    stroke={s.color} strokeWidth={1.0}
                    strokeLinecap="round" opacity={0.32} />
            ))}

            {trailSegs.map((s, i) => (
              <path key={i} d={s.d} fill="none"
                    stroke={s.color}
                    strokeWidth={s.w} strokeLinecap="round"
                    opacity={s.o}
                    style={{ filter: "drop-shadow(0 0 4px " + s.color + ")" }} />
            ))}

            <circle cx={curX} cy={curY} r={18} fill="url(#profile-dot-glow)" />
            <circle cx={curX} cy={curY} r={8}  fill="none" stroke={dotColor} strokeWidth={1.2} opacity={0.55} />
            <circle cx={curX} cy={curY} r={4.5} fill="#fff" stroke={dotColor} strokeWidth={1.5} />
          </svg>

          <div className="profile-trail-stats">
            <div className="profile-stat-mini">
              <span className="profile-stat-mini-label">VAL</span>
              <span className="profile-stat-mini-val">{valencePct}%</span>
            </div>
            <div className="profile-stat-mini">
              <span className="profile-stat-mini-label">ARO</span>
              <span className="profile-stat-mini-val">{arousalPct}%</span>
            </div>
            <div className="profile-stat-mini">
              <span className="profile-stat-mini-label">T</span>
              <span className="profile-stat-mini-val profile-stat-mini-val--small">
                {formatTime(playheadTime)}
              </span>
            </div>
          </div>
        </div>

        {/* RIGHT: hero metrics + segment pie */}
        <div className="profile-meta">
          {/* Top row: 4 hero tiles */}
          <div className="profile-tiles">
            {topGenre && (
              <div className="profile-tile profile-tile--accent">
                <span className="profile-tile-label">Жанр</span>
                <span className="profile-tile-value">{ru(topGenre.label)}</span>
                <span className="profile-tile-suffix">{(topGenre.confidence * 100).toFixed(0)}% conf</span>
              </div>
            )}
            {audioFeatures?.tempo_bpm != null && (
              <div className="profile-tile">
                <span className="profile-tile-label">Темп</span>
                <span className="profile-tile-value">{Math.round(audioFeatures.tempo_bpm)}</span>
                <span className="profile-tile-suffix">BPM</span>
              </div>
            )}
            {audioFeatures?.key && (
              <div className="profile-tile">
                <span className="profile-tile-label">Тональность</span>
                <span className="profile-tile-value">{audioFeatures.key.key}</span>
                <span className="profile-tile-suffix">
                  {audioFeatures.key.mode === "Major" ? "мажор" : "минор"}
                </span>
              </div>
            )}
            <div className="profile-tile">
              <span className="profile-tile-label">Длительность</span>
              <span className="profile-tile-value">{formatTime(duration)}</span>
              <span className="profile-tile-suffix">{transitions} смен</span>
            </div>
          </div>

          {/* Bottom row: segment pie + secondary stats */}
          <div className="profile-bottom">
            {segShare.length > 0 && (
              <div className="profile-pie">
                <svg width={PIE_SIZE} height={PIE_SIZE} viewBox={`0 0 ${PIE_SIZE} ${PIE_SIZE}`}>
                  <g transform={`translate(${PIE_SIZE / 2}, ${PIE_SIZE / 2})`}>
                    {arcs.map((a, i) => (
                      <path key={i} d={arcGen(a) ?? ""}
                            fill={monoSegmentFill(i, arcs.length)} />
                    ))}
                    <text textAnchor="middle" dy={-2} className="summary-pie-top">
                      {segShare.length}
                    </text>
                    <text textAnchor="middle" dy={12} className="summary-pie-sub">
                      сегментов
                    </text>
                  </g>
                </svg>
                <ul className="summary-pie-legend profile-pie-legend">
                  {segShare.slice(0, 4).map((s, i) => (
                    <li key={s.label}>
                      <span className="summary-pie-dot" style={{ backgroundColor: monoSegmentFill(i, segShare.length) }} />
                      <span className="summary-pie-label">{ru(s.label)}</span>
                      <span className="summary-pie-pct">{(s.share * 100).toFixed(0)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="profile-secondary">
              <div className="profile-secondary-stat">
                <span className="profile-secondary-label">Средняя энергия</span>
                <span className="profile-secondary-bar">
                  <span className="profile-secondary-fill profile-secondary-fill--arousal"
                        style={{ width: `${(avgArousal * 100).toFixed(0)}%` }} />
                </span>
                <span className="profile-secondary-pct">{(avgArousal * 100).toFixed(0)}</span>
              </div>
              <div className="profile-secondary-stat">
                <span className="profile-secondary-label">Среднее настроение</span>
                <span className="profile-secondary-bar">
                  <span className="profile-secondary-fill profile-secondary-fill--valence"
                        style={{ width: `${(avgValence * 100).toFixed(0)}%` }} />
                </span>
                <span className="profile-secondary-pct">{(avgValence * 100).toFixed(0)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

export default EmotionalProfilePanel;
