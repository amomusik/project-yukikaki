"use client";

import Image, { type ImageLoader } from "next/image";

// Pre-optimized variants in public/images (see scripts or README); the loader picks the
// smallest file at least as wide as the requested width.
const VARIANTS = [960, 1600, 2400] as const;
const heroLoader: ImageLoader = ({ width }) => {
  const w = VARIANTS.find((v) => v >= width) ?? 2400;
  return `/images/${w === 2400 ? "hero-yukikaki" : `hero-yukikaki-${w}`}.webp?w=${width}`;
};

// 24px-wide blurred WebP (public/images/hero-yukikaki-blur.webp), inlined for an instant placeholder.
const BLUR =
  "data:image/webp;base64,UklGRmIAAABXRUJQVlA4IFYAAACQAgCdASoYAA0AAsBMJYgCdAEO5gOp54IGoTRwgAD++b/pxnONNYxZMwVG9dryUfmVhsoFNvLFxhMeAS7lVqWthVsuti3eh2Ts5XxFYIWhQBB0+wAAAA==";

/** The paper-cut dusk scene, anchored to the bottom of the hero. */
export function HeroArt({ alt, className }: { alt: string; className?: string }) {
  return (
    <Image
      loader={heroLoader}
      src="/images/hero-yukikaki.webp"
      alt={alt}
      width={2400}
      height={1347}
      priority
      sizes="100vw"
      placeholder={BLUR}
      className={className}
    />
  );
}
