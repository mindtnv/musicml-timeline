import { useState, useEffect, useRef, type RefObject } from "react";

export function usePlayheadSync(
  audioRef: RefObject<HTMLAudioElement | null>
): number {
  const [currentTime, setCurrentTime] = useState(0);
  const rafId = useRef<number>(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    let running = true;

    function tick() {
      if (!running) return;
      const a = audioRef.current;
      if (a) {
        setCurrentTime(a.currentTime);
      }
      rafId.current = requestAnimationFrame(tick);
    }

    rafId.current = requestAnimationFrame(tick);

    return () => {
      running = false;
      cancelAnimationFrame(rafId.current);
    };
  }, [audioRef]);

  return currentTime;
}
