import type { Track } from "./types";

const BASE = "/api";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, options);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${body || res.statusText}`);
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
