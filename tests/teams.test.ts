import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb, schema } from "@/lib/db";
import { PermissionError, createTeam, deliver, getLead, transferLead } from "@/lib/teams";
import { makeBrief, makeUser } from "./helpers";

async function setup() {
  const { brief } = await makeBrief("approved");
  const lead = await makeUser("student");
  const member = await makeUser("student");
  const { teamId, unknownEmails } = await createTeam({
    briefId: brief.id,
    creatorUserId: lead.id,
    name: "Snow Shovelers",
    pitch: "LINE bot",
    memberEmails: [member.email, "nobody@example.com"],
  });
  return { brief, lead, member, teamId, unknownEmails };
}

describe("team ownership", () => {
  it("makes the creator the lead and reports unknown invitees", async () => {
    const { lead, teamId, unknownEmails } = await setup();
    expect((await getLead(teamId))?.userId).toBe(lead.id);
    expect(unknownEmails).toEqual(["nobody@example.com"]);
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
