import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { getDb, schema } from "@/lib/db";
import type { Prebaked } from "@/lib/grounding/prebaked";
import type { SearchFn } from "@/lib/grounding/search";
import { UngroundedError, buildInventPrompt, generateGrounded, parseDownloadedRows } from "@/lib/integrations/adaption";
import { processBrief, reEnrichBrief, startReEnrichment, type PipelineDeps } from "@/lib/pipeline/brief";
import { makeBrief } from "./helpers";

const goodSearch: SearchFn = async (q) => ({
  ok: true,
  results: [
    { title: `札幌 ${q}`, url: `https://city.sapporo.jp/${encodeURIComponent(q)}`, snippet: "札幌市のラーメン店の統計" },
  ],
});
const emptyDir = () => mkdtempSync(path.join(tmpdir(), "yk-prebaked-"));
const rows = [{ prompt: "明日19時に4名で予約できますか？", completion: "ご予約承りました。" }];
const review = {
  recommendation: "approve" as const,
  score: 80,
  issues: [],
  pii_found: false,
  grounding_comment: "ok",
  skills_needed: ["line-bot"],
  normalized: {
    ja: { title: "予約自動化", problem: "p", current_process: "c", desired_outcome: "d" },
    en: { title: "Automate bookings", problem: "p", current_process: "c", desired_outcome: "d" },
  },
};

function deps(over: Partial<PipelineDeps> = {}): Partial<PipelineDeps> {
  return {
    search: goodSearch,
    findExisting: vi.fn(async () => null),
    generateGrounded: vi.fn(async () => ({ id: "ds_new", name: "yukikaki:ramen:sapporo" })),
    waitForRows: vi.fn(async () => rows),
    reviewBrief: vi.fn(async () => review),
    prebakedDir: emptyDir(),
    adaptionWaitMs: 1_000,
    liveOnly: false,
    ...over,
  };
}

async function load(briefId: string) {
  const db = getDb();
  const [brief] = await db.select().from(schema.briefs).where(eq(schema.briefs.id, briefId));
  const sources = await db.select().from(schema.dataSources).where(eq(schema.dataSources.briefId, briefId));
  return { brief, live: sources.filter((s) => s.kind === "live"), synthetic: sources.filter((s) => s.kind === "synthetic") };
}

