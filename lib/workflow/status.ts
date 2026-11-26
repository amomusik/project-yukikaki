import type { BriefStatus, EventStatus, TeamStatus } from "@/lib/db/schema";

/** The single source of truth for which status changes are legal. */
export const BRIEF_TRANSITIONS: Record<BriefStatus, BriefStatus[]> = {
  draft: ["enriching"],
  enriching: ["in_review"],
  in_review: ["approved", "rejected", "enriching"], // enriching = host re-runs enrichment
  rejected: ["in_review"],
  approved: ["in_progress"],
  in_progress: ["delivered"],
  delivered: ["evaluated"],
  evaluated: [],
};

export const TEAM_TRANSITIONS: Record<TeamStatus, TeamStatus[]> = {
  pending: ["approved", "rejected"],
  approved: ["delivered"],
  rejected: [],
  delivered: [],
};

/**
 * Events: a draft is published or dropped; a published event can only be cancelled (it is never
 * silently un-published, because people have RSVP'd); cancellation is terminal, so a cancelled event
 * can't be re-published and reopen RSVPs. Create a new event instead.
 */
export const EVENT_TRANSITIONS: Record<EventStatus, EventStatus[]> = {
  draft: ["published", "cancelled"],
  published: ["cancelled"],
  cancelled: [],
};

const TABLES: Record<"brief" | "team" | "event", Record<string, string[]>> = {
  brief: BRIEF_TRANSITIONS,
  team: TEAM_TRANSITIONS,
  event: EVENT_TRANSITIONS,
};

export class TransitionError extends Error {
  constructor(entity: string, from: string, to: string) {
    super(`Illegal ${entity} transition: ${from} → ${to}`);
    this.name = "TransitionError";
  }
}

export function canTransition(entity: "brief", from: BriefStatus, to: BriefStatus): boolean;
export function canTransition(entity: "team", from: TeamStatus, to: TeamStatus): boolean;
export function canTransition(entity: "event", from: EventStatus, to: EventStatus): boolean;
export function canTransition(entity: "brief" | "team" | "event", from: string, to: string): boolean {
  return TABLES[entity][from]?.includes(to) ?? false;
}

export function assertTransition(entity: "brief", from: BriefStatus, to: BriefStatus): void;
export function assertTransition(entity: "team", from: TeamStatus, to: TeamStatus): void;
export function assertTransition(entity: "event", from: EventStatus, to: EventStatus): void;
export function assertTransition(entity: "brief" | "team" | "event", from: string, to: string): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!canTransition(entity as any, from as any, to as any)) throw new TransitionError(entity, from, to);
}
