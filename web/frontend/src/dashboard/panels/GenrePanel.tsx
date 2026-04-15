import { useMemo, useRef, useEffect } from "react";
import { stack, area } from "d3-shape";
import type { TimelineSegment, FramePredictions } from "../../api/types";
import { GENRE_ORDER, getGenreColor } from "../../utils/colors";
import { ru } from "../../utils/labels";
import Panel from "../Panel";
import ChartFrame from "../ChartFrame";
import type { TimeScale } from "../useTimeScale";

interface GenrePanelProps {
  genreSegments?: TimelineSegment[];
  framePredictions?: FramePredictions;
  duration: number;
}

const STACKED_HEIGHT = 200;

interface StackedAreaProps {
  probs: number[][];
  hopSeconds: number;
  duration: number;
  timeScale: TimeScale;
  width: number;
  height: number;
}

function StackedArea({ probs, hopSeconds, duration, timeScale, width, height }: StackedAreaProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || probs.length === 0 || width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const n = probs.length;
    const k = probs[0].length;

    // Build stacked series using d3-shape
    const keys = Array.from({ length: k }, (_, i) => i);
    type Row = { t: number } & Record<string, number>;
    const rows: Row[] = probs.map((p, i) => {
      const r: Row = { t: i * hopSeconds } as Row;
      keys.forEach((ki) => {
        r[String(ki)] = p[ki];
      });
      return r;
    });
    const stacker = stack<Row>().keys(keys.map(String));
    const series = stacker(rows);

    const plotTop = 6;
    const plotBottom = height - 6;
    const plotHeight = plotBottom - plotTop;

    const areaGen = area<[number, number]>()
      .x((_, i) => {
        const t = Math.min(duration, i * hopSeconds);
        return timeScale.scale(t);
      })
      .y0((d) => plotTop + plotHeight * (1 - d[0]))
      .y1((d) => plotTop + plotHeight * (1 - d[1]))
      .context(ctx);

    // Use lighten/screen blend so overlapping bands glow rather than mud
    ctx.globalCompositeOperation = "lighter";
    series.forEach((s, idx) => {
      const label = GENRE_ORDER[idx] ?? `g${idx}`;
      const c = getGenreColor(label);
      // Convert hex → rgba with 0.45 alpha
      const m = c.replace("#", "");
      const r = parseInt(m.slice(0, 2), 16);
      const g = parseInt(m.slice(2, 4), 16);
      const b = parseInt(m.slice(4, 6), 16);
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.42)`;
      ctx.beginPath();
      areaGen(s as unknown as [number, number][]);
      ctx.fill();
    });
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  }, [probs, hopSeconds, duration, timeScale, width, height]);

  return (
    <canvas
      ref={canvasRef}
      className="genre-stacked-canvas"
      style={{ width, height, display: "block" }}
    />
  );
}

function GenrePanel({ framePredictions, duration }: GenrePanelProps) {
  const probs = framePredictions?.genre_probs;
  const hasStack = probs && probs.length > 0;

  if (!hasStack) return null;

  // Normalize probs to sum=1 per frame (safety)
  const normalized = useMemo(() => {
    if (!probs) return [];
    return probs.map((row) => {
      const s = row.reduce((a, b) => a + b, 0) || 1;
      return row.map((v) => v / s);
    });
  }, [probs]);

  // Compute top-3 genres by average probability across the whole track.
  // This is more honest than showing only the dominant segment class,
  // because it reveals the model's uncertainty on OOD (out-of-GTZAN) music.
  const topGenres = useMemo(() => {
    if (!hasStack) return [] as { label: string; probability: number }[];
    const avg = new Array(GENRE_ORDER.length).fill(0);
    for (const row of normalized) {
      for (let i = 0; i < GENRE_ORDER.length; i++) avg[i] += row[i] ?? 0;
    }
    for (let i = 0; i < avg.length; i++) avg[i] /= Math.max(1, normalized.length);
    return GENRE_ORDER.map((label, i) => ({ label, probability: avg[i] }))
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 3);
  }, [hasStack, normalized]);

  const topConfidence = topGenres[0]?.probability ?? 0;
  const lowConfidence = topConfidence > 0 && topConfidence < 0.45;

  return (
    <Panel
      title="Жанр композиции"
      subtitle="Классификация в 10 жанров GTZAN-2002 · современные жанры (electronic, indie, lo-fi и др.) сопоставляются с ближайшим"
      span={4}
    >
      {topGenres.length > 0 && (
        <div className="genre-top3-wrap">
          <div className="genre-top3-list">
            {topGenres.map((g, i) => {
              const isWinner = i === 0;
              return (
                <div
                  key={g.label}
                  className={
                    "genre-top3-item genre-top3-item--rank-" + (i + 1) +
                    (isWinner ? " genre-top3-item--winner" : "")
                  }
                  style={{ "--g-color": getGenreColor(g.label) } as React.CSSProperties}
                >
                  <span className="genre-top3-rank">
                    {isWinner ? "★" : i + 1}
                  </span>
                  <span className="genre-top3-name">{ru(g.label)}</span>
                  <span className="genre-top3-track">
                    <span
                      className="genre-top3-fill"
                      style={{ width: `${g.probability * 100}%` }}
                    />
                  </span>
                  <span className="genre-top3-pct">{(g.probability * 100).toFixed(0)}%</span>
                </div>
              );
            })}
          </div>
          {lowConfidence && (
            <div className="genre-top3-warn" role="note">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <line x1="12" y1="8" x2="12" y2="13" />
                <circle cx="12" cy="16.5" r="0.8" fill="currentColor" />
              </svg>
              <span>
                <strong>Низкая уверенность классификации.</strong>{" "}
                Трек вероятно вне 10 классов GTZAN — показан ближайший жанр.
              </span>
            </div>
          )}
        </div>
      )}

      {hasStack && (
        <div className="genre-stacked-wrap">
          <ChartFrame height={STACKED_HEIGHT} showCursorLabel>
            {({ timeScale, width, height }) => (
              <StackedArea
                probs={normalized}
                hopSeconds={framePredictions!.frame_hop_seconds}
                duration={duration}
                timeScale={timeScale}
                width={width}
                height={height}
              />
            )}
          </ChartFrame>
          <div className="genre-legend">
            {GENRE_ORDER.map((g) => (
              <span key={g} className="genre-legend-item">
                <span
                  className="genre-legend-dot"
                  style={{ backgroundColor: getGenreColor(g) }}
                />
                {ru(g)}
              </span>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}

export default GenrePanel;
