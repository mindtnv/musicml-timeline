import { useEffect, useRef, useState } from "react";
import { interpolateViridis } from "d3-scale-chromatic";
import Panel from "../Panel";
import ChartFrame from "../ChartFrame";
import type { TimeScale } from "../useTimeScale";
import { fetchSpectrogram, type SpectrogramData } from "../../api/client";

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

function SpectrogramCanvas({ data, width, height, timeScale, duration }: SpectrogramCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
    // Normalized mel arrives as (n_mels, T)
    const T = mel[0]?.length ?? 0;
    if (T === 0) return;

    // Precompute viridis LUT (256 entries) for speed
    const lut = new Uint8Array(256 * 3);
    const tmp = document.createElement("canvas");
    tmp.width = 256;
    tmp.height = 1;
    const tmpCtx = tmp.getContext("2d")!;
    for (let i = 0; i < 256; i++) {
      tmpCtx.fillStyle = interpolateViridis(i / 255);
      tmpCtx.fillRect(i, 0, 1, 1);
    }
    const lutData = tmpCtx.getImageData(0, 0, 256, 1).data;
    for (let i = 0; i < 256; i++) {
      lut[i * 3] = lutData[i * 4];
      lut[i * 3 + 1] = lutData[i * 4 + 1];
      lut[i * 3 + 2] = lutData[i * 4 + 2];
    }

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
        img.data[pi] = lut[li];
        img.data[pi + 1] = lut[li + 1];
        img.data[pi + 2] = lut[li + 2];
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
  }, [data, width, height, timeScale, duration]);

  return (
    <canvas
      ref={canvasRef}
      className="spectrogram-canvas"
      style={{ width, height, display: "block", borderRadius: 4 }}
    />
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

/** Pick ~5 mel-bin indices roughly evenly spaced along the mel axis. */
function pickAxisTicks(nMels: number, count: number = 5): number[] {
  if (nMels <= 0) return [];
  const ticks: number[] = [];
  for (let i = 0; i < count; i++) {
    // Evenly spaced in [0, n_mels-1]
    const idx = Math.round((i * (nMels - 1)) / (count - 1));
    ticks.push(idx);
  }
  return ticks;
}

interface FrequencyAxisProps {
  melFreqs: number[];
  nMels: number;
  height: number;
}

function FrequencyAxis({ melFreqs, nMels, height }: FrequencyAxisProps) {
  const tickBins = pickAxisTicks(nMels, 5);
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
