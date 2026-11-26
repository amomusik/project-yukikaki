"use client";

import { useState } from "react";
import Image, { type ImageLoader } from "next/image";
import type { HeroVariant } from "./hero-variant";

/**
 * Pre-optimized WebPs in public/images at 960/1600/2400 wide, plus a 24px-wide blurred WebP
 * (hero-*-blur.webp) inlined for an instant placeholder.
 */
const ART = {
  papercut: {
    base: "hero-yukikaki",
    blur: "data:image/webp;base64,UklGRmIAAABXRUJQVlA4IFYAAACQAgCdASoYAA0AAsBMJYgCdAEO5gOp54IGoTRwgAD++b/pxnONNYxZMwVG9dryUfmVhsoFNvLFxhMeAS7lVqWthVsuti3eh2Ts5XxFYIWhQBB0+wAAAA==",
  },
  // 8-bit "Pixel 1" scene, resized with a nearest-neighbour kernel so the blocks stay crisp.
  pixel: {
    base: "hero-pixel",
    blur: "data:image/webp;base64,UklGRn4AAABXRUJQVlA4IHIAAAAwBACdASoYAA0APu1iqk2ppaQiMAgBMB2JZACdMoADTq2+i/tr6M/VYAAA/u5ztfd+Uf13TBqDick87C1zUoI9Boy11WwfMLR1lqOJXydYoHKw1fCqEjR53ztr/3l86eNo2THy3r3IEJKIjjvhdgPgAAA=",
  },
} as const satisfies Record<HeroVariant, { base: string; blur: string }>;

// The loader picks the smallest pre-built file at least as wide as the requested width.
const VARIANTS = [960, 1600, 2400] as const;
const loaderFor =
  (base: string): ImageLoader =>
  ({ width }) => {
    const w = VARIANTS.find((v) => v >= width) ?? 2400;
    return `/images/${w === 2400 ? base : `${base}-${w}`}.webp?w=${width}`;
  };
const LOADERS: Record<HeroVariant, ImageLoader> = {
  papercut: loaderFor(ART.papercut.base),
  pixel: loaderFor(ART.pixel.base),
};

/** The hero scene (8-bit pixel art by default, paper-cut dusk opt-in), anchored to the bottom of the hero. */
export function HeroArt({ alt, className, variant = "pixel" }: { alt: string; className?: string; variant?: HeroVariant }) {
  const art = ART[variant];
  // Pixel art keeps hard edges when scaled, but only once loaded: a pixelated 24px blur placeholder
  // would show as a few giant blocks.
  const [loaded, setLoaded] = useState(false);
  return (
    <Image
      loader={LOADERS[variant]}
      src={`/images/${art.base}.webp`}
      alt={alt}
      width={2400}
      height={1347}
      priority
      sizes="100vw"
      placeholder={art.blur}
      onLoad={variant === "pixel" ? () => setLoaded(true) : undefined}
      className={variant === "pixel" && loaded ? `${className ?? ""} [image-rendering:pixelated]` : className}
    />
  );
}
