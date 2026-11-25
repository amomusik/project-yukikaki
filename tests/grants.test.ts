import { desc, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { getDb, schema } from "@/lib/db";
import { areaMatch, findPrefecture } from "@/lib/grants/areas";
import { daysLeft, formatDateJst, formatYen, grantlineUrl } from "@/lib/grants/format";
import {
  buildSearchUrl,
  fetchSubsidies,
  JGrantsError,
  parseSubsidiesResponse,
  parseSubsidyDetailResponse,
  searchSubsidies,
  validateKeyword,
  type JGrantDetail,
  type JGrantSummary,
} from "@/lib/grants/jgrants";
import {
  detectThemes,
  inferIssuer,
  isPastFiscalYear,
  isTopical,
  linkupMatches,
  matchGrants,
  parseDeadline,
  planGrantQueries,
  programmeKey,
  rankCandidates,
  titleMunicipality,
  type BriefForMatching,
  type Candidate,
  type GrantMatch,
} from "@/lib/grants/match";
import { getGrantMatches, listOpenGrants, refreshGrantMatches, replaceGrantMatches } from "@/lib/grants/store";
import searchFixture from "./fixtures/jgrants-search.json";
import detailFixture from "./fixtures/jgrants-detail.json";
import { makeBrief } from "./helpers";

const NOW = new Date("2026-11-26T03:00:00Z");
const DAY = 86_400_000;

const bakery: BriefForMatching = {
  city: "Setagaya",
  industry: "bakery",
  text: "AIでレジデータから仕込み量を予測し、在庫が減ったら発注書を自動作成したい。手作業の発注をなくしたい。",
};

function summary(over: Partial<JGrantSummary> & { id: string; title: string }): JGrantSummary {
  return { number: null, area: "全国", maxAmount: null, start: new Date(NOW.getTime() - 30 * DAY), end: new Date(NOW.getTime() + 40 * DAY), employees: null, institution: null, ...over };
}
function detail(s: JGrantSummary, over: Partial<JGrantDetail> = {}): JGrantDetail {
  return { ...s, catchPhrase: null, usePurpose: null, industry: null, areaDetail: null, subsidyRate: "1/2", url: `https://www.jgrants-portal.go.jp/subsidy/${s.id}`, description: null, ...over };
}
const pool = (cs: Candidate[]) => new Map(cs.map((c) => [c.summary.id, c]));

/* ── Client parsing ─────────────────────────────────────────────────── */
describe("jGrants client parsing", () => {
  it("parses the live search fixture into normalised summaries", () => {
    const rows = parseSubsidiesResponse(searchFixture);
    expect(rows).toHaveLength(6);
    expect(rows[0]).toMatchObject({ id: "a0WJ200000CDeYeMAL", area: "東京都", maxAmount: 30_000_000 });
    expect(rows[0].title).toContain("DX");
    expect(rows[0].end?.toISOString()).toBe("2026-11-30T14:59:00.000Z");
    // jGrants uses 0 for "no stated cap".
    expect(rows.find((r) => r.id === "a0WJ200000CDZ2OMAX")?.maxAmount).toBeNull();
  });

  it("drops rows that fail validation instead of inventing fields", () => {
    const rows = parseSubsidiesResponse({ metadata: {}, result: [{ id: "x1", title: "" }, { id: "x2", title: "OK補助金", subsidy_max_limit: "1,000,000" }] });
    expect(rows).toEqual([expect.objectContaining({ id: "x2", maxAmount: 1_000_000, area: null, end: null })]);
  });

  it("rejects a response without a result array", () => {
    expect(() => parseSubsidiesResponse({ message: "Bad request" })).toThrow();
  });

  it("parses the live detail fixture (rate, official URL, industry, stripped HTML)", () => {
    const d = parseSubsidyDetailResponse(detailFixture)!;
    expect(d.id).toBe("a0WJ200000CDVkeMAH");
    expect(d.subsidyRate).toBe("1/2 もしくは 2/3");
    expect(d.maxAmount).toBe(35_000_000);
    expect(d.url).toBe("https://www.jgrants-portal.go.jp/subsidy/a0WJ200000CDVkeMAH");
    expect(d.industry).toContain("卸売業、小売業");
    expect(d.description ?? "").not.toMatch(/<[a-z]/i);
    expect(parseSubsidyDetailResponse({ result: [] })).toBeNull();
  });

  it("never trusts a non-portal detail URL", () => {
    const json = structuredClone(detailFixture) as { result: Record<string, unknown>[] };
    json.result[0].front_subsidy_detail_page_url = "https://evil.example.com/x";
    expect(parseSubsidyDetailResponse(json)!.url).toBe("https://www.jgrants-portal.go.jp/subsidy/a0WJ200000CDVkeMAH");
  });

  it("builds URLs with all required params and validates keywords", () => {
    const u = new URL(buildSearchUrl({ keyword: "省力化" }));
    expect(u.origin + u.pathname).toBe("https://api.jgrants-portal.go.jp/exp/v1/public/subsidies");
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ keyword: "省力化", acceptance: "1", sort: expect.any(String), order: expect.any(String) });
    expect(() => validateKeyword("a")).toThrow(JGrantsError);
    expect(() => validateKeyword("IT 導入")).toThrow(/no spaces/);
  });

  it("retries HTTP 429 with backoff, then throws on other errors", async () => {
    const ok = new Response(JSON.stringify(searchFixture), { status: 200 });
    const f = vi.fn().mockResolvedValueOnce(new Response("", { status: 429 })).mockResolvedValueOnce(ok);
    const rows = await fetchSubsidies({ keyword: "DX" }, { fetchImpl: f as unknown as typeof fetch, minIntervalMs: 0, retryBaseMs: 1 });
    expect(f).toHaveBeenCalledTimes(2);
    expect(rows).toHaveLength(6);

    const bad = vi.fn().mockResolvedValue(new Response('{"message":"Bad request"}', { status: 400 }));
    await expect(fetchSubsidies({ keyword: "DX" }, { fetchImpl: bad as unknown as typeof fetch, minIntervalMs: 0 })).rejects.toThrow(/HTTP 400/);
  });

  it("guarded search logs a jgrants service event and surfaces failures (live-only)", async () => {
    const down = vi.fn().mockResolvedValue(new Response("upstream down", { status: 503 }));
    await expect(searchSubsidies({ keyword: "DX" }, { fetchImpl: down as unknown as typeof fetch, minIntervalMs: 0 })).rejects.toThrow(JGrantsError);
    const [ev] = await getDb().select().from(schema.serviceEvents).where(eq(schema.serviceEvents.service, "jgrants")).orderBy(desc(schema.serviceEvents.createdAt)).limit(1);
    expect(ev).toMatchObject({ service: "jgrants", operation: "search", ok: false });
    expect(ev.error).toMatch(/503/);
  });
});

