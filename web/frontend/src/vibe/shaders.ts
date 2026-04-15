// Fullscreen raymarched SDF "Liquid Chrome Cathedral" — single-pass build.
//
// Design:
//   * ONE raymarch loop (not three) — CA is faked via palette offsets
//     modulated by fresnel so fringing is strongest on surface edges.
//   * Surface shimmer + sparkle layers driven by mid/treble so high-end
//     detail is as audible as the bass punch.
//   * A slow "breathing" envelope keeps the tunnel feeling alive even in
//     quiet passages.
//
// Uniforms:
//   uBass / uMid / uTreble   — live FFT bands
//   uBassEnv                 — fast-attack / slow-release bass envelope
//   uLoudnessEnv             — slow overall-loudness envelope (breathing)
//   uOnset                   — decaying pulse on bass spikes (drops)
//   uCentroid                — 0..1 spectral brightness
//   uArousal / uValence      — smoothed semantic regression outputs
//   uSegmentIntensity        — smoothed per-segment energy
//   uSegmentFlash            — decaying pulse on segment boundary

export const VERTEX_SRC = `#version 300 es
in vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

export const FRAGMENT_SRC = `#version 300 es
precision highp float;

out vec4 fragColor;

uniform vec2  uResolution;
uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uBassEnv;
uniform float uLoudnessEnv;
uniform float uOnset;
uniform float uCentroid;
uniform float uArousal;
uniform float uValence;
uniform float uSegmentIntensity;
uniform float uSegmentFlash;
// Genre-driven aesthetics — smoothly interpolated JS-side as the model's
// genre prediction changes.  The scene's "tribe" switches with the track.
uniform float uGenreHue;     // palette phase shift
uniform float uGenreRibs;    // rib count around the tunnel
uniform float uGenreSharp;   // 0 soft-cos → 1 folded-abs rib shape
uniform float uGenreSparkle; // sparkle density multiplier
uniform float uGenreTwist;   // twist speed multiplier

// ---------- utils ----------
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float hash31(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p += dot(p, p.yzx + 19.19);
  return fract(p.x * p.y * p.z);
}

