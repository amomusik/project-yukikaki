"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { YukikakiMark } from "./mark";
import { prefersReducedMotion } from "./use-in-view";

type Flake = { id: number; left: number; size: number; delay: number; dur: number; drift: number; blur: number };

/** Same size tiers as the hero snow: mostly small, some big, a few soft near-camera flakes that fall slower. */
function flakeTier(): Pick<Flake, "size" | "dur" | "blur"> {
  const r = Math.random();
  if (r < 0.55) return { size: 3 + Math.random() * 3, dur: 1.5 + Math.random() * 0.9, blur: 0 };
  if (r < 0.88) return { size: 7 + Math.random() * 4, dur: 1.9 + Math.random() * 0.7, blur: 0 };
  return { size: 14 + Math.random() * 8, dur: 2.2 + Math.random() * 0.4, blur: 2.5 };
}
let seq = 0;

/** Easter egg: clicking the 雪 mark shakes loose a brief extra flurry (skipped under reduced motion). */
export function MarkFlurry({ className }: { className?: string }) {
  const [flakes, setFlakes] = useState<Flake[]>([]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!flakes.length) return;
    const timer = setTimeout(() => setFlakes([]), 3200);
    return () => clearTimeout(timer);
  }, [flakes]);

  function flurry() {
    if (prefersReducedMotion()) return;
    setFlakes(
      Array.from({ length: 46 }, () => ({
        id: ++seq,
        left: Math.random() * 100,
        ...flakeTier(),
        delay: Math.random() * 0.6,
        drift: (Math.random() - 0.5) * 120,
      })),
    );
  }

  return (
    <>
      <span onClick={flurry} className="contents">
        <YukikakiMark className={className} />
      </span>
      {mounted &&
        flakes.length > 0 &&
        createPortal(
          <div aria-hidden className="yk-flurry">
            {flakes.map((f) => (
              <span
                key={f.id}
                style={
                  {
                    left: `${f.left}%`,
                    width: f.size,
                    height: f.size,
                    animationDelay: `${f.delay}s`,
                    animationDuration: `${f.dur}s`,
                    filter: f.blur ? `blur(${f.blur}px)` : undefined,
                    "--yk-drift": `${f.drift}px`,
                  } as React.CSSProperties
                }
              />
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
