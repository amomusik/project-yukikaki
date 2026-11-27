import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getDb, schema } from "@/lib/db";
import {
  adminDeliveries,
  adminQueue,
  adminTeams,
  briefsForOwner,
  challengeFacets,
  getBriefDetail,
  getTeamDetail,
  impactStats,
  recentDecisions,
  serviceStatus,
  teamsForUser,
} from "@/lib/queries";
import { listTestimonials } from "@/lib/testimonials";
import { recordServiceEvent } from "@/lib/integrations/_guard";
import { resubmitBrief } from "@/lib/decide";
import { TransitionError } from "@/lib/workflow/status";
import { makeBrief, makeUser } from "../helpers";

/** A full brief → team → delivery → evaluation chain, built directly in the DB. */
async function chain(opts: { quote?: unknown; synthetic?: boolean; hours?: number; satisfaction?: number } = {}) {
  const db = getDb();
  const { brief, business, ownerId } = await makeBrief("evaluated", { city: "Otaru", industry: "guesthouse" });
  if (opts.synthetic) await db.update(schema.briefs).set({ isSynthetic: true }).where(eq(schema.briefs.id, brief.id));
  const lead = await makeUser("student", { skills: ["line-bot"] });
  const member = await makeUser("student", { skills: ["spreadsheets"] });
  const [team] = await db.insert(schema.teams).values({ briefId: brief.id, name: "Snow", pitch: "p", status: "delivered" }).returning();
  await db.insert(schema.teamMembers).values([
    { teamId: team.id, userId: lead.id, role: "lead" },
    { teamId: team.id, userId: member.id, role: "member", status: "accepted" },
  ]);
  const [delivery] = await db
    .insert(schema.deliveries)
    .values({ teamId: team.id, briefId: brief.id, summary: { ja: "納品", en: "Delivered" }, supportContactUserId: lead.id, supportUntil: "2027-03-01" })
    .returning();
  await db.insert(schema.feedbackTokens).values({ deliveryId: delivery.id, tokenHash: `h-${delivery.id}`, expiresAt: new Date(Date.now() + 86_400_000) });
  const [evaluation] = await db
    .insert(schema.evaluations)
    .values({
      deliveryId: delivery.id,
      hoursSavedPerWeek: opts.hours ?? 2.5,
      satisfaction: opts.satisfaction ?? 4,
      stillInUse: true,
      wouldRecommend: true,
      impactSummary: opts.quote === undefined ? { quote: "家族と夕ごはんを食べられるようになりました。" } : { quote: opts.quote },
    })
    .returning();
  return { brief, business, ownerId, lead, member, team, delivery, evaluation };
}

