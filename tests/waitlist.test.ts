import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { getDb, schema } from "@/lib/db";
import { fillParty } from "@/lib/party";
import { createRateLimiter, joinWaitlist, waitlistSchema, type WaitlistInput } from "@/lib/waitlist";

const base: WaitlistInput = { email: "Builder@Example.com", org: "Otaru Shop", role: "shop", locale: "ja", features: ["pm", "team"] };
const fresh = () => ({ limiter: createRateLimiter(100), sendEmail: vi.fn(async () => ({ id: "re_test_123" })) });
const rows = (email: string) => getDb().select().from(schema.waitlist).where(eq(schema.waitlist.email, email));

describe("waitlist validation", () => {
  it("normalises valid input", () => {
    const r = waitlistSchema.parse({ ...base, org: "  " });
    expect(r).toMatchObject({ email: "builder@example.com", org: null, role: "shop", locale: "ja", features: ["team", "pm"] });
  });

  it("rejects bad email, unknown role and empty features, naming the fields", async () => {
    const r = await joinWaitlist({ ...base, email: "nope", role: "wizard" as never, features: [] }, "1.1.1.1", fresh());
    expect(r).toEqual({ ok: false, error: "invalid", fields: expect.arrayContaining(["email", "role", "features"]) });
  });

  it("falls back to English for an unknown locale", () => {
    expect(waitlistSchema.parse({ ...base, locale: "fr" }).locale).toBe("en");
  });
});

describe("joinWaitlist", () => {
  it("stores one row, sends one confirmation in the user's locale", async () => {
    const deps = fresh();
    const r = await joinWaitlist({ ...base, email: "first@example.com" }, "2.2.2.2", deps);
    expect(r).toMatchObject({ ok: true, status: "joined", emailed: true, emailId: "re_test_123" });
    expect(deps.sendEmail).toHaveBeenCalledWith({ to: "first@example.com", org: "Otaru Shop", locale: "ja", features: ["team", "pm"] });
    const [row] = await rows("first@example.com");
    expect(row).toMatchObject({ org: "Otaru Shop", role: "shop", locale: "ja", features: ["team", "pm"] });
  });

  it("treats a duplicate email (any case) as already joined without a second email", async () => {
    const deps = fresh();
    await joinWaitlist({ ...base, email: "dup@example.com" }, "3.3.3.3", deps);
    const r = await joinWaitlist({ ...base, email: "DUP@example.com", role: "student" }, "3.3.3.3", deps);
    expect(r).toEqual({ ok: true, status: "already", emailed: false });
    expect(deps.sendEmail).toHaveBeenCalledTimes(1);
    expect(await rows("dup@example.com")).toHaveLength(1);
  });

  it("silently drops honeypot submissions", async () => {
    const deps = fresh();
    const r = await joinWaitlist({ ...base, email: "bot@example.com", website: "http://spam" }, "4.4.4.4", deps);
    expect(r).toMatchObject({ ok: true, status: "joined", emailed: false });
    expect(deps.sendEmail).not.toHaveBeenCalled();
    expect(await rows("bot@example.com")).toHaveLength(0);
  });

  it("still saves the signup when email is not configured", async () => {
    const r = await joinWaitlist({ ...base, email: "noemail@example.com" }, "5.5.5.5", { limiter: createRateLimiter(100) });
    expect(r).toMatchObject({ ok: true, status: "joined", emailed: false });
    expect(await rows("noemail@example.com")).toHaveLength(1);
  });

  it("rate-limits per IP within the window, then resets", async () => {
    const limiter = createRateLimiter(2, 60_000);
    const deps = { limiter, sendEmail: vi.fn(async () => ({ id: "re_x" })) };
    const t0 = 1_000_000;
    expect((await joinWaitlist({ ...base, email: "rl1@example.com" }, "9.9.9.9", { ...deps, now: t0 })).ok).toBe(true);
    expect((await joinWaitlist({ ...base, email: "rl2@example.com" }, "9.9.9.9", { ...deps, now: t0 + 1 })).ok).toBe(true);
    expect(await joinWaitlist({ ...base, email: "rl3@example.com" }, "9.9.9.9", { ...deps, now: t0 + 2 })).toEqual({ ok: false, error: "rateLimited" });
    expect(await rows("rl3@example.com")).toHaveLength(0);
    // Another IP is unaffected; the same IP recovers after the window.
    expect((await joinWaitlist({ ...base, email: "rl4@example.com" }, "8.8.8.8", { ...deps, now: t0 + 3 })).ok).toBe(true);
    expect((await joinWaitlist({ ...base, email: "rl5@example.com" }, "9.9.9.9", { ...deps, now: t0 + 60_001 })).ok).toBe(true);
  });
});

describe("party demo mapping", () => {
  it("fills uncovered roles with helpers", () => {
    expect(fillParty([]).every((s) => s.by === null)).toBe(true);
    const p = fillParty(["town", "translator"]);
    expect(p.filter((s) => s.by).map((s) => s.role)).toEqual(["scout", "fundraiser", "translator"]);
    expect(p).toHaveLength(6);
  });
});
