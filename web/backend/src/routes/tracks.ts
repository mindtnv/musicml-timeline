import { Elysia, t } from "elysia";
import { randomUUID } from "crypto";
import { join } from "path";
import {
  loadTracks,
  getTrack,
  saveTrack,
  deleteTrack,
  getAudioPath,
  ensureUploadDir,
  getUploadsDir,
  revokeSharesForTrack,
} from "../services/storage";
import {
  validateUrl,
  fetchMetadata,
  downloadAudio,
  MAX_DURATION_SEC,
} from "../services/url-downloader";
import {
  extractFromAudioFile,
  downloadCoverFromUrl,
  deleteCover,
  getCoverPath,
} from "../services/metadata";
import type { Track } from "../types";

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|\r\n\t]/g, "_").trim().slice(0, 180) || "audio";
}

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

export const trackRoutes = new Elysia()
  // List all tracks — backfill missing metadata in the background so old
  // tracks pick up artist / title / cover the next time they're listed.
  .get("/api/tracks", async () => {
    const tracks = await loadTracks();

    // Trigger best-effort backfill for tracks missing extracted fields.
    // Runs async, off the response path — the next list call will see them.
    void Promise.all(
      tracks
        .filter((t) => t.artist === undefined && t.title === undefined && t.coverUrl === undefined)
        .slice(0, 8) // cap concurrency so we don't blow up on first ever load
        .map(async (t) => {
          try {
            const audioPath = getAudioPath(t.filename);
            const meta = await extractFromAudioFile(t.id, audioPath);
            if (meta.artist || meta.title || meta.hasCover) {
              await saveTrack({
                ...t,
                artist: meta.artist,
                title: meta.title,
                coverUrl: meta.hasCover ? `/api/tracks/${t.id}/cover` : undefined,
              });
            }
          } catch { /* best-effort */ }
        })
    );

    tracks.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return tracks;
  })

  // Get single track
  .get("/api/tracks/:id", async ({ params, set }) => {
    const track = await getTrack(params.id);
    if (!track) {
      set.status = 404;
      return { error: "Track not found" };
    }
    return track;
  })

  // Upload new track
  .post(
    "/api/tracks",
    async ({ body, set }) => {
      await ensureUploadDir();

      const { file } = body;
      const id = randomUUID();
      const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
      const filename = `${id}${ext}`;
      const uploadPath = join(getUploadsDir(), filename);

      // Write file to disk
      const arrayBuffer = await file.arrayBuffer();
      await Bun.write(uploadPath, arrayBuffer);

      // Best-effort ID3 / Vorbis tag extraction.  Fills artist/title/cover.
      const meta = await extractFromAudioFile(id, uploadPath);

      const track: Track = {
        id,
        filename,
        originalName: file.name,
        status: "pending",
        createdAt: new Date().toISOString(),
        artist: meta.artist,
        title: meta.title,
        coverUrl: meta.hasCover ? `/api/tracks/${id}/cover` : undefined,
      };

      await saveTrack(track);
      set.status = 201;
      return track;
    },
    {
      body: t.Object({
        file: t.File(),
      }),
    }
  )

  // Import a track from a URL (YouTube / SoundCloud) via yt-dlp
  .post(
    "/api/tracks/from-url",
    async ({ body, set }) => {
      const validation = validateUrl(body.url);
      if (!validation.ok) {
        set.status = 400;
        return { error: validation.error };
      }

      let meta;
      try {
        meta = await fetchMetadata(body.url);
      } catch (err) {
        set.status = 502;
        return {
          error: `Не удалось получить метаданные: ${(err as Error).message}`,
        };
      }

      if (meta.duration && meta.duration > MAX_DURATION_SEC) {
        set.status = 413;
        const minutes = Math.round(meta.duration / 60);
        const limitMin = Math.round(MAX_DURATION_SEC / 60);
        return {
          error: `Трек слишком длинный (${minutes} мин). Максимум — ${limitMin} мин.`,
        };
      }

      await ensureUploadDir();
      const id = randomUUID();
      const outputBase = join(getUploadsDir(), id);

      try {
        await downloadAudio(body.url, outputBase);
      } catch (err) {
        set.status = 502;
        return {
          error: `Скачивание не удалось: ${(err as Error).message}`,
        };
      }

      const filename = `${id}.mp3`;
      const originalName = `${sanitizeFilename(meta.title)}.mp3`;

      // Try ID3 from the downloaded file first (yt-dlp embeds title sometimes),
      // then fall back to yt-dlp metadata for any missing fields.  Cover
      // preference: embedded → YouTube/SC thumbnail.
      const downloadedPath = join(getUploadsDir(), filename);
      const fileMeta = await extractFromAudioFile(id, downloadedPath);

      let hasCover = fileMeta.hasCover;
      if (!hasCover && meta.thumbnail) {
        hasCover = await downloadCoverFromUrl(id, meta.thumbnail);
      }

      const track: Track = {
        id,
        filename,
        originalName,
        status: "pending",
        createdAt: new Date().toISOString(),
        artist: fileMeta.artist || meta.uploader,
        title: fileMeta.title || meta.title,
        coverUrl: hasCover ? `/api/tracks/${id}/cover` : undefined,
      };

      await saveTrack(track);
      set.status = 201;
      return track;
    },
    {
      body: t.Object({
        url: t.String({ minLength: 1 }),
      }),
    }
  )

  // Delete track
  .delete("/api/tracks/:id", async ({ params, set }) => {
    const deleted = await deleteTrack(params.id);
    if (!deleted) {
      set.status = 404;
      return { error: "Track not found" };
    }
    await deleteCover(params.id);
    await revokeSharesForTrack(params.id);
    return { success: true };
  })

  // Serve cover art (JPEG / PNG / WebP — content type sniffed by browser
  // works fine for img tags; we tag as image/jpeg by default).
  .get("/api/tracks/:id/cover", async ({ params, set }) => {
    const file = Bun.file(getCoverPath(params.id));
    if (!(await file.exists())) {
      set.status = 404;
      return { error: "Cover not found" };
    }
    set.headers["Content-Type"] = "image/jpeg";
    set.headers["Cache-Control"] = "public, max-age=86400";
    return file;
  })

  // Serve audio file
  .get("/api/tracks/:id/audio", async ({ params, set }) => {
    const track = await getTrack(params.id);
    if (!track) {
      set.status = 404;
      return { error: "Track not found" };
    }

    const audioPath = getAudioPath(track.filename);
    const file = Bun.file(audioPath);

    if (!(await file.exists())) {
      set.status = 404;
      return { error: "Audio file not found" };
    }

    const contentType = getContentType(track.filename);
    set.headers["Content-Type"] = contentType;
    // Use RFC 5987 encoding so non-ASCII (Cyrillic, etc.) titles don't blow
    // up Bun's strict Latin-1 header validation.
    const asciiFallback = track.originalName
      .replace(/[^\x20-\x7E]/g, "_")
      .replace(/[\\/:*?"<>|\r\n\t]/g, "_");
    set.headers["Content-Disposition"] =
      `inline; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(track.originalName)}`;
    set.headers["Accept-Ranges"] = "bytes";

    return file;
  });
