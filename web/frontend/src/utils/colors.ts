export const SEGMENT_COLORS: Record<string, string> = {
  Intro: "#81C784",
  Verse: "#4CAF50",
  Bridge: "#FF9800",
  Chorus: "#F44336",
  Instrumental: "#42A5F5",
  Outro: "#9E9E9E",
};

export const AROUSAL_COLORS: Record<string, string> = {
  Low: "#81D4FA",
  Mid: "#FFF176",
  High: "#EF5350",
};

export const VALENCE_COLORS: Record<string, string> = {
  Dark: "#7E57C2",
  Neutral: "#BDBDBD",
  Bright: "#FFEB3B",
};

export const GENRE_COLORS: Record<string, string> = {
  blues: "#1565C0",
  classical: "#8E24AA",
  country: "#F9A825",
  disco: "#E91E63",
  hiphop: "#FF6D00",
  jazz: "#00897B",
  metal: "#424242",
  pop: "#AB47BC",
  reggae: "#2E7D32",
  rock: "#C62828",
};

const FALLBACK_COLOR = "#607D8B";

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
