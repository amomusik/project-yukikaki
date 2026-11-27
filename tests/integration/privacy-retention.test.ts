import { eq, inArray } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getDb, schema } from "@/lib/db";
import { createFeedbackToken, submitEvaluation } from "@/lib/feedback";
import { impactStats, totalHoursSaved } from "@/lib/queries";
import { runRetention } from "@/lib/retention";
import { listTestimonials, verifyWithdrawSig, withdrawQuote, withdrawQuoteUrl, withdrawUrlForToken } from "@/lib/testimonials";
import { deleteMyData } from "@/app/[locale]/me/delete-data";
import { makeBrief, makeUser } from "../helpers";

const DAY = 86_400_000;

async function delivered(opts: { synthetic?: boolean; deliveredAt?: Date; ownerId?: string } = {}) {
  const db = getDb();
  const { brief, ownerId } = await makeBrief("delivered", { ownerId: opts.ownerId });
  if (opts.synthetic) await db.update(schema.briefs).set({ isSynthetic: true }).where(eq(schema.briefs.id, brief.id));
  const lead = await makeUser("student");
  const [team] = await db.insert(schema.teams).values({ briefId: brief.id, name: "T", pitch: "p", status: "delivered" }).returning();
  await db.insert(schema.teamMembers).values({ teamId: team.id, userId: lead.id, role: "lead" });
  const [delivery] = await db
    .insert(schema.deliveries)
    .values({
      teamId: team.id,
      briefId: brief.id,
      summary: { ja: "s", en: "s" },
      supportContactUserId: lead.id,
      supportUntil: "2027-03-01",
      ...(opts.deliveredAt ? { deliveredAt: opts.deliveredAt } : {}),
    })
    .returning();
  return { brief, delivery, ownerId };
}

async function evaluate(deliveryId: string, over: Partial<typeof schema.evaluations.$inferInsert> = {}) {
  const [e] = await getDb()
    .insert(schema.evaluations)
    .values({ deliveryId, hoursSavedPerWeek: 2, satisfaction: 4, stillInUse: true, wouldRecommend: true, impactSummary: { quote: "助かりました" }, ...over })
    .returning();
  return e;
}

describe("testimonials need explicit, non-withdrawn consent", () => {
  it("lists only consented quotes and hides withdrawn ones", async () => {
    const a = await delivered();
    const b = await delivered();
    const c = await delivered();
    const consented = await evaluate(a.delivery.id, { quoteConsent: true });
    const noConsent = await evaluate(b.delivery.id);
    const withdrawn = await evaluate(c.delivery.id, { quoteConsent: true, quoteWithdrawnAt: new Date() });
    const ids = (await listTestimonials(100)).map((t) => t.id);
    expect(ids).toContain(consented.id);
    expect(ids).not.toContain(noConsent.id);
    expect(ids).not.toContain(withdrawn.id);
  });

  it("submitEvaluation stores consent only when ticked", async () => {
    const a = await delivered();
    const b = await delivered();
    const answers = { hoursSavedPerWeek: 1, satisfaction: 3, stillInUse: false, issues: "", wouldRecommend: false };
    await submitEvaluation((await createFeedbackToken(a.delivery.id, null)).token, answers);
    await submitEvaluation((await createFeedbackToken(b.delivery.id, null)).token, { ...answers, quoteConsent: true });
    const rows = await getDb().select().from(schema.evaluations).where(inArray(schema.evaluations.deliveryId, [a.delivery.id, b.delivery.id]));
    const byDelivery = new Map(rows.map((r) => [r.deliveryId, r]));
    expect(byDelivery.get(a.delivery.id)!.quoteConsent).toBe(false);
    expect(byDelivery.get(b.delivery.id)!.quoteConsent).toBe(true);
  });

  it("a signed withdraw link takes the quote down; a forged one does nothing", async () => {
    const a = await delivered();
    const { token } = await createFeedbackToken(a.delivery.id, null);
    await submitEvaluation(token, { hoursSavedPerWeek: 1, satisfaction: 5, stillInUse: true, issues: "", wouldRecommend: true, quoteConsent: true });
    const [e] = await getDb().select().from(schema.evaluations).where(eq(schema.evaluations.deliveryId, a.delivery.id));
    await getDb().update(schema.evaluations).set({ impactSummary: { quote: "仕込みが楽に" } }).where(eq(schema.evaluations.id, e.id));
    const url = new URL(withdrawQuoteUrl(e.id, "en"));
    expect(url.pathname).toBe("/en/feedback/withdraw");
    expect(await withdrawUrlForToken(token, "en")).toBe(url.toString());
    const sig = url.searchParams.get("sig")!;
    expect(verifyWithdrawSig(e.id, sig)).toBe(true);
    expect(await withdrawQuote(e.id, "forged")).toBe(false);
    expect((await listTestimonials(100)).some((t) => t.id === e.id)).toBe(true);
    expect(await withdrawQuote(e.id, sig)).toBe(true);
    expect((await listTestimonials(100)).some((t) => t.id === e.id)).toBe(false);
    expect(await withdrawUrlForToken(token, "en")).toBeNull();
  });
});

describe("landing hours and impact stats exclude demo data", () => {
  it("only counts evaluations on non-synthetic briefs", async () => {
    const beforeTotal = await totalHoursSaved();
    const beforeStats = await impactStats();
    const real = await delivered();
    const demo = await delivered({ synthetic: true });
    await evaluate(real.delivery.id, { hoursSavedPerWeek: 3 });
    await evaluate(demo.delivery.id, { hoursSavedPerWeek: 40 });
    expect(await totalHoursSaved()).toBeCloseTo(beforeTotal + 3, 5);
    const stats = await impactStats();
    expect(stats.total).toBeCloseTo(beforeStats.total + 3, 5);
    expect(stats.rows.some((r) => r.evaluation.deliveryId === demo.delivery.id)).toBe(false);
    expect(stats.rows.every((r) => !r.brief.isSynthetic)).toBe(true);
  });
});

