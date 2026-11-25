import "./load-env";
import { sql } from "drizzle-orm";
import { getDb, dbKind } from "@/lib/db";
import { configured, env, requireLiveServices } from "@/lib/env";
import { closeDriver, getDriver } from "@/lib/graph/client";
import { linkupSearch } from "@/lib/integrations/linkup";

/**
 * `pnpm check:services` — one line per service. Exit code is non-zero only when a
 * hard dependency (the database) fails; everything else has a fallback.
 */
type Line = { service: string; ok: boolean | null; detail: string; hard?: boolean };

async function check(service: string, enabled: boolean, fallback: string, fn: () => Promise<string>, hard = false): Promise<Line> {
  if (!enabled) return { service, ok: null, detail: `not configured (fallback: ${fallback})`, hard };
  try {
    return { service, ok: true, detail: await fn(), hard };
  } catch (e) {
    return { service, ok: false, detail: `${(e as Error).message.slice(0, 160)} (fallback: ${fallback})`, hard };
  }
}

async function http(url: string, headers: Record<string, string>) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 120)}`);
  return res;
}

async function main() {
  const lines: Line[] = await Promise.all([
    check("clerk", true, "keyless dev mode", async () => {
      if (!process.env.CLERK_SECRET_KEY) return "keyless dev mode (temporary keys; fine for local)";
      await http("https://api.clerk.com/v1/users?limit=1", { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` });
      return "API key valid";
    }),
    check("database", true, "none — required", async () => {
      await getDb().execute(sql`select 1`);
      if (requireLiveServices() && dbKind() !== "neon") {
        throw new Error("live-only mode requires Neon, but DATABASE_URL is unset (using local PGlite)");
      }
      return dbKind() === "neon" ? "Neon reachable" : "local PGlite (.data/pglite) — set DATABASE_URL for Neon";
    }, true),
    check("neo4j", configured.neo4j(), "graph panels show 'unavailable'; suggestions via SQL", async () => {
      await getDriver().verifyConnectivity();
      return "connected";
    }),
    check("elevenlabs", configured.elevenlabs(), "text interview form", async () => {
      const ids = { interview: env.ELEVENLABS_INTERVIEW_AGENT_ID, impact: env.ELEVENLABS_IMPACT_AGENT_ID };
      const out: string[] = [];
      for (const [k, id] of Object.entries(ids)) {
        if (!id) { out.push(`${k} agent id missing`); continue; }
        await http(`https://api.elevenlabs.io/v1/convai/agents/${id}`, { "xi-api-key": env.ELEVENLABS_API_KEY! });
        out.push(`${k} agent ok`);
      }
      return out.join(", ");
    }),
    check("linkup", configured.linkup(), "pre-baked grounding (seed/prebaked)", async () => {
      const r = await linkupSearch("札幌市 オープンデータ");
      return `search ok (${r.length} results)`;
    }),
    check("dify", configured.difyBrief() || configured.difyTeam(), "'AI review unavailable', host decides", async () => {
      const out: string[] = [];
      for (const [k, key] of Object.entries({ brief: env.DIFY_BRIEF_REVIEW_KEY, team: env.DIFY_TEAM_REVIEW_KEY })) {
        if (!key) { out.push(`${k}-review key missing`); continue; }
        await http(`${env.DIFY_API_URL.replace(/\/$/, "")}/v1/info`, { Authorization: `Bearer ${key}` });
        out.push(`${k}-review ok`);
      }
      return out.join(", ");
    }),
    check("adaption", configured.adaption(), "pre-baked stand-in rows", async () => {
      await http(`${env.ADAPTION_API_URL.replace(/\/$/, "")}/api/v1/datasets?limit=1`, { Authorization: `Bearer ${env.ADAPTION_API_KEY}` });
      return "API key valid";
    }),
    check("resend", configured.resend(), "copy-link in /admin", async () => {
      const res = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` }, signal: AbortSignal.timeout(10_000) });
      if (res.ok) return "API key valid";
      const body = await res.text();
      if (body.includes("restricted_api_key")) return "sending-only key (ok)";
      throw new Error(`HTTP ${res.status} ${body.slice(0, 120)}`);
    }),
  ]);

  for (const l of lines) console.log(`${l.ok === true ? "✓" : l.ok === false ? "✗" : "·"} ${l.service.padEnd(11)} ${l.detail}`);
  await closeDriver().catch(() => {});
  const strict = requireLiveServices();
  const failed = lines.filter((l) => (strict ? l.ok !== true : l.hard && l.ok === false));
  if (strict) console.log(failed.length ? `✗ live-only mode: ${failed.map((l) => l.service).join(", ")} not live` : "✓ live-only mode: every service is live");
  process.exit(failed.length ? 1 : 0);
}

main();
