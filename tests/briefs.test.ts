import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb, schema } from "@/lib/db";
import { createBriefFromDraft } from "@/lib/briefs";
import { briefDraftSchema } from "@/lib/integrations/elevenlabs";
import { makeBrief, makeUser } from "./helpers";

const draft = (over: Record<string, string> = {}) =>
  briefDraftSchema.parse({ business_name: "Menya New", industry: "ramen", city: "Asahikawa", ward: "", problem: "Too many calls", ...over });

describe("createBriefFromDraft", () => {
  it("updates the owner's existing business with corrected details", async () => {
    const { business, ownerId } = await makeBrief("approved");
    const { briefId } = await createBriefFromDraft(draft(), { ownerUserId: ownerId, businessId: business.id });
    const db = getDb();
    const [b] = await db.select().from(schema.businesses).where(eq(schema.businesses.id, business.id));
    const [brief] = await db.select().from(schema.briefs).where(eq(schema.briefs.id, briefId));
    expect(b).toMatchObject({ name: "Menya New", city: "Asahikawa" });
    expect(brief.businessId).toBe(business.id);
  });

  it("never edits a business owned by someone else; creates a new one instead", async () => {
    const { business } = await makeBrief("approved");
    const stranger = await makeUser("business");
    const { briefId } = await createBriefFromDraft(draft({ business_name: "Hijack" }), { ownerUserId: stranger.id, businessId: business.id });
    const db = getDb();
    const [b] = await db.select().from(schema.businesses).where(eq(schema.businesses.id, business.id));
    const [brief] = await db.select().from(schema.briefs).where(eq(schema.briefs.id, briefId));
    expect(b.name).toBe("Menya Test");
    expect(brief.businessId).not.toBe(business.id);
  });
});
