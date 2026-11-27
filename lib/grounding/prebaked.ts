import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { findCity } from "./city-profiles";
import { industryKey, industryNeighbors } from "./industry-neighbors";
import { OFFICIAL_DOMAINS, isOfficial } from "./search";

/**
 * Pre-baked grounding + stand-in data, produced ahead of time by `pnpm prebake`
 * (real Linkup results + Adaption Labs output) and committed under seed/prebaked/.
 * Served when Linkup or Adaption is unreachable so the demo never breaks.
 */
export const prebakedSchema = z.object({
  slug: z.string(),
  industry: z.string(),
  industryKey: z.string(),
  city: z.string(),
  groundingLevel: z.enum(["exact", "analog", "national", "ungrounded"]),
  live: z.array(
    z.object({
      title: z.string(),
      url: z.string(),
      snippet: z.string(),
      matchedCity: z.string().nullable(),
      level: z.enum(["exact", "analog", "national"]),
      foundBy: z.enum(["linkup", "manual"]).default("linkup"),
    }),
  ),
  synthetic: z
    .object({
      name: z.string(),
      externalId: z.string().nullable().optional(),
      generatedBy: z.enum(["adaption", "seed"]),
      rows: z.array(z.object({ prompt: z.string(), completion: z.string() })),
    })
    .nullable(),
  generatedAt: z.string(),
});
export type Prebaked = z.infer<typeof prebakedSchema>;

export const PREBAKED_DIR = path.join(process.cwd(), "seed", "prebaked");

type PrebakedSource = Prebaked["live"][number];

/**
 * Provenance gate for committed prebaked sources: the same isOfficial() rule as live grounding,
 * keyed on the city the source was matched to (the brief's city for exact sources, the analog
 * city for analog ones, none for national ones) and allowing that city's own web domain.
 */
export function prebakedSourceIsOfficial(p: Pick<Prebaked, "city">, s: PrebakedSource): boolean {
  const profile = s.level === "national" ? undefined : findCity(s.matchedCity ?? p.city);
  const allowed = profile?.site ? [...OFFICIAL_DOMAINS, profile.site] : OFFICIAL_DOMAINS;
  const city = profile ? { ja: profile.ja, en: profile.en } : null;
  return isOfficial(s.url, allowed, profile?.key, { text: `${s.title} ${s.snippet}`, city });
}

/** Parse every prebaked file and drop any source that fails the provenance gate. */
function listPrebaked(dir = PREBAKED_DIR): Prebaked[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) => {
      const parsed = prebakedSchema.safeParse(JSON.parse(readFileSync(path.join(dir, f), "utf8")));
      if (!parsed.success) return [];
      const p = parsed.data;
      return [{ ...p, live: p.live.filter((s) => prebakedSourceIsOfficial(p, s)) }];
    });
}

export function loadPrebaked(slug: string, dir = PREBAKED_DIR): Prebaked | null {
  return listPrebaked(dir).find((p) => p.slug === slug) ?? null;
}

/** Closest pre-baked set for a new brief: same industry first, then an adjacent industry. */
export function findClosestPrebaked(industry: string, dir = PREBAKED_DIR): Prebaked | null {
  const all = listPrebaked(dir).filter((p) => p.groundingLevel !== "ungrounded");
  const key = industryKey(industry);
  return (
    all.find((p) => p.industryKey === key) ??
    all.find((p) => industryNeighbors(industry).some((n) => n.key === p.industryKey)) ??
    null
  );
}
