// Muted academic palette — one accent + low-saturation categorical colors.
// Inspired by Tableau 10 (muted) + IBM design system.

export const SEGMENT_COLORS: Record<string, string> = {
  Intro: "#94a3b8",
  Verse: "#64748b",
  Chorus: "#2563eb",
  Bridge: "#7c3aed",
  Instrumental: "#0ea5e9",
  Outro: "#475569",
};

// Cold → neutral → warm diverging scale (arousal)
export const AROUSAL_COLORS: Record<string, string> = {
  Low: "#93c5fd",
  Mid: "#cbd5e1",
  High: "#f87171",
};

// Dark → neutral → bright diverging scale (valence)
export const VALENCE_COLORS: Record<string, string> = {
  Dark: "#6366f1",
  Neutral: "#cbd5e1",
  Bright: "#fbbf24",
};

// Tableau 10 (muted hand-picked) — 10 distinct but low-saturation hues
export const GENRE_COLORS: Record<string, string> = {
  blues: "#4c78a8",
  classical: "#9d755d",
  country: "#b79a20",
  disco: "#d67195",
  hiphop: "#e0824c",
  jazz: "#59a14f",
  metal: "#555c6e",
  pop: "#b07aa1",
  reggae: "#499894",
  rock: "#d25a5a",
};

// Fixed genre order for stacked area (matches model's output order)
export const GENRE_ORDER = [
  "blues",
  "classical",
  "country",
  "disco",
  "hiphop",
  "jazz",
  "metal",
  "pop",
  "reggae",
  "rock",
];

const FALLBACK_COLOR = "#94a3b8";

// Semantic design tokens (used by dashboard primitives)
export const DASHBOARD_TOKENS = {
  playhead: "#dc2626",      // red-600, solid
  pinned: "#2563eb",        // blue-600, solid
  hover: "#2563eb",         // blue-600, dashed
  gridLine: "rgba(15, 23, 42, 0.06)",
  gridText: "rgba(71, 85, 105, 0.7)",
  axisText: "#475569",
};

export function getSegmentColor(label: string): string {
  return SEGMENT_COLORS[label] ?? FALLBACK_COLOR;
}

export function getArousalColor(label: string): string {
  return AROUSAL_COLORS[label] ?? FALLBACK_COLOR;
}

export function getValenceColor(label: string): string {
  return VALENCE_COLORS[label] ?? FALLBACK_COLOR;
}

export function getGenreColor(label: string): string {
  return GENRE_COLORS[label.toLowerCase()] ?? FALLBACK_COLOR;
}
