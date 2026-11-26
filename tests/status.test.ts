import { describe, expect, it } from "vitest";
import { BRIEF_TRANSITIONS, EVENT_TRANSITIONS, TEAM_TRANSITIONS, TransitionError, assertTransition, canTransition } from "@/lib/workflow/status";
import type { BriefStatus, EventStatus, TeamStatus } from "@/lib/db/schema";

const briefStates = Object.keys(BRIEF_TRANSITIONS) as BriefStatus[];
const teamStates = Object.keys(TEAM_TRANSITIONS) as TeamStatus[];

describe("brief transitions", () => {
  it("allows exactly the transitions in the table", () => {
    for (const from of briefStates)
      for (const to of briefStates) {
        const allowed = BRIEF_TRANSITIONS[from].includes(to);
        expect(canTransition("brief", from, to)).toBe(allowed);
        if (allowed) expect(() => assertTransition("brief", from, to)).not.toThrow();
        else expect(() => assertTransition("brief", from, to)).toThrow(TransitionError);
      }
  });

  it("follows the full lifecycle", () => {
    const path: BriefStatus[] = ["draft", "enriching", "in_review", "approved", "in_progress", "delivered", "evaluated"];
    for (let i = 0; i < path.length - 1; i++) expect(canTransition("brief", path[i], path[i + 1])).toBe(true);
  });

  it("rejects shortcuts", () => {
    expect(canTransition("brief", "approved", "delivered")).toBe(false);
    expect(canTransition("brief", "draft", "approved")).toBe(false);
    expect(canTransition("brief", "in_review", "evaluated")).toBe(false);
    expect(canTransition("brief", "rejected", "in_review")).toBe(true);
  });

  it("allows the host to re-run enrichment on a brief in review", () => {
    expect(canTransition("brief", "in_review", "enriching")).toBe(true);
    expect(canTransition("brief", "enriching", "in_review")).toBe(true);
    expect(canTransition("brief", "approved", "enriching")).toBe(false);
    expect(canTransition("brief", "rejected", "enriching")).toBe(false);
  });
});

describe("team transitions", () => {
  it("allows exactly the transitions in the table", () => {
    for (const from of teamStates)
      for (const to of teamStates) expect(canTransition("team", from, to)).toBe(TEAM_TRANSITIONS[from].includes(to));
  });
  it("cannot deliver before approval", () => {
    expect(() => assertTransition("team", "pending", "delivered")).toThrow(TransitionError);
  });
});

describe("event transitions", () => {
  const eventStates = Object.keys(EVENT_TRANSITIONS) as EventStatus[];
  it("allows exactly the transitions in the table", () => {
    for (const from of eventStates)
      for (const to of eventStates) {
        const allowed = EVENT_TRANSITIONS[from].includes(to);
        expect(canTransition("event", from, to)).toBe(allowed);
        if (!allowed) expect(() => assertTransition("event", from, to)).toThrow(TransitionError);
      }
  });
  it("publishes or drops drafts, only cancels published events, and never reopens a cancelled one", () => {
    expect(EVENT_TRANSITIONS).toEqual({ draft: ["published", "cancelled"], published: ["cancelled"], cancelled: [] });
    expect(canTransition("event", "published", "draft")).toBe(false);
    expect(canTransition("event", "cancelled", "published")).toBe(false);
  });
});
