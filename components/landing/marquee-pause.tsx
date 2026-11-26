"use client";

import { Pause, Play } from "lucide-react";
import { useState } from "react";

/**
 * Pause / resume control for the challenge marquee (WCAG 2.2.2 Pause, Stop, Hide):
 * hover and focus already pause it, but touch users need an explicit control.
 * Hidden under prefers-reduced-motion, where the marquee is a static row anyway.
 */
export function MarqueePause({ target, pauseLabel, playLabel }: { target: string; pauseLabel: string; playLabel: string }) {
  const [paused, setPaused] = useState(false);
  const toggle = () => {
    const next = !paused;
    setPaused(next);
    document.getElementById(target)?.toggleAttribute("data-marquee-paused", next);
  };
  return (
    <button
      type="button"
      onClick={toggle}
      aria-controls={target}
      className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-sm font-semibold text-ink transition hover:border-frost motion-reduce:hidden"
    >
      {paused ? <Play aria-hidden className="h-4 w-4" /> : <Pause aria-hidden className="h-4 w-4" />}
      {paused ? playLabel : pauseLabel}
    </button>
  );
}