describe("processBrief", () => {
  it("all services up: grounded, generated from grounding, reviewed, in_review", async () => {
    const { brief } = await makeBrief("draft");
    const d = deps();
    await processBrief(brief.id, d);
    const r = await load(brief.id);
    expect(r.brief.status).toBe("in_review");
    expect(r.brief.groundingLevel).toBe("exact");
    expect(r.live.length).toBeGreaterThanOrEqual(2);
    expect(r.synthetic).toHaveLength(1);
    expect(r.synthetic[0]).toMatchObject({ provider: "adaption", externalId: "ds_new", pending: false, payloadPath: null });
    expect(r.synthetic[0].payload).toMatchObject({ generatedBy: "adaption", externalId: "ds_new", rows });
    expect(r.synthetic[0].groundedOn.sort()).toEqual(r.live.map((l) => l.id).sort());
    expect(d.generateGrounded).toHaveBeenCalledWith(expect.anything(), expect.arrayContaining([expect.objectContaining({ url: expect.stringContaining("sapporo") })]), expect.anything());
    expect(r.brief.aiReview).toMatchObject({ recommendation: "approve", score: 80 });
    expect(r.brief.content.en.title).toBe("Automate bookings");
    expect(r.brief.skillsNeeded).toEqual(["line-bot"]);
  });

  it("reuses an existing Adaption dataset instead of generating", async () => {
    const { brief } = await makeBrief("draft");
    const d = deps({ findExisting: vi.fn(async () => ({ id: "ds_old", name: "yukikaki:ramen:sapporo" })) });
    await processBrief(brief.id, d);
    const r = await load(brief.id);
    expect(d.generateGrounded).not.toHaveBeenCalled();
    expect(r.synthetic[0]).toMatchObject({ externalId: "ds_old" });
    expect(r.synthetic[0].title).toMatch(/reused/);
  });

  it("ungrounded: no synthetic data is generated and the host is told", async () => {
    const { brief } = await makeBrief("draft");
    const d = deps({ search: async () => ({ ok: true, results: [] }) });
    await processBrief(brief.id, d);
    const r = await load(brief.id);
    expect(r.brief.status).toBe("in_review");
    expect(r.brief.groundingLevel).toBe("ungrounded");
    expect(r.synthetic).toHaveLength(0);
    expect(d.findExisting).not.toHaveBeenCalled();
    expect(d.generateGrounded).not.toHaveBeenCalled();
    expect(r.brief.aiReview?.issues?.join(" ")).toMatch(/Ungrounded/);
  });

  it("all services down: still lands in in_review with errors recorded", async () => {
    const { brief } = await makeBrief("draft");
    const fail = async () => {
      throw new Error("down");
    };
    await processBrief(brief.id, deps({ search: async () => ({ ok: false, results: [] }), reviewBrief: fail, findExisting: fail }));
    const r = await load(brief.id);
    expect(r.brief.status).toBe("in_review");
    expect(r.brief.aiReview?.recommendation).toBeNull();
    expect(r.brief.aiReview?.error).toMatch(/AI review unavailable/);
    expect(r.brief.skillsNeeded.length).toBeGreaterThan(0);
  });

  it("mixed: Linkup down → pre-baked reference data, labelled as reference", async () => {
    const { brief } = await makeBrief("draft", { industry: "ramen" });
    const dir = emptyDir();
    const pre: Prebaked = {
      slug: "other-ramen",
      industry: "ramen",
      industryKey: "ramen",
      city: "Asahikawa",
      groundingLevel: "analog",
      live: [{ title: "旭川 ラーメン", url: "https://www.city.asahikawa.hokkaido.jp/a", snippet: "旭川", matchedCity: "Asahikawa", level: "analog", foundBy: "linkup" }],
      synthetic: { name: "yukikaki:ramen:asahikawa", externalId: "ds_pre", generatedBy: "adaption", rows },
      generatedAt: "2026-11-25T00:00:00Z",
    };
    writeFileSync(path.join(dir, "other-ramen.json"), JSON.stringify(pre));
    const d = deps({ search: async () => ({ ok: false, results: [] }), prebakedDir: dir });
    await processBrief(brief.id, d);
    const r = await load(brief.id);
    expect(r.brief.groundingLevel).toBe("analog");
    expect(r.live[0]).toMatchObject({ provider: "prebaked", isReference: true });
    expect(r.synthetic[0]).toMatchObject({ provider: "prebaked", isReference: true });
    expect(r.synthetic[0].payload?.rows).toEqual(rows);
    expect(d.generateGrounded).not.toHaveBeenCalled();
    expect(r.brief.aiReview?.issues?.join(" ")).toMatch(/reference/);
  });

  it("mixed: Adaption down → pre-baked reference stand-in data, grounding stays live", async () => {
    const { brief } = await makeBrief("draft", { industry: "ramen" });
    const dir = emptyDir();
    writeFileSync(
      path.join(dir, "x.json"),
      JSON.stringify({
        slug: "x", industry: "ramen", industryKey: "ramen", city: "Sapporo", groundingLevel: "exact",
        live: [], synthetic: { name: "n", generatedBy: "adaption", rows }, generatedAt: "2026-11-25",
      }),
    );
    await processBrief(brief.id, deps({ prebakedDir: dir, findExisting: async () => { throw new Error("adaption down"); } }));
    const r = await load(brief.id);
    expect(r.live.every((l) => l.provider === "linkup")).toBe(true);
    expect(r.synthetic[0]).toMatchObject({ provider: "prebaked", isReference: true });
    expect(r.synthetic[0].payload?.rows).toEqual(rows);
  });

  it("live-only mode: a failed Linkup call never falls back to pre-baked data", async () => {
    const { brief } = await makeBrief("draft", { industry: "ramen" });
    const dir = emptyDir();
    writeFileSync(
      path.join(dir, "x.json"),
      JSON.stringify({
        slug: "x", industry: "ramen", industryKey: "ramen", city: "Sapporo", groundingLevel: "exact",
        live: [{ title: "t", url: "https://e.jp", snippet: "s", matchedCity: "Sapporo", level: "exact", foundBy: "manual" }],
        synthetic: { name: "n", generatedBy: "seed", rows }, generatedAt: "2026-11-25",
      }),
    );
    await processBrief(brief.id, deps({ liveOnly: true, prebakedDir: dir, search: async () => ({ ok: false, results: [] }) }));
    const r = await load(brief.id);
    expect(r.brief.status).toBe("in_review");
    expect(r.live).toHaveLength(0);
    expect(r.synthetic).toHaveLength(0);
    expect(r.brief.aiReview?.issues?.join(" ")).toMatch(/live-only/);
  });

  it("Adaption still generating → stored as pending", async () => {
    const { brief } = await makeBrief("draft");
    await processBrief(brief.id, deps({ waitForRows: vi.fn(async () => null) }));
    const r = await load(brief.id);
    expect(r.synthetic[0]).toMatchObject({ pending: true, payload: null });
  });
});

