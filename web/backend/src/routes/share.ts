// Public share links — a track owner generates a short read-only id, which
// anyone with the link can use to view (but not edit, delete, or re-analyze)
// the analysis result.

import { Elysia, t } from "elysia";
import { join } from "path";
import {
  createShare,
  getShare,
  getShareByTrack,
  getTrack,
  revokeShare,
  getUploadsDir,
} from "../services/storage";
import { getCoverPath } from "../services/metadata";

const AUDIO_CONTENT_TYPES: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".wma": "audio/x-ms-wma",
  ".webm": "audio/webm",
};
function getContentType(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  return AUDIO_CONTENT_TYPES[ext] || "application/octet-stream";
}

/**
 * Strip fields the public shouldn't need: `filename` (server-side path hint)
 * and `error` (internal status). We also blanket the `coverUrl` to go through
 * the public share route so the link works for logged-out viewers.
 */
function publicTrackPayload(
  shareId: string,
  track: Awaited<ReturnType<typeof getTrack>>,
) {
  if (!track) return null;
  const { filename: _filename, error: _error, ...rest } = track;
  return {
    ...rest,
    shareId,
    coverUrl: track.coverUrl ? `/api/shares/${shareId}/cover` : undefined,
    audioUrl: `/api/shares/${shareId}/audio`,
  };
}

export const shareRoutes = new Elysia()
  // Create (or return existing) share link for a track owned by "me". There's
  // no real auth in this product yet, so ownership is implicit in possession
  // of the track id — same model as everything else in the app.
  .post(
    "/api/shares",
    async ({ body, set }) => {
      const track = await getTrack(body.trackId);
      if (!track) {
        set.status = 404;
        return { error: "Track not found" };
      }
      if (!track.timeline) {
        set.status = 409;
        return { error: "Track is not analyzed yet" };
      }
      const record = await createShare(body.trackId);
      set.status = 201;
      return record;
    },
    {
      body: t.Object({
        trackId: t.String({ minLength: 1 }),
      }),
    },
  )

  // Return the active share record for a track (or 404 if none).
  .get("/api/shares/by-track/:trackId", async ({ params, set }) => {
    const record = await getShareByTrack(params.trackId);
    if (!record) {
      set.status = 404;
      return { error: "No active share for this track" };
    }
    return record;
  })

  // Revoke a share link.
  .delete("/api/shares/:shareId", async ({ params, set }) => {
    const ok = await revokeShare(params.shareId);
    if (!ok) {
      set.status = 404;
      return { error: "Share not found" };
    }
    return { success: true };
  })

  // Public read-only view of a shared track — same shape the dashboard
  // already consumes, so we can reuse the frontend components verbatim.
  .get("/api/shares/:shareId", async ({ params, set }) => {
    const rec = await getShare(params.shareId);
    if (!rec) {
      set.status = 404;
      return { error: "Share not found" };
    }
    const track = await getTrack(rec.trackId);
    if (!track) {
      set.status = 404;
      return { error: "Shared track no longer exists" };
    }
    const payload = publicTrackPayload(params.shareId, track);
    return payload;
  })

  // Public audio stream for a shared track — same bytes as the owner's endpoint.
  .get("/api/shares/:shareId/audio", async ({ params, set }) => {
    const rec = await getShare(params.shareId);
    if (!rec) {
      set.status = 404;
      return { error: "Share not found" };
    }
    const track = await getTrack(rec.trackId);
    if (!track) {
      set.status = 404;
      return { error: "Shared track no longer exists" };
    }
    const audioPath = join(getUploadsDir(), track.filename);
    const file = Bun.file(audioPath);
    if (!(await file.exists())) {
      set.status = 404;
      return { error: "Audio file not found" };
    }
    set.headers["Content-Type"] = getContentType(track.filename);
    set.headers["Accept-Ranges"] = "bytes";
    return file;
  })

  // Public cover art.
  .get("/api/shares/:shareId/cover", async ({ params, set }) => {
    const rec = await getShare(params.shareId);
    if (!rec) {
      set.status = 404;
      return { error: "Share not found" };
    }
    const file = Bun.file(getCoverPath(rec.trackId));
    if (!(await file.exists())) {
      set.status = 404;
      return { error: "Cover not found" };
    }
    set.headers["Content-Type"] = "image/jpeg";
    set.headers["Cache-Control"] = "public, max-age=86400";
    return file;
  });