describe("transcript retention", () => {
  it("clears transcripts N days after approval or delivery; dry run changes nothing", async () => {
    const db = getDb();
    const now = new Date("2027-06-01T00:00:00Z");
    const host = await makeUser("host");
    const old = await delivered({ deliveredAt: new Date(now.getTime() - 120 * DAY) });
    const recent = await delivered({ deliveredAt: new Date(now.getTime() - 10 * DAY) });
    const oldEval = await evaluate(old.delivery.id, { impactTranscript: "agent: ... owner: ..." });
    const recentEval = await evaluate(recent.delivery.id, { impactTranscript: "recent" });
    const { brief: approvedLongAgo } = await makeBrief("approved");
    await db.insert(schema.decisions).values({ subjectType: "brief", subjectId: approvedLongAgo.id, decidedBy: host.id, decision: "approve", createdAt: new Date(now.getTime() - 91 * DAY) });
    const { brief: approvedRecently } = await makeBrief("approved");
    await db.insert(schema.decisions).values({ subjectType: "brief", subjectId: approvedRecently.id, decidedBy: host.id, decision: "approve", createdAt: new Date(now.getTime() - 5 * DAY) });
    const { brief: inReview } = await makeBrief("in_review");

    const dry = await runRetention({ days: 90, now, dryRun: true });
    expect(dry.briefIds).toEqual(expect.arrayContaining([old.brief.id, approvedLongAgo.id]));
    expect(dry.briefIds).not.toEqual(expect.arrayContaining([recent.brief.id]));
    expect(dry.briefIds).not.toContain(approvedRecently.id);
    expect(dry.briefIds).not.toContain(inReview.id);
    expect(dry.evaluationIds).toContain(oldEval.id);
    expect(dry.evaluationIds).not.toContain(recentEval.id);
    const [stillThere] = await db.select().from(schema.briefs).where(eq(schema.briefs.id, old.brief.id));
    expect(stillThere.transcript).not.toBeNull();

    await runRetention({ days: 90, now });
    const briefs = new Map((await db.select().from(schema.briefs)).map((b) => [b.id, b]));
    expect(briefs.get(old.brief.id)!.transcript).toBeNull();
    expect(briefs.get(approvedLongAgo.id)!.transcript).toBeNull();
    expect(briefs.get(recent.brief.id)!.transcript).not.toBeNull();
    expect(briefs.get(approvedRecently.id)!.transcript).not.toBeNull();
    expect(briefs.get(inReview.id)!.transcript).not.toBeNull();
    const evals = new Map((await db.select().from(schema.evaluations)).map((e) => [e.id, e]));
    expect(evals.get(oldEval.id)!.impactTranscript).toBeNull();
    expect(evals.get(oldEval.id)!.hoursSavedPerWeek).toBe(2); // scores are kept
    expect(evals.get(recentEval.id)!.impactTranscript).toBe("recent");

    // Idempotent: nothing left to clear for the same cutoff.
    const again = await runRetention({ days: 90, now, dryRun: true });
    expect(again.briefIds).not.toContain(old.brief.id);
    expect(again.evaluationIds).not.toContain(oldEval.id);
  });
});

describe("delete my data", () => {
  it("clears the owner's transcripts, anonymizes quotes and deletes pending drafts only", async () => {
    const db = getDb();
    const owner = await makeUser("business");
    const other = await makeUser("business");
    const d = await delivered({ ownerId: owner.id });
    const e = await evaluate(d.delivery.id, { quoteConsent: true, impactTranscript: "t", impactSummary: { quote: "店長の○○さんが助かった", summary: "s", hours_saved_per_week: 2 } });
    const { brief: draft } = await makeBrief("draft", { ownerId: owner.id });
    const { brief: rejected } = await makeBrief("rejected", { ownerId: owner.id });
    const { brief: approved } = await makeBrief("approved", { ownerId: owner.id });
    const { brief: othersDraft } = await makeBrief("draft", { ownerId: other.id });

    const r = await deleteMyData(owner.id);
    expect(r).toEqual({ transcriptsCleared: 2, quotesAnonymized: 1, draftsDeleted: 2 });
    const ids = (await db.select({ id: schema.briefs.id }).from(schema.briefs)).map((b) => b.id);
    expect(ids).not.toContain(draft.id);
    expect(ids).not.toContain(rejected.id);
    expect(ids).toContain(approved.id);
    expect(ids).toContain(othersDraft.id);
    const [a] = await db.select().from(schema.briefs).where(eq(schema.briefs.id, approved.id));
    expect(a.transcript).toBeNull();
    const [o] = await db.select().from(schema.briefs).where(eq(schema.briefs.id, othersDraft.id));
    expect(o.transcript).not.toBeNull();
    const [ev] = await db.select().from(schema.evaluations).where(eq(schema.evaluations.id, e.id));
    expect(ev.impactTranscript).toBeNull();
    expect(ev.impactSummary).toEqual({ hours_saved_per_week: 2 });
    expect(ev.quoteConsent).toBe(false);
    expect(ev.quoteWithdrawnAt).not.toBeNull();
    expect((await listTestimonials(100)).some((t) => t.id === e.id)).toBe(false);
    expect(await deleteMyData(owner.id)).toMatchObject({ draftsDeleted: 0, quotesAnonymized: 0 });
  });
});
