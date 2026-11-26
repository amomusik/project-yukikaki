import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CITY_PROFILES, analogCities, cityDistance, findCity } from "@/lib/grounding/city-profiles";
import { INDUSTRIES, findIndustry, industryKey } from "@/lib/grounding/industry-neighbors";
import { expandToken, tokenizeQuery, escapeLike, SEARCH_MAX_TOKENS, SEARCH_MAX_LENGTH } from "@/lib/queries";
import { briefDraftSchema, impactDraftSchema, roundHours } from "@/lib/integrations/elevenlabs";
import { readEnv } from "@/lib/env";
import { seedSchema } from "@/lib/seed-schema";

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

describe("city alias search (property-style over every city profile)", () => {
  const variants = (c: (typeof CITY_PROFILES)[number]) => [
    c.en,
    c.en.toUpperCase(),
    c.en.toLowerCase(),
    ` ${c.en} `,
    `${c.en} City`,
    `${c.key}-shi`,
    c.ja,
    `${c.ja}市`,
    `北海道${c.ja}市中央区`,
  ];

  it("every spelling of every city resolves to the same profile", () => {
    for (const c of CITY_PROFILES) for (const v of variants(c)) expect(findCity(v)?.key, `${v}`).toBe(c.key);
  });

  it("a search token for any city expands to both its English and Japanese names (Sapporo ↔ 札幌)", () => {
    for (const c of CITY_PROFILES)
      for (const v of [c.en, c.ja, c.key]) {
        const terms = expandToken(v);
        expect(terms).toContain(c.en);
        expect(terms).toContain(c.ja);
        expect(terms[0]).toBe(v); // the original token always comes first
      }
  });

  it("industry aliases expand to canonical vocabulary; random ASCII words never pick up an industry", () => {
    for (const ind of INDUSTRIES)
      for (const a of [ind.key, ind.en, ind.ja, ...ind.aliases]) {
        expect(industryKey(a), a).toBe(ind.key === industryKey(a) ? ind.key : industryKey(a));
        const terms = expandToken(a);
        if (findIndustry(a)?.key === ind.key) expect(terms, a).toContain(ind.ja);
      }
    const r = rng(7);
    const vocab = new Set(INDUSTRIES.flatMap((i) => [i.key, i.en, ...i.aliases].map((x) => x.toLowerCase())));
    for (let i = 0; i < 200; i++) {
      const w = Array.from({ length: 3 + Math.floor(r() * 6) }, () => String.fromCharCode(97 + Math.floor(r() * 26))).join("");
      if (vocab.has(w) || findCity(w)) continue;
      expect(expandToken(w), w).toEqual([w]);
    }
    expect(expandToken("dinner")).toEqual(["dinner"]); // substring "inn" must not match ryokan
  });

  it("analog cities: never itself, closest first, distance is a symmetric metric", () => {
    for (const a of CITY_PROFILES) {
      const an = analogCities(a.key, 5);
      expect(an.map((c) => c.key)).not.toContain(a.key);
      const d = an.map((c) => cityDistance(a, c));
      expect([...d].sort((x, y) => x - y)).toEqual(d);
      expect(cityDistance(a, a)).toBe(0);
      for (const b of CITY_PROFILES) {
        expect(cityDistance(a, b)).toBeCloseTo(cityDistance(b, a), 10);
        for (const c of CITY_PROFILES.slice(0, 6)) expect(cityDistance(a, c)).toBeLessThanOrEqual(cityDistance(a, b) + cityDistance(b, c) + 1e-9);
      }
    }
    expect(analogCities("Atlantis")).toEqual([]);
  });

  it("query tokenizer caps words/length, splits full-width spaces, escapes LIKE metachars", () => {
    const r = rng(9);
    for (let i = 0; i < 50; i++) {
      const words = Array.from({ length: Math.floor(r() * 20) }, (_, j) => `w${j}${Math.floor(r() * 3)}`);
      const q = words.join(r() > 0.5 ? " " : "\u3000");
      const t = tokenizeQuery(q);
      expect(t.length).toBeLessThanOrEqual(SEARCH_MAX_TOKENS);
      expect(new Set(t).size).toBe(t.length);
      expect(t.join(" ").length).toBeLessThanOrEqual(SEARCH_MAX_LENGTH);
    }
    expect(escapeLike("100%_\\")).toBe("100\\%\\_\\\\");
  });
});

