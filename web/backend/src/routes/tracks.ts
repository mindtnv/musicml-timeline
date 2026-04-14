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
} from "../services/storage";
import type { Track } from "../types";

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
  // List all tracks
  .get("/api/tracks", async () => {
    const tracks = await loadTracks();
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

      const track: Track = {
        id,
        filename,
        originalName: file.name,
        status: "pending",
        createdAt: new Date().toISOString(),
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

  // Delete track
  .delete("/api/tracks/:id", async ({ params, set }) => {
    const deleted = await deleteTrack(params.id);
    if (!deleted) {
      set.status = 404;
      return { error: "Track not found" };
    }
    return { success: true };
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
    set.headers["Content-Disposition"] =
      `inline; filename="${track.originalName}"`;
    set.headers["Accept-Ranges"] = "bytes";

    return file;
  });
