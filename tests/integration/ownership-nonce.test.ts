import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { createBriefFromDraft, ingestInterview, InterviewOwnershipError } from "@/lib/briefs";
import { getDb, schema } from "@/lib/db";
import { assertImpactConversation, createFeedbackToken, ImpactConversationError, ingestImpact, sendImpactCheck, submitEvaluation } from "@/lib/feedback";
import { briefDraftSchema, parseConversation, type ParsedConversation } from "@/lib/integrations/elevenlabs";
import { signInterviewNonce } from "@/lib/interview-nonce";
import interview from "../fixtures/elevenlabs-interview.json";
import impact from "../fixtures/elevenlabs-impact.json";
import { makeBrief, makeUser } from "../helpers";

let seq = 0;
const conv = (dv: Record<string, unknown>, base: unknown = interview): ParsedConversation => {
  const c = parseConversation(base);
  return { ...c, conversationId: `conv_nonce_${Date.now()}_${seq++}`, dynamicVariables: { ...c.dynamicVariables, ...dv } };
};
const briefOf = async (id: string) => (await getDb().select().from(schema.briefs).where(eq(schema.briefs.id, id)))[0];
const businessOf = async (id: string) => (await getDb().select().from(schema.businesses).where(eq(schema.businesses.id, id)))[0];

describe("interview ownership comes only from the server-signed nonce", () => {
  it("attaches to the nonce's user and business, ignoring spoofed user_id/business_id", async () => {
    const { business, ownerId } = await makeBrief("approved");
    const victim = await makeBrief("approved");
    const nonce = signInterviewNonce({ kind: "interview", userId: ownerId, businessId: business.id });
    const { briefId } = await ingestInterview(conv({ yk_nonce: nonce, user_id: victim.ownerId, business_id: victim.business.id }), { expectedUserId: ownerId });
    expect((await briefOf(briefId)).businessId).toBe(business.id);
    expect((await businessOf(victim.business.id)).name).toBe("Menya Test");
  });

  it("rejects when the nonce belongs to another user than the caller (owner mismatch)", async () => {
    const { business, ownerId } = await makeBrief("approved");
    const caller = await makeUser("business");
    const nonce = signInterviewNonce({ kind: "interview", userId: ownerId, businessId: business.id });
    const c = conv({ yk_nonce: nonce });
    await expect(ingestInterview(c, { expectedUserId: caller.id })).rejects.toBeInstanceOf(InterviewOwnershipError);
    const rows = await getDb().select().from(schema.briefs).where(eq(schema.briefs.elevenlabsConversationId, c.conversationId));
    expect(rows).toHaveLength(0);
  });

  it("rejects a missing, expired, tampered or impact nonce on the caller-authenticated path", async () => {
    const u = await makeUser("business");
    const expired = signInterviewNonce({ kind: "interview", userId: u.id }, Date.now() - 3 * 3600_000);
    const impactNonce = signInterviewNonce({ kind: "impact", userId: u.id, deliveryId: "x" });
    const good = signInterviewNonce({ kind: "interview", userId: u.id });
    for (const yk_nonce of [undefined, "", expired, impactNonce, good.slice(0, -3) + "abc"]) {
      await expect(ingestInterview(conv({ yk_nonce, user_id: u.id }), { expectedUserId: u.id })).rejects.toBeInstanceOf(InterviewOwnershipError);
    }
  });

  it("webhook path without a valid nonce stores an ownerless brief and never touches the named business", async () => {
    const victim = await makeBrief("approved");
    const { briefId } = await ingestInterview(conv({ user_id: "", business_id: victim.business.id }));
    const brief = await briefOf(briefId);
    expect(brief.businessId).not.toBe(victim.business.id);
    expect((await businessOf(brief.businessId)).ownerUserId).toBeNull();
    expect((await businessOf(victim.business.id)).name).toBe("Menya Test");
  });

  it("createBriefFromDraft with no owner never edits or attaches an existing business", async () => {
    const victim = await makeBrief("approved");
    const d = briefDraftSchema.parse({ business_name: "Hijack", industry: "x", city: "y", problem: "p" });
    const { briefId } = await createBriefFromDraft(d, { ownerUserId: null, businessId: victim.business.id });
    expect((await briefOf(briefId)).businessId).not.toBe(victim.business.id);
    expect((await businessOf(victim.business.id)).name).toBe("Menya Test");
  });
});

