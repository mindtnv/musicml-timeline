export interface Track {
  id: string;
  filename: string;
  originalName: string;
  status: "pending" | "analyzing" | "ready" | "error";
  error?: string;
  timeline?: Timeline;
  createdAt: string;
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

export interface Timeline {
  metadata: TimelineMetadata;
  segment?: TimelineSegment[];
  arousal?: TimelineSegment[];
  valence?: TimelineSegment[];
  genre?: TimelineSegment[];
  frame_predictions?: FramePredictions;
  audio_features?: AudioFeatures;
}
