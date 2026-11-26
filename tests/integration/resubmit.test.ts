import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getDb, schema } from "@/lib/db";
import { applyBriefEdits, decide, resubmitBrief } from "@/lib/decide";
import { reEnrichBrief, startReEnrichment } from "@/lib/pipeline/brief";
import { adminQueue, adminRejected, briefsForOwner, latestRejections } from "@/lib/queries";
import { PermissionError } from "@/lib/teams";
import { TransitionError } from "@/lib/workflow/status";
import { makeBrief, makeUser } from "../helpers";

const load = async (id: string) => (await getDb().select().from(schema.briefs).where(eq(schema.briefs.id, id)))[0];

async function rejected(note: string | null = "Please add how many bookings a week") {
  const host = await makeUser("host");
  const made = await makeBrief("in_review");
  await decide({ subjectType: "brief", subjectId: made.brief.id, decision: "reject", note, hostUserId: host.id });
  return { ...made, host };
}

describe("applyBriefEdits", () => {
  const lang = { title: "T", problem: "P", current_process: "C", desired_outcome: "D" };
  it("updates changed fields in the owner's language and mirrors them for re-translation", () => {
    const { content, changed } = applyBriefEdits({ ja: { ...lang }, en: { ...lang, title: "English T" } }, { title: "  新しい題 ", problem: "P", current_process: "" }, "ja");
    expect(changed).toEqual(["title"]);
    expect(content.ja).toEqual({ ...lang, title: "新しい題" });
    expect(content.en).toEqual({ ...lang, title: "新しい題" });
  });
  it("caps field length", () => {
    const { content } = applyBriefEdits({ ja: { ...lang }, en: { ...lang } }, { title: "x".repeat(500) }, "en");
    expect(content.en.title).toHaveLength(120);
  });
});

describe("revise & resubmit a rejected brief", () => {
  it("the host's note is visible to the owner and in the admin 'Returned' list", async () => {
    const { brief, ownerId } = await rejected();
    const mine = (await briefsForOwner(ownerId)).find((r) => r.brief.id === brief.id)!;
    expect(mine.brief.status).toBe("rejected");
    expect(mine.rejection?.note).toBe("Please add how many bookings a week");
    const listed = (await adminRejected()).find((r) => r.brief.id === brief.id);
    expect(listed?.rejection?.note).toBe("Please add how many bookings a week");
    // Not in the review queue while it waits for the owner.
    expect((await adminQueue()).some((r) => r.brief.id === brief.id)).toBe(false);
  });

  it("latestRejections returns the most recent reject note per brief", async () => {
    const { brief, host, ownerId } = await rejected("first");
    await resubmitBrief(brief.id, { ownerUserId: ownerId });
    await decide({ subjectType: "brief", subjectId: brief.id, decision: "reject", note: "second", hostUserId: host.id });
    expect((await latestRejections([brief.id])).get(brief.id)?.note).toBe("second");
    expect((await latestRejections([])).size).toBe(0);
  });

  it("owner edits + resubmits: rejected → in_review with the new text, then enrichment re-runs", async () => {
    const { brief, ownerId } = await rejected();
    const { changed } = await resubmitBrief(brief.id, {
      ownerUserId: ownerId,
      lang: "en",
      edits: { title: "Reservation chaos", problem: "About 40 phone bookings a week, 6 hours lost", current_process: "Paper notebook", desired_outcome: "" },
    });
    expect(changed).toEqual(["problem"]);
    let b = await load(brief.id);
    expect(b.status).toBe("in_review");
    expect(b.content.en.problem).toBe("About 40 phone bookings a week, 6 hours lost");
    expect(b.content.ja.problem).toBe("About 40 phone bookings a week, 6 hours lost");
    expect(b.content.en.desired_outcome).toBe("Auto replies");
    expect((await briefsForOwner(ownerId)).find((r) => r.brief.id === brief.id)?.rejection).toBeNull();
    expect((await adminRejected()).some((r) => r.brief.id === brief.id)).toBe(false);

    // The /me action: startReEnrichment, then reEnrichBrief in after().
    expect(await startReEnrichment(brief.id)).toBe(true);
    expect((await load(brief.id)).status).toBe("enriching");
    const reviewBrief = vi.fn(async () => {
      throw new Error("dify down");
    });
    expect(
      await reEnrichBrief(brief.id, { search: async () => ({ ok: false, results: [] }), reviewBrief, liveOnly: true }, { alreadyStarted: true }),
    ).toBe(true);
    b = await load(brief.id);
    expect(b.status).toBe("in_review");
    expect(reviewBrief).toHaveBeenCalledOnce();
    expect(JSON.stringify(reviewBrief.mock.calls[0])).toContain("About 40 phone bookings a week");
  });

  it("only the owner can resubmit, only once, and only from rejected", async () => {
    const { brief } = await rejected();
    const stranger = await makeUser("business");
    await expect(resubmitBrief(brief.id, { ownerUserId: stranger.id, edits: { problem: "hijack" } })).rejects.toBeInstanceOf(PermissionError);
    expect((await load(brief.id)).status).toBe("rejected");
    expect((await load(brief.id)).content.en.problem).not.toBe("hijack");
    const { ownerId } = (await getDb().select({ ownerId: schema.businesses.ownerUserId }).from(schema.businesses).where(eq(schema.businesses.id, brief.businessId)))[0];
    await resubmitBrief(brief.id, { ownerUserId: ownerId! });
    await expect(resubmitBrief(brief.id, { ownerUserId: ownerId! })).rejects.toBeInstanceOf(TransitionError);
    const { brief: approved, ownerId: o2 } = await makeBrief("approved");
    await expect(resubmitBrief(approved.id, { ownerUserId: o2, edits: { problem: "x" } })).rejects.toBeInstanceOf(TransitionError);
    expect((await load(approved.id)).content.en.problem).not.toBe("x");
  });
});
