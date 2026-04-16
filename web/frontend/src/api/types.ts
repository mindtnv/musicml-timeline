export interface Track {
  id: string;
  filename: string;
  originalName: string;
  status: "pending" | "analyzing" | "ready" | "error";
  error?: string;
  timeline?: Timeline;
  createdAt: string;
  /** Extracted from ID3 (local) / yt-dlp uploader (YouTube). */
  artist?: string;
  /** Extracted from ID3; falls back to originalName if missing. */
  title?: string;
  /** Public URL to extracted cover JPG (embedded artwork or YT thumbnail). */
  coverUrl?: string;
}

export interface TimelineSegment {
  start: number;
  end: number;
  label: string;
  confidence: number;
}

export interface FramePredictions {
  frame_hop_seconds: number;
  segment_probs?: number[][];
  arousal_probs?: number[][];
  valence_probs?: number[][];
  genre_probs?: number[][];
  arousal_reg?: number[];
  valence_reg?: number[];
}

export interface AudioFeatures {
  tempo_bpm: number;
  key: { key: string; mode: string; confidence: number };
  loudness_rms: number[];
  spectral_centroid: number[];
  onset_strength: number[];
  feature_hop_seconds: number;
}

export interface TimelineMetadata {
  duration_sec: number;
  window_seconds: number;
  hop_seconds: number;
}

export interface KeyMoment {
  type: string;
  time_sec: number;
  frame: number;
  label_ru: string;
  label_en: string;
  emoji: string;
  color: string;
  description_ru: string;
  arousal: number;
  valence: number;
}

export interface Timeline {
  metadata: TimelineMetadata;
  segment?: TimelineSegment[];
  arousal?: TimelineSegment[];
  valence?: TimelineSegment[];
  genre?: TimelineSegment[];
  frame_predictions?: FramePredictions;
  audio_features?: AudioFeatures;
  /** Emotional arc archetype (Vonnegut-style shape). */
  emotional_arc?: {
    archetype: string;
    label_ru: string;
    label_en: string;
    emoji: string;
    description_ru: string;
    curve: number[];
  };
  /** Key emotional moments (peaks, drops, climax, tension, etc). */
  key_moments?: KeyMoment[];
  /** Mean backbone embedding (512-dim). Used for similarity search. */
  track_embedding?: number[];
}
