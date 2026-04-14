import { resolve, join } from "path";
import { readdir, readFile, writeFile, unlink, mkdir } from "fs/promises";
import type { Track } from "../types";

const BASE_DIR = resolve(import.meta.dir, "..", "..");
const UPLOADS_DIR = join(BASE_DIR, "uploads");
const DATA_DIR = join(BASE_DIR, "data");

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