describe("hours rounding and draft parsing", () => {
  it("roundHours is idempotent and within ±0.05 of the input", () => {
    const r = rng(11);
    for (let i = 0; i < 500; i++) {
      const x = r() * 200;
      const y = roundHours(x);
      expect(Math.abs(y - x)).toBeLessThanOrEqual(0.05 + 1e-9);
      expect(roundHours(y)).toBe(y);
      expect(Math.round(y * 10)).toBeCloseTo(y * 10, 9);
    }
  });

  it("free-text hours from the voice agent parse to one decimal; junk becomes null", () => {
    const base = { business_name: "b", industry: "i", city: "c", problem: "p" };
    const h = (v: unknown) => briefDraftSchema.parse({ ...base, hours_lost_per_week: v }).hours_lost_per_week;
    expect(h("約5時間")).toBe(5);
    expect(h("6.25")).toBe(6.3);
    expect(h(4.04)).toBe(4);
    expect(h("")).toBeNull();
    expect(h(null)).toBeNull();
    expect(h("たくさん")).toBeNull(); // no digits = unknown, not 0 h
    expect(h("2時間半")).toBe(2.5);
    const imp = impactDraftSchema.parse({ hours_saved_per_week: "2時間半", satisfaction: "4.6", still_in_use: "はい", would_recommend: "no", issues: null, quote: 1 });
    expect(imp).toMatchObject({ hours_saved_per_week: 2.5, satisfaction: 5, still_in_use: true, would_recommend: false, issues: "", quote: "1" });
    expect(impactDraftSchema.parse({ satisfaction: "0" }).satisfaction).toBeNull();
    expect(impactDraftSchema.parse({ satisfaction: 9 }).satisfaction).toBe(5);
  });

  it("draft enums default safely and tools_used splits Japanese/English separators", () => {
    const d = briefDraftSchema.parse({ business_name: "b", industry: "i", city: "c", problem: "p", data_sensitivity: "secret", preferred_language: "English", tools_used: "Excel、LINE,電卓・紙" });
    expect(d.data_sensitivity).toBe("synthetic_ok");
    expect(d.preferred_language).toBe("en");
    expect(d.tools_used).toEqual(["Excel", "LINE", "電卓", "紙"]);
    expect(briefDraftSchema.safeParse({ business_name: "", industry: "i", city: "c", problem: "p" }).success).toBe(false);
  });
});

describe("env + seed schema", () => {
  it("readEnv applies defaults, treats empty strings as unset and rejects a bad APP_URL", () => {
    const e = readEnv({ APP_URL: "", DIFY_API_URL: "", EMAIL_FROM: "" });
    expect(e.APP_URL).toBe("http://localhost:3000");
    expect(e.DIFY_API_URL).toBe("https://api.dify.ai");
    expect(e.ADAPTION_API_URL).toBe("https://api.prod.adaptionlabs.ai");
    expect(e.EMAIL_FROM).toContain("Yukikaki");
    expect(e.DATABASE_URL).toBeUndefined();
    expect(() => readEnv({ APP_URL: "not a url" })).toThrow(/Invalid environment configuration[\s\S]*APP_URL/);
  });

  it("seed/seed.json satisfies seedSchema", () => {
    const r = seedSchema.safeParse(JSON.parse(readFileSync("seed/seed.json", "utf8")));
    expect(r.success, r.success ? "" : JSON.stringify(r.error.issues.slice(0, 3))).toBe(true);
  });
});