async function delivered() {
  const { brief } = await makeBrief("delivered");
  const lead = await makeUser("student");
  const db = getDb();
  const [team] = await db.insert(schema.teams).values({ briefId: brief.id, name: "T", pitch: "p", status: "delivered" }).returning();
  await db.insert(schema.teamMembers).values({ teamId: team.id, userId: lead.id, role: "lead" });
  const [d] = await db
    .insert(schema.deliveries)
    .values({ teamId: team.id, briefId: brief.id, summary: { ja: "s", en: "s" }, supportContactUserId: lead.id, supportUntil: "2027-03-01" })
    .returning();
  return d;
}
const answers = { hoursSavedPerWeek: 5, satisfaction: 5, stillInUse: true, issues: "", wouldRecommend: true };
const evalOf = async (deliveryId: string) => (await getDb().select().from(schema.evaluations).where(eq(schema.evaluations.deliveryId, deliveryId)))[0];

describe("impact reviews are bound to the feedback token's delivery", () => {
  it("ignores a spoofed delivery_id; only the nonce's delivery is used", async () => {
    const mine = await delivered();
    const victim = await delivered();
    await submitEvaluation((await createFeedbackToken(victim.id, null)).token, answers);
    await submitEvaluation((await createFeedbackToken(mine.id, null)).token, answers);
    expect(await ingestImpact(conv({ delivery_id: victim.id }, impact))).toEqual({ attached: false });
    expect((await evalOf(victim.id)).impactTranscript).toBeNull();

    const c = conv({ delivery_id: victim.id, yk_nonce: signInterviewNonce({ kind: "impact", userId: null, deliveryId: mine.id }) }, impact);
    expect(await ingestImpact(c)).toEqual({ attached: true });
    expect((await evalOf(mine.id)).impactConversationId).toBe(c.conversationId);
    expect((await evalOf(victim.id)).impactTranscript).toBeNull();
  });

  it("refuses interview-agent conversations and interview nonces", async () => {
    const d = await delivered();
    await submitEvaluation((await createFeedbackToken(d.id, null)).token, answers);
    expect(await ingestImpact(conv({ yk_nonce: signInterviewNonce({ kind: "impact", userId: null, deliveryId: d.id }) }, interview))).toEqual({ attached: false });
    expect(await ingestImpact(conv({ yk_nonce: signInterviewNonce({ kind: "interview", userId: "u", deliveryId: d.id }) }, impact))).toEqual({ attached: false });
  });

  it("assertImpactConversation checks agent kind and the nonce's delivery", async () => {
    const good = conv({ yk_nonce: signInterviewNonce({ kind: "impact", userId: null, deliveryId: "d1" }) }, impact);
    await expect(assertImpactConversation(good.conversationId, "d1", good)).resolves.toBe(good);
    await expect(assertImpactConversation(good.conversationId, "d2", good)).rejects.toBeInstanceOf(ImpactConversationError);
    await expect(assertImpactConversation("other", "d1", good)).rejects.toBeInstanceOf(ImpactConversationError);
    const wrongAgent = conv({ yk_nonce: signInterviewNonce({ kind: "impact", userId: null, deliveryId: "d1" }) }, interview);
    await expect(assertImpactConversation(wrongAgent.conversationId, "d1", wrongAgent)).rejects.toBeInstanceOf(ImpactConversationError);
    const noNonce = conv({ delivery_id: "d1" }, impact);
    await expect(assertImpactConversation(noNonce.conversationId, "d1", noNonce)).rejects.toBeInstanceOf(ImpactConversationError);
  });
});

describe("logs never contain raw feedback tokens or links", () => {
  it("sendImpactCheck logs only ids and a hash prefix", async () => {
    const d = await delivered();
    const spies = (["log", "info", "warn", "error"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    const r = await sendImpactCheck(d.id, "ja");
    const logged = spies.flatMap((s) => s.mock.calls.map((c) => c.map(String).join(" "))).join("\n");
    spies.forEach((s) => s.mockRestore());
    const token = r.link.split("/").pop()!;
    expect(logged).toContain(d.id);
    expect(logged).not.toContain(token);
    expect(logged).not.toContain(r.link);
  });
});
