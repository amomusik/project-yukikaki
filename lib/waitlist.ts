import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { withFallback } from "@/lib/integrations/_guard";
import { sendWaitlistEmail } from "@/lib/integrations/email";
import { ROADMAP_FEATURES, WAITLIST_ROLES } from "@/lib/party";

/** Shared waitlist for the coming-soon roadmap features (any team, virtual PM, points & rewards). */
export const waitlistSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  org: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => v || null),
  role: z.enum(WAITLIST_ROLES),
  features: z
    .array(z.enum(ROADMAP_FEATURES))
    .min(1)
    .transform((xs) => ROADMAP_FEATURES.filter((f) => xs.includes(f))),
  locale: z.enum(["en", "ja"]).catch("en"),
  /** Honeypot: hidden from people; bots that fill it get a fake success. */
  website: z.string().optional(),
});

export type WaitlistInput = z.input<typeof waitlistSchema>;

export type WaitlistResult =
  | { ok: true; status: "joined" | "already"; emailed: boolean }
  | { ok: false; error: "invalid"; fields: string[] }
  | { ok: false; error: "rateLimited" | "server" };

/** Fixed-window in-memory limiter keyed by IP. Good enough for one region; resets on cold start. */
export function createRateLimiter(limit = 5, windowMs = 10 * 60_000) {
  const hits = new Map<string, { start: number; count: number }>();
  return {
    check(key: string, now = Date.now()): boolean {
      const h = hits.get(key);
      if (!h || now - h.start >= windowMs) {
        hits.set(key, { start: now, count: 1 });
        if (hits.size > 10_000) for (const [k, v] of hits) if (now - v.start >= windowMs) hits.delete(k);
        return true;
      }
      h.count += 1;
      return h.count <= limit;
    },
  };
}

const g = globalThis as unknown as { __ykWaitlistLimiter?: ReturnType<typeof createRateLimiter> };
export const waitlistLimiter = (g.__ykWaitlistLimiter ??= createRateLimiter());

type Deps = {
  limiter?: ReturnType<typeof createRateLimiter>;
  sendEmail?: typeof sendWaitlistEmail;
  now?: number;
};

export async function joinWaitlist(raw: WaitlistInput, ip: string, deps: Deps = {}): Promise<WaitlistResult & { emailId?: string }> {
  const limiter = deps.limiter ?? waitlistLimiter;
  if (!limiter.check(ip || "unknown", deps.now)) return { ok: false, error: "rateLimited" };

  const parsed = waitlistSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "invalid", fields: [...new Set(parsed.error.issues.map((i) => String(i.path[0])))] };
  }
  const { email, org, role, locale, website, features } = parsed.data;
  if (website && website.trim() !== "") return { ok: true, status: "joined", emailed: false };

  let inserted: { id: string }[];
  try {
    inserted = await getDb()
      .insert(schema.waitlist)
      .values({ email, org, role, locale, features })
      .onConflictDoNothing({ target: schema.waitlist.email })
      .returning({ id: schema.waitlist.id });
  } catch (e) {
    console.error("waitlist insert failed", e);
    return { ok: false, error: "server" };
  }
  // Already on the list: say so, but don't send a second email.
  if (inserted.length === 0) return { ok: true, status: "already", emailed: false };

  const send = deps.sendEmail ?? sendWaitlistEmail;
  const r = await withFallback("resend", "waitlistConfirm", () => send({ to: email, org, locale, features }), null, { timeoutMs: 15_000 });
  if (r.value) console.info(`waitlist confirmation sent: resend id ${r.value.id}`);
  return { ok: true, status: "joined", emailed: Boolean(r.value), emailId: r.value?.id };
}
