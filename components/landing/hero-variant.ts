/** Which hero illustration to show. The 8-bit `pixel` scene is the default; `?hero=paper` opts back into the paper-cut art. */
export type HeroVariant = "papercut" | "pixel";

export function parseHeroVariant(value: string | string[] | undefined): HeroVariant {
  const v = Array.isArray(value) ? value[0] : value;
  return v === "paper" || v === "papercut" ? "papercut" : "pixel";
}

/**
 * Sky colour sampled from the top of each illustration, used for the hero background and the
 * fade above the art so the two meet without a seam.
 */
export const HERO_SKY: Record<HeroVariant, string> = {
  papercut: "#041329",
  pixel: "#041a40",
};
