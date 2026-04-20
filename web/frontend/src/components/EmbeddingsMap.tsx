import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchEmbeddingsMap, type EmbeddingPoint } from "../api/client";
import { getGenreColor } from "../utils/colors";

interface Props {
  /** Highlight one track on the map (the currently-viewed track). */
  highlightId?: string;
}

const PAD = 32;
const DOT_R = 6;
const DOT_R_HL = 9;

function drawMap(
  canvas: HTMLCanvasElement,
  W: number,
  points: EmbeddingPoint[],
  highlightId?: string,
) {
  const H = Math.min(Math.round(W * 0.55), 420);
  const dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;

  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  // Grid
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const x = PAD + ((W - PAD * 2) * i) / 4;
    ctx.beginPath(); ctx.moveTo(x, PAD); ctx.lineTo(x, H - PAD); ctx.stroke();
    const y = PAD + ((H - PAD * 2) * i) / 4;
    ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke();
  }

  const tx = (v: number) => PAD + ((v + 1) / 2) * (W - PAD * 2);
  const ty = (v: number) => H - PAD - ((v + 1) / 2) * (H - PAD * 2);

  // Dots (non-highlighted first, highlighted last so it's on top)
  const sorted = [...points].sort((a, b) =>
    (a.id === highlightId ? 1 : 0) - (b.id === highlightId ? 1 : 0),
  );

  for (const p of sorted) {
    const isHL = p.id === highlightId;
    const r = isHL ? DOT_R_HL : DOT_R;
    const color = p.genre ? getGenreColor(p.genre) : "#7dd3fc";

    ctx.beginPath();
    ctx.arc(tx(p.x), ty(p.y), r, 0, Math.PI * 2);
    ctx.fillStyle = isHL ? color : color + "99";
    ctx.fill();

    if (isHL) {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.font = "bold 11px monospace";
      ctx.textAlign = "center";
      const label = p.title.length > 26 ? p.title.slice(0, 24) + "\u2026" : p.title;
      ctx.fillText(label, tx(p.x), ty(p.y) - r - 6);
    }
  }

  // Axis labels
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.font = "500 10px monospace";
  ctx.textAlign = "center";
  ctx.fillText("PC 1", W / 2, H - 6);
  ctx.save();
  ctx.translate(10, H / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("PC 2", 0, 0);
  ctx.restore();
}

/**
 * Interactive 2D PCA scatter plot of the entire track library.
 *
 * Each dot is a track coloured by top-genre. The currently-viewed track is
 * highlighted with a larger ring + label. Hover shows a tooltip; click
 * navigates to the track page.
 */
function EmbeddingsMap({ highlightId }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [points, setPoints] = useState<EmbeddingPoint[]>([]);
  const [hovered, setHovered] = useState<EmbeddingPoint | null>(null);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [tick, setTick] = useState(0);
  const navigate = useNavigate();

  // Fetch points once
  useEffect(() => {
    fetchEmbeddingsMap()
      .then((r) => setPoints(r.points))
      .catch(() => setPoints([]));
  }, []);

  // Bump tick on resize so drawing effect re-runs
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setTick((t) => t + 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Draw after layout
  useEffect(() => {
    if (points.length < 2) return;
    const raf = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      const W = Math.round(container.getBoundingClientRect().width);
      if (W < 40) return;
      drawMap(canvas, W, points, highlightId);
    });
    return () => cancelAnimationFrame(raf);
  }, [points, highlightId, tick]);

  // Hit-testing
  const findPoint = (e: React.MouseEvent): EmbeddingPoint | null => {
    const canvas = canvasRef.current;
    if (!canvas || points.length < 2) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const W = rect.width;
    const H = rect.height;
    const tx = (v: number) => PAD + ((v + 1) / 2) * (W - PAD * 2);
    const ty = (v: number) => H - PAD - ((v + 1) / 2) * (H - PAD * 2);

    let closest: EmbeddingPoint | null = null;
    let bestD = 18;
    for (const p of points) {
      const dx = tx(p.x) - mx;
      const dy = ty(p.y) - my;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestD) { bestD = d; closest = p; }
    }
    return closest;
  };

  if (points.length < 2) return null;

  return (
    <section className="embeddings-map">
      <h3 className="embeddings-map-title">
        Карта библиотеки
        <span className="embeddings-map-badge">{points.length} треков</span>
      </h3>
      <p className="embeddings-map-hint">
        Каждая точка — трек в вашей библиотеке. Цвет = жанр.
        Близкие точки — похожие по звучанию треки. Наведите для подсказки,
        клик откроет трек.
      </p>
      <div ref={containerRef} className="embeddings-map-canvas-wrap">
        <canvas
          ref={canvasRef}
          className="embeddings-map-canvas"
          onMouseMove={(e) => {
            const p = findPoint(e);
            setHovered(p);
            setMouse({ x: e.clientX, y: e.clientY });
          }}
          onMouseLeave={() => setHovered(null)}
          onClick={(e) => {
            const p = findPoint(e);
            if (p) navigate(`/tracks/${p.id}`);
          }}
          style={{ cursor: hovered ? "pointer" : "default" }}
        />
        {hovered && (
          <div
            className="embeddings-map-tooltip"
            style={{ left: mouse.x, top: mouse.y - 12 }}
          >
            <strong>{hovered.title}</strong>
            {hovered.artist && <span> · {hovered.artist}</span>}
            {hovered.genre && (
              <span className="embeddings-map-tooltip-genre">
                {hovered.genre}
              </span>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export default EmbeddingsMap;
