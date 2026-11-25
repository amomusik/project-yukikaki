import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/graph/sync", () => ({
  syncBrief: vi.fn(async () => ({ value: true, ok: true, fellBack: false })),
  syncTeam: vi.fn(async () => ({ value: true, ok: true, fellBack: false })),
  syncDelivery: vi.fn(async () => ({ value: true, ok: true, fellBack: false })),
  syncBuilder: vi.fn(async () => ({ value: true, ok: true, fellBack: false })),
}));

import { getDb, schema } from "@/lib/db";
import { decide } from "@/lib/decide";
import { syncBrief, syncTeam } from "@/lib/graph/sync";
import { PermissionError, createTeam } from "@/lib/teams";
import { TransitionError } from "@/lib/workflow/status";
import { makeBrief, makeUser } from "./helpers";

describe("host decisions", () => {
  it("rejects non-hosts", async () => {
    const { brief } = await makeBrief("in_review");
    const student = await makeUser("student");
    await expect(decide({ subjectType: "brief", subjectId: brief.id, decision: "approve", hostUserId: student.id })).rejects.toBeInstanceOf(PermissionError);
  });

  it("approving a brief audits and syncs the graph", async () => {
    const { brief } = await makeBrief("in_review");
    const host = await makeUser("host");
    await decide({ subjectType: "brief", subjectId: brief.id, decision: "approve", note: "looks good", hostUserId: host.id });
    const db = getDb();
    const [b] = await db.select().from(schema.briefs).where(eq(schema.briefs.id, brief.id));
    const [d] = await db.select().from(schema.decisions).where(eq(schema.decisions.subjectId, brief.id));
    expect(b.status).toBe("approved");
    expect(d).toMatchObject({ decision: "approve", decidedBy: host.id, note: "looks good" });
    expect(syncBrief).toHaveBeenCalledWith(brief.id);
  });

  it("cannot approve a brief that is not in review", async () => {
    const { brief } = await makeBrief("draft");
    const host = await makeUser("host");
    await expect(decide({ subjectType: "brief", subjectId: brief.id, decision: "approve", hostUserId: host.id })).rejects.toBeInstanceOf(TransitionError);
  });

  it("approving a team moves its brief to in_progress", async () => {
    const { brief } = await makeBrief("approved");
    const host = await makeUser("host");
    const student = await makeUser("student");
    const { teamId } = await createTeam({ briefId: brief.id, creatorUserId: student.id, name: "T", pitch: "p", memberEmails: [] });
    await decide({ subjectType: "team", subjectId: teamId, decision: "approve", hostUserId: host.id });
    const db = getDb();
    const [b] = await db.select().from(schema.briefs).where(eq(schema.briefs.id, brief.id));
    const [t] = await db.select().from(schema.teams).where(eq(schema.teams.id, teamId));
    expect(t.status).toBe("approved");
    expect(b.status).toBe("in_progress");
    expect(syncTeam).toHaveBeenCalledWith(teamId);
  });
});
