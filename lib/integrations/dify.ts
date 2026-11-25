import { z } from "zod";
import { configured, env } from "@/lib/env";
import type { AiReview, BriefContent } from "@/lib/db/schema";
import { fetchJson, NotConfiguredError } from "./_guard";

/**
 * Dify workflow API — POST {DIFY_API_URL}/v1/workflows/run (blocking).
 * Import dify/brief-review.yml and dify/team-review.yml into Dify, then put
 * each app's API key in DIFY_BRIEF_REVIEW_KEY / DIFY_TEAM_REVIEW_KEY.
 * Dify only RECOMMENDS. Status changes happen only via a host decision.
 */

const langContent = z.object({
  title: z.string(),
  problem: z.string(),
  current_process: z.string(),
  desired_outcome: z.string(),
});

export const briefReviewSchema = z.object({
  recommendation: z.enum(["approve", "revise", "reject"]),
  score: z.coerce.number().min(0).max(100),
  issues: z.array(z.string()).default([]),
  pii_found: z.coerce.boolean().default(false),
  grounding_comment: z.string().default(""),
  skills_needed: z.array(z.string()).default([]),
  normalized: z.object({ ja: langContent, en: langContent }).optional(),
});
export type BriefReview = z.infer<typeof briefReviewSchema>;

export const teamReviewSchema = z.object({
  recommendation: z.enum(["approve", "revise", "reject"]),
  score: z.coerce.number().min(0).max(100),
  issues: z.array(z.string()).default([]),
  lead_named: z.coerce.boolean().default(false),
});
export type TeamReview = z.infer<typeof teamReviewSchema>;

/** Pull a JSON object out of an LLM text answer (handles ```json fences and chatter). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("No JSON object in Dify output");
  return JSON.parse(body.slice(start, end + 1));
}

/** Dify end-node outputs: either `{ result: "<json text>" }` or already-structured fields. */
export function parseOutputs<T>(outputs: Record<string, unknown>, schema: z.ZodType<T>): T {
  const raw = typeof outputs.result === "string" ? extractJson(outputs.result) : (outputs.result ?? outputs);
  return schema.parse(raw);
}

const runResponse = z.object({
  data: z.object({
    status: z.string(),
    outputs: z.record(z.string(), z.unknown()).nullish(),
    error: z.string().nullish(),
  }),
});

export async function runWorkflow(
  apiKey: string,
  inputs: Record<string, string>,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const json = runResponse.parse(
    await fetchJson(`${env.DIFY_API_URL.replace(/\/$/, "")}/v1/workflows/run`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ inputs, response_mode: "blocking", user: "yukikaki-server" }),
      signal,
    }),
  );
  if (json.data.status !== "succeeded") throw new Error(`Dify workflow ${json.data.status}: ${json.data.error ?? ""}`);
  return json.data.outputs ?? {};
}

export async function reviewBrief(
  input: { content: BriefContent; transcript: string; sources: string; groundingLevel: string; meta: string },
  signal?: AbortSignal,
): Promise<BriefReview> {
  if (!configured.difyBrief()) throw new NotConfiguredError("dify");
  const outputs = await runWorkflow(
    env.DIFY_BRIEF_REVIEW_KEY!,
    {
      brief: JSON.stringify(input.content),
      transcript: input.transcript.slice(0, 20_000),
      sources: input.sources.slice(0, 10_000),
      grounding_level: input.groundingLevel,
      meta: input.meta,
    },
    signal,
  );
  return parseOutputs(outputs, briefReviewSchema);
}

export async function reviewTeam(
  input: { brief: string; team: string; members: string },
  signal?: AbortSignal,
): Promise<TeamReview> {
  if (!configured.difyTeam()) throw new NotConfiguredError("dify");
  const outputs = await runWorkflow(env.DIFY_TEAM_REVIEW_KEY!, input, signal);
  return parseOutputs(outputs, teamReviewSchema);
}

export function toAiReview(r: BriefReview | TeamReview): AiReview {
  return {
    recommendation: r.recommendation,
    score: r.score,
    issues: r.issues,
    pii_found: "pii_found" in r ? r.pii_found : undefined,
    grounding_comment: "grounding_comment" in r ? r.grounding_comment : undefined,
  };
}

export const AI_REVIEW_UNAVAILABLE = (error: string): AiReview => ({
  recommendation: null,
  error: `AI review unavailable: ${error}`,
});
