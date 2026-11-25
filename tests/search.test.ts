import { describe, expect, it } from "vitest";
import { getDb, schema } from "@/lib/db";
import type { BriefStatus } from "@/lib/db/schema";
import { escapeLike, expandToken, listChallenges, searchChallenges, tokenizeQuery } from "@/lib/queries";
import { GET } from "@/app/api/challenges/search/route";

type Texts = { title: string; problem?: string; current_process?: string; desired_outcome?: string };

async function seed(opts: {
  ja: Texts;
  en: Texts;
  status?: BriefStatus;
  city?: string;
  industry?: string;
  name?: string;
  skills?: string[];
  updatedAt?: Date;
}) {
  const db = getDb();
  const [biz] = await db
    .insert(schema.businesses)
    .values({ name: opts.name ?? "テスト商店", city: opts.city ?? "Aomori", industry: opts.industry ?? "retail" })
    .returning();
  const fill = (t: Texts) => ({ problem: "", current_process: "", desired_outcome: "", ...t });
  const [brief] = await db
    .insert(schema.briefs)
    .values({
      businessId: biz.id,
      content: { ja: fill(opts.ja), en: fill(opts.en) },
      skillsNeeded: opts.skills ?? [],
      status: opts.status ?? "approved",
      hoursLostPerWeek: 4,
      ...(opts.updatedAt ? { updatedAt: opts.updatedAt } : {}),
    })
    .returning();
  return brief;
}

const ids = (rows: { brief: { id: string } }[]) => rows.map((r) => r.brief.id);

describe("query helpers", () => {
  it("escapes LIKE metacharacters", () => {
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\");
  });
  it("tokenizes on ASCII and full-width spaces", () => {
    expect(tokenizeQuery("  札幌\u3000除雪  snow snow ")).toEqual(["札幌", "除雪", "snow"]);
    expect(tokenizeQuery("")).toEqual([]);
  });
  it("expands city and industry aliases both ways", () => {
    expect(expandToken("Sapporo")).toContain("札幌");
    expect(expandToken("札幌")).toContain("Sapporo");
    expect(expandToken("bakery")).toContain("パン屋");
    // substring false positives from findIndustry are not trusted for ASCII words
    expect(expandToken("dinner")).toEqual(["dinner"]);
  });
});

describe("listChallenges q", () => {
  it("matches Japanese and English titles", async () => {
    const b = await seed({ ja: { title: "雪かき依頼の受付を自動化" }, en: { title: "Automate shovelling requests xqtitle" } });
    expect(ids(await listChallenges({ q: "雪かき依頼" }))).toContain(b.id);
    expect(ids(await listChallenges({ q: "XQTITLE" }))).toContain(b.id); // case-insensitive
    expect(ids(await listChallenges({ q: "shovelling" }))).toEqual([b.id]);
  });

  it("matches problem/current_process/desired_outcome and business name", async () => {
    const b = await seed({
      ja: { title: "在庫", problem: "棚卸しが大変" },
      en: { title: "Stock", desired_outcome: "zebrafinch dashboard" },
      name: "Okapi Goods",
    });
    expect(ids(await listChallenges({ q: "棚卸し" }))).toEqual([b.id]);
    expect(ids(await listChallenges({ q: "zebrafinch" }))).toEqual([b.id]);
    expect(ids(await listChallenges({ q: "okapi" }))).toEqual([b.id]);
  });

  it("matches a city by its English or Japanese name (Sapporo ↔ 札幌)", async () => {
    const ja = await seed({ ja: { title: "札幌の店 alpha" }, en: { title: "Shop alpha" }, city: "札幌" });
    const en = await seed({ ja: { title: "店 beta" }, en: { title: "Shop beta" }, city: "Sapporo" });
    const other = await seed({ ja: { title: "店 gamma" }, en: { title: "Shop gamma" }, city: "Kyoto" });
    const bySapporo = ids(await listChallenges({ q: "sapporo" }));
    const by札幌 = ids(await listChallenges({ q: "札幌" }));
    for (const r of [bySapporo, by札幌]) {
      expect(r).toEqual(expect.arrayContaining([ja.id, en.id]));
      expect(r).not.toContain(other.id);
    }
  });

  it("matches an industry alias (bakery ↔ パン屋)", async () => {
    const b = await seed({ ja: { title: "仕込み delta" }, en: { title: "Prep delta" }, industry: "パン屋" });
    expect(ids(await listChallenges({ q: "bakery delta" }))).toEqual([b.id]);
  });

  it("matches skills", async () => {
    const b = await seed({ ja: { title: "受付" }, en: { title: "Intake" }, skills: ["quokka-automation", "line-bot"] });
    expect(ids(await listChallenges({ q: "quokka" }))).toEqual([b.id]);
  });

  it("excludes non-public statuses", async () => {
    const pub = await seed({ ja: { title: "ペリカン公開" }, en: { title: "pelican public" }, status: "in_progress" });
    const hidden: string[] = [];
    for (const status of ["draft", "enriching", "in_review", "rejected"] as BriefStatus[])
      hidden.push((await seed({ ja: { title: "ペリカン" }, en: { title: `pelican ${status}` }, status })).id);
    const r = ids(await listChallenges({ q: "pelican" }));
    expect(r).toEqual([pub.id]);
    const api = await searchChallenges("pelican", { limit: 20 });
    expect(api.map((x) => x.id)).toEqual([pub.id]);
  });

  it("ANDs multiple words", async () => {
    const both = await seed({ ja: { title: "x" }, en: { title: "walrus invoices" }, city: "Otaru" });
    await seed({ ja: { title: "x" }, en: { title: "walrus payroll" }, city: "Kyoto" });
    expect(ids(await listChallenges({ q: "walrus otaru" }))).toEqual([both.id]);
    expect(ids(await listChallenges({ q: "walrus 小樽" }))).toEqual([both.id]);
    expect(ids(await listChallenges({ q: "walrus nonexistentword" }))).toEqual([]);
  });

  it("escapes % and _ in the query", async () => {
    const pct = await seed({ ja: { title: "割引 100% narwhal" }, en: { title: "100% narwhal discount" } });
    const und = await seed({ ja: { title: "x" }, en: { title: "narwhal snake_case export" } });
    const plain = await seed({ ja: { title: "x" }, en: { title: "narwhal snakeXcase 1000 export" } });
    expect(ids(await listChallenges({ q: "narwhal %" }))).toEqual([pct.id]);
    expect(ids(await listChallenges({ q: "snake_case" }))).toEqual([und.id]);
    expect(ids(await listChallenges({ q: "100%" }))).toEqual([pct.id]);
    expect(ids(await listChallenges({ q: "narwhal" }))).toHaveLength(3);
    expect(ids(await listChallenges({ q: "narwhal" }))).toContain(plain.id);
  });

  it("ranks title matches first, then recency", async () => {
    const old = new Date("2020-01-01T00:00:00Z");
    const titleHit = await seed({ ja: { title: "x" }, en: { title: "ibis rota" }, updatedAt: old });
    const bodyHit = await seed({ ja: { title: "x" }, en: { title: "y", problem: "the ibis problem" } });
    const r = ids(await listChallenges({ q: "ibis" }));
    expect(r).toEqual([titleHit.id, bodyHit.id]);
  });

  it("combines q with city/industry/skill filters", async () => {
    const a = await seed({ ja: { title: "x" }, en: { title: "tapir a" }, city: "Akita", skills: ["s1"] });
    await seed({ ja: { title: "x" }, en: { title: "tapir b" }, city: "Morioka", skills: ["s1"] });
    expect(ids(await listChallenges({ q: "tapir", city: "Akita" }))).toEqual([a.id]);
    expect(ids(await listChallenges({ q: "tapir", skill: "s1" }))).toHaveLength(2);
  });
});

