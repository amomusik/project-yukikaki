import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PREBAKED_DIR, loadPrebaked, prebakedSchema, prebakedSourceIsOfficial, type Prebaked } from "@/lib/grounding/prebaked";
import { OFFICIAL_DOMAINS, isOfficial } from "@/lib/grounding/search";

const files = readdirSync(PREBAKED_DIR).filter((f) => f.endsWith(".json"));
const read = (f: string): Prebaked => prebakedSchema.parse(JSON.parse(readFileSync(path.join(PREBAKED_DIR, f), "utf8")));

describe("committed prebaked grounding files", () => {
  it("exist", () => expect(files.length).toBeGreaterThan(0));

  it.each(files)("%s: every source passes isOfficial for its city", (f) => {
    const p = read(f);
    expect(p.live.filter((s) => !prebakedSourceIsOfficial(p, s)).map((s) => s.url)).toEqual([]);
  });

  it.each(files)("%s: grounded on at least 2 sources", (f) => {
    const p = read(f);
    if (p.groundingLevel !== "ungrounded") expect(p.live.length).toBeGreaterThanOrEqual(2);
  });

  it("no longer cite the rejected pages from the review", () => {
    const urls = files.flatMap((f) => read(f).live.map((s) => s.url)).join("\n");
    expect(urls).not.toMatch(/city\.yokohama\.lg\.jp/);
    expect(urls).not.toMatch(/\/~/);
    expect(urls).not.toMatch(/ibusuki\.or\.jp/);
  });
});

describe("loadPrebaked provenance gate", () => {
  it("drops sources that fail isOfficial for the brief's city", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "yk-prov-"));
    const src = (url: string, title = "金沢市 酒造 統計") => ({ title, url, snippet: "金沢", matchedCity: "Kanazawa", level: "exact" as const, foundBy: "linkup" as const });
    const p: Prebaked = {
      slug: "k",
      industry: "brewery",
      industryKey: "brewery",
      city: "Kanazawa",
      groundingLevel: "exact",
      live: [
        src("https://www4.city.kanazawa.lg.jp/a.html"),
        src("https://www.city.yokohama.lg.jp/kanazawa/kusei/tokei/toukeiyouran.html", "金沢区統計要覧 横浜市金沢区"),
        src("https://www.tkl.iis.u-tokyo.ac.jp/~someone/a.html"),
        src("https://www.kanazawa-kankoukyoukai.or.jp/gourmet/detail_20009.html", "金沢地酒蔵"),
        src("https://some-random-npo.or.jp/kanazawa.html", "金沢の酒"),
      ],
      synthetic: null,
      generatedAt: "2026-11-27",
    };
    writeFileSync(path.join(dir, "k.json"), JSON.stringify(p));
    expect(loadPrebaked("k", dir)?.live.map((s) => s.url)).toEqual([
      "https://www4.city.kanazawa.lg.jp/a.html",
      "https://www.kanazawa-kankoukyoukai.or.jp/gourmet/detail_20009.html",
    ]);
  });
});

describe("or.jp is limited to public bodies about the brief's city", () => {
  const sapporo = { ja: "札幌", en: "Sapporo" };
  it("accepts chambers of commerce, welfare councils and tourism associations", () => {
    expect(isOfficial("https://www.sapporo-cci.or.jp/web/a.html", OFFICIAL_DOMAINS, "sapporo")).toBe(true);
    expect(isOfficial("https://www.sapporo-shakyo.or.jp/service/a.html", OFFICIAL_DOMAINS, "sapporo")).toBe(true);
    expect(isOfficial("https://www.hokkaido-kanko.or.jp/a", OFFICIAL_DOMAINS, "sapporo", { text: "札幌の観光統計", city: sapporo })).toBe(true);
    expect(isOfficial("https://www.zaidan.city-sapporo.or.jp/a", OFFICIAL_DOMAINS)).toBe(true);
  });

  it("rejects a Kagoshima tourism page about a shop called 札幌ラーメン", () => {
    expect(isOfficial("https://ibusuki.or.jp/eat/japanese/post-35/", OFFICIAL_DOMAINS, "sapporo", { text: "札幌ラーメン休次郎 | いぶすき観光ネット", city: sapporo })).toBe(false);
  });

  it("rejects public bodies of another city unless the page names the city", () => {
    expect(isOfficial("https://www.kagoshima-cci.or.jp/a", OFFICIAL_DOMAINS, "sapporo", { text: "鹿児島の商店街", city: sapporo })).toBe(false);
  });

  it("rejects arbitrary or.jp organisations even with no city", () => {
    expect(isOfficial("https://ramen-fans.or.jp/a", OFFICIAL_DOMAINS)).toBe(false);
  });
});
