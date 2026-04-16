// Exporters for a finished Track + Timeline.
//
// All functions here are pure (string-in, string-out) so they can be unit-tested
// and re-used from both the REST routes and, in the future, CLI tooling.

import type { Track, TimelineSegment, Timeline } from "../types";

/**
 * Format a duration in seconds as `HH:MM:SS,mmm` (SRT format).
 */
function srtTimestamp(seconds: number): string {
  const s = Math.max(0, seconds);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  const ms = Math.round((s - Math.floor(s)) * 1000);
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return `${pad(hh)}:${pad(mm)}:${pad(ss)},${pad(ms, 3)}`;
}

/**
 * Format `MM:SS` — used for the Markdown report.
 */
function mmss(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function displayTitle(track: Track): string {
  if (track.title && track.artist) return `${track.artist} — ${track.title}`;
  if (track.title) return track.title;
  return track.originalName.replace(/\.[^/.]+$/, "");
}

/**
 * Sanitize a string for use as a downloaded filename. Keeps Cyrillic and other
 * non-ASCII code points (modern browsers handle them fine via RFC 5987) but
 * strips filesystem-reserved characters.
 */
export function exportFilename(track: Track, extension: string): string {
  const base = displayTitle(track)
    .replace(/[\\/:*?"<>|\r\n\t]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  return `${base || "track"}.${extension}`;
}

// ---------------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------------

/**
 * Full track + timeline JSON with a small "exportedAt" envelope so the user
 * knows when/how the file was produced.
 */
export function exportJson(track: Track): string {
  const payload = {
    exportedAt: new Date().toISOString(),
    format: "musicml-timeline/v1",
    track: {
      id: track.id,
      title: track.title,
      artist: track.artist,
      originalName: track.originalName,
      createdAt: track.createdAt,
    },
    timeline: track.timeline,
  };
  return JSON.stringify(payload, null, 2);
}

// ---------------------------------------------------------------------------
// CSV (frame-level, one row per frame)
// ---------------------------------------------------------------------------

const SEGMENT_CLASS_NAMES = [
  "Intro",
  "Verse",
  "Bridge",
  "Chorus",
  "Instrumental",
  "Outro",
] as const;
const AROUSAL_CLASS_NAMES = ["Low", "Mid", "High"] as const;
const VALENCE_CLASS_NAMES = ["Dark", "Neutral", "Bright"] as const;
const GENRE_CLASS_NAMES = [
  "blues", "classical", "country", "disco", "hiphop",
  "jazz", "metal", "pop", "reggae", "rock",
] as const;

function argmax(row: number[] | undefined): { label: string; prob: number } | null {
  if (!row || row.length === 0) return null;
  let bestI = 0;
  for (let i = 1; i < row.length; i++) if (row[i]! > row[bestI]!) bestI = i;
  return { label: String(bestI), prob: row[bestI]! };
}

function namedArgmax(
  row: number[] | undefined,
  names: readonly string[],
): { label: string; prob: number } | null {
  const r = argmax(row);
  if (!r) return null;
  const i = parseInt(r.label, 10);
  return { label: names[i] ?? r.label, prob: r.prob };
}

/**
 * Build a CSV with one row per hop-frame. Columns:
 *   time_sec, segment, segment_conf, arousal, arousal_conf,
 *   valence, valence_conf, genre, genre_conf, arousal_reg, valence_reg
 *
 * Missing heads are emitted as empty cells so the column set is stable.
 */
export function exportCsv(tl: Timeline): string {
  const fp = tl.frame_predictions;
  const hop = fp?.frame_hop_seconds ?? tl.metadata.hop_seconds;
  const nFrames =
    fp?.segment_probs?.length ??
    fp?.arousal_probs?.length ??
    fp?.valence_probs?.length ??
    fp?.genre_probs?.length ??
    Math.round(tl.metadata.duration_sec / hop);

  const cols = [
    "time_sec",
    "segment", "segment_conf",
    "arousal", "arousal_conf",
    "valence", "valence_conf",
    "genre",   "genre_conf",
    "arousal_reg", "valence_reg",
  ];
  const rows = [cols.join(",")];
  for (let t = 0; t < nFrames; t++) {
    const time = (t * hop).toFixed(2);
    const seg = namedArgmax(fp?.segment_probs?.[t], SEGMENT_CLASS_NAMES);
    const ar = namedArgmax(fp?.arousal_probs?.[t], AROUSAL_CLASS_NAMES);
    const va = namedArgmax(fp?.valence_probs?.[t], VALENCE_CLASS_NAMES);
    const gn = namedArgmax(fp?.genre_probs?.[t], GENRE_CLASS_NAMES);
    const arReg = fp?.arousal_reg?.[t];
    const vaReg = fp?.valence_reg?.[t];
    rows.push([
      time,
      seg?.label ?? "", seg ? seg.prob.toFixed(4) : "",
      ar?.label ?? "",  ar  ? ar.prob.toFixed(4)  : "",
      va?.label ?? "",  va  ? va.prob.toFixed(4)  : "",
      gn?.label ?? "",  gn  ? gn.prob.toFixed(4)  : "",
      arReg != null ? arReg.toFixed(4) : "",
      vaReg != null ? vaReg.toFixed(4) : "",
    ].join(","));
  }
  return rows.join("\n");
}

// ---------------------------------------------------------------------------
// SRT (segments as subtitles — drops into DAW video tracks / captioning)
// ---------------------------------------------------------------------------

export function exportSrt(segments: TimelineSegment[]): string {
  const parts: string[] = [];
  segments.forEach((s, i) => {
    const conf = Math.round(s.confidence * 100);
    parts.push(
      String(i + 1),
      `${srtTimestamp(s.start)} --> ${srtTimestamp(s.end)}`,
      `${s.label} (${conf}%)`,
      "",
    );
  });
  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// DAW markers (Audacity label-track / Reaper markers: `start<TAB>end<TAB>label`)
// ---------------------------------------------------------------------------

export function exportDawMarkers(segments: TimelineSegment[]): string {
  // Audacity's label-track format: three tab-separated columns. Reaper imports
  // the same file without modification. We keep floating-point seconds so the
  // DAW aligns to sample-accurate positions.
  return segments
    .map((s) => `${s.start.toFixed(3)}\t${s.end.toFixed(3)}\t${s.label}`)
    .join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Markdown report (human-readable summary)
// ---------------------------------------------------------------------------

export function exportMarkdown(track: Track): string {
  const tl = track.timeline;
  if (!tl) return `# ${displayTitle(track)}\n\n_Анализ ещё не выполнен._\n`;

  const lines: string[] = [];
  lines.push(`# ${displayTitle(track)}`);
  lines.push("");
  lines.push(`_Экспорт: ${new Date().toISOString()}_`);
  lines.push("");

  const dur = tl.metadata.duration_sec;
  lines.push(`**Длительность:** ${mmss(dur)}`);
  if (tl.audio_features?.tempo_bpm) {
    lines.push(`**Темп:** ${Math.round(tl.audio_features.tempo_bpm)} BPM`);
  }
  if (tl.audio_features?.key) {
    const k = tl.audio_features.key;
    lines.push(`**Тональность:** ${k.key} ${k.mode}`);
  }
  lines.push("");

  if (tl.segment && tl.segment.length > 0) {
    lines.push("## Структура");
    lines.push("");
    lines.push("| # | Время | Длит. | Секция | Увер. |");
    lines.push("|---|-------|-------|--------|-------|");
    tl.segment.forEach((s, i) => {
      lines.push(
        `| ${i + 1} | ${mmss(s.start)}–${mmss(s.end)} | ${mmss(s.end - s.start)} | ${s.label} | ${Math.round(s.confidence * 100)}% |`,
      );
    });
    lines.push("");
  }

  if (tl.genre && tl.genre.length > 0) {
    const top = [...tl.genre].sort((a, b) => b.confidence - a.confidence)[0]!;
    lines.push(`## Жанр`);
    lines.push("");
    lines.push(`Доминирующий жанр: **${top.label}** (${Math.round(top.confidence * 100)}%)`);
    lines.push("");
  }

  if (tl.arousal && tl.valence) {
    lines.push("## Эмоциональный профиль");
    lines.push("");
    const avgArousal = tl.arousal.reduce((s, x) => s + x.confidence, 0) / (tl.arousal.length || 1);
    const avgValence = tl.valence.reduce((s, x) => s + x.confidence, 0) / (tl.valence.length || 1);
    lines.push(`- Средняя уверенность по arousal: ${Math.round(avgArousal * 100)}%`);
    lines.push(`- Средняя уверенность по valence: ${Math.round(avgValence * 100)}%`);
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("_Сгенерировано MusicML Timeline._");
  return lines.join("\n");
}