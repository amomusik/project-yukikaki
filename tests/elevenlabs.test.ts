import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb, schema } from "@/lib/db";
import { ingestInterview } from "@/lib/briefs";
import { agentKind, briefDraftSchema, impactDraftSchema, parseConversation, roundHours, verifySignature } from "@/lib/integrations/elevenlabs";
import interview from "./fixtures/elevenlabs-interview.json";
import impact from "./fixtures/elevenlabs-impact.json";

const SECRET = "whsec_test";
const sign = (body: string, t: number) => `t=${t},v0=${createHmac("sha256", SECRET).update(`${t}.${body}`).digest("hex")}`;

describe("webhook signature", () => {
  const body = JSON.stringify({ type: "post_call_transcription", data: interview });
  const now = 1_800_000_000;
  it("accepts a valid signature", () => {
    expect(verifySignature(body, sign(body, now), SECRET, now)).toBe(true);
  });
  it("rejects a tampered body", () => {
    expect(verifySignature(body + " ", sign(body, now), SECRET, now)).toBe(false);
  });
  it("rejects a wrong secret, missing header and stale timestamps", () => {
    expect(verifySignature(body, sign(body, now), "other", now)).toBe(false);
    expect(verifySignature(body, null, SECRET, now)).toBe(false);
    expect(verifySignature(body, sign(body, now - 3600), SECRET, now)).toBe(false);
  });
});

describe("conversation parsing", () => {
  it("parses the interview agent and maps fields to a draft", () => {
    const c = parseConversation(interview);
    expect(agentKind(c.agentId)).toBe("interview");
    expect(c.fields.business_name).toBe("麺屋ゆき");
    expect(c.transcriptText).toContain("Owner: 札幌の麺屋ゆきです");
  });

  it("parses the impact agent", () => {
    const c = parseConversation(impact);
    expect(agentKind(c.agentId)).toBe("impact");
    expect(impactDraftSchema.parse(c.fields)).toMatchObject({
      hours_saved_per_week: 5,
      satisfaction: 5,
      still_in_use: true,
      would_recommend: true,
    });
    expect(agentKind("someone_else")).toBe("unknown");
  });

  it("keeps fractional hours, rounded to one decimal", () => {
    const base = { business_name: "b", industry: "i", city: "c", problem: "p" };
    expect(briefDraftSchema.parse({ ...base, hours_lost_per_week: "2.5" }).hours_lost_per_week).toBe(2.5);
    expect(briefDraftSchema.parse({ ...base, hours_lost_per_week: "約3.25時間" }).hours_lost_per_week).toBe(3.3);
    expect(briefDraftSchema.parse({ ...base, hours_lost_per_week: "" }).hours_lost_per_week).toBeNull();
    expect(impactDraftSchema.parse({ hours_saved_per_week: 1.44 }).hours_saved_per_week).toBe(1.4);
    expect(roundHours(0.25)).toBe(0.3);
  });
});

describe("fractional hours persistence", () => {
  it("stores and reads back 2.5 h/week as a number", async () => {
    const c = parseConversation(interview);
    const { briefId } = await ingestInterview({
      ...c,
      conversationId: "conv_fractional_001",
      fields: { ...c.fields, hours_lost_per_week: "2.5" },
    });
    const [row] = await getDb().select().from(schema.briefs).where(eq(schema.briefs.id, briefId));
    expect(row.hoursLostPerWeek).toBe(2.5);
  });
});

describe("ingestion", () => {
  it("creates exactly one brief even when polling and webhook both deliver the conversation", async () => {
    const c = parseConversation(interview);
    const [a, b] = await Promise.all([ingestInterview(c), ingestInterview(c)]);
    const again = await ingestInterview(c);
    expect(a.briefId).toBe(b.briefId);
    expect(again).toEqual({ briefId: a.briefId, created: false });
    const rows = await getDb().select().from(schema.briefs).where(eq(schema.briefs.elevenlabsConversationId, "conv_interview_001"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "draft", hoursLostPerWeek: 6, toolsUsed: ["LINE", "紙のノート", "電話"] });
    expect(rows[0].skillsNeeded).toEqual(expect.arrayContaining(["ai-automation", "line-bot", "booking-automation"]));
  });
});
