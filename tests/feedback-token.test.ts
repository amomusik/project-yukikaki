import { eq, sum } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb, schema } from "@/lib/db";
import { checkFeedbackToken, createFeedbackToken, hashToken, ingestImpact, sendImpactCheck, submitEvaluation } from "@/lib/feedback";
import { parseConversation } from "@/lib/integrations/elevenlabs";
import impact from "./fixtures/elevenlabs-impact.json";
import { impactStats } from "@/lib/queries";
import { signInterviewNonce } from "@/lib/interview-nonce";
import { makeBrief, makeUser } from "./helpers";

async function delivered() {
  const { brief, ownerId } = await makeBrief("delivered");
  const lead = await makeUser("student");
  const db = getDb();
  const [team] = await db.insert(schema.teams).values({ briefId: brief.id, name: "T", pitch: "p", status: "delivered" }).returning();
  await db.insert(schema.teamMembers).values({ teamId: team.id, userId: lead.id, role: "lead" });
  const [d] = await db
    .insert(schema.deliveries)
    .values({ teamId: team.id, briefId: brief.id, summary: { ja: "s", en: "s" }, supportContactUserId: lead.id, supportUntil: "2027-03-01" })
    .returning();
  return { brief, delivery: d, ownerId };
}

const answers = { hoursSavedPerWeek: 5, satisfaction: 5, stillInUse: true, issues: "", wouldRecommend: true };

describe("one-time impact links", () => {
  it("stores only the hash", async () => {
    const { delivery } = await delivered();
    const { token, row } = await createFeedbackToken(delivery.id, "o@example.com");
    expect(row.tokenHash).toBe(hashToken(token));
    expect(row.tokenHash).not.toContain(token);
    const all = await getDb().select().from(schema.feedbackTokens);
    expect(JSON.stringify(all)).not.toContain(token);
  });

  it("works once, then reports used; brief becomes evaluated", async () => {
    const { brief, delivery } = await delivered();
    const { token } = await createFeedbackToken(delivery.id, null);
    expect(await checkFeedbackToken(token)).toMatchObject({ ok: true });
    expect(await submitEvaluation(token, answers)).toMatchObject({ ok: true });
    expect(await submitEvaluation(token, answers)).toEqual({ ok: false, reason: "used" });
    const [b] = await getDb().select().from(schema.briefs).where(eq(schema.briefs.id, brief.id));
    expect(b.status).toBe("evaluated");
  });

  it("rejects expired and tampered tokens", async () => {
    const { delivery } = await delivered();
    const { token } = await createFeedbackToken(delivery.id, null, new Date("2026-01-01"));
    expect(await checkFeedbackToken(token, new Date("2026-02-01"))).toEqual({ ok: false, reason: "expired" });
    expect(await checkFeedbackToken(token.slice(0, -2) + "xx")).toEqual({ ok: false, reason: "invalid" });
    expect(await checkFeedbackToken("short")).toEqual({ ok: false, reason: "invalid" });
  });

  it("falls back to a copyable link when email is not configured", async () => {
    const { delivery } = await delivered();
    const r = await sendImpactCheck(delivery.id, "ja");
    expect(r.emailed).toBe(false);
    expect(r.link).toMatch(/^http:\/\/localhost:3000\/ja\/feedback\/[\w-]{40,}$/);
    const token = r.link.split("/").pop()!;
    expect(await checkFeedbackToken(token)).toMatchObject({ ok: true });
  });

  it("attaches the voice review to the evaluation", async () => {
    const { delivery } = await delivered();
    const { token } = await createFeedbackToken(delivery.id, null);
    await submitEvaluation(token, { ...answers, impactConversationId: "conv_impact_001" });
    const c = parseConversation(impact);
    const yk_nonce = signInterviewNonce({ kind: "impact", userId: null, deliveryId: delivery.id });
    expect(await ingestImpact({ ...c, dynamicVariables: { ...c.dynamicVariables, yk_nonce } })).toEqual({ attached: true });
    const [e] = await getDb().select().from(schema.evaluations).where(eq(schema.evaluations.deliveryId, delivery.id));
    expect(e.impactTranscript).toContain("週に5時間");
    expect(e.impactSummary).toMatchObject({ quote: "仕込みに集中できるようになりました" });
  });

  it("stores fractional hours saved and sums them in impact stats", async () => {
    const a = await delivered();
    const b = await delivered();
    const t1 = await createFeedbackToken(a.delivery.id, null);
    const t2 = await createFeedbackToken(b.delivery.id, null);
    await submitEvaluation(t1.token, { ...answers, hoursSavedPerWeek: 2.5 });
    await submitEvaluation(t2.token, { ...answers, hoursSavedPerWeek: 1.26 });
    const [e] = await getDb().select().from(schema.evaluations).where(eq(schema.evaluations.deliveryId, a.delivery.id));
    expect(e.hoursSavedPerWeek).toBe(2.5);
    const stats = await impactStats();
    const mine = stats.rows.filter((r) => [a.delivery.id, b.delivery.id].includes(r.evaluation.deliveryId));
    expect(mine.map((r) => r.evaluation.hoursSavedPerWeek).sort()).toEqual([1.3, 2.5]);
    expect(typeof stats.total).toBe("number");
    const [s] = await getDb().select({ total: sum(schema.evaluations.hoursSavedPerWeek) }).from(schema.evaluations);
    expect(Number(s.total)).toBeCloseTo(stats.total, 5);
  });
});
