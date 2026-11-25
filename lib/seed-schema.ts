import { z } from "zod";
import { SKILLS } from "@/lib/skills";

/** Shape of seed/seed.json — synthetic demo content loaded by `pnpm seed`. */
/** Hours per week, at most one decimal place (e.g. 2.5). */
const hours = z
  .number()
  .nonnegative()
  .refine((n) => Math.abs(n * 10 - Math.round(n * 10)) < 1e-9, "at most one decimal place");

const lang = z.object({
  title: z.string(),
  problem: z.string(),
  current_process: z.string(),
  desired_outcome: z.string(),
});
const bilingual = z.object({ ja: z.string(), en: z.string() });
const skill = z.enum(SKILLS);

export const seedSchema = z.object({
  users: z.array(
    z.object({
      key: z.string(),
      role: z.enum(["business", "student"]),
      displayName: z.string(),
      email: z.string().email(),
      skills: z.array(skill).default([]),
    }),
  ),
  businesses: z.array(
    z.object({
      key: z.string(),
      ownerKey: z.string(),
      name: z.string(),
      city: z.string(), // English city name matching lib/grounding/city-profiles.ts (e.g. "Sapporo")
      ward: z.string().nullable(),
      industry: z.string(), // key from lib/grounding/industry-neighbors.ts (e.g. "ramen")
    }),
  ),
  briefs: z.array(
    z.object({
      slug: z.string(), // also the filename of seed/prebaked/{slug}.json
      businessKey: z.string(),
      status: z.enum(["in_review", "approved", "rejected", "in_progress", "delivered", "evaluated"]),
      content: z.object({ ja: lang, en: lang }),
      transcript: z.string(),
      toolsUsed: z.array(z.string()),
      hoursLostPerWeek: hours,
      skillsNeeded: z.array(skill).min(1),
      dataSensitivity: z.enum(["public", "private", "synthetic_ok"]),
      aiReview: z.object({
        recommendation: z.enum(["approve", "revise", "reject"]),
        score: z.number().min(0).max(100),
        issues: z.array(z.string()),
        pii_found: z.boolean(),
        grounding_comment: z.string(),
      }),
    }),
  ),
  teams: z.array(
    z.object({
      key: z.string(),
      briefSlug: z.string(),
      name: z.string(),
      pitch: z.string(),
      status: z.enum(["pending", "approved", "rejected", "delivered"]),
      leadKey: z.string(),
      memberKeys: z.array(z.string()),
    }),
  ),
  deliveries: z.array(
    z.object({
      teamKey: z.string(),
      summary: bilingual,
      links: z.array(z.string()),
      handoverNotes: z.string(),
      deliveredAt: z.string(), // ISO date
    }),
  ),
  evaluations: z.array(
    z.object({
      teamKey: z.string(),
      hoursSavedPerWeek: hours,
      satisfaction: z.number().int().min(1).max(5),
      stillInUse: z.boolean(),
      issues: z.string(),
      wouldRecommend: z.boolean(),
      quote: z.string(),
    }),
  ),
  entities: z.array(
    z.object({
      kind: z.enum(["stakeholder", "venue", "funder"]),
      name: bilingual,
      city: z.string(),
      ward: z.string().nullable(),
      industries: z.array(z.string()).default([]),
    }),
  ),
});
export type Seed = z.infer<typeof seedSchema>;
