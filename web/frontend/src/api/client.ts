import type { Track } from "./types";

const BASE = "/api";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, options);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let message = body || res.statusText;
    try {
      const parsed = JSON.parse(body) as { error?: string };
      if (parsed?.error) message = parsed.error;
    } catch {
      // body wasn't JSON; keep the raw text
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export async function fetchTracks(): Promise<Track[]> {
  return request<Track[]>("/tracks");
}

export async function fetchTrack(id: string): Promise<Track> {
  return request<Track>(`/tracks/${encodeURIComponent(id)}`);
}

export async function uploadTrack(file: File): Promise<Track> {
  const form = new FormData();
  form.append("file", file);
  return request<Track>("/tracks", {
    method: "POST",
    body: form,
  });
}

/**
 * Upload with progress reporting via XHR. `onProgress(0..1)` fires as bytes are sent;
 * it may also fire with `null` once the browser has finished sending and is waiting
 * for the server response (analysis kickoff, disk write, etc.) — use that to switch
 * the UI from a deterministic bar to an indeterminate "finalizing" state.
 */
export function uploadTrackWithProgress(
  file: File,
  onProgress: (ratio: number | null) => void,
  signal?: AbortSignal,
): Promise<Track> {
  return new Promise<Track>((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE}/tracks`);
    xhr.responseType = "text";

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) onProgress(e.total > 0 ? e.loaded / e.total : 0);
    });
    xhr.upload.addEventListener("load", () => onProgress(null));

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as Track);
        } catch (err) {
          reject(err instanceof Error ? err : new Error("Invalid server response"));
        }
      } else {
        reject(new Error(`API ${xhr.status}: ${xhr.responseText || xhr.statusText}`));
      }
    });
    xhr.addEventListener("error", () => reject(new Error("Сбой сети при загрузке")));
    xhr.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));

    if (signal) {
      if (signal.aborted) {
        xhr.abort();
        return;
      }
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }

    xhr.send(form);
  });
}

export async function importTrackFromUrl(
  url: string,
  signal?: AbortSignal,
): Promise<Track> {
  return request<Track>("/tracks/from-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
    signal,
  });
}

export async function analyzeTrack(id: string): Promise<Track> {
  return request<Track>(`/tracks/${encodeURIComponent(id)}/analyze`, {
    method: "POST",
  });
}

export async function deleteTrack(id: string): Promise<void> {
  await fetch(`${BASE}/tracks/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function getAudioUrl(id: string): string {
  return `${BASE}/tracks/${encodeURIComponent(id)}/audio`;
}

export interface SpectrogramData {
  n_mels: number;
  n_frames: number;
  hop_seconds: number;
  duration_sec: number;
  /** Sample rate used to compute the mel filterbank (Hz). Optional for older payloads. */
  sr?: number;
  fmin?: number;
  fmax?: number;
  /** Mel filterbank center frequencies (Hz), one per mel bin. Optional for older payloads. */
  mel_freqs?: number[];
  mel: number[][]; // (n_mels, T), values in [0, 1]
}

export async function fetchSpectrogram(id: string): Promise<SpectrogramData> {
  return request<SpectrogramData>(`/tracks/${encodeURIComponent(id)}/spectrogram`);
}

// ---------------------------------------------------------------------------
// Export + Share
// ---------------------------------------------------------------------------

export type ExportFormat = "json" | "csv" | "srt" | "markers" | "md";

/** File-download URL for one of the supported export formats. */
export function getExportUrl(id: string, format: ExportFormat): string {
  const slug = format === "markers" ? "export-markers.txt" : `export.${format}`;
  return `${BASE}/tracks/${encodeURIComponent(id)}/${slug}`;
}

export interface ShareRecord {
  shareId: string;
  trackId: string;
  createdAt: string;
}

/** Create (or retrieve existing) share link for a track. */
export async function createShareLink(trackId: string): Promise<ShareRecord> {
  return request<ShareRecord>("/shares", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trackId }),
  });
}

/** Return the currently-active share record for a track, if any. */
export async function getShareForTrack(
  trackId: string,
): Promise<ShareRecord | null> {
  try {
    return await request<ShareRecord>(
      `/shares/by-track/${encodeURIComponent(trackId)}`,
    );
  } catch {
    return null;
  }
}

/** Revoke a public share link. */
export async function revokeShareLink(shareId: string): Promise<void> {
  await fetch(`${BASE}/shares/${encodeURIComponent(shareId)}`, {
    method: "DELETE",
  });
}

/**
 * Fetch a publicly-shared track by its short share id. The backend already
 * returns the same `Track` shape (minus filename/error) plus an `audioUrl`
 * and, if present, a rewritten `coverUrl` pointing at the public endpoints.
 */
export interface SharedTrack extends Track {
  shareId: string;
  audioUrl: string;
}

export async function fetchSharedTrack(shareId: string): Promise<SharedTrack> {
  return request<SharedTrack>(`/shares/${encodeURIComponent(shareId)}`);
}

/** Build the absolute URL a user pastes into Slack / DMs. */
export function buildShareUrl(shareId: string): string {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/s/${shareId}`;
}

// ---------------------------------------------------------------------------
// Embeddings — similarity + 2D map
// ---------------------------------------------------------------------------

export interface SimilarTrack {
  id: string;
  title?: string;
  artist?: string;
  originalName: string;
  coverUrl?: string;
  similarity: number;
  genre?: string;
}

export interface SimilarResponse {
  trackId: string;
  similar: SimilarTrack[];
}

export async function fetchSimilarTracks(
  id: string,
  k = 5,
): Promise<SimilarResponse> {
  return request<SimilarResponse>(
    `/tracks/${encodeURIComponent(id)}/similar?k=${k}`,
  );
}

export interface EmbeddingPoint {
  id: string;
  title: string;
  artist?: string;
  coverUrl?: string;
  genre?: string;
  x: number;
  y: number;
}

export interface EmbeddingsMapResponse {
  points: EmbeddingPoint[];
}

export async function fetchEmbeddingsMap(): Promise<EmbeddingsMapResponse> {
  return request<EmbeddingsMapResponse>("/embeddings-map");
}
