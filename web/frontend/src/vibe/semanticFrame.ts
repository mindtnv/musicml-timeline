import type { Timeline } from "../api/types";
import { GENRE_ORDER } from "../utils/colors";

// Map the regression heads' signed [-1, 1] training range into the [0, 1]
// space the visualisation expects (0 = sad / calm, 0.5 = neutral, 1 = happy
// / energetic).  Without this rescale, a track sitting around the model's
// neutral output (~0) lands in the bottom-left of the A/V plot rather than
// the middle, and any negative prediction reads as 0 % in the HUD.
export function rescaleReg(x: number): number {
  return Math.max(0, Math.min(1, (x + 1) * 0.5));
}

export interface SemanticFrame {
  arousal: number;          // 0..1, continuous regression output
  valence: number;          // 0..1, continuous regression output
  segmentLabel: string;     // e.g. "Chorus" | "Verse" | ...
  segmentIntensity: number; // 0..1, mood-per-segment
  genreLabel: string;       // e.g. "rock" | "jazz" | "" if unknown
  genreIdx: number;         // GENRE_ORDER index, -1 if unknown
  // Confidences sourced from the frame-level probability distributions
  // when available; zero otherwise.  Feeds the confidence arc.
  genreConfidence: number;
  arousalConfidence: number;
  valenceConfidence: number;
}

// Per-segment visual energy. Chorus = full tilt, Intro/Outro = subdued.
// Keyed by the Structure head labels from musicml/postprocess.
const SEGMENT_INTENSITY: Record<string, number> = {
  Intro: 0.25,
  Verse: 0.55,
  "Pre-Chorus": 0.75,
  Bridge: 0.7,
  Chorus: 1.0,
  Instrumental: 0.65,
  Break: 0.5,
  Outro: 0.3,
};

export function semanticsAtTime(t: number, timeline: Timeline): SemanticFrame {
  let arousal = 0.5;
  let valence = 0.5;

  const fp = timeline.frame_predictions;
  if (fp && fp.frame_hop_seconds > 0) {
    const hop = fp.frame_hop_seconds;
    const aLen = fp.arousal_reg?.length ?? 0;
    const vLen = fp.valence_reg?.length ?? 0;
    // Regression heads emit values in [-1, 1]; rescale to [0, 1] so the
    // shader palette and HUD percentages read correctly.
    if (aLen > 0 && fp.arousal_reg) {
      const idx = Math.max(0, Math.min(aLen - 1, Math.floor(t / hop)));
      arousal = rescaleReg(fp.arousal_reg[idx] ?? 0);
    }
    if (vLen > 0 && fp.valence_reg) {
      const idx = Math.max(0, Math.min(vLen - 1, Math.floor(t / hop)));
      valence = rescaleReg(fp.valence_reg[idx] ?? 0);
    }
  }

  let segmentLabel = "";
  if (timeline.segment) {
    for (const s of timeline.segment) {
      if (s.start <= t && t < s.end) {
        segmentLabel = s.label;
        break;
      }
    }
  }
  const segmentIntensity = SEGMENT_INTENSITY[segmentLabel] ?? 0.5;

  // Genre comes from the aggregated segment timeline (one stable label at a time).
  let genreLabel = "";
  if (timeline.genre) {
    for (const g of timeline.genre) {
      if (g.start <= t && t < g.end) {
        genreLabel = g.label.toLowerCase();
        break;
      }
    }
  }
  const genreIdx = genreLabel ? GENRE_ORDER.indexOf(genreLabel) : -1;

  // Pull max-class probabilities from the per-frame distributions if present.
  let genreConfidence = 0;
  let arousalConfidence = 0;
  let valenceConfidence = 0;
  if (fp && fp.frame_hop_seconds > 0) {
    const hop = fp.frame_hop_seconds;
    const pickMax = (probs: number[][] | undefined) => {
      if (!probs || probs.length === 0) return 0;
      const idx = Math.max(0, Math.min(probs.length - 1, Math.floor(t / hop)));
      const row = probs[idx];
      if (!row) return 0;
      let m = 0;
      for (const p of row) if (p > m) m = p;
      return Math.max(0, Math.min(1, m));
    };
    genreConfidence = pickMax(fp.genre_probs);
    arousalConfidence = pickMax(fp.arousal_probs);
    valenceConfidence = pickMax(fp.valence_probs);
  }

  return {
    arousal,
    valence,
    segmentLabel,
    segmentIntensity,
    genreLabel,
    genreIdx,
    genreConfidence,
    arousalConfidence,
    valenceConfidence,
  };
}
