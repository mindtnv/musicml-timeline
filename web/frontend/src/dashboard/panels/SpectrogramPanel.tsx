import { useEffect, useRef, useState } from "react";
import Panel from "../Panel";
import ChartFrame from "../ChartFrame";
import type { TimeScale } from "../useTimeScale";
import { fetchSpectrogram, type SpectrogramData } from "../../api/client";
import { formatTime } from "../../utils/formatTime";

interface SpectrogramPanelProps {
  trackId: string;
  duration: number;
}

const HEIGHT = 200;
const FREQ_AXIS_WIDTH = 44;

interface SpectrogramCanvasProps {
  data: SpectrogramData;
  width: number;
  height: number;
  timeScale: TimeScale;
  duration: number;
}

// Custom 5-stop colormap: deep indigo → magenta → coral → amber → near-white.
// iZotope/Spectre-style — never goes to pure black (a #0a0a18 floor avoids
// dead zones), and brights exceed the midtones for natural bloom.
function buildAuroraLUT(): Uint8Array {
  const stops: [number, [number, number, number]][] = [
    [0.00, [10,  10,  24]],   // near-black indigo
    [0.18, [40,  20,  90]],   // deep purple
    [0.40, [180, 50,  170]],  // magenta
    [0.65, [255, 100, 90]],   // coral
    [0.85, [255, 200, 60]],   // amber
    [1.00, [255, 250, 220]],  // off-white
  ];
  const lut = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let a = stops[0][1];
    let b = stops[stops.length - 1][1];
    let t0 = 0;
    let t1 = 1;
    for (let j = 0; j < stops.length - 1; j++) {
      if (t >= stops[j][0] && t <= stops[j + 1][0]) {
        a = stops[j][1];
        b = stops[j + 1][1];
        t0 = stops[j][0];
        t1 = stops[j + 1][0];
        break;
      }
    }
    const k = (t - t0) / Math.max(1e-6, t1 - t0);
    lut[i * 3]     = Math.round(a[0] + (b[0] - a[0]) * k);
    lut[i * 3 + 1] = Math.round(a[1] + (b[1] - a[1]) * k);
    lut[i * 3 + 2] = Math.round(a[2] + (b[2] - a[2]) * k);
  }
  return lut;
}

const AURORA_LUT = buildAuroraLUT();

interface HoverInfo {
  x: number;
  y: number;
  t: number;     // seconds
  hz: number;    // approximate Hz at cursor
  intensity: number; // 0..1
}

