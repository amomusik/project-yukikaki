/**
 * "Bring any team" (coming soon): client-safe constants for the landing-page party demo and
 * the waitlist form. The demo is a fixed mapping computed in the browser; no API calls.
 */
const HELPER_ROLES = ["researcher", "scout", "fundraiser", "diplomat", "translator", "datachef"] as const;
type HelperRole = (typeof HELPER_ROLES)[number];

export const TEAM_MEMBERS = ["students", "shop", "town", "designer", "developer", "translator"] as const;
export type TeamMember = (typeof TEAM_MEMBERS)[number];

/** Which prep workstreams each kind of human usually covers. */
const COVERS: Record<TeamMember, HelperRole[]> = {
  students: ["researcher"],
  shop: ["diplomat"],
  town: ["fundraiser", "scout"],
  designer: ["scout"],
  developer: ["datachef"],
  translator: ["translator"],
};

export type Slot = { role: HelperRole; by: TeamMember | null };

/** Six role slots: the first chosen human that covers a role takes it; every gap goes to a helper. */
export function fillParty(team: readonly TeamMember[]): Slot[] {
  return HELPER_ROLES.map((role) => ({ role, by: TEAM_MEMBERS.find((m) => team.includes(m) && COVERS[m].includes(role)) ?? null }));
}

/** Coming-soon roadmap features sharing one waitlist. */
export const ROADMAP_FEATURES = ["team", "pm", "points"] as const;
export type RoadmapFeature = (typeof ROADMAP_FEATURES)[number];

export const WAITLIST_ROLES = ["student", "shop", "town", "designer", "developer", "translator", "other"] as const;
