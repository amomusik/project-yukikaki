import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* ── Mocks: Clerk, Next.js navigation/after, server-only ── */
const clerk = vi.hoisted(() => ({
  userId: null as string | null,
  user: null as null | Record<string, unknown>,
  updateUserMetadata: vi.fn(async () => ({})),
}));
vi.mock("server-only", () => ({}));
// lib/auth only consults Clerk when both keys are set (see authEnabled()).
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_dummy";
  process.env.CLERK_SECRET_KEY = "sk_test_dummy";
});
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: clerk.userId }),
  currentUser: async () => clerk.user,
  clerkClient: async () => ({ users: { updateUserMetadata: clerk.updateUserMetadata } }),
}));
class RedirectSignal extends Error {
  constructor(public url: string) {
    super(`NEXT_REDIRECT ${url}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
}));
const afterQueue = vi.hoisted(() => [] as (() => unknown)[]);
vi.mock("next/server", async (orig) => ({ ...(await orig<object>()), after: (fn: () => unknown) => afterQueue.push(fn) }));
const grantStore = vi.hoisted(() => ({ refresh: vi.fn(), ids: vi.fn() }));
vi.mock("@/lib/grants/store", () => ({ refreshGrantMatches: grantStore.refresh, publishedBriefIds: grantStore.ids }));

import { getDb, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { briefSyncStatements, deliverySyncStatements, rebuildGraph, syncBrief, syncBuilder, teamSyncStatements } from "@/lib/graph/sync";
import { challengeNeighborhood, fullGraph, suggestBuilders, suggestBuildersSql } from "@/lib/graph/queries";
import { chooseRole, ensureUser, requireRole, requireUser } from "@/lib/auth";
import { scheduleAllGrantRefresh, scheduleGrantRefresh } from "@/lib/grants/schedule";
import { makeBrief, makeUser } from "../helpers";

describe("graph projection (Neo4j not configured → statements built from Postgres, writes fall back)", () => {
  it("brief statements include business, city, datasets, entities and only open grants", async () => {
    const db = getDb();
    const { brief } = await makeBrief("approved", { city: "札幌市", industry: "ラーメン" });
    await db.insert(schema.dataSources).values({ briefId: brief.id, kind: "live", provider: "linkup", title: "Stats", groundingLevel: "analog", matchedCity: "Asahikawa" });
    await db.insert(schema.entities).values([
      { kind: "venue", name: { ja: "図書館", en: "Library" }, city: "札幌市", industries: [] },
      { kind: "funder", name: { ja: "銀行", en: "" }, city: "札幌市", industries: ["ramen"] },
      { kind: "stakeholder", name: { ja: "漁協", en: "Co-op" }, city: "札幌市", industries: ["fishery"] },
    ]);
    const past = new Date(Date.now() - 86_400_000);
    await db.insert(schema.grantMatches).values([
      { briefId: brief.id, source: "jgrants", externalId: "OPEN", title: "Open grant", url: "https://www.jgrants-portal.go.jp/subsidy/OPEN", deadline: null },
      { briefId: brief.id, source: "jgrants", externalId: "CLOSED", title: "Closed", url: "https://x", deadline: past },
    ]);
    const st = await briefSyncStatements(brief.id);
    const params = JSON.stringify(st.map((s) => s.params));
    expect(st.length).toBeGreaterThan(0);
    expect(params).toContain("Library");
    expect(params).toContain("銀行"); // falls back to ja name when en is empty
    expect(params).not.toContain("Co-op"); // other industry
    expect(params).toContain("grant:jgrants:OPEN");
    expect(params).not.toContain("CLOSED");
    expect(params).toContain("sapporo");
    expect(params).toContain("asahikawa");
    expect(await briefSyncStatements("00000000-0000-4000-8000-000000000000")).toEqual([]);
  });

  it("team statements need a lead; delivery statements carry the English summary", async () => {
    const db = getDb();
    const { brief } = await makeBrief("in_progress");
    const lead = await makeUser("student", { skills: ["line-bot"] });
    const [team] = await db.insert(schema.teams).values({ briefId: brief.id, name: "T", pitch: "p", status: "approved" }).returning();
    expect(await teamSyncStatements(team.id)).toEqual([]); // no members yet → no lead
    await db.insert(schema.teamMembers).values({ teamId: team.id, userId: lead.id, role: "lead" });
    expect(JSON.stringify(await teamSyncStatements(team.id))).toContain(lead.id);
    expect(await teamSyncStatements("00000000-0000-4000-8000-000000000000")).toEqual([]);
    const [d] = await db.insert(schema.deliveries).values({ teamId: team.id, briefId: brief.id, summary: { ja: "納品", en: "Delivered bot" }, supportContactUserId: lead.id, supportUntil: "2027-01-01" }).returning();
    expect(JSON.stringify(await deliverySyncStatements(d.id))).toContain("Delivered bot");
    expect(await deliverySyncStatements("00000000-0000-4000-8000-000000000000")).toEqual([]);
  });

  it("sync* never throw without Neo4j (guarded); rebuildGraph does (CLI)", async () => {
    const { brief } = await makeBrief("approved");
    const r = await syncBrief(brief.id);
    expect(r).toMatchObject({ ok: false, fellBack: true, value: false });
    expect(r.error).toMatch(/neo4j is not configured/);
    expect((await syncBuilder({ id: "u", displayName: "n", skills: [] })).ok).toBe(false);
    await expect(rebuildGraph()).rejects.toThrow(/neo4j is not configured/);
  });

  it("graph reads fall back: empty graphs and SQL builder suggestions ranked by shared skills", async () => {
    expect(await fullGraph()).toEqual({ nodes: [], links: [], available: false });
    expect((await challengeNeighborhood("x")).available).toBe(false);
    const db = getDb();
    const { brief } = await makeBrief("approved");
    await db.update(schema.briefs).set({ skillsNeeded: ["line-bot", "booking-automation", "spreadsheets"] }).where(eq(schema.briefs.id, brief.id));
    const two = await makeUser("student", { skills: ["LINE-BOT", "spreadsheets"], displayName: "Zed" });
    const one = await makeUser("student", { skills: ["booking-automation"], displayName: "Amy" });
    await makeUser("student", { skills: ["unrelated"] });
    const viaGuard = await suggestBuilders(brief.id, 50);
    const sql = await suggestBuildersSql(brief.id, 50);
    expect(viaGuard).toEqual(sql);
    const ids = sql.map((s) => s.id);
    expect(ids.indexOf(two.id)).toBeLessThan(ids.indexOf(one.id));
    expect(sql.find((s) => s.id === two.id)?.sharedSkills).toHaveLength(2);
    expect(await suggestBuildersSql("00000000-0000-4000-8000-000000000000")).toEqual([]);
  });
});

describe("auth (Clerk mirrored lazily into users)", () => {
  let savedHosts: string | undefined;
  beforeEach(() => {
    savedHosts = env.HOST_EMAILS;
    env.HOST_EMAILS = "Boss@Town.example";
    clerk.updateUserMetadata.mockClear();
  });
  afterEach(() => {
    env.HOST_EMAILS = savedHosts;
    clerk.userId = null;
    clerk.user = null;
  });
  const cu = (over: Record<string, unknown> = {}) => ({ primaryEmailAddress: { emailAddress: "New@Example.com" }, emailAddresses: [], firstName: "Hana", lastName: "Sato", username: null, publicMetadata: {}, ...over });

  it("signed out → null; requireUser redirects to sign-in", async () => {
    expect(await ensureUser()).toBeNull();
    await expect(requireUser("ja")).rejects.toMatchObject({ url: "/ja/sign-in" });
  });

  it("first sight inserts the user without a role (→ onboarding), later calls use the fast path", async () => {
    clerk.userId = `clerk_${Math.random()}`;
    clerk.user = cu();
    const u = await ensureUser();
    expect(u).toMatchObject({ email: "new@example.com", displayName: "Hana Sato", role: null });
    await expect(requireUser("en")).rejects.toMatchObject({ url: "/en/onboarding" });
    const s = await chooseRole("student", ["line-bot"]);
    expect(s).toMatchObject({ role: "student", skills: ["line-bot"] });
    expect(clerk.updateUserMetadata).toHaveBeenCalledWith(clerk.userId, { publicMetadata: { role: "student" } });
    clerk.user = null; // fast path must not need Clerk's currentUser
    expect((await requireRole("ja", "student")).id).toBe(u!.id);
    await expect(requireRole("ja", "host")).rejects.toMatchObject({ url: "/ja" });
  });

  it("HOST_EMAILS promotes on first sight and on the fast path; hosts can't self-demote", async () => {
    clerk.userId = `clerk_${Math.random()}`;
    clerk.user = cu({ primaryEmailAddress: { emailAddress: "boss@town.example" } });
    expect((await ensureUser())?.role).toBe("host");
    expect(clerk.updateUserMetadata).toHaveBeenCalledWith(clerk.userId, { publicMetadata: { role: "host" } });
    expect((await chooseRole("business"))?.role).toBe("host");

    const existing = await makeUser("business", { email: "boss@town.example" });
    clerk.userId = existing.clerkId;
    expect((await ensureUser())?.role).toBe("host");
  });

  it("existing row without a role is updated from Clerk metadata; display name falls back to email", async () => {
    const id = `clerk_${Math.random()}`;
    const [row] = await getDb().insert(schema.users).values({ clerkId: id, email: "old@example.com", displayName: "x" }).returning();
    clerk.userId = id;
    clerk.user = cu({ firstName: null, lastName: null, publicMetadata: { role: "business" } });
    const u = await ensureUser();
    expect(u).toMatchObject({ id: row.id, role: "business", email: "new@example.com" });
    clerk.user = cu({ firstName: null, lastName: null, primaryEmailAddress: null, emailAddresses: [{ emailAddress: "fallback@example.com" }] });
    clerk.userId = `clerk_${Math.random()}`;
    expect((await ensureUser())?.displayName).toBe("fallback");
  });

  it("Clerk metadata failures are logged, not thrown", async () => {
    clerk.updateUserMetadata.mockRejectedValueOnce(new Error("clerk down"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    clerk.userId = `clerk_${Math.random()}`;
    clerk.user = cu({ primaryEmailAddress: { emailAddress: "boss@town.example" } });
    expect((await ensureUser())?.role).toBe("host");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    clerk.userId = null;
    await expect(chooseRole("student")).rejects.toThrow(/Not signed in/);
  });
});

describe("grant refresh scheduling (runs after the response)", () => {
  it("defers work with after(); logs failures instead of throwing", async () => {
    afterQueue.length = 0;
    grantStore.refresh.mockResolvedValueOnce({ count: 2, warnings: [] });
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    scheduleGrantRefresh("b1");
    expect(grantStore.refresh).not.toHaveBeenCalled();
    await afterQueue.shift()!();
    expect(grantStore.refresh).toHaveBeenCalledWith("b1");
    expect(info).toHaveBeenCalled();

    grantStore.ids.mockResolvedValueOnce(["b2", "b3"]);
    grantStore.refresh.mockRejectedValueOnce(new Error("jgrants 429")).mockResolvedValueOnce({ count: 0, warnings: ["none"] });
    scheduleAllGrantRefresh();
    await afterQueue.shift()!();
    expect(grantStore.refresh).toHaveBeenNthCalledWith(2, "b2");
    expect(grantStore.refresh).toHaveBeenNthCalledWith(3, "b3");
    expect(error).toHaveBeenCalledWith("[grants] refresh failed", "b2", expect.any(Error));
    info.mockRestore();
    error.mockRestore();
  });
});
