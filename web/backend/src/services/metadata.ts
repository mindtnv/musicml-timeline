// Track metadata extraction — ID3 tags + cover art.
//
// Covers are saved as JPEG into <backend>/covers/{id}.jpg and served via
// GET /api/tracks/:id/cover.  The extraction is best-effort; failures here
// must NEVER block the upload itself, since most fields are nice-to-have.

import { join } from "path";
import { writeFile, mkdir, unlink } from "fs/promises";
import { existsSync } from "fs";
import * as mm from "music-metadata";

const BACKEND_DIR = join(import.meta.dir, "..", "..");
const COVERS_DIR = join(BACKEND_DIR, "covers");

export function getCoversDir(): string {
  return COVERS_DIR;
}

export function getCoverPath(id: string): string {
  return join(COVERS_DIR, `${id}.jpg`);
}

async function ensureCoversDir(): Promise<void> {
  try { await mkdir(COVERS_DIR, { recursive: true }); } catch { /* already exists */ }
}

export interface ExtractedMetadata {
  artist?: string;
  title?: string;
  hasCover: boolean;
}

/** Read ID3 / Vorbis / etc. tags + cover blob from an audio file on disk. */
export async function extractFromAudioFile(
  trackId: string,
  audioPath: string
): Promise<ExtractedMetadata> {
  let parsed: mm.IAudioMetadata;
  try {
    parsed = await mm.parseFile(audioPath, { duration: false, skipCovers: false });
  } catch (err) {
    console.warn(`[metadata] parseFile failed for ${audioPath}:`, (err as Error).message);
    return { hasCover: false };
  }

  const common = parsed.common;
  const out: ExtractedMetadata = {
    artist: cleanString(common.artist || common.albumartist),
    title: cleanString(common.title),
    hasCover: false,
  };

  // Save embedded cover (APIC frame) if present
  const cover = mm.selectCover(common.picture);
  if (cover && cover.data && cover.data.length > 0) {
    try {
      await ensureCoversDir();
      await writeFile(getCoverPath(trackId), cover.data);
      out.hasCover = true;
    } catch (err) {
      console.warn(`[metadata] cover write failed for ${trackId}:`, (err as Error).message);
    }
  }

  return out;
}

/** Download a remote thumbnail URL (yt-dlp gives us one) and store as cover. */
export async function downloadCoverFromUrl(
  trackId: string,
  url: string
): Promise<boolean> {
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0) return false;
    await ensureCoversDir();
    await writeFile(getCoverPath(trackId), new Uint8Array(buf));
    return true;
  } catch (err) {
    console.warn(`[metadata] thumbnail download failed:`, (err as Error).message);
    return false;
  }
}

/** Remove cover blob (called from track-delete flow). */
export async function deleteCover(id: string): Promise<void> {
  const p = getCoverPath(id);
  if (existsSync(p)) {
    try { await unlink(p); } catch { /* best-effort */ }
  }
}

function cleanString(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