/* ── Planning, areas, ranking ──────────────────────────────────────── */
describe("grant matching", () => {
  it("maps cities to jGrants prefectures and regions", () => {
    const tokyo = findPrefecture("Tokyo");
    expect(tokyo).toMatchObject({ ja: "東京都", region: "関東・甲信越地方" });
    expect(areaMatch("東京都", tokyo)).toBe("prefecture");
    expect(areaMatch("茨城県 / 東京都 / 神奈川県", tokyo)).toBe("prefecture");
    expect(areaMatch("関東・甲信越地方", tokyo)).toBe("region");
    expect(areaMatch("全国", tokyo)).toBe("national");
    expect(areaMatch("福岡県", tokyo)).toBeNull();
    expect(areaMatch("北海道", undefined)).toBeNull();
  });

  it("plans a few searches from problem themes + industry, with the brief's prefecture", () => {
    const plan = planGrantQueries({ city: "Sapporo", industry: "snow_removal", text: "LINEで依頼を自動受付し、手作業の配車をなくしたい。Excel台帳。" });
    expect(plan.prefecture?.ja).toBe("北海道");
    expect(plan.queries.length).toBeLessThanOrEqual(4);
    expect(plan.queries).toEqual(expect.arrayContaining(["DX", "除雪"]));
    expect(plan.queries.every((q) => q.length >= 2 && !/\s/.test(q))).toBe(true);
    expect(detectThemes("inbound tourists need English menus")).toContain("インバウンド");
  });

  it("detects municipalities and issuers in titles", () => {
    expect(titleMunicipality("【長野県茅野市】中小企業人材育成等支援補助金")).toBe("長野県茅野市");
    expect(titleMunicipality("都城市中小企業退職金等共済加入促進事業補助金（令和８年度）")).toBe("都城市");
    expect(titleMunicipality("令和８年度　世田谷区商店街支援補助金")).toBe("世田谷区");
    expect(titleMunicipality("観光関連事業者のDX・経営力強化支援事業補助金")).toBeNull();
    expect(inferIssuer("【経済産業省】ものづくり補助金", "全国")).toBeNull();
    expect(inferIssuer("東京都中小企業DX補助金", "東京都")).toBe("東京都");
  });

  it("ranks by area + keyword overlap + deadline and filters expired, out-of-area and ineligible calls", () => {
    const plan = planGrantQueries(bakery);
    const s = {
      tokyoDx: summary({ id: "tokyo-dx", title: "東京都 小売業の生産性向上・IT導入支援補助金", area: "東京都", maxAmount: 3_000_000 }),
      national: summary({ id: "national", title: "IT導入補助金2026", area: "全国", maxAmount: 4_500_000, end: new Date(NOW.getTime() + 120 * DAY) }),
      kanto: summary({ id: "kanto", title: "食品小売DX支援", area: "関東・甲信越地方" }),
      setagaya: summary({ id: "setagaya", title: "【世田谷区】区内小売店舗の生産性向上補助金", area: "東京都" }),
      expired: summary({ id: "expired", title: "東京都 IT導入補助金（終了）", area: "東京都", end: new Date(NOW.getTime() - DAY) }),
      notYet: summary({ id: "not-yet", title: "IT導入補助金（次回）", start: new Date(NOW.getTime() + 5 * DAY) }),
      fukuoka: summary({ id: "fukuoka", title: "福岡県 IT導入補助金", area: "福岡県" }),
      otherWard: summary({ id: "minato", title: "【港区】中小企業IT導入補助金", area: "東京都" }),
      notice: summary({ id: "notice", title: "デジタル技術活用推進助成金に係る状況報告等について", area: "東京都" }),
      medical: summary({ id: "medical", title: "医療分野における業務効率化・IT導入支援事業", area: "東京都" }),
    };
    const ranked = rankCandidates(
      pool([
        { summary: s.tokyoDx, hits: 2, detail: detail(s.tokyoDx, { industry: "卸売業、小売業 / 製造業" }) },
        { summary: s.national, hits: 1, detail: detail(s.national) },
        { summary: s.kanto, hits: 1 },
        { summary: s.setagaya, hits: 1 },
        { summary: s.expired, hits: 3 },
        { summary: s.notYet, hits: 1 },
        { summary: s.fukuoka, hits: 1 },
        { summary: s.otherWard, hits: 1 },
        { summary: s.notice, hits: 1 },
        { summary: s.medical, hits: 1, detail: detail(s.medical, { industry: "医療、福祉" }) },
      ]),
      plan,
      { now: NOW },
    );
    const ids = ranked.map((m) => m.externalId);
    expect(ids).toEqual(expect.arrayContaining(["tokyo-dx", "national", "kanto", "setagaya"]));
    for (const gone of ["expired", "not-yet", "fukuoka", "minato", "notice", "medical"]) expect(ids).not.toContain(gone);
    // Prefecture/municipal + strong keyword overlap beats a nationwide call.
    expect(ids.indexOf("tokyo-dx")).toBeLessThan(ids.indexOf("national"));
    expect(ids.indexOf("setagaya")).toBeLessThan(ids.indexOf("national"));
    expect(ranked.find((m) => m.externalId === "tokyo-dx")).toMatchObject({ subsidyRate: "1/2", amountMax: 3_000_000, url: expect.stringContaining("jgrants-portal.go.jp/subsidy/tokyo-dx") });
    expect(ranked.length).toBeLessThanOrEqual(5);
  });

  it("ranks generic off-topic schemes below topical ones and drops the weak ones", () => {
    const snow: BriefForMatching = { city: "Sapporo", industry: "snow_removal", text: "LINEで除雪依頼を自動受付し、手作業の配車をなくしたい。Excel台帳。" };
    const ramen: BriefForMatching = { city: "Sapporo", industry: "ramen", text: "券売機の売上データで仕込み量を予測し、手作業の発注をなくしたい。" };
    const ALL_INDUSTRIES = "漁業 / 建設業 / 製造業 / 情報通信業 / 運輸業、郵便業 / 卸売業、小売業 / 宿泊業、飲食サービス業 / 医療、福祉 / 農業、林業";
    const smokingDesc =
      "■目的・概要\nこの助成金は、中小企業事業主による受動喫煙防止のための施設設備の整備に対し助成する。\n" +
      "（１）健康増進法で定める既存特定飲食提供施設を営む\n（３）以下の表のいずれかに該当する中小企業事業主\n" +
      "小売業\n小売業、飲食店、配達飲食サービス業\n50人以下\nサービス業\n物品賃貸業、宿泊業、娯楽業、医療・福祉\n" +
      "その他の業種\n農業、林業、漁業、建設業、製造業、\n運輸業、金融業、保険業など\n300人以下";
    const s = {
      smoking: summary({ id: "smoking", title: "令和8年度_受動喫煙防止対策助成金", maxAmount: 1_000_000, end: new Date(NOW.getTime() + 66 * DAY) }),
      gxdx: summary({ id: "gxdx", title: "令和8年度　建築GX・DX推進事業", end: new Date(NOW.getTime() + 35 * DAY) }),
      hokkaido: summary({ id: "hokkaido", title: "北海道中小企業経営基盤強化補助金", area: "北海道", maxAmount: 2_000_000, end: new Date(NOW.getTime() + 30 * DAY) }),
    };
    const smokingDetail = detail(s.smoking, { usePurpose: "設備整備・IT導入をしたい", industry: ALL_INDUSTRIES, description: smokingDesc });
    const candidates = [
      { summary: s.smoking, hits: 1, detail: smokingDetail },
      { summary: s.gxdx, hits: 2, detail: detail(s.gxdx, { industry: "建設業", description: "建設業の生産性向上に資するDXの取組を支援" }) },
      { summary: s.hokkaido, hits: 1, detail: detail(s.hokkaido, { usePurpose: "設備整備・IT導入をしたい", industry: ALL_INDUSTRIES, description: "道内中小企業の経営基盤の強化を支援します。" }) },
    ];
    const snowPlan = planGrantQueries(snow);
    // The industry field and the SME size table list 建設業, and the use-purpose tag says IT導入: none of that is topical.
    expect(isTopical(candidates[0], snowPlan)).toBe(false);
    expect(isTopical(candidates[1], snowPlan)).toBe(true);
    const ids = rankCandidates(pool(candidates), snowPlan, { now: NOW }).map((m) => m.externalId);
    expect(ids).not.toContain("smoking"); // national + off-topic: under the floor
    expect(ids).toEqual(["gxdx", "hokkaido"]); // prefecture-level but off-topic: kept, ranked below the topical call
    // For a restaurant the same scheme is topical (it targets 飲食提供施設) and stays.
    const ramenPlan = planGrantQueries(ramen);
    expect(isTopical(candidates[0], ramenPlan)).toBe(true);
    expect(rankCandidates(pool([candidates[0]]), ramenPlan, { now: NOW }).map((m) => m.externalId)).toEqual(["smoking"]);
  });

  it("collapses multiple application rounds of one programme into the soonest open round", () => {
    expect(programmeKey("【経済産業省】ものづくり・商業・サービス生産性向上促進補助金（20次締切）")).toBe(
      programmeKey("【経済産業省】ものづくり・商業・サービス生産性向上促進補助金（23次締切）"),
    );
    expect(programmeKey("観光DX補助金（令和８年度第２回募集）")).toBe(programmeKey("観光DX補助金（令和８年度第１回募集）"));
    const plan = planGrantQueries(bakery);
    const r20 = summary({ id: "r20", title: "小売業 生産性向上補助金（20次締切）", end: new Date(NOW.getTime() + 30 * DAY) });
    const r21 = summary({ id: "r21", title: "小売業 生産性向上補助金（21次締切）", end: new Date(NOW.getTime() + 120 * DAY) });
    const ranked = rankCandidates(pool([{ summary: r21, hits: 1 }, { summary: r20, hits: 1 }]), plan, { now: NOW });
    expect(ranked.map((m) => m.externalId)).toEqual(["r20"]);
  });

  it("parses closing dates in snippets and drops expired municipal pages", () => {
    expect(parseDeadline("申請受付期間：令和8年12月25日まで")?.toISOString()).toBe("2026-12-25T14:59:00.000Z");
    expect(parseDeadline("締切 2026年4月1日")?.toISOString()).toBe("2026-04-01T14:59:00.000Z");
    expect(isPastFiscalYear("令和７年度 補助金", NOW)).toBe(true);
    expect(isPastFiscalYear("令和8年度 補助金", NOW)).toBe(false);
    expect(isPastFiscalYear("補助金のご案内", NOW)).toBe(false);
    const plan = planGrantQueries(bakery);
    const out = linkupMatches(
      [
        { title: "世田谷区 店舗改装補助金", url: "https://www.city.setagaya.lg.jp/a.html", snippet: "世田谷区の補助金。締切 令和8年12月25日まで" },
        { title: "世田谷区 昨年度補助金", url: "https://www.city.setagaya.lg.jp/b.html", snippet: "世田谷区の補助金。締切 令和7年3月31日まで" },
        { title: "世田谷区 補助金まとめ", url: "https://subsidy-blog.example.com/c", snippet: "世田谷区の補助金" },
        { title: "補助金見直し検討状況について", url: "https://www.city.setagaya.lg.jp/d.html", snippet: "世田谷区の補助金" },
        { title: "【８年度募集は終了しました】世田谷区 活性化補助金", url: "https://www.city.setagaya.lg.jp/e.html", snippet: "世田谷区の補助金" },
        { title: "令和7年度世田谷区中小事業者経営支援補助金のご案内", url: "https://www.city.setagaya.lg.jp/f.html", snippet: "世田谷区の補助金" },
      ],
      plan,
      ["lg.jp", "go.jp"],
      NOW,
    );
    expect(out.map((m) => m.url)).toEqual(["https://www.city.setagaya.lg.jp/a.html"]);
    expect(out[0]).toMatchObject({ source: "linkup", deadline: new Date("2026-12-25T14:59:00.000Z") });
  });

  it("dedupes across searches, fetches details for the shortlist, and treats Linkup as optional", async () => {
    const a = summary({ id: "A", title: "小売業 IT導入 生産性向上補助金", area: "東京都" });
    const b = summary({ id: "B", title: "全国 IT導入補助金", area: "全国" });
    const search = vi.fn(async () => [a, b]);
    const detailFn = vi.fn(async (id: string) => detail(id === "A" ? a : b));
    const r = await matchGrants(bakery, {
      search,
      detail: detailFn,
      linkup: async () => {
        throw new Error("linkup down");
      },
      now: NOW,
    });
    expect(search.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(r.matches.map((m) => m.externalId)).toEqual(["A", "B"]); // deduped
    expect(detailFn).toHaveBeenCalledTimes(2);
    expect(r.prefecture).toBe("東京都");
    expect(r.warnings).toEqual([expect.stringContaining("linkup down")]);
  });

  it("surfaces jGrants failures instead of returning stand-in data", async () => {
    await expect(
      matchGrants(bakery, {
        search: async () => {
          throw new JGrantsError("jGrants search failed: HTTP 503");
        },
        now: NOW,
      }),
    ).rejects.toThrow(/503/);
  });

  it("formats amounts, dates and the Grantline hand-off", () => {
    expect(formatYen(35_000_000, "ja")).toBe("3,500万円");
    expect(formatYen(35_000_000, "en")).toBe("¥35,000,000");
    expect(formatYen(null, "en")).toBeNull();
    expect(formatDateJst(new Date("2026-12-28T15:30:00Z"))).toBe("2026-12-29");
    expect(daysLeft(new Date(NOW.getTime() + 2.5 * DAY), NOW)).toBe(3);
    expect(grantlineUrl("en")).toBe("https://grantline.foundrylabs.co.jp/en/grants");
    expect(grantlineUrl("ja")).toBe("https://grantline.foundrylabs.co.jp/ja/grants");
  });
});

describe("graph projection", () => {
  it("projects matched grants as Funder nodes with FUNDS edges, replacing stale grant edges", async () => {
    const { grantStatements } = await import("@/lib/graph/cypher");
    const st = grantStatements("c1", [{ id: "grant:jgrants:A", name: "IT導入補助金", provider: "jgrants", issuer: null, url: "https://www.jgrants-portal.go.jp/subsidy/A", deadline: null, amountMax: 1 }]);
    const cypher = st.map((s) => s.query).join("\n");
    expect(cypher).toMatch(/DELETE r/);
    expect(cypher).toMatch(/MERGE \(f:Funder \{id: g\.id\}\)/);
    expect(cypher).toMatch(/MERGE \(f\)-\[:FUNDS\]->\(c\)/);
    expect(cypher).not.toContain("IT導入補助金"); // values are parameters
  });
});

/* ── Persistence ───────────────────────────────────────────────────── */
describe("grant_matches store", () => {
  const m = (over: Partial<GrantMatch>): GrantMatch => ({
    source: "jgrants",
    externalId: "X",
    title: "t",
    issuer: null,
    url: "https://www.jgrants-portal.go.jp/subsidy/X",
    amountMax: 1_000_000,
    subsidyRate: "1/2",
    deadline: new Date(Date.now() + 10 * DAY),
    area: "東京都",
    score: 5,
    ...over,
  });

  it("replaces matches per brief and hides expired ones", async () => {
    const { brief } = await makeBrief("approved", { city: "Setagaya", industry: "bakery" });
    await replaceGrantMatches(brief.id, [m({ externalId: "old" })]);
    await replaceGrantMatches(brief.id, [m({ externalId: "open", score: 7 }), m({ externalId: "gone", deadline: new Date(Date.now() - DAY) }), m({ externalId: "rolling", deadline: null, score: 1 })]);
    const open = await getGrantMatches(brief.id);
    expect(open.map((g) => g.externalId)).toEqual(["open", "rolling"]);
    expect((await getGrantMatches(brief.id, { includeExpired: true })).length).toBe(3);
  });

  it("lists open grants only for published challenges", async () => {
    const pub = await makeBrief("approved");
    const draft = await makeBrief("in_review");
    await replaceGrantMatches(pub.brief.id, [m({ externalId: "pub-grant" })]);
    await replaceGrantMatches(draft.brief.id, [m({ externalId: "draft-grant" })]);
    const ids = (await listOpenGrants()).map((g) => g.externalId);
    expect(ids).toContain("pub-grant");
    expect(ids).not.toContain("draft-grant");
  });

  it("refresh persists live results and keeps previous matches when jGrants fails", async () => {
    const { brief } = await makeBrief("in_review", { city: "Setagaya", industry: "bakery" });
    const a = summary({ id: "R1", title: "小売業 IT導入 生産性向上補助金", area: "東京都", end: new Date(Date.now() + 20 * DAY), start: new Date(Date.now() - DAY) });
    const r = await refreshGrantMatches(brief.id, { search: async () => [a], detail: async () => detail(a), sync: false });
    expect(r.count).toBe(1);
    expect(r.warnings.join(" ")).toMatch(/linkup/); // not configured in tests → reported, not faked
    expect((await getGrantMatches(brief.id)).map((g) => g.externalId)).toEqual(["R1"]);

    await expect(
      refreshGrantMatches(brief.id, {
        search: async () => {
          throw new JGrantsError("HTTP 503");
        },
        sync: false,
      }),
    ).rejects.toThrow();
    expect((await getGrantMatches(brief.id)).map((g) => g.externalId)).toEqual(["R1"]);
  });
});
