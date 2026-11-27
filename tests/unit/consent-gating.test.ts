import { describe, expect, it } from "vitest";
import { parseEvaluationForm } from "@/app/[locale]/feedback/[token]/parse";
import { hasInterviewConsent, INTERVIEW_CONSENT_FIELD, INTERVIEW_CONSENT_VALUE } from "@/app/[locale]/interview/consent";
import { DEFAULT_TRANSCRIPT_RETENTION_DAYS, retentionCutoff, retentionDays } from "@/lib/retention";

const form = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};

describe("interview consent gate", () => {
  it("accepts only the ticked notice checkbox", () => {
    expect(hasInterviewConsent(form({}))).toBe(false);
    expect(hasInterviewConsent(form({ [INTERVIEW_CONSENT_FIELD]: "no" }))).toBe(false);
    expect(hasInterviewConsent(form({ [INTERVIEW_CONSENT_FIELD]: INTERVIEW_CONSENT_VALUE }))).toBe(true);
  });
});

describe("impact form has no pre-selected answers", () => {
  const complete = { hoursSavedPerWeek: "2,5", satisfaction: "3", stillInUse: "false", wouldRecommend: "true" };

  it("rejects a form where only the hours were filled in", () => {
    const r = parseEvaluationForm(form({ hoursSavedPerWeek: "4" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing.sort()).toEqual(["satisfaction", "stillInUse", "wouldRecommend"]);
  });

  it("rejects out-of-range or garbage answers instead of defaulting", () => {
    expect(parseEvaluationForm(form({ ...complete, satisfaction: "9" })).ok).toBe(false);
    expect(parseEvaluationForm(form({ ...complete, stillInUse: "maybe" })).ok).toBe(false);
    expect(parseEvaluationForm(form({ ...complete, hoursSavedPerWeek: "" })).ok).toBe(false);
  });

  it("parses explicit answers; quote consent is opt-in", () => {
    const r = parseEvaluationForm(form(complete));
    expect(r).toMatchObject({ ok: true, value: { hoursSavedPerWeek: 2.5, satisfaction: 3, stillInUse: false, wouldRecommend: true, quoteConsent: false } });
    const yes = parseEvaluationForm(form({ ...complete, quoteConsent: "true" }));
    expect(yes.ok && yes.value.quoteConsent).toBe(true);
  });
});

describe("retention settings", () => {
  it("defaults to 90 days and validates TRANSCRIPT_RETENTION_DAYS", () => {
    expect(retentionDays({})).toBe(DEFAULT_TRANSCRIPT_RETENTION_DAYS);
    expect(retentionDays({ TRANSCRIPT_RETENTION_DAYS: "" })).toBe(90);
    expect(retentionDays({ TRANSCRIPT_RETENTION_DAYS: "30" })).toBe(30);
    expect(() => retentionDays({ TRANSCRIPT_RETENTION_DAYS: "0" })).toThrow();
    expect(() => retentionDays({ TRANSCRIPT_RETENTION_DAYS: "abc" })).toThrow();
    expect(retentionCutoff(10, new Date("2026-11-27T00:00:00Z")).toISOString()).toBe("2026-11-17T00:00:00.000Z");
  });
});
