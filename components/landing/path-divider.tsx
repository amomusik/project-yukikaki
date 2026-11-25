"use client";

import { cn } from "@/components/ui";
import { useInViewOnce } from "./use-in-view";

const PATH = "M0 30 C 120 18, 260 16, 380 22 S 640 30, 760 22 S 920 14, 1000 20";

/**
 * The "cleared path" motif: a long shovel stroke swept through soft snow,
 * with a lantern at the end of the path. It sweeps itself in left to right the first
 * time it scrolls into view (static under prefers-reduced-motion). Decorative only.
 */
export function PathDivider({ className }: { className?: string }) {
  const { ref, armed, inView } = useInViewOnce<HTMLDivElement>(0.5);
  return (
    <div
      ref={ref}
      aria-hidden
      data-armed={armed || undefined}
      data-inview={inView || undefined}
      className={cn("yk-draw relative mx-auto my-20 h-12 w-full max-w-5xl sm:my-24", className)}
    >
      <svg viewBox="0 0 1000 48" preserveAspectRatio="none" className="yk-draw__svg absolute inset-0 h-full w-full" fill="none">
        {/* snow pushed to either side of the path */}
        <path d={PATH} stroke="var(--ice)" strokeWidth="16" strokeLinecap="round" />
        {/* the swept path */}
        <path d={PATH} stroke="var(--ice-strong)" strokeWidth="2" strokeLinecap="round" strokeDasharray="1 10" />
        <path d="M40 28 C 160 18, 280 17, 380 22 S 640 30, 760 22 S 900 15, 960 18" stroke="var(--frost)" strokeOpacity="0.35" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
      <span className="yk-draw__lantern absolute right-[3%] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-lantern shadow-[0_0_14px_4px_rgb(233_162_59/0.45)]" />
    </div>
  );
}

/** A snowbank edge with a path cut through it, used where the night hero meets the snow page. */
export function SnowbankEdge({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 1440 90" preserveAspectRatio="none" className={cn("block h-14 w-full sm:h-20", className)}>
      <path
        d="M0 90 V44 C 120 28, 260 22, 420 34 C 520 42, 600 52, 660 62 L 780 62 C 840 52, 920 40, 1020 32 C 1180 20, 1320 28, 1440 40 V90 Z"
        fill="var(--snow)"
      />
      <path d="M660 62 C 690 70, 750 70, 780 62" stroke="var(--ice-strong)" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}
