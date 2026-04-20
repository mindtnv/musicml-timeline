import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Panel from "../Panel";
import {
  fetchSimilarTracks,
  fetchEmbeddingsMap,
  type SimilarTrack,
  type EmbeddingPoint,
} from "../../api/client";
import { getGenreColor } from "../../utils/colors";
import { displayName } from "../../utils/displayName";
import { ru } from "../../utils/labels";

interface Props {
  trackId: string;
}

// ---------------------------------------------------------------------------
// Similar tracks grid
// ---------------------------------------------------------------------------

function SimilarGrid({ trackId }: { trackId: string }) {
  const [similar, setSimilar] = useState<SimilarTrack[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchSimilarTracks(trackId, 5)
      .then((r) => { if (!cancelled) setSimilar(r.similar); })
      .catch(() => { if (!cancelled) setSimilar([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [trackId]);

  if (loading) return <div className="emb-panel-loading">Поиск похожих...</div>;
  if (similar.length === 0) return <div className="emb-panel-empty">Недостаточно треков для сравнения</div>;

  return (
    <div className="emb-similar-grid">
      {similar.map((t) => (
        <Link key={t.id} to={`/tracks/${t.id}`} className="emb-similar-card">
          {t.coverUrl ? (
            <img src={t.coverUrl} alt="" className="emb-similar-cover" />
          ) : (
            <div className="emb-similar-cover emb-similar-cover--empty">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
            </div>
          )}
          <div className="emb-similar-info">
            <div className="emb-similar-name">
              {t.title || displayName(t.originalName)}
            </div>
            {t.artist && <div className="emb-similar-artist">{t.artist}</div>}
            <div className="emb-similar-meta">
              <span className="emb-similar-score">
                {Math.round(t.similarity * 100)}%
              </span>
              {t.genre && (
                <span className="emb-similar-genre">{ru(t.genre)}</span>
              )}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PCA scatter map
// ---------------------------------------------------------------------------

const PAD = 28;
const DOT_R = 5;
const DOT_R_HL = 8;

function drawMap(
  canvas: HTMLCanvasElement, W: number,
  points: EmbeddingPoint[], highlightId?: string,
) {
  const H = Math.min(Math.round(W * 0.5), 380);
  const dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;

  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  // Grid
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const x = PAD + ((W - PAD * 2) * i) / 4;
    ctx.beginPath(); ctx.moveTo(x, PAD); ctx.lineTo(x, H - PAD); ctx.stroke();
    const y = PAD + ((H - PAD * 2) * i) / 4;
    ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke();
  }

  const tx = (v: number) => PAD + ((v + 1) / 2) * (W - PAD * 2);
  const ty = (v: number) => H - PAD - ((v + 1) / 2) * (H - PAD * 2);

  const sorted = [...points].sort((a, b) =>
    (a.id === highlightId ? 1 : 0) - (b.id === highlightId ? 1 : 0),
  );

  for (const p of sorted) {
    const isHL = p.id === highlightId;
    const r = isHL ? DOT_R_HL : DOT_R;
    const color = p.genre ? getGenreColor(p.genre) : "#7dd3fc";

    ctx.beginPath();
    ctx.arc(tx(p.x), ty(p.y), r, 0, Math.PI * 2);
    ctx.fillStyle = isHL ? color : color + "88";
    ctx.fill();

    if (isHL) {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.88)";
      ctx.font = "bold 10px monospace";
      ctx.textAlign = "center";
      const label = p.title.length > 28 ? p.title.slice(0, 26) + "\u2026" : p.title;
      ctx.fillText(label, tx(p.x), ty(p.y) - r - 5);
    }
  }

  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.font = "500 9px monospace";
  ctx.textAlign = "center";
  ctx.fillText("PC 1", W / 2, H - 4);
  ctx.save();
  ctx.translate(8, H / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("PC 2", 0, 0);
  ctx.restore();
}

function CollapsibleMap({ highlightId }: { highlightId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="emb-map-section">
      <button
        type="button"
        className="emb-map-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <svg
          width="12" height="12" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
          className={`emb-map-toggle-icon ${open ? "emb-map-toggle-icon--open" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
        <span className="emb-map-toggle-label">
          {open ? "Скрыть карту библиотеки" : "Показать карту библиотеки"}
        </span>
        <span className="emb-map-toggle-hint"></span>
      </button>
      {open && <ScatterCanvas highlightId={highlightId} />}
    </div>
  );
}

function ScatterCanvas({ highlightId }: { highlightId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [points, setPoints] = useState<EmbeddingPoint[]>([]);
  const [hovered, setHovered] = useState<EmbeddingPoint | null>(null);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [tick, setTick] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    fetchEmbeddingsMap().then((r) => setPoints(r.points)).catch(() => {});
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setTick((t) => t + 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (points.length < 2) return;
    const raf = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      if (!canvas || !wrap) return;
      const W = Math.round(wrap.getBoundingClientRect().width);
      if (W < 40) return;
      drawMap(canvas, W, points, highlightId);
    });
    return () => cancelAnimationFrame(raf);
  }, [points, highlightId, tick]);

  const findPoint = (e: React.MouseEvent): EmbeddingPoint | null => {
    const canvas = canvasRef.current;
    if (!canvas || points.length < 2) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const W = rect.width;
    const H = rect.height;
    const tx2 = (v: number) => PAD + ((v + 1) / 2) * (W - PAD * 2);
    const ty2 = (v: number) => H - PAD - ((v + 1) / 2) * (H - PAD * 2);
    let best: EmbeddingPoint | null = null;
    let bestD = 16;
    for (const p of points) {
      const d = Math.hypot(tx2(p.x) - mx, ty2(p.y) - my);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  };

  if (points.length < 2) return null;

  return (
    <div className="emb-map-section">
      <div className="emb-map-label">
        Карта библиотеки · {points.length} треков
      </div>
      <div ref={wrapRef} className="emb-map-wrap">
        <canvas
          ref={canvasRef}
          className="emb-map-canvas"
          onMouseMove={(e) => {
            setHovered(findPoint(e));
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
          <div className="emb-map-tooltip" style={{ left: mouse.x, top: mouse.y - 12 }}>
            <strong>{hovered.title}</strong>
            {hovered.artist && <span> · {hovered.artist}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Combined panel
// ---------------------------------------------------------------------------

function EmbeddingPanel({ trackId }: Props) {
  return (
    <Panel
      title="Похожие треки"
      subtitle="Треки с наиболее похожим звучанием из вашей библиотеки"
      span={4}
    >
      <SimilarGrid trackId={trackId} />
      <CollapsibleMap highlightId={trackId} />
    </Panel>
  );
}

export default EmbeddingPanel;
