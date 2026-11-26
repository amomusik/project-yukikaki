import { describe, expect, it } from "vitest";
import { getDb, schema } from "@/lib/db";
import { eventIcs, rsvpEmail } from "@/lib/events/email";
import { jstLocalToDate, monthRange, dateToJstLocal, slugify, formatTimeRange } from "@/lib/events/format";
import { buildIcs, foldLine, icsEscape } from "@/lib/events/ics";
import {
  EventError,
  cancelRsvp,
  createEvent,
  getEventDetail,
  getMyRsvp,
  listUpcomingEvents,
  rsvp,
  setEventStatus,
  topGrantsForBriefs,
  updateEvent,
  type EventInput,
} from "@/lib/events/store";
import { makeBrief, makeUser } from "./helpers";

const NOW = new Date("2026-11-26T00:00:00Z");
let n = 0;
function input(over: Partial<EventInput> = {}): EventInput {
  n++;
  return {
    title: { en: `Test Event ${n}`, ja: `テストイベント${n}` },
    summary: { en: "Build things", ja: "つくる" },
    format: "hackathon",
    startsAt: jstLocalToDate("2027-01-30T10:00")!,
    endsAt: jstLocalToDate("2027-01-30T18:00")!,
    city: "Sapporo",
    venueName: "Library",
    venueAddress: "札幌市中央区南22条西13丁目1-1",
    onlineUrl: null,
    coverImage: null,
    capacity: 2,
    briefIds: [],
    ...over,
  };
}

describe("host-only create/edit/publish", () => {
  it("rejects non-hosts and signed-out callers", async () => {
    const student = await makeUser("student");
    const business = await makeUser("business");
    for (const u of [student, business, null, undefined]) {
      await expect(createEvent(u, input())).rejects.toMatchObject({ code: "forbidden" });
    }
    const host = await makeUser("host");
    const ev = await createEvent(host, input(), { publish: true });
    await expect(updateEvent(student, ev.id, input())).rejects.toBeInstanceOf(EventError);
    await expect(setEventStatus(student, ev.id, "cancelled")).rejects.toMatchObject({ code: "forbidden" });
  });

  it("creates a draft with an owner seat, unique slug and linked challenges; validates input", async () => {
    const host = await makeUser("host");
    const { brief } = await makeBrief("approved");
    const a = await createEvent(host, input({ title: { en: "Snow Jam", ja: "雪" }, briefIds: [brief.id] }));
    const b = await createEvent(host, input({ title: { en: "Snow Jam", ja: "雪" } }));
    expect(a.status).toBe("draft");
    expect(a.slug).toBe("snow-jam");
    expect(b.slug).toBe("snow-jam-2");
    expect(await getMyRsvp(a.id, host.id)).toMatchObject({ role: "owner", status: "going" });
    const links = await getDb().select().from(schema.eventChallenges);
    expect(links.some((l) => l.eventId === a.id && l.briefId === brief.id)).toBe(true);

    await expect(createEvent(host, input({ endsAt: jstLocalToDate("2027-01-30T09:00")! }))).rejects.toMatchObject({ code: "invalid" });
    await expect(createEvent(host, input({ capacity: 0 }))).rejects.toMatchObject({ code: "invalid" });
    await expect(createEvent(host, input({ title: { en: "", ja: "x" } }))).rejects.toMatchObject({ code: "invalid" });
  });
});