describe("Adaption helpers", () => {
  it("refuses to generate without grounding facts", async () => {
    await expect(generateGrounded({ briefId: "b", industry: "ramen", city: "Sapporo", problem: "x" }, [])).rejects.toBeInstanceOf(UngroundedError);
  });

  it("weaves grounding facts into the generation prompt", () => {
    const p = buildInventPrompt({ briefId: "b", industry: "ramen", city: "Sapporo", problem: "reservations" }, [
      { title: "Sapporo stats", url: "https://example.jp/s", snippet: "1,234 shops" },
    ]);
    expect(p).toContain("https://example.jp/s");
    expect(p).toContain("1,234 shops");
    expect(p).toMatch(/FICTIONAL/);
  });

  it("parses JSON array, {rows} and JSONL downloads", () => {
    expect(parseDownloadedRows(JSON.stringify([{ enhanced_prompt: "a", enhanced_completion: "b" }]))).toEqual([{ prompt: "a", completion: "b" }]);
    expect(parseDownloadedRows(JSON.stringify({ rows: [{ prompt: "a", completion: "b" }] }))).toHaveLength(1);
    expect(parseDownloadedRows('{"prompt":"a","completion":"b"}\n{"prompt":"c","completion":"d"}')).toHaveLength(2);
  });
});

describe("reEnrichBrief", () => {
  it("re-runs a live-only failure: in_review → enriching → in_review with fresh grounding", async () => {
    const { brief } = await makeBrief("draft");
    await processBrief(brief.id, deps({ liveOnly: true, search: async () => ({ ok: false, results: [] }) }));
    let r = await load(brief.id);
    expect(r.brief.status).toBe("in_review");
    expect(r.brief.aiReview?.issues?.join(" ")).toMatch(/Re-run enrichment/);
    expect(r.live).toHaveLength(0);

    const d = deps({ liveOnly: true });
    expect(await reEnrichBrief(brief.id, d)).toBe(true);
    r = await load(brief.id);
    expect(r.brief.status).toBe("in_review");
    expect(r.brief.groundingLevel).toBe("exact");
    expect(r.live.length).toBeGreaterThanOrEqual(1);
    expect(r.synthetic).toHaveLength(1);
    expect(r.brief.aiReview?.issues?.join(" ") ?? "").not.toMatch(/Re-run enrichment/);
    expect(d.reviewBrief).toHaveBeenCalledOnce();
  });

  it("refuses briefs that are not in review", async () => {
    const { brief } = await makeBrief("approved");
    const d = deps();
    expect(await reEnrichBrief(brief.id, d)).toBe(false);
    expect((await load(brief.id)).brief.status).toBe("approved");
    expect(d.reviewBrief).not.toHaveBeenCalled();
  });
});

describe("stuck enrichment retry", () => {
  const backdate = (id: string, minutesAgo: number) =>
    getDb().update(schema.briefs).set({ updatedAt: new Date(Date.now() - minutesAgo * 60_000) }).where(eq(schema.briefs.id, id));

  it("retries a brief stuck in enriching for over 10 minutes: enriching → enriching → in_review", async () => {
    const { brief } = await makeBrief("enriching");
    await backdate(brief.id, 11);
    const d = deps();
    expect(await startReEnrichment(brief.id)).toBe(true);
    expect((await load(brief.id)).brief.status).toBe("enriching");
    expect(await startReEnrichment(brief.id)).toBe(false); // claim bumped updatedAt: no parallel second run
    expect(await reEnrichBrief(brief.id, d, { alreadyStarted: true })).toBe(true);
    const r = await load(brief.id);
    expect(r.brief.status).toBe("in_review");
    expect(r.brief.groundingLevel).toBe("exact");
    expect(d.reviewBrief).toHaveBeenCalledOnce();
  });

  it("retries a brief stuck in draft", async () => {
    const { brief } = await makeBrief("draft");
    await backdate(brief.id, 30);
    expect(await reEnrichBrief(brief.id, deps())).toBe(true);
    expect((await load(brief.id)).brief.status).toBe("in_review");
  });

  it("does not claim a brief that is still enriching within 10 minutes", async () => {
    const { brief } = await makeBrief("enriching");
    await backdate(brief.id, 5);
    const d = deps();
    expect(await reEnrichBrief(brief.id, d)).toBe(false);
    expect((await load(brief.id)).brief.status).toBe("enriching");
    expect(d.reviewBrief).not.toHaveBeenCalled();
  });

  it("a failing pipeline still lands the retried brief in in_review", async () => {
    const { brief } = await makeBrief("enriching");
    await backdate(brief.id, 15);
    const boom = async () => {
      throw new Error("boom");
    };
    await reEnrichBrief(brief.id, deps({ search: boom, findExisting: boom, reviewBrief: boom }));
    const r = await load(brief.id);
    expect(r.brief.status).toBe("in_review");
    expect(r.brief.aiReview?.recommendation).toBeNull();
  });
});
