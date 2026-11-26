import { beforeEach, describe, expect, it, vi } from "vitest";

const ensureUser = vi.fn();
const requireRole = vi.fn();
const after = vi.fn();
const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT ${url}`);
});

vi.mock("@/lib/auth", () => ({ ensureUser: () => ensureUser(), requireRole: (...a: unknown[]) => requireRole(...a) }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => unknown) => after(fn) }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const form = (o: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) for (const x of [v].flat()) f.append(k, x);
  return f;
};
const eventForm = (over: Record<string, string> = {}) =>
  form({
    locale: "en",
    intent: "publish",
    titleEn: "Auth Test Jam",
    titleJa: "認証テスト",
    summaryEn: "x",
    summaryJa: "x",
    format: "test_kitchen",
    startsAt: "2027-02-20T13:00",
    endsAt: "2027-02-20T19:00",
    city: "Setagaya",
    venueName: "Library",
    venueAddress: "東京都世田谷区弦巻3-16-8",
    capacity: "8",
    ...over,
  });
// requireRole redirects (throws) when the user lacks the role.
const as = (user: { id: string; role: string | null } | null) =>
  requireRole.mockImplementation(async (_l: string, ...roles: string[]) => {
    if (!user?.role || !roles.includes(user.role)) throw new Error("NEXT_REDIRECT /en");
    return user;
  });

beforeEach(() => vi.clearAllMocks());

describe("saveEventAction", () => {
  it("is host-only", async () => {
    const { saveEventAction } = await import("@/app/[locale]/events/actions");
    const { listUpcomingEvents } = await import("@/lib/events/store");
    for (const role of [null, "business", "student"]) {
      as(role ? { id: "u1", role } : null);
      await expect(saveEventAction(undefined, eventForm())).rejects.toThrow("NEXT_REDIRECT");
    }
    expect((await listUpcomingEvents({ city: "Setagaya" })).length).toBe(0);
  });

  it("lets a host create + publish, and returns validation errors instead of throwing", async () => {
    const { makeUser } = await import("./helpers");
    const host = await makeUser("host");
    as(host);
    const { saveEventAction } = await import("@/app/[locale]/events/actions");
    expect(await saveEventAction(undefined, eventForm({ endsAt: "2027-02-20T12:00" }))).toMatchObject({ error: expect.stringContaining("endsAt") });
    await expect(saveEventAction(undefined, eventForm())).rejects.toThrow("NEXT_REDIRECT /en/events/auth-test-jam");
    const { getEventBySlug } = await import("@/lib/events/store");
    expect(await getEventBySlug("auth-test-jam")).toMatchObject({ status: "published", hostUserId: host.id, format: "test_kitchen", city: "Setagaya" });
  });
});

describe("rsvpAction", () => {
  it("sends signed-out users to sign-in, then RSVPs and queues a confirmation email", async () => {
    const { makeUser } = await import("./helpers");
    const { createEvent } = await import("@/lib/events/store");
    const host = await makeUser("host");
    const ev = await createEvent(host, {
      title: { en: "RSVP Action", ja: "参加" },
      summary: { en: "x", ja: "x" },
      format: "hackathon",
      startsAt: new Date("2027-01-30T01:00:00Z"),
      endsAt: new Date("2027-01-30T09:00:00Z"),
      city: "Sapporo",
      venueName: "v",
      venueAddress: "a",
      onlineUrl: null,
      coverImage: null,
      capacity: 1,
    }, { publish: true });
    const { rsvpAction } = await import("@/app/[locale]/events/actions");
    const f = () => form({ locale: "ja", eventId: ev.id, slug: ev.slug, role: "participant" });

    ensureUser.mockResolvedValue(null);
    await expect(rsvpAction(f())).rejects.toThrow(`NEXT_REDIRECT /ja/sign-in?redirect_url=${encodeURIComponent(`/ja/events/${ev.slug}`)}`);

    ensureUser.mockResolvedValue(await makeUser("student"));
    await expect(rsvpAction(f())).rejects.toThrow(`NEXT_REDIRECT /ja/events/${ev.slug}?rsvp=going`);
    expect(after).toHaveBeenCalledTimes(1);

    ensureUser.mockResolvedValue(await makeUser("student"));
    await expect(rsvpAction(f())).rejects.toThrow(`?rsvp=waitlist`);
  });
});
