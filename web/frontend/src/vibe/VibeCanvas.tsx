import { useEffect, useRef } from "react";
import type { Timeline } from "../api/types";
import {
  attachAnalyser,
  getOutputLatency,
  readBands,
  resumeContext,
  type AnalyserBundle,
} from "./audioAnalyser";
import { semanticsAtTime } from "./semanticFrame";
import { genrePresetByLabel } from "./genrePresets";
import { FRAGMENT_SRC, VERTEX_SRC } from "./shaders";

interface Props {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  timeline: Timeline;
}

// Cap DPR so full-HD retina panels don't bring the raymarcher to its knees.
const MAX_DPR = 1.25;

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  src: string
): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("createShader failed");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("Shader compile failed: " + log);
  }
  return sh;
}

function linkProgram(
  gl: WebGL2RenderingContext,
  vs: WebGLShader,
  fs: WebGLShader
): WebGLProgram {
  const prog = gl.createProgram();
  if (!prog) throw new Error("createProgram failed");
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error("Program link failed: " + log);
  }
  return prog;
}

function VibeCanvas({ audioRef, timeline }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const audio = audioRef.current;
    if (!canvas || !audio) return;

    const gl = canvas.getContext("webgl2", {
      antialias: false,
      preserveDrawingBuffer: false,
      premultipliedAlpha: false,
    });
    if (!gl) {
      console.warn("[vibe] WebGL2 unavailable");
      return;
    }

    // --- Shader program ---
    const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SRC);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC);
    const prog = linkProgram(gl, vs, fs);
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    // --- Fullscreen quad (2 triangles) ---
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    // --- Uniform locations ---
    const uRes    = gl.getUniformLocation(prog, "uResolution");
    const uTime   = gl.getUniformLocation(prog, "uTime");
    const uBass   = gl.getUniformLocation(prog, "uBass");
    const uMid    = gl.getUniformLocation(prog, "uMid");
    const uTreble = gl.getUniformLocation(prog, "uTreble");
    const uBassE  = gl.getUniformLocation(prog, "uBassEnv");
    const uLoudE  = gl.getUniformLocation(prog, "uLoudnessEnv");
    const uOnset  = gl.getUniformLocation(prog, "uOnset");
    const uCent   = gl.getUniformLocation(prog, "uCentroid");
    const uAro    = gl.getUniformLocation(prog, "uArousal");
    const uVal    = gl.getUniformLocation(prog, "uValence");
    const uSegI   = gl.getUniformLocation(prog, "uSegmentIntensity");
    const uSegF   = gl.getUniformLocation(prog, "uSegmentFlash");
    const uGHue   = gl.getUniformLocation(prog, "uGenreHue");
    const uGRibs  = gl.getUniformLocation(prog, "uGenreRibs");
    const uGSharp = gl.getUniformLocation(prog, "uGenreSharp");
    const uGSpark = gl.getUniformLocation(prog, "uGenreSparkle");
    const uGTwist = gl.getUniformLocation(prog, "uGenreTwist");

    // --- WebAudio (idempotent singleton) ---
    let bundle: AnalyserBundle | null = null;
    try {
      bundle = attachAnalyser(audio);
      resumeContext(bundle);
    } catch (err) {
      console.warn("[vibe] analyser init failed; running without audio uniforms", err);
    }

    // --- Sizing ---
    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const w = Math.max(1, Math.floor(canvas!.clientWidth * dpr));
      const h = Math.max(1, Math.floor(canvas!.clientHeight * dpr));
      if (canvas!.width !== w || canvas!.height !== h) {
        canvas!.width = w;
        canvas!.height = h;
      }
      gl!.viewport(0, 0, w, h);
    }
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    // --- Animation state ---
    let rafId = 0;
    let running = true;
    const startMs = performance.now();
    let prevMs = startMs;

    // Smoothed audio envelopes
    let bassEnv = 0;       // fast attack, slow release — camera punch
    let loudEnv = 0;       // slow — "breathing"
    let baseline = 0;      // slow bass floor for onset threshold
    let onset = 0;         // decaying spike on bass surges

    // Smoothed semantic values — avoid step changes when the HUD poll ticks
    let aroSm = 0.5;
    let valSm = 0.5;
    let segISm = 0.5;

    // Smoothed FFT bands to reduce FFT jitter
    let bassSm = 0, midSm = 0, trebleSm = 0, centSm = 0;

    // Smoothed genre preset params — lerp between genres keeps palette /
    // geometry continuous when the model flips its prediction.
    let gHue = 0, gRibs = 12, gSharp = 0.25, gSpark = 0.5, gTwist = 1.0;

    let lastSegLabel = "";
    let flashUntilMs = 0;  // segment flash decay target

    // Frame-rate-independent first-order smoother.
    // k01 = "fraction converged in 1/60s"; tuned per channel.
    function step(cur: number, target: number, k01: number, dtSec: number): number {
      const a = 1 - Math.pow(1 - k01, dtSec * 60);
      return cur + (target - cur) * a;
    }

    gl.useProgram(prog);

    function frame() {
      if (!running) return;
      const tMs = performance.now();
      const t = (tMs - startMs) / 1000;
      const dt = Math.max(0.001, Math.min(0.1, (tMs - prevMs) / 1000));
      prevMs = tMs;

      // Audio bands (raw, smoothed, envelopes)
      let bass = 0, mid = 0, treble = 0, loudness = 0, centroid = 0;
      if (bundle) {
        const b = readBands(bundle);
        bass = b.bass; mid = b.mid; treble = b.treble;
        loudness = b.loudness; centroid = b.centroid;
      }

      // Light smoothing of raw bands (FFT is already smoothed at analyser=0.82)
      bassSm   = step(bassSm, bass, 0.6, dt);
      midSm    = step(midSm, mid, 0.6, dt);
      trebleSm = step(trebleSm, treble, 0.55, dt);
      centSm   = step(centSm, centroid, 0.35, dt);

      // Bass envelope: fast attack, slow release (camera shake feel)
      bassEnv = bass > bassEnv
        ? step(bassEnv, bass, 0.70, dt)
        : step(bassEnv, bass, 0.12, dt);

      // Slow loudness envelope — "breathing"
      loudEnv = step(loudEnv, loudness, 0.10, dt);

      // Onset detection: running bass baseline, trigger when we spike above it
      baseline = step(baseline, bass, 0.04, dt);
      const spike = Math.max(0, bass - baseline - 0.10);
      if (spike > 0) {
        onset = Math.min(1, onset + spike * 2.2);
      }
      onset = step(onset, 0, 0.22, dt); // ~600ms decay

      // Semantic frame at the currently-AUDIBLE audio position — subtract
      // output latency so segment / A-V uniforms align with what the
      // listener hears, not with what's been scheduled internally.
      const nowT = Math.max(0, audio!.currentTime - getOutputLatency(audio!));
      const s = semanticsAtTime(nowT, timeline);
      aroSm  = step(aroSm, s.arousal, 0.18, dt);
      valSm  = step(valSm, s.valence, 0.18, dt);
      segISm = step(segISm, s.segmentIntensity, 0.10, dt);

      // Genre preset lerp — smooth visual handoff when genre flips
      const gp = genrePresetByLabel(s.genreLabel);
      gHue   = step(gHue,   gp.hue,     0.08, dt);
      gRibs  = step(gRibs,  gp.ribs,    0.08, dt);
      gSharp = step(gSharp, gp.sharp,   0.08, dt);
      gSpark = step(gSpark, gp.sparkle, 0.08, dt);
      gTwist = step(gTwist, gp.twist,   0.08, dt);

      // Segment transition → flash
      if (s.segmentLabel && s.segmentLabel !== lastSegLabel) {
        if (lastSegLabel !== "") flashUntilMs = tMs + 600;
        lastSegLabel = s.segmentLabel;
      }
      const flash = Math.max(0, (flashUntilMs - tMs) / 600);

      gl!.uniform2f(uRes, canvas!.width, canvas!.height);
      gl!.uniform1f(uTime, t);
      gl!.uniform1f(uBass, bassSm);
      gl!.uniform1f(uMid, midSm);
      gl!.uniform1f(uTreble, trebleSm);
      gl!.uniform1f(uBassE, bassEnv);
      gl!.uniform1f(uLoudE, loudEnv);
      gl!.uniform1f(uOnset, onset);
      gl!.uniform1f(uCent, centSm);
      gl!.uniform1f(uAro, aroSm);
      gl!.uniform1f(uVal, valSm);
      gl!.uniform1f(uSegI, segISm);
      gl!.uniform1f(uSegF, flash);
      gl!.uniform1f(uGHue, gHue);
      gl!.uniform1f(uGRibs, gRibs);
      gl!.uniform1f(uGSharp, gSharp);
      gl!.uniform1f(uGSpark, gSpark);
      gl!.uniform1f(uGTwist, gTwist);

      gl!.drawArrays(gl!.TRIANGLES, 0, 6);
      rafId = requestAnimationFrame(frame);
    }
    rafId = requestAnimationFrame(frame);

    return () => {
      running = false;
      cancelAnimationFrame(rafId);
      ro.disconnect();
      gl.deleteBuffer(vbo);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(prog);
    };
  }, [audioRef, timeline]);

  return <canvas ref={canvasRef} className="vibe-canvas" />;
}

export default VibeCanvas;
