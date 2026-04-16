import { useState } from "react";

interface ArcData {
  archetype: string;
  label_ru: string;
  label_en: string;
  emoji: string;
  description_ru: string;
  curve: number[];
}

interface Props {
  arc: ArcData;
}

/**
 * Sparkline — 4-point mini curve rendered as an inline SVG.
 * Maps the 4 quarter-means to a polyline inside a tiny viewport.
 */
function Sparkline({ curve, color }: { curve: number[]; color: string }) {
  if (curve.length < 4) return null;
  const W = 36;
  const H = 16;
  const pad = 2;
  const pts = curve.map((v, i) => {
    const x = pad + (i / 3) * (W - pad * 2);
    const y = H - pad - v * (H - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      className="arc-sparkline"
      aria-hidden="true"
    >
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Dots at endpoints */}
      <circle cx={pts[0]!.split(",")[0]} cy={pts[0]!.split(",")[1]} r="1.5" fill={color} />
      <circle
        cx={pts[3]!.split(",")[0]}
        cy={pts[3]!.split(",")[1]}
        r="1.5"
        fill={color}
      />
    </svg>
  );
}

const ARC_COLORS: Record<string, string> = {
  rise: "#22c55e",
  fall: "#ef4444",
  hole: "#f59e0b",
  peak: "#a78bfa",
  wave: "#38bdf8",
  steady: "#94a3b8",
};

/**
 * Compact badge showing the emotional arc archetype.
 *
 * Renders as a hero chip: emoji + Russian label + sparkline.
 * Hover/click expands a tooltip with the English name and description.
 */
function ArcBadge({ arc }: Props) {
  const [showTip, setShowTip] = useState(false);
  const color = ARC_COLORS[arc.archetype] ?? "#94a3b8";

  return (
    <span
      className="arc-badge"
      style={{ "--arc-color": color } as React.CSSProperties}
      onMouseEnter={() => setShowTip(true)}
      onMouseLeave={() => setShowTip(false)}
      role="button"
      tabIndex={0}
      aria-label={`Эмоциональная арка: ${arc.label_ru}`}
    >
      <Sparkline curve={arc.curve} color={color} />
      <span className="arc-badge-label">{arc.label_ru}</span>

      {showTip && (
        <span className="arc-badge-tooltip">
          <span className="arc-badge-tooltip-head">
            {arc.label_ru}
            <span className="arc-badge-tooltip-en">{arc.label_en}</span>
          </span>
          <span className="arc-badge-tooltip-desc">{arc.description_ru}</span>
        </span>
      )}
    </span>
  );
}

export default ArcBadge;