mat2 rot(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

// IQ cosine palette.  Low valence → cool metallic.  High valence → warm iridescent.
// Genre hue rotates the palette's "d" vector, shifting the whole family to
// the genre's signature tint (metal → blood, reggae → green-gold, etc).
vec3 palette(float t, float v) {
  vec3 aCool = vec3(0.10, 0.14, 0.28);
  vec3 bCool = vec3(0.45, 0.22, 0.65);
  vec3 cCool = vec3(0.60, 0.80, 1.20);
  vec3 dCool = vec3(0.00, 0.33, 0.67);

  vec3 aWarm = vec3(0.32, 0.12, 0.18);
  vec3 bWarm = vec3(0.90, 0.35, 0.55);
  vec3 cWarm = vec3(1.00, 0.90, 0.40);
  vec3 dWarm = vec3(0.00, 0.15, 0.40);

  vec3 a = mix(aCool, aWarm, v);
  vec3 b = mix(bCool, bWarm, v);
  vec3 c = mix(cCool, cWarm, v);
  vec3 d = mix(dCool, dWarm, v) + vec3(uGenreHue, uGenreHue * 0.6, -uGenreHue * 0.4);
  return a + b * cos(6.28318 * (c * t + d));
}

// ---------- scene SDF ----------
float map(vec3 p) {
  // Slow twist along z (genre can speed it up or slow it down)
  float tw = p.z * 0.08 + uTime * 0.15 * uGenreTwist;
  p.xy *= rot(tw);

  // "Breathing" radius: slow loudness envelope + onset punch
  float breathe = 1.0 + 0.08 * sin(uTime * 0.6) + 0.18 * uLoudnessEnv + 0.12 * uOnset;

  // Arches every 3 units on z; amplitude driven by bass envelope
  float archZ = mod(p.z, 3.0) - 1.5;
  float archR = 0.35 + 0.28 * uBassEnv;
  float arches = archR * cos(archZ * 2.094); // 2π/3

  // Angular ribbing — genre-controlled count + sharpness.
  // soft = cos wave; sharp = folded absolute value (hard angular facets).
  float ang = atan(p.y, p.x);
  float ribPhase = ang * uGenreRibs + uTime * 1.5;
  float ribSoft  = cos(ribPhase);
  float ribHard  = 1.0 - 2.0 * abs(fract(ribPhase * 0.159155) - 0.5); // 1/(2π)
  float ribShape = mix(ribSoft, ribHard, uGenreSharp);
  float rib = (0.06 + 0.08 * uTreble) * ribShape;

  // Surface shimmer: high-frequency sparkle from treble on the walls
  float shim = 0.045 * uTreble * sin(p.z * 14.0 + uTime * 6.0)
             * cos(ang * 8.0 - uTime * 3.0);

  // Turbulent wobble from arousal + mid
  float wob = (0.08 + 0.10 * uArousal + 0.06 * uMid)
            * sin(p.z * 0.9 + uTime * 1.2)
            * sin(ang * 3.0 + uTime * 0.7);

  float baseR = (2.6 + arches + rib + wob + shim) * breathe;
  float r = length(p.xy);
  return baseR - r;
}

vec3 getNormal(vec3 p) {
  vec2 e = vec2(0.0015, 0.0);
  return normalize(vec3(
    map(p + e.xyy) - map(p - e.xyy),
    map(p + e.yxy) - map(p - e.yxy),
    map(p + e.yyx) - map(p - e.yyx)
  ));
}

// ---------- sparkle layer ----------
// Cheap bright specks in screen space, gated by treble & loudness.
// Feels like airborne dust catching light on loud passages.
vec3 sparkles(vec2 uv, float valence) {
  float gate = smoothstep(0.12, 0.55, uTreble) * (0.25 + 0.75 * uLoudnessEnv) * uGenreSparkle;
  if (gate < 0.01) return vec3(0.0);
  vec2 grid = uv * 18.0 + vec2(uTime * 0.2, uTime * 0.15);
  vec2 g = floor(grid);
  vec2 f = fract(grid);
  float n = hash21(g);
  // Density scales with genre sparkle: disco/pop get more, hip-hop/blues less.
  float threshold = mix(0.985, 0.920, clamp(uGenreSparkle, 0.0, 1.5) / 1.5);
  float live = step(threshold, n) * (0.5 + 0.5 * sin(uTime * 12.0 + n * 30.0));
  float d = length(f - 0.5);
  float spark = smoothstep(0.15, 0.0, d) * live * gate;
  return spark * palette(valence * 0.5 + 0.7 + n, valence) * 1.4;
}

// ---------- main ----------
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;

  // Forward speed ramps with arousal, segment, and onset punch
  float speed = 2.0 + 3.5 * uArousal + 2.8 * uSegmentIntensity + 4.0 * uOnset;
  float camZ = uTime * speed;

  // Camera shake — subtle on bass envelope, extra punch on onsets
  vec2 shake = vec2(
    sin(uTime * 13.7) * 0.5 + cos(uTime * 9.2),
    cos(uTime * 11.1) * 0.5 + sin(uTime * 7.4)
  ) * (0.08 * uBassEnv + 0.14 * uOnset);

  // FOV punch on onsets: pulls the viewer forward briefly
  float fov = 1.35 - 0.22 * uOnset;

  // Slow sway of the look direction
  mat2 yawR   = rot(0.12 * sin(uTime * 0.35));
  mat2 pitchR = rot(0.10 * sin(uTime * 0.27));

  vec3 ro = vec3(shake, camZ);
  vec3 rd = normalize(vec3(uv, fov));
  rd.xy = yawR * rd.xy;
  rd.yz = pitchR * rd.yz;

  // Single raymarch
  float t = 0.0;
  float glow = 0.0;
  vec3 color = vec3(0.0);
  float fres = 0.0;
  bool hit = false;

  for (int i = 0; i < 56; i++) {
    vec3 p = ro + rd * t;
    float d = map(p);

    // Volumetric glow from near-surface proximity
    glow += 0.028 * exp(-abs(d) * 2.4);

    if (d < 0.012) {
      vec3 n = getNormal(p);
      float palT = t * 0.045 + uTime * 0.015;

      // Valence sets palette warmth; centroid nudges hue towards brighter
      float pv = clamp(uValence * 0.85 + uCentroid * 0.25, 0.0, 1.0);
      vec3 base = palette(palT, pv);

      // Fresnel rim
      fres = pow(1.0 - max(dot(-rd, n), 0.0), 2.2);
      vec3 rim = palette(palT + 0.27, pv) * fres * 1.4;

      // Key light along tunnel axis — extra bite on onsets
      float key = max(dot(n, normalize(vec3(0.3, 0.5, -1.0))), 0.0);
      vec3 lit = base * (0.35 + 0.85 * key) + rim;

      // Distance fog — opens up on loud / chorus passages
      float fogK = 0.040 - 0.010 * uSegmentIntensity - 0.008 * uLoudnessEnv;
      lit *= exp(-t * max(fogK, 0.012));

      color = lit;
      hit = true;
      break;
    }

    if (t > 45.0) break;
    t += max(d * 0.85, 0.015);
  }

  if (!hit) {
    color = palette(uTime * 0.015, uValence) * 0.18;
  }

  // Physically-coherent fake CA: palette shift per channel, weighted by fresnel.
  // Edges of the arches get chromatic fringing; flat walls stay clean.
  float caAmt = 0.010 + 0.030 * uArousal + 0.050 * uSegmentFlash;
  float palT = t * 0.045 + uTime * 0.015;
  float pv = clamp(uValence * 0.85 + uCentroid * 0.25, 0.0, 1.0);
  vec3 shiftR = palette(palT + caAmt * (fres + 0.1), pv);
  vec3 shiftB = palette(palT - caAmt * (fres + 0.1), pv);
  color.r = mix(color.r, shiftR.r, 0.35 + 0.45 * fres);
  color.b = mix(color.b, shiftB.b, 0.35 + 0.45 * fres);

  // Volumetric glow pass in the palette
  color += glow * palette(uTime * 0.02, uValence) * (0.8 + 0.6 * uLoudnessEnv);

  // Sparkle layer overlaid additively
  color += sparkles(uv, uValence);

  // Segment flash — white pop that decays
  color += uSegmentFlash * (0.8 + palette(uTime * 0.1, uValence) * 0.6);

  // Onset brightness punch
  color *= 1.0 + 0.55 * uOnset;

  // Saturation lift scaled by loudness — louder = more vivid
  float luma = dot(color, vec3(0.299, 0.587, 0.114));
  float satBoost = 1.0 + 0.35 * uLoudnessEnv;
  color = mix(vec3(luma), color, satBoost);

  // Cheap bloom: highlights bleed into themselves, stronger on loud passages
  vec3 hi = max(color - 0.55, 0.0);
  color += hi * hi * (1.1 + 0.6 * uLoudnessEnv);

  // ACES-ish tonemap
  color = (color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14);
  color = clamp(color, 0.0, 1.0);

  // Vignette — opens up on chorus / loud passages
  float vigR = mix(1.12, 1.48, max(uSegmentIntensity, uLoudnessEnv));
  float vig = 1.0 - smoothstep(0.55, vigR, length(uv));
  color *= mix(0.6, 1.0, vig);

  // Film grain
  float g = hash21(gl_FragCoord.xy + uTime * 120.0);
  color += (g - 0.5) * 0.04;

  fragColor = vec4(color, 1.0);
}
`;
