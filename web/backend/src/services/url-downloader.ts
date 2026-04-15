import { join } from "path";
import { existsSync } from "fs";

const YT_DLP_BIN = process.env.YT_DLP_BIN ?? "yt-dlp";

const SUPPORTED_HOSTS = [
  "youtube.com",
  "youtu.be",
  "music.youtube.com",
  "soundcloud.com",
  "on.soundcloud.com",
];

const MAX_DURATION_SEC = 30 * 60; // 30 минут

let _ffmpegLocation: string | null | undefined;

/**
 * Locate ffmpeg binary. Prefers $FFMPEG_LOCATION, then $PATH, then the
 * imageio-ffmpeg copy bundled in the project's .venv (same fallback the
 * Python scripts use).
 */
function findFfmpeg(): string | null {
  if (_ffmpegLocation !== undefined) return _ffmpegLocation;

  if (process.env.FFMPEG_LOCATION) {
    _ffmpegLocation = process.env.FFMPEG_LOCATION;
    return _ffmpegLocation;
  }

  const onPath = Bun.which("ffmpeg");
  if (onPath) {
    _ffmpegLocation = onPath;
    return onPath;
  }

  // backend lives in <project>/web/backend; venv is at <project>/.venv
  const projectRoot = join(import.meta.dir, "..", "..", "..", "..");
  const pythonExe = join(projectRoot, ".venv", "Scripts", "python.exe");
  if (existsSync(pythonExe)) {
    try {
      const proc = Bun.spawnSync({
        cmd: [
          pythonExe,
          "-c",
          "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())",
        ],
      });
      if (proc.exitCode === 0) {
        const path = proc.stdout.toString().trim();
        if (path && existsSync(path)) {
          _ffmpegLocation = path;
          return path;
        }
      }
    } catch {
      // fall through
    }
  }

  _ffmpegLocation = null;
  return null;
}

export type UrlValidation =
  | { ok: true; host: string }
  | { ok: false; error: string };

export function validateUrl(input: string): UrlValidation {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return { ok: false, error: "Некорректный URL" };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, error: "Поддерживаются только http(s) ссылки" };
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const supported = SUPPORTED_HOSTS.some(
    (h) => host === h || host.endsWith("." + h)
  );
  if (!supported) {
    return {
      ok: false,
      error: "Поддерживаются ссылки только с YouTube или SoundCloud",
    };
  }
  return { ok: true, host };
}

export interface UrlMetadata {
  title: string;
  duration?: number;
  uploader?: string;
  thumbnail?: string;
}

/** Run `yt-dlp -j` to grab title/duration/uploader without downloading. */
export async function fetchMetadata(url: string): Promise<UrlMetadata> {
  const proc = Bun.spawn({
    cmd: [YT_DLP_BIN, "-j", "--no-playlist", "--no-warnings", url],
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    const message = stderr.trim().split("\n").slice(-1)[0] || `yt-dlp exit ${exitCode}`;
    throw new Error(message);
  }

  let info: {
    title?: string;
    duration?: number;
    uploader?: string;
    channel?: string;
    thumbnail?: string;
    thumbnails?: Array<{ url: string; width?: number; height?: number }>;
  };
  try {
    info = JSON.parse(stdout);
  } catch {
    throw new Error("Не удалось распарсить ответ yt-dlp");
  }

  // Pick the highest-resolution thumbnail when several are offered.
  let bestThumb = info.thumbnail;
  if (Array.isArray(info.thumbnails) && info.thumbnails.length > 0) {
    const sorted = [...info.thumbnails]
      .filter((t) => t && typeof t.url === "string")
      .sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
    if (sorted.length > 0) bestThumb = sorted[0].url;
  }

  return {
    title: info.title?.trim() || "audio",
    duration: typeof info.duration === "number" ? info.duration : undefined,
    uploader: info.uploader || info.channel,
    thumbnail: bestThumb,
  };
}

/**
 * Download audio as MP3 to `<outputBase>.mp3` using yt-dlp + ffmpeg.
 * Returns the absolute path of the resulting file.
 */
export async function downloadAudio(
  url: string,
  outputBase: string
): Promise<string> {
  const ffmpeg = findFfmpeg();
  const cmd = [
    YT_DLP_BIN,
    url,
    "-x",
    "--audio-format",
    "mp3",
    "--audio-quality",
    "128K",
    "-o",
    `${outputBase}.%(ext)s`,
    "--no-playlist",
    "--no-warnings",
    "--no-progress",
  ];
  if (ffmpeg) {
    cmd.push("--ffmpeg-location", ffmpeg);
  }

  const proc = Bun.spawn({ cmd, stdout: "pipe", stderr: "pipe" });
  const [stderr, exitCode] = await Promise.all([
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    const message =
      stderr.trim().split("\n").slice(-1)[0] || `Сбой yt-dlp (код ${exitCode})`;
    throw new Error(message);
  }

  const finalPath = `${outputBase}.mp3`;
  if (!existsSync(finalPath)) {
    throw new Error("Файл не создан после скачивания");
  }
  return finalPath;
}

export { MAX_DURATION_SEC };
