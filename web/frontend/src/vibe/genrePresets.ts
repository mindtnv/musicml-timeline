import { GENRE_ORDER } from "../utils/colors";

// Per-genre shader parameters.  These feed scalar uniforms consumed by the
// fragment shader, so the model's dominant genre literally changes the
// visual language of the scene.
//
//   hue     — palette phase shift (added to the IQ cosine palette's "d")
//   ribs    — number of angular ribs around the tunnel
//   sharp   — 0..1, interpolates rib shape from soft cos → sharp folded abs
//   sparkle — density multiplier for the sparkle layer
//   twist   — speed multiplier for the tunnel's axial twist
export interface GenrePreset {
  hue: number;
  ribs: number;
  sharp: number;
  sparkle: number;
  twist: number;
}

// Indexed by GENRE_ORDER: blues, classical, country, disco, hiphop, jazz, metal, pop, reggae, rock
const PRESETS: GenrePreset[] = [
  /* blues     */ { hue: 0.64, ribs:  8, sharp: 0.15, sparkle: 0.3, twist: 0.85 },
  /* classical */ { hue: 0.08, ribs: 22, sharp: 0.05, sparkle: 0.5, twist: 1.10 },
  /* country   */ { hue: 0.05, ribs: 10, sharp: 0.30, sparkle: 0.2, twist: 0.95 },
  /* disco     */ { hue: 0.80, ribs: 16, sharp: 0.55, sparkle: 1.2, twist: 1.30 },
  /* hiphop    */ { hue: 0.02, ribs:  6, sharp: 0.90, sparkle: 0.4, twist: 0.80 },
  /* jazz      */ { hue: 0.90, ribs: 10, sharp: 0.10, sparkle: 0.3, twist: 1.00 },
  /* metal     */ { hue: 0.97, ribs: 14, sharp: 1.00, sparkle: 0.5, twist: 1.20 },
  /* pop       */ { hue: 0.85, ribs: 12, sharp: 0.35, sparkle: 1.0, twist: 1.15 },
  /* reggae    */ { hue: 0.25, ribs:  8, sharp: 0.20, sparkle: 0.4, twist: 1.00 },
  /* rock      */ { hue: 0.00, ribs: 14, sharp: 0.70, sparkle: 0.4, twist: 1.10 },
];

const NEUTRAL: GenrePreset = {
  hue: 0.0,
  ribs: 12,
  sharp: 0.25,
  sparkle: 0.5,
  twist: 1.0,
};

export function genrePresetByLabel(label: string | undefined): GenrePreset {
  if (!label) return NEUTRAL;
  const idx = GENRE_ORDER.indexOf(label.toLowerCase());
  return idx >= 0 ? PRESETS[idx] : NEUTRAL;
}

export function genreIdxByLabel(label: string | undefined): number {
  if (!label) return -1;
  return GENRE_ORDER.indexOf(label.toLowerCase());
}