describe("read models (lib/queries)", () => {
  it("brief + team detail return joined rows; invalid or unknown ids return null", async () => {
    const c = await chain();
    const detail = await getBriefDetail(c.brief.id);
    expect(detail?.business.id).toBe(c.business.id);
    expect(detail?.teams.map((t) => t.id)).toEqual([c.team.id]);
    expect(detail?.sources).toEqual([]);
    const team = await getTeamDetail(c.team.id);
    expect(team?.members).toHaveLength(2);
    expect(team?.delivery?.id).toBe(c.delivery.id);
    expect(team?.brief.id).toBe(c.brief.id);
    expect(await getBriefDetail("not-a-uuid")).toBeNull();
    expect(await getTeamDetail("not-a-uuid")).toBeNull();
    expect(await getBriefDetail("00000000-0000-4000-8000-000000000000")).toBeNull();
    expect(await getTeamDetail("00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("owner and student dashboards", async () => {
    const c = await chain();
    const mine = await briefsForOwner(c.ownerId);
    expect(mine).toHaveLength(1);
    expect(mine[0].deliveries.map((d) => d.delivery.id)).toEqual([c.delivery.id]);
    expect(mine[0].deliveries[0].lead.id).toBe(c.lead.id);
    expect(await briefsForOwner((await makeUser("business")).id)).toEqual([]);
    const teams = await teamsForUser(c.member.id);
    expect(teams.map((t) => [t.team.id, t.role])).toEqual([[c.team.id, "member"]]);
  });

  it("admin queue, pending teams, deliveries with evaluation + token counts", async () => {
    const { brief: queued } = await makeBrief("in_review");
    const { brief: approved } = await makeBrief("approved");
    const db = getDb();
    await db.insert(schema.dataSources).values({ briefId: queued.id, kind: "live", provider: "linkup", title: "src" });
    const [pending] = await db.insert(schema.teams).values({ briefId: approved.id, name: "Pending", pitch: "p" }).returning();
    const s = await makeUser("student");
    await db.insert(schema.teamMembers).values({ teamId: pending.id, userId: s.id, role: "lead" });
    const c = await chain();

    const q = await adminQueue();
    const row = q.find((r) => r.brief.id === queued.id)!;
    expect(row.sources.map((x) => x.title)).toEqual(["src"]);
    expect(q.some((r) => r.brief.id === approved.id)).toBe(false);

    const teams = await adminTeams();
    const t = teams.find((x) => x.team.id === pending.id)!;
    expect(t.members.map((m) => m.user.id)).toEqual([s.id]);
    expect(teams.some((x) => x.team.id === c.team.id)).toBe(false); // delivered ≠ pending

    const del = (await adminDeliveries()).find((d) => d.delivery.id === c.delivery.id)!;
    expect(del.evaluation?.id).toBe(c.evaluation.id);
    expect(del.tokensSent).toBe(1);
    expect(del.lead.id).toBe(c.lead.id);
  });

  it("impact stats aggregate hours, satisfaction and still-in-use", async () => {
    const before = await impactStats();
    await chain({ hours: 3, satisfaction: 5 });
    const after = await impactStats();
    expect(after.rows.length).toBe(before.rows.length + 1);
    expect(after.total).toBeCloseTo(before.total + 3, 5);
    expect(after.inUse).toBe(before.inUse + 1);
    expect(after.avg).toBeGreaterThan(0);
  });

  it("facets list public cities/industries/skills only", async () => {
    await makeBrief("approved", { city: "Hakodate", industry: "fishery" });
    await makeBrief("draft", { city: "Nowhere", industry: "secret" });
    const f = await challengeFacets();
    expect(f.cities).toContain("Hakodate");
    expect(f.cities).not.toContain("Nowhere");
    expect(f.industries).toContain("fishery");
    expect(f.skills).toEqual([...f.skills].sort());
  });

  it("service status returns the latest event per service; recent decisions join the host", async () => {
    await recordServiceEvent({ service: "linkup", operation: "a", ok: false, latencyMs: 5, error: "old" });
    await new Promise((r) => setTimeout(r, 5));
    await recordServiceEvent({ service: "linkup", operation: "b", ok: true, latencyMs: 5 });
    const st = await serviceStatus();
    const linkup = st.filter((s) => s.service === "linkup");
    expect(linkup).toHaveLength(1);
    expect(linkup[0].ok).toBe(true);

    const host = await makeUser("host");
    const { brief } = await makeBrief("in_review");
    await getDb().insert(schema.decisions).values({ subjectType: "brief", subjectId: brief.id, decidedBy: host.id, decision: "approve" });
    const ds = await recentDecisions(50);
    expect(ds.find((d) => d.decision.subjectId === brief.id)?.host.id).toBe(host.id);
  });
});

describe("testimonials (lib/testimonials)", () => {
  it("returns real quotes only, clamps satisfaction, flags synthetic briefs as demo", async () => {
    const real = await chain({ satisfaction: 4 });
    const demo = await chain({ synthetic: true, satisfaction: 9 });
    await chain({ quote: "   " });
    await chain({ quote: 42 });
    const t = await listTestimonials(50);
    const byId = new Map(t.map((x) => [x.id, x]));
    expect(byId.get(real.evaluation.id)).toMatchObject({ quote: "家族と夕ごはんを食べられるようになりました。", isDemo: false, satisfaction: 4, city: "Otaru" });
    expect(byId.get(demo.evaluation.id)).toMatchObject({ isDemo: true, satisfaction: 5 });
    expect(t.every((x) => x.quote.length > 0)).toBe(true);
    expect((await listTestimonials(1)).length).toBe(1);
  });
});

describe("resubmitBrief (rejected → in_review)", () => {
  it("moves a rejected brief back into the review queue, and refuses other states", async () => {
    const { brief } = await makeBrief("rejected");
    await resubmitBrief(brief.id);
    const [b] = await getDb().select().from(schema.briefs).where(eq(schema.briefs.id, brief.id));
    expect(b.status).toBe("in_review");
    const { brief: approved } = await makeBrief("approved");
    await expect(resubmitBrief(approved.id)).rejects.toBeInstanceOf(TransitionError);
    await expect(resubmitBrief("00000000-0000-4000-8000-000000000000")).rejects.toThrow(/not found/);
  });
});
