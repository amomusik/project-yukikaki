"use client";

import { useEffect, useState } from "react";

/**
 * Floating testimonial footer for the hero: a slim, flat bar pinned to the bottom of the
 * viewport on first load. It fades away as soon as the visitor scrolls, and stays hidden
 * until they return to the very top. Server renders it visible; no layout shift.
 * The shoveller stands at ~12–17vw from the left of the art, so from `sm` to `2xl` the bar is
 * centred in the space right of 22vw and never covers the kid (DESIGN.md: don't cover the shoveller).
 */
export function HeroQuoteBar({ quote, byline, lang }: { quote: string; byline: string; lang?: string }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const onScroll = () => setHidden(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <figure
      aria-hidden={hidden}
      className={`pointer-events-none fixed inset-x-0 bottom-0 z-30 hidden justify-center bg-gradient-to-t from-night/95 via-night/80 to-transparent px-6 pb-4 pt-8 text-white sm:pl-[22vw] 2xl:pl-6 transition-all duration-500 motion-reduce:transition-none sm:flex ${
        hidden ? "translate-y-full opacity-0" : "translate-y-0 opacity-100"
      }`}
    >
      <div className="flex max-w-3xl items-baseline gap-3 border-l-2 border-lantern/80 pl-3">
        {/* No faux-italic on Japanese: CJK fonts ship no italic, so the browser slants the glyphs. */}
        <blockquote lang={lang} className={`text-sm leading-snug text-white/90 ${lang === "ja" ? "" : "italic"}`}>
          “{quote}”
        </blockquote>
        <figcaption className="shrink-0 whitespace-nowrap text-xs text-sky-100">— {byline}</figcaption>
      </div>
    </figure>
  );
}
