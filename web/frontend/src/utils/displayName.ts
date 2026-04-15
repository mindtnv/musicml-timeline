/**
 * Derive a clean, human-readable display name from a raw track filename.
 *
 * Handles common dataset prefixes and ugly filenames:
 *   "0375_dynamite.mp3"       → "Dynamite"
 *   "0017_badromance.mp3"     → "Bad Romance"
 *   "01 Falling in Reverse - Ronald.mp3" → "Falling in Reverse — Ronald"
 *   "blues.00005.wav"         → "Blues #00005"
 *   "jazz.00003.wav"          → "Jazz #00003"
 *   "istasha - caterpillars.flac" → "Istasha — Caterpillars"
 *   "2.mp3"                   → "Трек #2"
 *
 * Always preserves semantic information so the user can still identify the track.
 */
export function displayName(raw: string): string {
  if (!raw) return "Без названия";

  // 1) Strip extension
  const dotIdx = raw.lastIndexOf(".");
  let name = dotIdx > 0 ? raw.slice(0, dotIdx) : raw;

  // 2) GTZAN-style: "blues.00005" → "Blues #00005"
  const gtzan = name.match(/^([a-z]+)\.(\d+)$/i);
  if (gtzan) {
    const [, genre, num] = gtzan;
    return `${capitalize(genre)} #${num}`;
  }

  // 3) Harmonix-style: leading "0375_" or "0017_" → strip
  const harmonix = name.match(/^\d{3,4}[_\s]+(.+)$/);
  if (harmonix) name = harmonix[1];

  // 4) "01 Title - Artist" — leading track number
  const leadingNum = name.match(/^\d{1,3}[\s.-]+(.+)$/);
  if (leadingNum) name = leadingNum[1];

  // 5) Pure numeric like "2" → "Трек #2"
  if (/^\d+$/.test(name)) return `Трек #${name}`;

  // 6) Replace " - " with " — " for nicer typography
  name = name.replace(/\s+-\s+/g, " — ");

  // 7) CamelCase/lowercase-smashed words → Title Case heuristic
  // If there are no spaces AND only lowercase letters → try to split on known words
  if (!/\s/.test(name) && /^[a-z0-9]+$/.test(name)) {
    name = splitLowerCaseCompound(name);
  }

  // 8) Title Case words (preserve all-caps acronyms like "DJ", "USA")
  name = name
    .split(/\s+/)
    .map((w) => {
      if (w === w.toUpperCase() && w.length <= 4 && /[A-Z]/.test(w)) return w; // acronym
      return capitalize(w);
    })
    .join(" ");

  return name.trim();
}

function capitalize(w: string): string {
  if (!w) return w;
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

/**
 * Heuristic split for lowercase-concatenated filenames.
 * "badromance" → "bad romance", "dontstopthemusic" → "dont stop the music"
 */
// Words to recognize in compound lowercase filenames. Single-letter entries
// are deliberately excluded — otherwise "californiagurls" fragments into
// "c a l i for n i a gurls" because each letter is a "known word".
const COMMON_WORDS = [
  // articles / prepositions (2+ chars)
  "the", "an", "and", "but", "of", "in", "on", "at", "to", "for",
  "with", "by", "from", "into", "out", "over", "under", "up", "down", "off",
  "or", "is", "are", "was", "were", "be", "been",
  "has", "have", "had", "do", "does", "did",
  // pronouns (2+ chars)
  "you", "he", "she", "we", "they", "me", "my", "your", "his", "her",
  "our", "them", "us", "it", "its",
  // common song-title words
  "love", "romance", "bad", "good", "life", "night", "day", "time", "party",
  "dance", "music", "song", "feel", "feeling", "heart", "world", "body",
  "girl", "girls", "boy", "boys", "baby", "kiss", "rock", "roll", "star",
  "stars", "dream", "dreams", "fire", "water", "sun", "moon", "home",
  "house", "hotel", "room", "service", "disposition", "sweet", "beat",
  "around", "imagine", "hello", "goodbye", "wonderwall", "rolling",
  "deep", "umbrella", "someone", "like", "tiktok", "dynamite", "gotta",
  "paradise", "caterpillars", "istasha",
  // dataset-specific
  "california", "gurls", "shake", "radio", "mix", "just", "get", "got",
  "tonight", "morning", "rain", "storm", "light", "dark", "way", "high",
  "low", "down", "real", "fake", "true", "false", "young", "old", "new",
  "little", "big", "long", "short", "hot", "cold", "wake", "sleep",
  "break", "broken", "fallen", "falling", "reverse", "ronald", "blue",
  "red", "white", "black", "green", "yellow", "dj",
];
const WORD_SET = new Set(COMMON_WORDS.map((w) => w.toLowerCase()));

/**
 * Viterbi-style segmentation: pick word split that maximizes a score
 * mixing (a) fraction of characters covered by known words and
 * (b) penalty per extra split to avoid noisy over-segmentation.
 */
function splitLowerCaseCompound(s: string): string {
  const n = s.length;
  // dp[i] = best score ending at position i; parent[i] = start of last word
  const NEG = -Infinity;
  const dp: number[] = new Array(n + 1).fill(NEG);
  const parent: number[] = new Array(n + 1).fill(-1);
  dp[0] = 0;

  const MIN_WORD = 2;               // ignore 1-char "words"
  const MAX_WORD = 14;
  const UNKNOWN_PENALTY_PER_CHAR = -0.3;
  const SPLIT_PENALTY = -1.5;

  for (let i = 1; i <= n; i++) {
    for (let j = Math.max(0, i - MAX_WORD); j < i; j++) {
      if (dp[j] === NEG) continue;
      const word = s.slice(j, i);
      const len = i - j;
      if (len < MIN_WORD && j !== 0 && i !== n) continue;
      const known = WORD_SET.has(word);
      const wordScore = known
        ? len                                       // +len if known
        : UNKNOWN_PENALTY_PER_CHAR * len;           // -0.3*len if unknown
      // First split (from start) is free; subsequent splits are penalized
      const splitPen = j === 0 ? 0 : SPLIT_PENALTY;
      const score = dp[j] + wordScore + splitPen;
      if (score > dp[i]) {
        dp[i] = score;
        parent[i] = j;
      }
    }
  }

  if (dp[n] === NEG) return s;
  // Reconstruct split
  const parts: string[] = [];
  let i = n;
  while (i > 0) {
    const j = parent[i];
    parts.push(s.slice(j, i));
    i = j;
  }
  parts.reverse();
  // Require at least one known word in the split, else give up
  const anyKnown = parts.some((w) => WORD_SET.has(w));
  if (!anyKnown) return s;
  return parts.join(" ");
}
