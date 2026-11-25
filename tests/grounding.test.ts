import { describe, expect, it, vi } from "vitest";
import { OFFICIAL_DOMAINS, groundBrief, isOfficial, planQueries, type SearchFn } from "@/lib/grounding/search";

const hit = (title: string, url: string, snippet: string) => ({ title, url, snippet });

describe("grounding cascade", () => {
  it("stops at exact when the city has results", async () => {
    const search: SearchFn = vi.fn(async (q: string) => ({
      ok: true,
      results: q.startsWith("札幌") ? [hit(`札幌 ${q}`, `https://city.sapporo.jp/${encodeURIComponent(q)}`, "札幌市のラーメン店データ")] : [],
    }));
    const r = await groundBrief({ city: "Sapporo", industry: "ramen" }, { search });
    expect(r.level).toBe("exact");
    expect(r.sources.length).toBeGreaterThanOrEqual(2);
    expect(r.sources.every((s) => s.matchedCity === "Sapporo")).toBe(true);
    expect(search).toHaveBeenCalledTimes(planQueries({ city: "Sapporo", industry: "ramen" }).exact.length);
  });

  it("falls back to analog cities when the exact city has nothing", async () => {
    const search: SearchFn = async (q) => ({
      ok: true,
      results: q.startsWith("旭川") || q.startsWith("青森") || q.startsWith("小樽")
        ? [hit(`${q.slice(0, 2)} ラーメン統計`, `https://www.pref.hokkaido.lg.jp/${encodeURIComponent(q)}`, `${q.slice(0, 2)}のラーメン店`)]
        : [],
    });
    const r = await groundBrief({ city: "Sapporo", industry: "ramen" }, { search });
    expect(r.level).toBe("analog");
    expect(r.sources.length).toBeGreaterThanOrEqual(2);
    expect(r.sources.every((s) => s.matchedCity && s.matchedCity !== "Sapporo")).toBe(true);
  });

  it("ignores results that do not mention the city they were searched for", async () => {
    const search: SearchFn = async () => ({ ok: true, results: [hit("Generic ramen article", "https://www.meti.go.jp/a", "nothing local")] });
    const r = await groundBrief({ city: "Sapporo", industry: "ramen" }, { search, minResults: 1 });
    expect(r.level).toBe("national"); // only the national level accepts non-local results
  });

  it("never grounds on blogs or SEO sites, only official domains", async () => {
    const search: SearchFn = async (q) => ({
      ok: true,
      results: [hit(`札幌 ${q}`, `https://ramen-blog.example.com/${encodeURIComponent(q)}`, "札幌のラーメン")],
    });
    const r = await groundBrief({ city: "Sapporo", industry: "ramen" }, { search });
    expect(r.level).toBe("ungrounded");
  });

  it("rejects another municipality's site and personal pages", () => {
    expect(isOfficial("https://www4.city.kanazawa.lg.jp/a.pdf", OFFICIAL_DOMAINS, "kanazawa")).toBe(true);
    expect(isOfficial("https://www.city.yokohama.lg.jp/kanazawa/x.pdf", OFFICIAL_DOMAINS, "kanazawa")).toBe(false);
    expect(isOfficial("https://www.pref.ishikawa.lg.jp/a.html", OFFICIAL_DOMAINS, "kanazawa")).toBe(true);
    expect(isOfficial("https://www.tkl.iis.u-tokyo.ac.jp/~someone/page.html", OFFICIAL_DOMAINS)).toBe(false);
    expect(isOfficial("https://www.city.asahikawa.hokkaido.jp/a", [...OFFICIAL_DOMAINS, "city.asahikawa.hokkaido.jp"], "asahikawa")).toBe(true);
  });

  it("asks Linkup for official domains, including the city's own site", async () => {
    const seen: string[][] = [];
    await groundBrief({ city: "Sapporo", industry: "ramen" }, { search: async (_q, o) => (seen.push(o?.includeDomains ?? []), { ok: true, results: [] }) });
    expect(seen[0]).toEqual(expect.arrayContaining(["go.jp", "lg.jp", "city.sapporo.jp"]));
    expect(seen.every((d) => d.length > 0)).toBe(true);
  });

  it("is ungrounded (not unavailable) when Linkup answers but finds nothing", async () => {
    const r = await groundBrief({ city: "Sapporo", industry: "ramen" }, { search: async () => ({ ok: true, results: [] }) });
    expect(r).toMatchObject({ level: "ungrounded", sources: [], unavailable: false });
  });

  it("is unavailable when every Linkup call failed", async () => {
    const r = await groundBrief({ city: "Sapporo", industry: "ramen" }, { search: async () => ({ ok: false, results: [] }) });
    expect(r).toMatchObject({ level: "ungrounded", unavailable: true });
  });
});
