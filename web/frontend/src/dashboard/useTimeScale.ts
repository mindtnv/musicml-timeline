import { useEffect, useState, type RefObject } from "react";
import { scaleLinear } from "d3-scale";
import { useDashboard } from "./DashboardContext";

export interface TimeScale {
  /** time (seconds) → pixels relative to container left edge */
  scale: (time: number) => number;
  /** pixels relative to container left → time (seconds) */
  invert: (px: number) => number;
  /** Plotting area width (container width minus padding) */
  plotWidth: number;
  /** Left padding in pixels */
  paddingLeft: number;
  /** Right padding in pixels */
  paddingRight: number;
  /** Container's full measured width */
  containerWidth: number;
}

/**
 * Returns a time→pixel scale tied to a container's measured width.
 * Re-measures via ResizeObserver so panels stay in sync on resize.
 */
export function useTimeScale(
  containerRef: RefObject<HTMLElement | null>,
  paddingLeft = 0,
  paddingRight = 0
): TimeScale {
  const { duration } = useDashboard();
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => setContainerWidth(el.clientWidth);
    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);

  const plotWidth = Math.max(0, containerWidth - paddingLeft - paddingRight);
  const d3 = scaleLinear()
    .domain([0, Math.max(1e-6, duration)])
    .range([paddingLeft, paddingLeft + plotWidth]);

  return {
    scale: (t: number) => d3(t),
    invert: (px: number) => d3.invert(px),
    plotWidth,
    paddingLeft,
    paddingRight,
    containerWidth,
  };
}