describe("searchChallenges", () => {
  it("returns locale-specific titles and a compact shape", async () => {
    const b = await seed({ ja: { title: "カピバラ温泉の予約" }, en: { title: "Capybara onsen bookings" }, city: "Hakodate", skills: ["booking-automation"] });
    const [en] = await searchChallenges("capybara", { locale: "en" });
    expect(en).toEqual({
      id: b.id,
      title: "Capybara onsen bookings",
      city: "Hakodate",
      industry: "retail",
      status: "approved",
      hoursLostPerWeek: 4,
      skills: ["booking-automation"],
    });
    const [ja] = await searchChallenges("カピバラ", { locale: "ja" });
    expect(ja.title).toBe("カピバラ温泉の予約");
  });

  it("empty q returns the most recent public challenges, limited", async () => {
    const recent = await seed({ ja: { title: "最新" }, en: { title: "newest" }, updatedAt: new Date("2099-01-01T00:00:00Z") });
    const r = await searchChallenges("", { limit: 3 });
    expect(r).toHaveLength(3);
    expect(r[0].id).toBe(recent.id);
  });
});

describe("GET /api/challenges/search", () => {
  const call = (qs: string) => GET(new Request(`http://localhost/api/challenges/search${qs}`));

  it("returns results as JSON with no-store", async () => {
    const b = await seed({ ja: { title: "フラミンゴの在庫" }, en: { title: "Flamingo stock" }, city: "札幌" });
    const res = await call(`?q=${encodeURIComponent("flamingo sapporo")}&locale=en`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = (await res.json()) as { results: { id: string; title: string }[] };
    expect(body.results).toEqual([expect.objectContaining({ id: b.id, title: "Flamingo stock", city: "札幌" })]);

    const ja = (await (await call(`?q=${encodeURIComponent("札幌 フラミンゴ")}&locale=ja`)).json()) as { results: { title: string }[] };
    expect(ja.results[0].title).toBe("フラミンゴの在庫");
  });

  it("defaults: empty q, limit 6", async () => {
    for (let i = 0; i < 7; i++) await seed({ ja: { title: `埋め ${i}` }, en: { title: `filler ${i}` } });
    const body = (await (await call("")).json()) as { results: unknown[] };
    expect(body.results).toHaveLength(6);
  });

  it("validates input", async () => {
    expect((await call("?limit=21")).status).toBe(400);
    expect((await call("?limit=0")).status).toBe(400);
    expect((await call("?locale=fr")).status).toBe(400);
    const ok = await call("?limit=20");
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { results: unknown[] }).results.length).toBeLessThanOrEqual(20);
  });
});
