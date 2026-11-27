import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb, schema } from "@/lib/db";
import { getTeamDetail, teamsForUser } from "@/lib/queries";
import { PermissionError, createTeam, deliver, getLead, processTeam, respondToInvite, transferLead } from "@/lib/teams";
import { makeBrief, makeUser } from "./helpers";

async function setup() {
  const { brief } = await makeBrief("approved");
  const lead = await makeUser("student");
  const member = await makeUser("student");
  const result = await createTeam({
    briefId: brief.id,
    creatorUserId: lead.id,
    name: "Snow Shovelers",
    pitch: "LINE bot",
    memberEmails: [member.email, "nobody@example.com"],
  });
  return { brief, lead, member, teamId: result.teamId, result };
}

describe("team ownership", () => {
  it("makes the creator the lead, accepted at once", async () => {
    const { lead, teamId } = await setup();
    const l = await getLead(teamId);
    expect(l?.userId).toBe(lead.id);
    expect(l?.status).toBe("accepted");
  });

  it("never tells the creator which emails matched a builder account", async () => {
    const { result } = await setup();
    expect(Object.keys(result).sort()).toEqual(["invitedUserIds", "teamId"]);
    expect(JSON.stringify(result)).not.toContain("nobody@example.com");
  });

  it("refuses teams around unapproved challenges", async () => {
    const { brief } = await makeBrief("in_review");
    const s = await makeUser("student");
    await expect(createTeam({ briefId: brief.id, creatorUserId: s.id, name: "x", pitch: "y", memberEmails: [] })).rejects.toBeInstanceOf(PermissionError);
  });

  it("the database refuses a second lead", async () => {
    const { member, teamId } = await setup();
    await expect(
      getDb()
        .update(schema.teamMembers)
        .set({ role: "lead" })
        .where(and(eq(schema.teamMembers.teamId, teamId), eq(schema.teamMembers.userId, member.id))),
    ).rejects.toThrow();
  });

  it("transferLead leaves exactly one lead", async () => {
    const { lead, member, teamId } = await setup();
    await respondToInvite(teamId, member.id, true);
    await transferLead(teamId, lead.id, member.id);
    const leads = await getDb()
      .select()
      .from(schema.teamMembers)
      .where(and(eq(schema.teamMembers.teamId, teamId), eq(schema.teamMembers.role, "lead")));
    expect(leads.map((l) => l.userId)).toEqual([member.id]);
    await expect(transferLead(teamId, lead.id, lead.id)).rejects.toBeInstanceOf(PermissionError); // no longer lead
  });

  it("only the lead can deliver; lead becomes the 90-day support contact", async () => {
    const { brief, lead, member, teamId } = await setup();
    const db = getDb();
    await db.update(schema.teams).set({ status: "approved" }).where(eq(schema.teams.id, teamId));
    await db.update(schema.briefs).set({ status: "in_progress" }).where(eq(schema.briefs.id, brief.id));
    const input = { summaryJa: "LINE自動受付", summaryEn: "LINE auto-booking", links: ["https://example.com"], handoverNotes: "" };

    await expect(deliver(teamId, member.id, input)).rejects.toBeInstanceOf(PermissionError);
    const now = new Date("2026-12-01T00:00:00Z");
    const { deliveryId, supportUntil } = await deliver(teamId, lead.id, input, now);
    expect(supportUntil).toBe("2027-03-01");
    const [d] = await db.select().from(schema.deliveries).where(eq(schema.deliveries.id, deliveryId));
    expect(d.supportContactUserId).toBe(lead.id);
    const [t] = await db.select().from(schema.teams).where(eq(schema.teams.id, teamId));
    const [b] = await db.select().from(schema.briefs).where(eq(schema.briefs.id, brief.id));
    expect(t.status).toBe("delivered");
    expect(b.status).toBe("delivered");
  });
});

describe("team invitations", () => {
  it("invitees are pending: off the roster and not eligible for lead until they accept", async () => {
    const { lead, member, teamId } = await setup();
    let detail = await getTeamDetail(teamId);
    expect(detail?.members.map((m) => m.user.id)).toEqual([lead.id]);
    expect(detail?.invitations).toEqual([{ userId: member.id, status: "invited" }]);
    await expect(transferLead(teamId, lead.id, member.id)).rejects.toBeInstanceOf(PermissionError);
    expect((await teamsForUser(member.id)).map((t) => t.memberStatus)).toEqual(["invited"]);

    expect(await respondToInvite(teamId, member.id, true)).toBe("accepted");
    detail = await getTeamDetail(teamId);
    expect(detail?.members.map((m) => m.user.id).sort()).toEqual([lead.id, member.id].sort());
    expect(await respondToInvite(teamId, member.id, false)).toBeNull(); // an accepted member can't flip to declined
  });

  it("declined invitees never join and the team disappears from their list", async () => {
    const { member, teamId } = await setup();
    expect(await respondToInvite(teamId, member.id, false)).toBe("declined");
    expect((await getTeamDetail(teamId))?.members.some((m) => m.user.id === member.id)).toBe(false);
    expect(await respondToInvite(teamId, member.id, true)).toBeNull();
    expect(await teamsForUser(member.id)).toHaveLength(0);
  });

  it("the lead cannot answer an invitation, and strangers have none", async () => {
    const { lead, teamId } = await setup();
    const stranger = await makeUser("student");
    expect(await respondToInvite(teamId, lead.id, false)).toBeNull();
    expect(await respondToInvite(teamId, stranger.id, true)).toBeNull();
  });

  it("only accepted members are sent to the AI team review", async () => {
    const { member, teamId } = await setup();
    const seen: string[] = [];
    const review = (async (input: { members: string }) => {
      seen.push(input.members);
      throw new Error("offline");
    }) as unknown as Parameters<typeof processTeam>[1];
    await processTeam(teamId, review);
    expect(seen[0]).not.toContain(member.displayName);
    await respondToInvite(teamId, member.id, true);
    await processTeam(teamId, review);
    expect(seen[1]).toContain(member.displayName);
  });
});
