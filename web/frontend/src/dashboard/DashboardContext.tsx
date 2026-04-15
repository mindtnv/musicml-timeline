import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { getOutputLatency } from "../vibe/audioAnalyser";

export interface DashboardState {
  duration: number;
  playheadTime: number;
  hoverTime: number | null;
  pinnedTime: number | null;
  isPlaying: boolean;
  seek: (t: number) => void;
  setHoverTime: (t: number | null) => void;
  setPinnedTime: (t: number | null) => void;
  togglePlay: () => void;
  getEffectiveCursorTime: () => number | null;
}

const DashboardContext = createContext<DashboardState | null>(null);

interface ProviderProps {
  children: ReactNode;
  audioRef: RefObject<HTMLAudioElement | null>;
  duration: number;
}

export function DashboardProvider({ children, audioRef, duration }: ProviderProps) {
  const [playheadTime, setPlayheadTime] = useState(0);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [pinnedTime, setPinnedTime] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const rafIdRef = useRef<number>(0);

  // rAF loop — always running while mounted; keeps playhead in sync with audio.
  useEffect(() => {
    let running = true;

    function tick() {
      if (!running) return;
      const audio = audioRef.current;
      if (audio) {
        // Compensate for output latency so the playhead tracks what the
        // listener actually hears, not what's been scheduled internally.
        const lat = getOutputLatency(audio);
        setPlayheadTime((prev) => {
          const t = Math.max(0, audio.currentTime - lat);
          return Math.abs(t - prev) > 0.01 ? t : prev;
        });
      }
      rafIdRef.current = requestAnimationFrame(tick);
    }
    rafIdRef.current = requestAnimationFrame(tick);

    return () => {
      running = false;
      cancelAnimationFrame(rafIdRef.current);
    };
  }, [audioRef]);

  // Subscribe to audio element play/pause events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      setIsPlaying(false);
      setPlayheadTime(0);
    };

    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
    };
  }, [audioRef]);

  const seek = useCallback(
    (t: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      const clamped = Math.max(0, Math.min(duration, t));
      audio.currentTime = clamped;
      setPlayheadTime(clamped);
    },
    [audioRef, duration]
  );

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().catch((err) => {
        console.warn("[audio] play() rejected:", err);
      });
    } else {
      audio.pause();
    }
  }, [audioRef]);

  const getEffectiveCursorTime = useCallback(() => {
    // Priority: hover > pinned > playhead (while playing)
    if (hoverTime != null) return hoverTime;
    if (pinnedTime != null) return pinnedTime;
    return playheadTime;
  }, [hoverTime, pinnedTime, playheadTime]);

  const value = useMemo<DashboardState>(
    () => ({
      duration,
      playheadTime,
      hoverTime,
      pinnedTime,
      isPlaying,
      seek,
      setHoverTime,
      setPinnedTime,
      togglePlay,
      getEffectiveCursorTime,
    }),
    [
      duration,
      playheadTime,
      hoverTime,
      pinnedTime,
      isPlaying,
      seek,
      togglePlay,
      getEffectiveCursorTime,
    ]
  );

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboard(): DashboardState {
  const ctx = useContext(DashboardContext);
  if (!ctx) {
    throw new Error("useDashboard must be used inside <DashboardProvider>");
  }
  return ctx;
}
