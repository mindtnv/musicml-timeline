import { resolve, join } from "path";
import { readdir, readFile, writeFile, unlink, mkdir } from "fs/promises";
import { randomBytes } from "crypto";
import type { Track } from "../types";

const BASE_DIR = resolve(import.meta.dir, "..", "..");
const UPLOADS_DIR = join(BASE_DIR, "uploads");
const DATA_DIR = join(BASE_DIR, "data");
const SHARES_DIR = join(BASE_DIR, "data", "shares");

export function getUploadsDir(): string {
  return UPLOADS_DIR;
}

export function getDataDir(): string {
  return DATA_DIR;
}

async function ensureDir(dir: string): Promise<void> {
  try {
    await mkdir(dir, { recursive: true });
  } catch {
    // directory already exists
  }
}

export async function loadTracks(): Promise<Track[]> {
  await ensureDir(DATA_DIR);

  const files = await readdir(DATA_DIR);
  const jsonFiles = files.filter((f) => f.endsWith(".json"));

  const tracks: Track[] = [];

  for (const file of jsonFiles) {
    try {
      const content = await readFile(join(DATA_DIR, file), "utf-8");
      const track = JSON.parse(content) as Track;
      tracks.push(track);
    } catch {
      // skip corrupted files
      console.warn(`Skipping corrupted track file: ${file}`);
    }
  }

  return tracks;
}

export async function getTrack(id: string): Promise<Track | null> {
  await ensureDir(DATA_DIR);

  const filePath = join(DATA_DIR, `${id}.json`);

  try {
    const content = await readFile(filePath, "utf-8");
    return JSON.parse(content) as Track;
  } catch {
    return null;
  }
}

export async function saveTrack(track: Track): Promise<void> {
  await ensureDir(DATA_DIR);

  const filePath = join(DATA_DIR, `${track.id}.json`);
  await writeFile(filePath, JSON.stringify(track, null, 2), "utf-8");
}

export async function deleteTrack(id: string): Promise<boolean> {
  const track = await getTrack(id);
  if (!track) {
    return false;
  }

  // Remove JSON data file
  const dataPath = join(DATA_DIR, `${id}.json`);
  try {
    await unlink(dataPath);
  } catch {
    // file may not exist
  }

  // Remove uploaded audio file
  const audioPath = join(UPLOADS_DIR, track.filename);
  try {
    await unlink(audioPath);
  } catch {
    // file may not exist
  }

  return true;
}

export function getAudioPath(filename: string): string {
  return join(UPLOADS_DIR, filename);
}

export async function ensureUploadDir(): Promise<void> {
  await ensureDir(UPLOADS_DIR);
}

// ---------------------------------------------------------------------------
// Share links
//
// Each active share is stored as `data/shares/{shareId}.json`:
//   { shareId, trackId, createdAt }
// A secondary file `data/shares/by-track/{trackId}.json` records the currently
// active shareId for a track so the UI can recover it without a scan.
// ---------------------------------------------------------------------------

export interface ShareRecord {
  shareId: string;
  trackId: string;
  createdAt: string;
}

const SHARE_ID_ALPHABET =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** Generate a short (10-char), URL-safe, unguessable share id. */
function generateShareId(): string {
  const bytes = randomBytes(10);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += SHARE_ID_ALPHABET[bytes[i]! % SHARE_ID_ALPHABET.length];
  }
  return out;
}

function shareFile(shareId: string): string {
  return join(SHARES_DIR, `${shareId}.json`);
}

function byTrackFile(trackId: string): string {
  return join(SHARES_DIR, "by-track", `${trackId}.json`);
}

export async function createShare(trackId: string): Promise<ShareRecord> {
  await ensureDir(SHARES_DIR);
  await ensureDir(join(SHARES_DIR, "by-track"));

  // Reuse the existing share for this track if one is already active — the
  // user's expectation is "one stable public link per track", not "rotate on
  // every click".
  const existing = await getShareByTrack(trackId);
  if (existing) return existing;

  // Retry a couple of times on the extremely unlikely collision.
  for (let i = 0; i < 5; i++) {
    const shareId = generateShareId();
    const path = shareFile(shareId);
    try {
      // atomic-ish: bail if file already exists
      await readFile(path, "utf-8");
      continue;
    } catch {
      // no existing file — good
    }
    const record: ShareRecord = {
      shareId,
      trackId,
      createdAt: new Date().toISOString(),
    };
    await writeFile(path, JSON.stringify(record, null, 2), "utf-8");
    await writeFile(byTrackFile(trackId), JSON.stringify(record, null, 2), "utf-8");
    return record;
  }
  throw new Error("Could not allocate a unique share id");
}

export async function getShare(shareId: string): Promise<ShareRecord | null> {
  try {
    const raw = await readFile(shareFile(shareId), "utf-8");
    return JSON.parse(raw) as ShareRecord;
  } catch {
    return null;
  }
}

export async function getShareByTrack(
  trackId: string,
): Promise<ShareRecord | null> {
  try {
    const raw = await readFile(byTrackFile(trackId), "utf-8");
    return JSON.parse(raw) as ShareRecord;
  } catch {
    return null;
  }
}

export async function revokeShare(shareId: string): Promise<boolean> {
  const record = await getShare(shareId);
  if (!record) return false;
  try {
    await unlink(shareFile(shareId));
  } catch {}
  try {
    await unlink(byTrackFile(record.trackId));
  } catch {}
  return true;
}

/** Called from deleteTrack — ensure no dangling public link remains. */
export async function revokeSharesForTrack(trackId: string): Promise<void> {
  const rec = await getShareByTrack(trackId);
  if (rec) await revokeShare(rec.shareId);
}
