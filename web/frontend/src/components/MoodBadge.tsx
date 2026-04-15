import type { TimelineSegment } from "../api/types";

interface MoodBadgeProps {
  arousalSegments?: TimelineSegment[];
  valenceSegments?: TimelineSegment[];
}

// Label → [0,1] value on each axis
const AROUSAL_VAL: Record<string, number> = { Low: 0.0, Mid: 0.5, High: 1.0 };
const VALENCE_VAL: Record<string, number> = { Dark: 0.0, Neutral: 0.5, Bright: 1.0 };

function durationWeightedMean(
  segments: TimelineSegment[] | undefined,
  map: Record<string, number>
): number | null {
  if (!segments || segments.length === 0) return null;
  let sum = 0;
  let weight = 0;
  for (const s of segments) {
    const v = map[s.label];
    if (v == null) continue;
    const w = Math.max(0, s.end - s.start);
    if (w <= 0) continue;
    sum += v * w;
    weight += w;
  }
  if (weight <= 0) return null;
  return sum / weight;
}

export interface Mood {
  /** Short Russian label for this mood quadrant. */
  label: string;
  /** Background color for the pill (low-saturation, matches palette). */
  color: string;
  /** Text/icon contrast color. */
  fg: string;
  /** Mean valence ∈ [0,1] used for the classification (for tooltips). */
  valence: number;
  /** Mean arousal ∈ [0,1] used for the classification (for tooltips). */
  arousal: number;
}

/**
 * Map (valence, arousal) ∈ [0,1]² → Russell circumplex quadrant.
 * Colors echo the emotional semantics used elsewhere in the app:
 *   arousal drives warmth (red = high, blue = low)
 *   valence drives brightness (yellow = bright, indigo = dark)
 * Each quadrant mood takes a complementary blend of the two.
 */
function quadrantMood(valence: number, arousal: number): Mood {
  const highA = arousal >= 0.5;
  const highV = valence >= 0.5;
  if (highA && highV) return { label: "Радостное", color: "#f59e0b", fg: "#fff", valence, arousal }; // amber
  if (highA && !highV) return { label: "Напряжённое", color: "#dc2626", fg: "#fff", valence, arousal }; // red
  if (!highA && !highV) return { label: "Грустное", color: "#6366f1", fg: "#fff", valence, arousal }; // indigo
  return { label: "Умиротворённое", color: "#059669", fg: "#fff", valence, arousal }; // emerald
}

/**
 * Compute the dominant mood of a track from its arousal/valence segment
 * timelines. Returns `null` if either axis is missing. Shared by the
 * list-card badge and the dashboard header pill so the list → detail
 * transition feels continuous.
 */
export function computeMood(
  arousalSegments?: TimelineSegment[],
  valenceSegments?: TimelineSegment[]
): Mood | null {
  const arousal = durationWeightedMean(arousalSegments, AROUSAL_VAL);
  const valence = durationWeightedMean(valenceSegments, VALENCE_VAL);
  if (arousal == null || valence == null) return null;
  return quadrantMood(valence, arousal);
}

/**
 * Compact mood indicator for track cards — a single pill showing the
 * dominant emotional quadrant of the whole track (duration-weighted mean
 * of arousal × valence segments mapped onto the Russell circumplex).
 */
function MoodBadge({ arousalSegments, valenceSegments }: MoodBadgeProps) {
  const mood = computeMood(arousalSegments, valenceSegments);
  if (!mood) return null;

  const title = `Настроение: ${mood.label.toLowerCase()} · valence ${Math.round(mood.valence * 100)}% · arousal ${Math.round(mood.arousal * 100)}%`;

  // Monochrome chip with a single coloured dot — keeps the semantic colour
  // signal but doesn't add a saturated pill to the page.
  return (
    <span
      className="mood-badge"
      title={title}
      aria-label={title}
    >
      <span
        className="mood-badge-dot"
        style={{ backgroundColor: mood.color }}
        aria-hidden="true"
      />
      {mood.label}
    </span>
  );
}

export default MoodBadge;
