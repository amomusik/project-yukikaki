"use client";

import { useEffect, useState } from "react";
import { useInViewOnce } from "./use-in-view";

/**
 * Counts up to `value` once, the first time it scrolls into view. The real value is
 * server-rendered and announced to assistive tech; only the visual digits animate.
 */
export function CountUp({ value, duration = 1400 }: { value: number; duration?: number }) {
  const { ref, armed, inView } = useInViewOnce<HTMLSpanElement>(0.6);
  const [shown, setShown] = useState(value);
  const decimals = Number.isInteger(value) ? 0 : 1;

  useEffect(() => {
    if (!armed) return;
    if (!inView) {
      setShown(0);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(value * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [armed, inView, value, duration]);

  return (
    <span ref={ref} className="tabular-nums">
      <span aria-hidden>{shown.toFixed(decimals)}</span>
      <span className="sr-only">{value}</span>
    </span>
  );
}
