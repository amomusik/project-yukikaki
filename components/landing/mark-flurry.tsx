"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { YukikakiMark } from "./mark";
import { prefersReducedMotion } from "./use-in-view";

type Flake = { id: number; left: number; size: number; delay: number; dur: number; drift: number };
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
        size: 3 + Math.random() * 6,
        delay: Math.random() * 0.6,
        dur: 1.6 + Math.random() * 1.2,
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
