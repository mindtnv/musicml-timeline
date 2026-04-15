import { Elysia } from "elysia";
import { getTrack, saveTrack, getAudioPath } from "../services/storage";
import { analyzeTrack, getSpectrogram } from "../services/ml-client";

// In-memory cache: trackId → spectrogram payload
const SPEC_CACHE = new Map<string, unknown>();

export const analyzeRoutes = new Elysia()
  .get("/api/tracks/:id/spectrogram", async ({ params, set }) => {
    const track = await getTrack(params.id);
    if (!track) {
      set.status = 404;
      return { error: "Track not found" };
    }
    const cached = SPEC_CACHE.get(params.id);
    if (cached) return cached;

    try {
      const audioPath = getAudioPath(track.filename);
      const data = await getSpectrogram(audioPath);
      SPEC_CACHE.set(params.id, data);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set.status = 502;
      return { error: `Spectrogram failed: ${message}` };
    }
  })
  // Trigger analysis for a track
  .post("/api/tracks/:id/analyze", async ({ params, set }) => {
    const track = await getTrack(params.id);
    if (!track) {
      set.status = 404;
      return { error: "Track not found" };
    }

    if (track.status === "analyzing") {
      set.status = 409;
      return { error: "Track is already being analyzed" };
    }

    // Update status to analyzing
    track.status = "analyzing";
    track.error = undefined;
    await saveTrack(track);

    const audioPath = getAudioPath(track.filename);

    // Run analysis in the background so we can return immediately
    // but also support awaiting the result in the same request
    try {
      const timeline = await analyzeTrack(audioPath);
      track.status = "ready";
      track.timeline = timeline;
      track.error = undefined;
      await saveTrack(track);
      return track;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      track.status = "error";
      track.error = message;
      track.timeline = undefined;
      await saveTrack(track);
      set.status = 502;
      return { error: `Analysis failed: ${message}` };
    }
  });
