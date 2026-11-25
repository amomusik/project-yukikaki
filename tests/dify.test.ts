import { describe, expect, it } from "vitest";
import { briefReviewSchema, extractJson, parseOutputs, teamReviewSchema } from "@/lib/integrations/dify";
import { parseLinkupResponse } from "@/lib/integrations/linkup";
import fixture from "./fixtures/dify-brief-review.json";
import linkup from "./fixtures/linkup-search.json";

describe("Dify output parsing", () => {
  it("maps the brief-review fixture (JSON inside a fenced LLM answer)", () => {
    const r = parseOutputs(fixture.data.outputs, briefReviewSchema);
    expect(r).toMatchObject({ recommendation: "approve", score: 82, pii_found: false });
    expect(r.normalized?.en.title).toBe("Automate reservations");
    expect(r.skills_needed).toContain("line-bot");
  });

  it("accepts already-structured outputs", () => {
    const r = parseOutputs({ recommendation: "revise", score: "40", issues: [], lead_named: true }, teamReviewSchema);
    expect(r).toMatchObject({ recommendation: "revise", score: 40, lead_named: true });
  });

  it("throws on malformed output (callers turn this into ai_review.error)", () => {
    expect(() => parseOutputs({ result: "I cannot help with that" }, briefReviewSchema)).toThrow();
    expect(() => parseOutputs({ result: '{"recommendation":"maybe","score":5}' }, briefReviewSchema)).toThrow();
    expect(() => extractJson("no braces")).toThrow();
  });
});

describe("Linkup parsing", () => {
  it("keeps text results only and falls back to the URL as title", () => {
    const r = parseLinkupResponse(linkup);
    expect(r).toHaveLength(2);
    expect(r[1].title).toBe("https://example.jp/no-title");
  });
});
