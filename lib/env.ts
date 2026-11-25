import { z } from "zod";

/**
 * Validated environment. Nothing here throws at import time so the app can boot
 * with partial configuration; integrations check `configured.x` and fall back.
 */
const empty = (v: unknown) => (v === "" ? undefined : v);
const opt = z.preprocess(empty, z.string().optional());

const schema = z.object({
  APP_URL: z.preprocess(empty, z.string().url().default("http://localhost:3000")),
  HOST_EMAILS: opt,
  FEEDBACK_TOKEN_SECRET: opt,
  DATABASE_URL: opt,
  PGLITE_DIR: opt,
  NEO4J_URI: opt,
  NEO4J_USERNAME: opt,
  NEO4J_PASSWORD: opt,
  ELEVENLABS_API_KEY: opt,
  ELEVENLABS_INTERVIEW_AGENT_ID: opt,
  ELEVENLABS_IMPACT_AGENT_ID: opt,
  ELEVENLABS_WEBHOOK_SECRET: opt,
  LINKUP_API_KEY: opt,
  DIFY_API_URL: z.preprocess(empty, z.string().default("https://api.dify.ai")),
  DIFY_BRIEF_REVIEW_KEY: opt,
  DIFY_TEAM_REVIEW_KEY: opt,
  ADAPTION_API_KEY: opt,
  ADAPTION_API_URL: z.preprocess(empty, z.string().default("https://api.prod.adaptionlabs.ai")),
  RESEND_API_KEY: opt,
  REQUIRE_LIVE_SERVICES: opt,
  EMAIL_FROM: z.preprocess(empty, z.string().default("Yukikaki <noreply@example.com>")),
});

export type Env = z.infer<typeof schema>;

export function readEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${msg}\nSee .env.example`);
  }
  return parsed.data;
}

export const env = readEnv();

export const configured = {
  database: () => Boolean(env.DATABASE_URL),
  neo4j: () => Boolean(env.NEO4J_URI && env.NEO4J_USERNAME && env.NEO4J_PASSWORD),
  elevenlabs: () => Boolean(env.ELEVENLABS_API_KEY),
  linkup: () => Boolean(env.LINKUP_API_KEY),
  difyBrief: () => Boolean(env.DIFY_BRIEF_REVIEW_KEY),
  difyTeam: () => Boolean(env.DIFY_TEAM_REVIEW_KEY),
  adaption: () => Boolean(env.ADAPTION_API_KEY),
  resend: () => Boolean(env.RESEND_API_KEY),
};

export function hostEmails(): string[] {
  return (env.HOST_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function feedbackSecret(): string {
  // Dev default keeps local demos working; production must set the real secret.
  return env.FEEDBACK_TOKEN_SECRET ?? "dev-only-insecure-feedback-secret-change-me";
}

/** Live-only mode: every partner service must be configured; no pre-baked substitutes. */
export function requireLiveServices(): boolean {
  return ["1", "true", "yes"].includes((env.REQUIRE_LIVE_SERVICES ?? "").toLowerCase());
}