function SpectrogramCanvas({ data, width, height, timeScale, duration }: SpectrogramCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const { mel, n_mels } = data;
    const T = mel[0]?.length ?? 0;
    if (T === 0) return;

    const off = document.createElement("canvas");
    off.width = T;
    off.height = n_mels;
    const offCtx = off.getContext("2d");
    if (!offCtx) return;
    const img = offCtx.createImageData(T, n_mels);

    // Gamma correction to brighten midtones (log-mel is very dynamic-range compressed)
    const GAMMA = 0.4;

    for (let y = 0; y < n_mels; y++) {
      const melRow = mel[n_mels - 1 - y]; // flip so low freq on bottom
      if (!melRow) continue;
      for (let x = 0; x < T; x++) {
        const raw = Math.max(0, Math.min(1, melRow[x] ?? 0));
        const v = Math.pow(raw, GAMMA);
        const li = Math.min(255, Math.max(0, Math.round(v * 255))) * 3;
        const pi = (y * T + x) * 4;
        img.data[pi]     = AURORA_LUT[li];
        img.data[pi + 1] = AURORA_LUT[li + 1];
        img.data[pi + 2] = AURORA_LUT[li + 2];
        img.data[pi + 3] = 255;
      }
    }
    offCtx.putImageData(img, 0, 0);

    // Draw scaled to match time scale
    ctx.clearRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const x0 = timeScale.scale(0);
    const x1 = timeScale.scale(duration);
    ctx.drawImage(off, x0, 0, x1 - x0, height);

    // --- Bloom pass: re-draw the spectrogram blurred + screen-composited.
    // Cheap "iZotope premium" feel — highlights overspill into a soft glow. ---
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.filter = "blur(6px) saturate(140%)";
    ctx.globalAlpha = 0.55;
    ctx.drawImage(off, x0, 0, x1 - x0, height);
    ctx.filter = "none";
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.restore();
  }, [data, width, height, timeScale, duration]);

  function handleMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (x < 0 || x > width || y < 0 || y > height) {
      setHover(null);
      return;
    }
    const t = Math.max(0, Math.min(duration, timeScale.invert(x)));
    // y inverted: top of canvas = high freq
    const yFrac = 1 - y / height;
    const binIdx = Math.min(data.n_mels - 1, Math.max(0, Math.round(yFrac * (data.n_mels - 1))));
    const hz = (data.mel_freqs ?? [])[binIdx] ?? 0;
    // Sample intensity from raw mel matrix if present
    const T = data.mel[0]?.length ?? 0;
    const colIdx = T > 0 ? Math.min(T - 1, Math.max(0, Math.floor((t / Math.max(0.001, duration)) * T))) : 0;
    const raw = data.mel[data.n_mels - 1 - binIdx]?.[colIdx] ?? 0;
    setHover({ x, y, t, hz, intensity: raw });
  }

  function handleLeave() {
    setHover(null);
  }

  return (
    <div
      className="spectrogram-canvas-wrap"
      style={{ width, height, position: "relative", cursor: "crosshair" }}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
    >
      <canvas
        ref={canvasRef}
        className="spectrogram-canvas"
        style={{ width, height, display: "block", borderRadius: 8 }}
      />
      {hover && (
        <>
          {/* Vertical crosshair */}
          <div
            className="spec-crosshair spec-crosshair--v"
            style={{ left: hover.x }}
          />
          {/* Horizontal crosshair */}
          <div
            className="spec-crosshair spec-crosshair--h"
            style={{ top: hover.y }}
          />
          {/* Floating tooltip */}
          <div
            className="spec-tooltip"
            style={{
              left: Math.min(width - 140, Math.max(0, hover.x + 12)),
              top: Math.max(0, hover.y - 56),
            }}
          >
            <div className="spec-tooltip-row">
              <span className="spec-tooltip-key">T</span>
              <span className="spec-tooltip-val">{formatTime(hover.t)}</span>
            </div>
            <div className="spec-tooltip-row">
              <span className="spec-tooltip-key">F</span>
              <span className="spec-tooltip-val">
                {hover.hz < 1000 ? `${Math.round(hover.hz)} Hz` :
                 hover.hz < 10000 ? `${(hover.hz / 1000).toFixed(1)} kHz` :
                 `${Math.round(hover.hz / 1000)} kHz`}
              </span>
            </div>
            <div className="spec-tooltip-row">
              <span className="spec-tooltip-key">I</span>
              <span className="spec-tooltip-val">{(hover.intensity * 100).toFixed(0)}%</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Format a frequency in Hz as a short human-friendly label:
 *   250  → "250"     0.25→ "250"
 *   1024 → "1.0k"
 *   10500 → "10k"
 */
function formatHz(hz: number): string {
  if (hz < 1000) return `${Math.round(hz)}`;
  const k = hz / 1000;
  if (k < 10) return `${k.toFixed(1)}k`;
  return `${Math.round(k)}k`;
}

/** Pick mel-bin indices nearest to musically-meaningful "round" frequencies
 *  (200 Hz, 500 Hz, 1 kHz, 2 kHz, 5 kHz, 10 kHz).  This reads as a piano
 *  range to a musician, not as arbitrary mel slots. */
function pickAxisTicks(nMels: number, melFreqs: number[]): number[] {
  if (nMels <= 0 || !melFreqs || melFreqs.length === 0) return [];
  const targets = [200, 500, 1000, 2000, 5000, 10000];
  const out: number[] = [];
  for (const target of targets) {
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < nMels; i++) {
      const d = Math.abs((melFreqs[i] ?? 0) - target);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    if (bestIdx >= 0 && !out.includes(bestIdx)) out.push(bestIdx);
  }
  return out;
}

interface FrequencyAxisProps {
  melFreqs: number[];
  nMels: number;
  height: number;
}

function FrequencyAxis({ melFreqs, nMels, height }: FrequencyAxisProps) {
  const tickBins = pickAxisTicks(nMels, melFreqs);
  return (
    <svg
      className="spectrogram-freq-axis"
      width={FREQ_AXIS_WIDTH}
      height={height}
      viewBox={`0 0 ${FREQ_AXIS_WIDTH} ${height}`}
      aria-hidden="true"
    >
      <text
        x={FREQ_AXIS_WIDTH - 4}
        y={12}
        textAnchor="end"
        className="spectrogram-axis-title"
      >
        Hz
      </text>
      {tickBins.map((bin) => {
        // bin=0 is the lowest freq, rendered at the bottom of the canvas
        const y = height - (bin / Math.max(1, nMels - 1)) * height;
        const hz = melFreqs[bin] ?? 0;
        // Keep labels inside the axis box (avoid clipping at top/bottom edges)
        const clampedY = Math.max(10, Math.min(height - 3, y));
        return (
          <g key={bin}>
            <line
              x1={FREQ_AXIS_WIDTH - 4}
              x2={FREQ_AXIS_WIDTH}
              y1={clampedY}
              y2={clampedY}
              className="spectrogram-axis-tick"
            />
            <text
              x={FREQ_AXIS_WIDTH - 7}
              y={clampedY + 3}
              textAnchor="end"
              className="spectrogram-axis-label"
            >
              {formatHz(hz)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function SpectrogramPanel({ trackId, duration }: SpectrogramPanelProps) {
  const [data, setData] = useState<SpectrogramData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchSpectrogram(trackId)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [trackId]);

  const subtitle = data?.sr
    ? `128 mel bins · 0 – ${formatHz(data.sr / 2)}Hz · вход CNN/AST модели`
    : "Вход модели: 128 mel bins × время";

  return (
    <Panel title="Мел-спектрограмма" subtitle={subtitle} span={4}>
      {loading && <div className="spectrogram-placeholder">Вычисление спектрограммы...</div>}
      {error && <div className="spectrogram-error">{error}</div>}
      {data && (
        <div className="spectrogram-row">
          <FrequencyAxis
            melFreqs={data.mel_freqs ?? []}
            nMels={data.n_mels}
            height={HEIGHT}
          />
          <div className="spectrogram-plot">
            <ChartFrame height={HEIGHT}>
              {({ timeScale, width, height }) => (
                <SpectrogramCanvas
                  data={data}
                  width={width}
                  height={height}
                  timeScale={timeScale}
                  duration={duration}
                />
              )}
            </ChartFrame>
          </div>
        </div>
      )}
    </Panel>
  );
}

export default SpectrogramPanel;