describe("RSVP capacity and waitlist", () => {
  it("fills seats, waitlists overflow, and promotes in order when a seat frees up", async () => {
    const host = await makeUser("host");
    const ev = await createEvent(host, input({ capacity: 2 }), { publish: true });
    const [s1, s2, s3, s4] = await Promise.all([1, 2, 3, 4].map(() => makeUser("student")));
    const t = (m: number) => new Date(NOW.getTime() + m * 60_000);

    expect((await rsvp(ev.id, s1.id, "participant", t(1))).status).toBe("going");
    expect((await rsvp(ev.id, s2.id, "mentor", t(2))).status).toBe("going");
    expect((await rsvp(ev.id, s3.id, "participant", t(3))).status).toBe("waitlist");
    expect((await rsvp(ev.id, s4.id, "participant", t(4))).status).toBe("waitlist");
    // The host's owner seat does not use capacity.
    let d = await getEventDetail(ev.slug, s4.id);
    expect(d).toMatchObject({ going: 2, waitlist: 2 });
    expect(d!.myRsvp).toMatchObject({ status: "waitlist", waitlistPosition: 2 });

    // Re-RSVPing is idempotent (no double booking).
    expect(await rsvp(ev.id, s1.id, "participant", t(5))).toMatchObject({ status: "going", changed: false });

    // s1 cancels → s3 (first in line) is promoted, s4 moves up.
    const c = await cancelRsvp(ev.id, s1.id);
    expect(c).toEqual({ cancelled: true, promoted: [{ userId: s3.id, eventId: ev.id }] });
    expect(await getMyRsvp(ev.id, s3.id)).toMatchObject({ status: "going" });
    expect(await getMyRsvp(ev.id, s4.id)).toMatchObject({ status: "waitlist", waitlistPosition: 1 });
    expect(await getMyRsvp(ev.id, s1.id)).toBeNull();

    // Cancelling a waitlist spot promotes nobody; cancelling twice is a no-op.
    expect(await cancelRsvp(ev.id, s4.id)).toEqual({ cancelled: true, promoted: [] });
    expect(await cancelRsvp(ev.id, s4.id)).toEqual({ cancelled: false, promoted: [] });

    // Coming back after cancelling joins the back of the queue (event is full again).
    expect((await rsvp(ev.id, s1.id, "participant", t(6))).status).toBe("waitlist");
    expect((await rsvp(ev.id, s4.id, "participant", t(7))).status).toBe("waitlist");

    // Raising capacity promotes the waitlist in order.
    const up = await updateEvent(host, ev.id, input({ capacity: 3 }));
    expect(up.promoted.map((p) => p.userId)).toEqual([s1.id]);
    d = await getEventDetail(ev.slug);
    expect(d).toMatchObject({ going: 3, waitlist: 1 });

    // The host can't give up their own seat.
    await expect(cancelRsvp(ev.id, host.id)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("only accepts RSVPs for published, upcoming events with a valid role", async () => {
    const host = await makeUser("host");
    const s = await makeUser("student");
    const draft = await createEvent(host, input());
    await expect(rsvp(draft.id, s.id)).rejects.toMatchObject({ code: "not_open" });
    const pub = await createEvent(host, input(), { publish: true });
    await expect(rsvp(pub.id, s.id, "owner")).rejects.toMatchObject({ code: "invalid" });
    await expect(rsvp(pub.id, s.id, "participant", new Date("2027-02-01T00:00:00Z"))).rejects.toMatchObject({ code: "ended" });
    await setEventStatus(host, pub.id, "cancelled");
    await expect(rsvp(pub.id, s.id)).rejects.toMatchObject({ code: "not_open" });
    await expect(rsvp("11111111-2222-4333-8444-555555555555", s.id)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("event status transitions (EVENT_TRANSITIONS)", () => {
  it("draft → published → cancelled; cancelled is terminal; published can't go back to draft", async () => {
    const host = await makeUser("host");
    const ev = await createEvent(host, input());
    expect((await setEventStatus(host, ev.id, "published")).event.status).toBe("published");
    // Same status again is a no-op (double-click safe).
    expect(await setEventStatus(host, ev.id, "published")).toMatchObject({ event: { status: "published" }, promoted: [] });
    await expect(setEventStatus(host, ev.id, "draft")).rejects.toMatchObject({ code: "illegal_status" });
    expect((await setEventStatus(host, ev.id, "cancelled")).event.status).toBe("cancelled");
    await expect(setEventStatus(host, ev.id, "published")).rejects.toMatchObject({ code: "illegal_status" });
    await expect(setEventStatus(host, ev.id, "draft")).rejects.toMatchObject({ code: "illegal_status" });
    const draft = await createEvent(host, input());
    expect((await setEventStatus(host, draft.id, "cancelled")).event.status).toBe("cancelled");
    await expect(setEventStatus(host, "11111111-2222-4333-8444-555555555555", "cancelled")).rejects.toMatchObject({ code: "not_found" });
  });

  it("publishing returns the waitlisted RSVPs it promoted, in queue order, so they can be emailed", async () => {
    const host = await makeUser("host");
    const [a, b, c] = [await makeUser("student"), await makeUser("student"), await makeUser("student")];
    const ev = await createEvent(host, input({ capacity: 2 }));
    // Waitlist rows left on a draft (e.g. imported or from an earlier run): publish fills the free seats.
    await getDb().insert(schema.eventRsvps).values([
      { eventId: ev.id, userId: a.id, role: "participant", status: "waitlist", createdAt: new Date("2026-11-20T00:00:00Z") },
      { eventId: ev.id, userId: b.id, role: "participant", status: "waitlist", createdAt: new Date("2026-11-21T00:00:00Z") },
      { eventId: ev.id, userId: c.id, role: "participant", status: "waitlist", createdAt: new Date("2026-11-22T00:00:00Z") },
    ]);
    const { promoted } = await setEventStatus(host, ev.id, "published");
    expect(promoted).toEqual([
      { userId: a.id, eventId: ev.id },
      { userId: b.id, eventId: ev.id },
    ]);
    expect(await getEventDetail(ev.slug)).toMatchObject({ going: 2, waitlist: 1 });
    expect((await setEventStatus(host, ev.id, "cancelled")).promoted).toEqual([]);
  });
});

describe("listing filters", () => {
  it("lists upcoming published events filtered by city, format and JST month", async () => {
    const host = await makeUser("host");
    const city = `City${Date.now()}`;
    const dec = await createEvent(host, input({ city, format: "charrette", startsAt: jstLocalToDate("2026-12-31T23:30")!, endsAt: jstLocalToDate("2027-01-01T02:00")! }), { publish: true });
    const jan = await createEvent(host, input({ city, format: "hackathon", startsAt: jstLocalToDate("2027-01-01T00:30")!, endsAt: jstLocalToDate("2027-01-01T09:00")! }), { publish: true });
    await createEvent(host, input({ city })); // draft: hidden
    const past = await createEvent(host, input({ city, startsAt: new Date("2026-10-01T01:00:00Z"), endsAt: new Date("2026-10-01T08:00:00Z") }), { publish: true });
    const gone = await createEvent(host, input({ city }), { publish: true });
    await setEventStatus(host, gone.id, "cancelled");

    const slugs = async (f: Parameters<typeof listUpcomingEvents>[0]) => (await listUpcomingEvents(f, { now: NOW })).map((e) => e.slug);
    expect(await slugs({ city })).toEqual([dec.slug, jan.slug]);
    expect(await slugs({ city, format: "charrette" })).toEqual([dec.slug]);
    expect(await slugs({ city, format: "bogus" })).toEqual([dec.slug, jan.slug]);
    // Month boundaries are JST: 23:30 on Dec 31 JST is December; 00:30 Jan 1 JST is January.
    expect(await slugs({ city, month: "2026-12" })).toEqual([dec.slug]);
    expect(await slugs({ city, month: "2027-01" })).toEqual([jan.slug]);
    expect(await slugs({ city, month: "2027-03" })).toEqual([]);
    expect((await slugs({ city })).includes(past.slug)).toBe(false);
    expect((await listUpcomingEvents({ city: "Nowhere" }, { now: NOW })).length).toBe(0);
  });

  it("aggregates open grants across linked challenges, deduped by programme", async () => {
    const a = await makeBrief("approved");
    const b = await makeBrief("approved");
    const g = (briefId: string, externalId: string, score: number, deadline: Date | null) => ({
      briefId,
      source: "jgrants" as const,
      externalId,
      title: `Grant ${externalId}`,
      url: `https://www.jgrants-portal.go.jp/subsidy/${externalId}`,
      score,
      deadline,
    });
    await getDb()
      .insert(schema.grantMatches)
      .values([
        g(a.brief.id, "shared", 0.5, null),
        g(b.brief.id, "shared", 0.9, null),
        g(a.brief.id, "only-a", 0.7, new Date("2027-03-01T00:00:00Z")),
        g(b.brief.id, "expired", 1, new Date("2026-01-01T00:00:00Z")),
      ]);
    const grants = await topGrantsForBriefs([a.brief.id, b.brief.id], { now: NOW });
    expect(grants.map((x) => [x.externalId, x.score])).toEqual([
      ["shared", 0.9],
      ["only-a", 0.7],
    ]);
    expect(grants[0].challenge.id).toBe(b.brief.id);
    expect(await topGrantsForBriefs([])).toEqual([]);
  });
});

describe("ICS export", () => {
  it("builds a valid RFC 5545 VEVENT with UTC times, escaping and folding", () => {
    const ics = buildIcs({
      uid: "abc@yukikaki",
      title: "Snow, ramen; and\nmore",
      description: "x".repeat(200),
      location: "札幌市中央区南22条西13丁目1-1, Sapporo Central Library",
      url: "https://example.com/en/events/x",
      start: jstLocalToDate("2027-01-30T10:00")!,
      end: jstLocalToDate("2027-01-31T17:00")!,
      stamp: new Date("2026-11-26T00:00:00Z"),
    });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VEVENT\r\nEND:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART:20270130T010000Z\r\n");
    expect(ics).toContain("DTEND:20270131T080000Z\r\n");
    expect(ics).toContain("DTSTAMP:20261126T000000Z\r\n");
    expect(ics).toContain("SUMMARY:Snow\\, ramen\\; and\\nmore\r\n");
    expect(ics).not.toMatch(/[^\r]\n/); // CRLF only
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    // Unfolding restores the original description.
    expect(ics.replace(/\r\n /g, "")).toContain(`DESCRIPTION:${"x".repeat(200)}\r\n`);
    expect(icsEscape("a\\b")).toBe("a\\\\b");
    // Multibyte characters are never split across fold boundaries.
    const folded = foldLine(`LOCATION:${"雪".repeat(40)}`);
    expect(folded.replace(/\r\n /g, "")).toBe(`LOCATION:${"雪".repeat(40)}`);
  });

  it("exports an event in the requested language with a cancelled status when cancelled", async () => {
    const host = await makeUser("host");
    const ev = await createEvent(host, input({ title: { en: "Kitchen Night", ja: "キッチンの夜" } }), { publish: true });
    const ja = eventIcs(ev, "ja", "https://yk.example");
    expect(ja).toContain("SUMMARY:キッチンの夜");
    expect(ja.replace(/\r\n /g, "")).toContain(`URL:https://yk.example/ja/events/${ev.slug}`);
    expect(ja).toContain(`UID:${ev.id}@yukikaki`);
    const mail = rsvpEmail({ ev, kind: "waitlist", locale: "ja", name: "<Aoi>", appUrl: "https://yk.example" });
    expect(mail.subject).toBe("【雪かき】キャンセル待ち登録: キッチンの夜");
    expect(mail.html).toContain("&lt;Aoi&gt;");
    expect(mail.html.indexOf("キャンセル待ち")).toBeLessThan(mail.html.indexOf("waitlist"));
    expect(rsvpEmail({ ev, kind: "promoted", locale: "en", name: "A" }).subject).toBe("You're off the waitlist: Kitchen Night");
    const { event: cancelled } = await setEventStatus(host, ev.id, "cancelled");
    expect(eventIcs(cancelled, "en")).toContain("STATUS:CANCELLED");
  });
});

describe("format helpers", () => {
  it("handles JST wall-clock conversions and slugs", () => {
    expect(jstLocalToDate("2027-01-30T10:00")!.toISOString()).toBe("2027-01-30T01:00:00.000Z");
    expect(jstLocalToDate("nope")).toBeNull();
    expect(dateToJstLocal(new Date("2027-01-30T01:00:00Z"))).toBe("2027-01-30T10:00");
    expect(monthRange("2027-02")).toEqual({ start: new Date("2027-01-31T15:00:00Z"), end: new Date("2027-02-28T15:00:00Z") });
    expect(monthRange("2027-13")).toBeNull();
    expect(slugify("Sapporo Snow-Tech Hackathon!")).toBe("sapporo-snow-tech-hackathon");
    expect(slugify("雪かき")).toBe("event");
    expect(formatTimeRange(jstLocalToDate("2027-01-30T10:00")!, jstLocalToDate("2027-01-30T18:00")!, "en")).toBe("10:00–18:00 JST");
  });
});
