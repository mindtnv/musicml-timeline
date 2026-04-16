// Embedding-based similarity and 2D projection endpoints.
//
// These are pure-JS (no ML service call needed): track_embedding is already
// stored in each track's JSON after analysis, so similarity is just a cosine
// dot-product scan over the library.

import { Elysia } from "elysia";
import { loadTracks, getTrack } from "../services/storage";
import type { Track } from "../types";

// ---------------------------------------------------------------------------
// Cosine similarity on plain number[]
// ---------------------------------------------------------------------------

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
}

function norm(v: number[]): number {
  return Math.sqrt(dot(v, v));
}

function cosine(a: number[], b: number[]): number {
  const d = norm(a) * norm(b);
  return d > 0 ? dot(a, b) / d : 0;
}

// ---------------------------------------------------------------------------
// Lightweight 2D projection via PCA (no numpy, no UMAP dependency).
// Good enough for <500 tracks; the scatter plot is qualitative anyway.
// ---------------------------------------------------------------------------

function pca2d(
  embeddings: number[][],
): { x: number; y: number }[] {
  const N = embeddings.length;
  if (N === 0) return [];
  const D = embeddings[0]!.length;

  // Center
  const mean = new Float64Array(D);
  for (const e of embeddings) for (let d = 0; d < D; d++) mean[d] += e[d]!;
  for (let d = 0; d < D; d++) mean[d] /= N;

  const centered: number[][] = embeddings.map((e) =>
    e.map((v, d) => v - mean[d]!),
  );

  // Power iteration for top-2 principal components.
  // (D can be 512 — full covariance is 512×512 which is fine to iterate)
  function project(data: number[][], vec: number[]): number[] {
    return data.map((row) => dot(row, vec));
  }

  function powerIter(
    data: number[][],
    iters: number = 50,
  ): { axis: number[]; scores: number[] } {
    let v = Array.from({ length: D }, () => Math.random() - 0.5);
    let vNorm = norm(v);
    v = v.map((x) => x / (vNorm || 1));

    for (let i = 0; i < iters; i++) {
      // X^T X v  (via two passes to avoid forming D×D matrix)
      const p = project(data, v);            // (N,)
      const newV = new Array<number>(D).fill(0);
      for (let n = 0; n < N; n++) {
        for (let d = 0; d < D; d++) newV[d] += p[n]! * data[n]![d]!;
      }
      vNorm = norm(newV);
      v = newV.map((x) => x / (vNorm || 1));
    }
    return { axis: v, scores: project(data, v) };
  }

  // First PC
  const pc1 = powerIter(centered);
  // Deflate: remove PC1 component
  const deflated = centered.map((row, i) =>
    row.map((val, d) => val - pc1.scores[i]! * pc1.axis[d]!),
  );
  // Second PC
  const pc2 = powerIter(deflated);

  // Normalise to [-1, 1] for stable frontend rendering
  const minMax = (arr: number[]) => {
    let lo = Infinity, hi = -Infinity;
    for (const v of arr) { if (v < lo) lo = v; if (v > hi) hi = v; }
    const span = hi - lo || 1;
    return arr.map((v) => ((v - lo) / span) * 2 - 1);
  };

  const xs = minMax(pc1.scores);
  const ys = minMax(pc2.scores);

  return xs.map((x, i) => ({ x: Math.round(x * 1000) / 1000, y: Math.round(ys[i]! * 1000) / 1000 }));
}

// ---------------------------------------------------------------------------
// Helper: collect all tracks that have an embedding
// ---------------------------------------------------------------------------

interface TrackWithEmbedding {
  track: Track;
  embedding: number[];
}

async function loadTracksWithEmbeddings(): Promise<TrackWithEmbedding[]> {
  const all = await loadTracks();
  return all.filter(
    (t): t is Track & { timeline: NonNullable<Track["timeline"]> } =>
      t.status === "ready" &&
      t.timeline != null &&
      Array.isArray(t.timeline.track_embedding) &&
      t.timeline.track_embedding.length > 0,
  ).map((t) => ({
    track: t,
    embedding: t.timeline!.track_embedding!,
  }));
}

// ---------------------------------------------------------------------------
// Public routes
// ---------------------------------------------------------------------------

export const embeddingRoutes = new Elysia()
  // Top-K similar tracks (by cosine similarity of mean backbone embedding).
  .get("/api/tracks/:id/similar", async ({ params, set, query }) => {
    const k = Math.min(Math.max(parseInt(String(query?.k ?? "5"), 10) || 5, 1), 20);
    const target = await getTrack(params.id);
    if (!target) {
      set.status = 404;
      return { error: "Track not found" };
    }
    const tEmb = target.timeline?.track_embedding;
    if (!tEmb || tEmb.length === 0) {
      set.status = 409;
      return { error: "Track has no embedding (not analyzed yet, or model didn't produce one)" };
    }

    const all = await loadTracksWithEmbeddings();
    const scored = all
      .filter((t) => t.track.id !== params.id)
      .map((t) => ({
        id: t.track.id,
        title: t.track.title,
        artist: t.track.artist,
        originalName: t.track.originalName,
        coverUrl: t.track.coverUrl,
        similarity: Math.round(cosine(tEmb, t.embedding) * 10000) / 10000,
        genre: t.track.timeline?.genre?.reduce((best, seg) => seg.confidence > best.confidence ? seg : best)?.label,
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, k);

    return { trackId: params.id, similar: scored };
  })

  // All track embeddings projected to 2D (PCA) for the scatter map.
  .get("/api/embeddings-map", async () => {
    const all = await loadTracksWithEmbeddings();
    if (all.length < 2) {
      return { points: [] };
    }

    const embeddings = all.map((t) => t.embedding);
    const coords = pca2d(embeddings);

    const points = all.map((t, i) => ({
      id: t.track.id,
      title: t.track.title || t.track.originalName.replace(/\.[^/.]+$/, ""),
      artist: t.track.artist,
      coverUrl: t.track.coverUrl,
      genre: t.track.timeline?.genre?.reduce((best, seg) => seg.confidence > best.confidence ? seg : best)?.label,
      x: coords[i]!.x,
      y: coords[i]!.y,
    }));

    return { points };
  });
