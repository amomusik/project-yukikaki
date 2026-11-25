import { beforeEach, describe, expect, it, vi } from "vitest";

const ensureUser = vi.fn();
const requireRole = vi.fn();
const scheduleGrantRefresh = vi.fn();
const scheduleAllGrantRefresh = vi.fn();
const refreshGrantMatches = vi.fn();

vi.mock("@/lib/auth", () => ({ ensureUser: () => ensureUser(), requireRole: (...a: unknown[]) => requireRole(...a) }));
vi.mock("@/lib/grants/schedule", () => ({
  scheduleGrantRefresh: (id: string) => scheduleGrantRefresh(id),
  scheduleAllGrantRefresh: () => scheduleAllGrantRefresh(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/grants/store", async (orig) => ({
  ...(await orig<typeof import("@/lib/grants/store")>()),
  refreshGrantMatches: (...a: unknown[]) => refreshGrantMatches(...a),
}));

const BRIEF = "11111111-2222-4333-8444-555555555555";
const post = (body: unknown) =>
  new Request("http://localhost/api/grants/refresh", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
// requireRole redirects (throws) when the user is not a host.
const redirectNonHost = (role: string | null) =>
  requireRole.mockImplementation(async (_locale: string, ...roles: string[]) => {
    if (!role || !roles.includes(role)) throw new Error("NEXT_REDIRECT");
    return { id: "u1", role };
  });

beforeEach(() => vi.clearAllMocks());

describe("POST /api/grants/refresh", () => {
  it("401 when signed out", async () => {
    ensureUser.mockResolvedValue(null);
    const { POST } = await import("@/app/api/grants/refresh/route");
    expect((await POST(post({ briefId: BRIEF }))).status).toBe(401);
    expect(refreshGrantMatches).not.toHaveBeenCalled();
  });

  it("403 for non-hosts", async () => {
    const { POST } = await import("@/app/api/grants/refresh/route");
    for (const role of ["business", "student"]) {
      ensureUser.mockResolvedValue({ id: "u1", role });
      expect((await POST(post({ briefId: BRIEF }))).status).toBe(403);
    }
    expect(refreshGrantMatches).not.toHaveBeenCalled();
  });

  it("400 on a bad body, 200 for hosts, 502 when jGrants fails", async () => {
    ensureUser.mockResolvedValue({ id: "h1", role: "host" });
    const { POST } = await import("@/app/api/grants/refresh/route");
    expect((await POST(post({ briefId: "nope" }))).status).toBe(400);

    refreshGrantMatches.mockResolvedValueOnce({ briefId: BRIEF, count: 3, queries: ["DX"], prefecture: "北海道", warnings: [] });
    const ok = await POST(post({ briefId: BRIEF }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ count: 3 });

    refreshGrantMatches.mockRejectedValueOnce(new Error("jGrants search failed: HTTP 503"));
    expect((await POST(post({ briefId: BRIEF }))).status).toBe(502);
  });
});

describe("GET /api/grants", () => {
  it("rejects malformed ids and hides unpublished briefs", async () => {
    const { GET } = await import("@/app/api/grants/route");
    expect((await GET(new Request("http://localhost/api/grants?brief=xyz"))).status).toBe(400);
    const { makeBrief } = await import("./helpers");
    const { brief } = await makeBrief("in_review");
    expect((await GET(new Request(`http://localhost/api/grants?brief=${brief.id}`))).status).toBe(404);
    const pub = await makeBrief("approved");
    const res = await GET(new Request(`http://localhost/api/grants?brief=${pub.brief.id}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ grants: [], eligibility: "https://grantline.foundrylabs.co.jp/en/grants" });
    expect(body.notice).toMatch(/行政書士/);
  });
});

describe("refreshGrantsAction (admin)", () => {
  it("is host-only and schedules the refresh via after()", async () => {
    const { refreshGrantsAction, refreshAllGrantsAction } = await import("@/app/[locale]/admin/grant-actions");
    for (const role of [null, "business", "student"]) {
      redirectNonHost(role);
      await expect(refreshGrantsAction(form({ locale: "en", briefId: BRIEF }))).rejects.toThrow("NEXT_REDIRECT");
      await expect(refreshAllGrantsAction(form({ locale: "en" }))).rejects.toThrow("NEXT_REDIRECT");
    }
    expect(scheduleGrantRefresh).not.toHaveBeenCalled();
    expect(scheduleAllGrantRefresh).not.toHaveBeenCalled();

    redirectNonHost("host");
    await refreshGrantsAction(form({ locale: "en", briefId: "not-a-uuid" }));
    expect(scheduleGrantRefresh).not.toHaveBeenCalled();
    await refreshGrantsAction(form({ locale: "en", briefId: BRIEF }));
    expect(scheduleGrantRefresh).toHaveBeenCalledWith(BRIEF);
    await refreshAllGrantsAction(form({ locale: "en" }));
    expect(scheduleAllGrantRefresh).toHaveBeenCalledTimes(1);
  });
});
