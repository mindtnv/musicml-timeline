export interface Track {
  id: string;
  filename: string;
  originalName: string;
  status: "pending" | "analyzing" | "ready" | "error";
  error?: string;
  timeline?: Timeline;
  createdAt: string;
  // Extracted from ID3 tags (local files) or yt-dlp metadata (YouTube/SC).
  // All optional — UI gracefully degrades when missing.
  artist?: string;
  title?: string;
  /** Public URL to the track's cover art, if extracted/downloaded. */
  coverUrl?: string;
}

export interface TimelineSegment {
  start: number;
  end: number;
  label: string;
  confidence: number;
}

export interface Timeline {
  metadata: {
    duration_sec: number;
    window_seconds: number;
    hop_seconds: number;
  };
  segment?: TimelineSegment[];
  arousal?: TimelineSegment[];
  valence?: TimelineSegment[];
  genre?: TimelineSegment[];
  frame_predictions?: {
    frame_hop_seconds: number;
    segment_probs?: number[][];
    arousal_probs?: number[][];
    valence_probs?: number[][];
    genre_probs?: number[][];
    arousal_reg?: number[];
    valence_reg?: number[];
  };
  audio_features?: {
    tempo_bpm: number;
    key: { key: string; mode: string; confidence: number };
    loudness_rms: number[];
    spectral_centroid: number[];
    onset_strength: number[];
    feature_hop_seconds: number;
  };
}
