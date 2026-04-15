// Singleton WebAudio analyser attached to an <audio> element.
//
// MediaElementAudioSourceNode can only be created ONCE per audio element
// (browsers throw InvalidStateError on the second call). We cache the
// bundle by element via WeakMap so opening / closing Vibe Mode repeatedly
// never re-creates the graph. The graph is source → analyser → destination,
// so normal playback continues whether Vibe Mode is mounted or not.

export interface AnalyserBundle {
  context: AudioContext;
  analyser: AnalyserNode;
  source: MediaElementAudioSourceNode;
  fft: Uint8Array;
}

export interface AudioBands {
  bass: number;    // 0..1
  mid: number;     // 0..1
  treble: number;  // 0..1
  loudness: number; // 0..1 (overall energy, perceptual mix)
  centroid: number; // 0..1 (spectral brightness — where the energy is)
}

const cache = new WeakMap<HTMLAudioElement, AnalyserBundle>();

export function attachAnalyser(audio: HTMLAudioElement): AnalyserBundle {
  const hit = cache.get(audio);
  if (hit) return hit;

  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) throw new Error("WebAudio not supported in this browser");

  const context = new Ctor();
  const source = context.createMediaElementSource(audio);
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.82;

  source.connect(analyser);
  analyser.connect(context.destination);

  const bundle: AnalyserBundle = {
    context,
    analyser,
    source,
    fft: new Uint8Array(analyser.frequencyBinCount),
  };
  cache.set(audio, bundle);
  return bundle;
}

// Resume the audio context. AudioContext starts suspended until a user
// gesture on some browsers; the button click that opens Vibe Mode counts.
export function resumeContext(bundle: AnalyserBundle): void {
  if (bundle.context.state === "suspended") {
    void bundle.context.resume();
  }
}

// Sound has to traverse the OS audio stack and reach the speaker before
// the user actually hears the sample at audio.currentTime.  WebAudio
// exposes that delay as AudioContext.outputLatency (typically 30–120 ms).
// Subtract it from currentTime when driving semantic visuals so the
// segment / A-V cursor / sparkle land on the beat the listener hears,
// not on the beat the player has already SCHEDULED.
//
// If no analyser is attached yet, fall back to a sensible desktop default.
const FALLBACK_OUTPUT_LATENCY = 0.08;

export function getOutputLatency(audio: HTMLAudioElement): number {
  const bundle = cache.get(audio);
  if (!bundle) return FALLBACK_OUTPUT_LATENCY;
  const ol = bundle.context.outputLatency;
  return Number.isFinite(ol) && ol > 0 ? ol : FALLBACK_OUTPUT_LATENCY;
}

// Read the current FFT and collapse it into perceptual bands.
// Assumes 44.1 kHz sampling; bin = sampleRate / fftSize ≈ 43 Hz.
//   Bass:   0–250 Hz   → bins 0..5
//   Mid:    250 Hz–4 kHz → bins 6..92
//   Treble: 4 kHz–16 kHz → bins 93..372
export function readBands(bundle: AnalyserBundle): AudioBands {
  const { analyser, fft } = bundle;
  analyser.getByteFrequencyData(fft);

  const N = fft.length;
  const bassEnd = Math.min(6, N);
  const midEnd = Math.min(93, N);
  const trebleEnd = Math.min(373, N);

  let bass = 0;
  for (let i = 0; i < bassEnd; i++) bass += fft[i];
  let mid = 0;
  for (let i = bassEnd; i < midEnd; i++) mid += fft[i];
  let treble = 0;
  for (let i = midEnd; i < trebleEnd; i++) treble += fft[i];

  const bassN = bassEnd;
  const midN = midEnd - bassEnd;
  const trebleN = trebleEnd - midEnd;

  const b = bass / (bassN * 255);
  const m = mid / (midN * 255);
  const t = treble / (trebleN * 255);

  // Spectral centroid: Σ(i · E_i) / Σ(E_i), normalised by trebleEnd.
  // Tracks whether energy is clustered low (dark) or high (bright/sparkly).
  let num = 0;
  let den = 0;
  for (let i = 0; i < trebleEnd; i++) {
    num += i * fft[i];
    den += fft[i];
  }
  const centroid = den > 0 ? Math.min(1, num / (den * trebleEnd)) : 0;

  // Perceptual loudness: mids count most (~= where voice/leads live).
  const loudness = Math.min(1, 0.25 * b + 0.55 * m + 0.35 * t);

  return { bass: b, mid: m, treble: t, loudness, centroid };
}
