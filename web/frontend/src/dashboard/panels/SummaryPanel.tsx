import { useMemo } from "react";
import { pie, arc } from "d3-shape";
import type {
  TimelineSegment,
  FramePredictions,
  AudioFeatures,
} from "../../api/types";
import { getSegmentColor } from "../../utils/colors";
import { ru } from "../../utils/labels";
import { formatTime } from "../../utils/formatTime";
import Panel from "../Panel";

interface SummaryPanelProps {
  segments?: TimelineSegment[];
  genreSegments?: TimelineSegment[];
  framePredictions?: FramePredictions;
  audioFeatures?: AudioFeatures;
  duration: number;
}

const PIE_SIZE = 180;
const PIE_RADIUS = 80;
const PIE_INNER = 44;

function mean(values: number[]): number {
  if (!values || values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Per-frame classification score: 0.5 + 0.5·(P(positive) − P(negative)). */
function meanClassScore(probs?: number[][]): number | null {
  if (!probs || probs.length === 0) return null;
  let sum = 0;
  let n = 0;
  for (const p of probs) {
    if (!p || p.length < 3) continue;
    sum += 0.5 + 0.5 * ((p[2] ?? 0) - (p[0] ?? 0));
    n++;
  }
  return n > 0 ? sum / n : null;
}

function SummaryPanel({
  segments,
  genreSegments,
  framePredictions,
  audioFeatures,
  duration,
}: SummaryPanelProps) {
  const segShare = useMemo(() => {
    const map = new Map<string, number>();
    (segments ?? []).forEach((s) => {
      map.set(s.label, (map.get(s.label) ?? 0) + (s.end - s.start));
    });
    const entries = Array.from(map.entries()).map(([label, secs]) => ({
      label,
      seconds: secs,
      share: duration > 0 ? secs / duration : 0,
    }));
    entries.sort((a, b) => b.seconds - a.seconds);
    return entries;
  }, [segments, duration]);

  // Prefer classification-based mean (unbiased); fall back to regression
  const avgArousal =
    meanClassScore(framePredictions?.arousal_probs) ??
    mean(framePredictions?.arousal_reg ?? []);
  const avgValence =
    meanClassScore(framePredictions?.valence_probs) ??
    mean(framePredictions?.valence_reg ?? []);
  const transitions = (segments?.length ?? 1) - 1;

  const topGenre = useMemo(() => {
    if (!genreSegments || genreSegments.length === 0) return null;
    return genreSegments.reduce((best, seg) =>
      seg.confidence > best.confidence ? seg : best
    );
  }, [genreSegments]);

  // Build pie arcs
  const pieGen = pie<(typeof segShare)[number]>()
    .value((d) => d.seconds)
    .sort(null);
  const arcGen = arc<{ startAngle: number; endAngle: number }>()
    .innerRadius(PIE_INNER)
    .outerRadius(PIE_RADIUS)
    .padAngle(0.015)
    .cornerRadius(2);

  const arcs = pieGen(segShare);

  return (
    <Panel title="Сводка" subtitle="Ключевые метрики трека" span={2}>
      <div className="summary-grid">
        {/* Pie chart */}
        {segShare.length > 0 && (
          <div className="summary-pie">
            <svg width={PIE_SIZE} height={PIE_SIZE} viewBox={`0 0 ${PIE_SIZE} ${PIE_SIZE}`}>
              <g transform={`translate(${PIE_SIZE / 2}, ${PIE_SIZE / 2})`}>
                {arcs.map((a, i) => (
                  <path
                    key={i}
                    d={arcGen(a) ?? ""}
                    fill={getSegmentColor(a.data.label)}
                    opacity={0.88}
                  />
                ))}
                <text textAnchor="middle" dy={-4} className="summary-pie-top">
                  {segShare.length}
                </text>
                <text textAnchor="middle" dy={14} className="summary-pie-sub">
                  сегментов
                </text>
              </g>
            </svg>
            <ul className="summary-pie-legend">
              {segShare.map((s) => (
                <li key={s.label}>
                  <span
                    className="summary-pie-dot"
                    style={{ backgroundColor: getSegmentColor(s.label) }}
                  />
                  <span className="summary-pie-label">{ru(s.label)}</span>
                  <span className="summary-pie-pct">
                    {(s.share * 100).toFixed(0)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Numeric stats */}
        <div className="summary-stats">
          {topGenre && (
            <div className="summary-stat">
              <span className="summary-stat-label">Доминирующий жанр</span>
              <span className="summary-stat-value">
                {ru(topGenre.label)}{" "}
                <span className="summary-stat-suffix">
                  {(topGenre.confidence * 100).toFixed(0)}%
                </span>
              </span>
            </div>
          )}
          {audioFeatures?.tempo_bpm != null && (
            <div className="summary-stat">
              <span className="summary-stat-label">Темп</span>
              <span className="summary-stat-value">
                {Math.round(audioFeatures.tempo_bpm)}{" "}
                <span className="summary-stat-suffix">BPM</span>
              </span>
            </div>
          )}
          {audioFeatures?.key && (
            <div className="summary-stat">
              <span className="summary-stat-label">Тональность</span>
              <span className="summary-stat-value">
                {audioFeatures.key.key}{" "}
                <span className="summary-stat-suffix">
                  {audioFeatures.key.mode === "Major" ? "мажор" : "минор"}
                </span>
              </span>
            </div>
          )}
          <div className="summary-stat">
            <span className="summary-stat-label">Средняя энергия</span>
            <span className="summary-stat-value">
              {(avgArousal * 100).toFixed(0)}
              <span className="summary-stat-suffix">/100</span>
            </span>
          </div>
          <div className="summary-stat">
            <span className="summary-stat-label">Среднее настроение</span>
            <span className="summary-stat-value">
              {(avgValence * 100).toFixed(0)}
              <span className="summary-stat-suffix">/100</span>
            </span>
          </div>
          <div className="summary-stat">
            <span className="summary-stat-label">Смен сегментов</span>
            <span className="summary-stat-value">{transitions}</span>
          </div>
          <div className="summary-stat">
            <span className="summary-stat-label">Длительность</span>
            <span className="summary-stat-value">{formatTime(duration)}</span>
          </div>
        </div>
      </div>
    </Panel>
  );
}

export default SummaryPanel;
