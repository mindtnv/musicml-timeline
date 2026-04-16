import { Elysia } from "elysia";
import { getTrack } from "../services/storage";
import {
  exportCsv,
  exportDawMarkers,
  exportFilename,
  exportJson,
  exportMarkdown,
  exportSrt,
} from "../services/export";

/**
 * Build a `Content-Disposition` header value that works for non-ASCII
 * filenames (Cyrillic, emoji, …). Follows RFC 5987.
 */
function disposition(filename: string): string {
  const ascii = filename
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/[\\/:*?"<>|\r\n\t]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/**
 * Wrap "the track exists and its analysis is ready" checks so each export
 * handler can focus on format.
 */
async function loadReadyTrack(id: string) {
  const track = await getTrack(id);
  if (!track) return { error: "Track not found" as const, status: 404 };
  if (!track.timeline) {
    return { error: "Track has no analysis yet" as const, status: 409 };
  }
  return { track };
}

export const exportRoutes = new Elysia()
  // Full JSON (track + timeline + envelope)
  .get("/api/tracks/:id/export.json", async ({ params, set }) => {
    const r = await loadReadyTrack(params.id);
    if ("error" in r) {
      set.status = r.status;
      return { error: r.error };
    }
    set.headers["Content-Type"] = "application/json; charset=utf-8";
    set.headers["Content-Disposition"] = disposition(
      exportFilename(r.track, "json"),
    );
    return exportJson(r.track);
  })

  // Frame-level CSV
  .get("/api/tracks/:id/export.csv", async ({ params, set }) => {
    const r = await loadReadyTrack(params.id);
    if ("error" in r) {
      set.status = r.status;
      return { error: r.error };
    }
    set.headers["Content-Type"] = "text/csv; charset=utf-8";
    set.headers["Content-Disposition"] = disposition(
      exportFilename(r.track, "csv"),
    );
    return exportCsv(r.track.timeline!);
  })

  // Structural segments as SRT subtitles
  .get("/api/tracks/:id/export.srt", async ({ params, set }) => {
    const r = await loadReadyTrack(params.id);
    if ("error" in r) {
      set.status = r.status;
      return { error: r.error };
    }
    const segs = r.track.timeline?.segment ?? [];
    set.headers["Content-Type"] = "application/x-subrip; charset=utf-8";
    set.headers["Content-Disposition"] = disposition(
      exportFilename(r.track, "srt"),
    );
    return exportSrt(segs);
  })

  // DAW markers (Audacity / Reaper label format)
  .get("/api/tracks/:id/export-markers.txt", async ({ params, set }) => {
    const r = await loadReadyTrack(params.id);
    if ("error" in r) {
      set.status = r.status;
      return { error: r.error };
    }
    const segs = r.track.timeline?.segment ?? [];
    set.headers["Content-Type"] = "text/plain; charset=utf-8";
    set.headers["Content-Disposition"] = disposition(
      exportFilename(r.track, "markers.txt"),
    );
    return exportDawMarkers(segs);
  })

  // Human-readable markdown report
  .get("/api/tracks/:id/export.md", async ({ params, set }) => {
    const r = await loadReadyTrack(params.id);
    if ("error" in r) {
      set.status = r.status;
      return { error: r.error };
    }
    set.headers["Content-Type"] = "text/markdown; charset=utf-8";
    set.headers["Content-Disposition"] = disposition(
      exportFilename(r.track, "md"),
    );
    return exportMarkdown(r.track);
  });