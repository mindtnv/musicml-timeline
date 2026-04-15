import type { Timeline } from "../types";

const ML_API_URL = process.env.ML_API_URL || "http://localhost:8000";

export async function analyzeTrack(audioPath: string): Promise<Timeline> {
  const file = Bun.file(audioPath);
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${ML_API_URL}/analyze`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ML API error: ${response.status} ${error}`);
  }

  const data = await response.json();
  return data.timeline as Timeline;
}

export async function getSpectrogram(audioPath: string): Promise<{
  n_mels: number;
  n_frames: number;
  hop_seconds: number;
  duration_sec: number;
  sr?: number;
  fmin?: number;
  fmax?: number;
  mel_freqs?: number[];
  mel: number[][];
}> {
  const file = Bun.file(audioPath);
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${ML_API_URL}/spectrogram`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ML API error: ${response.status} ${error}`);
  }

  return await response.json();
}

export async function checkHealth(): Promise<boolean> {
  try {
    const resp = await fetch(`${ML_API_URL}/health`);
    return resp.ok;
  } catch {
    return false;
  }
}
