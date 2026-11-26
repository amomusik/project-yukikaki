import { and, asc, desc, eq, gte, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import type { EventFormat, EventRow, EventStatus, GrantMatchRow, RsvpRole, RsvpStatus, User } from "@/lib/db/schema";
import { PUBLIC_STATUSES } from "@/lib/queries";
import { EVENT_FORMATS, monthRange, slugify } from "./format";

/* ── Errors ──────────────────────────────────────────────────────── */
export type EventErrorCode = "not_found" | "not_open" | "ended" | "forbidden" | "invalid";
export class EventError extends Error {
  constructor(
    public code: EventErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "EventError";
  }
}

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
type Exec = ReturnType<typeof getDb> | Tx;

/* ── Listing ─────────────────────────────────────────────────────── */
export type EventFilters = { city?: string | null; format?: string | null; month?: string | null };
export type Attendee = { userId: string; displayName: string; role: RsvpRole };
export type EventCard = EventRow & { going: number; waitlist: number; attendees: Attendee[] };

const isFormat = (f: unknown): f is EventFormat => EVENT_FORMATS.includes(f as EventFormat);

/** Attendee counts and the first few "going" guests (host excluded; for avatar stacks), per event. */
async function attendance(eventIds: string[], avatarLimit = 5) {
  const out = new Map<string, { going: number; waitlist: number; attendees: Attendee[] }>();
  for (const id of eventIds) out.set(id, { going: 0, waitlist: 0, attendees: [] });
  if (eventIds.length === 0) return out;
  const rows = await getDb()
    .select({
      eventId: schema.eventRsvps.eventId,
      userId: schema.eventRsvps.userId,
      role: schema.eventRsvps.role,
      status: schema.eventRsvps.status,
      displayName: schema.users.displayName,
    })
    .from(schema.eventRsvps)
    .innerJoin(schema.users, eq(schema.eventRsvps.userId, schema.users.id))
    .where(and(inArray(schema.eventRsvps.eventId, eventIds), ne(schema.eventRsvps.status, "cancelled")))
    .orderBy(asc(schema.eventRsvps.createdAt));
  for (const r of rows) {
    const a = out.get(r.eventId)!;
    if (r.status === "waitlist") a.waitlist++;
    else if (r.role !== "owner") a.going++;
    if (r.status === "going" && r.role !== "owner" && a.attendees.length < avatarLimit) a.attendees.push({ userId: r.userId, displayName: r.displayName, role: r.role });
  }
  return out;
}

/** Upcoming (not yet ended) published events, soonest first. */
export async function listUpcomingEvents(filters: EventFilters = {}, opts: { now?: Date; limit?: number } = {}): Promise<EventCard[]> {
  const now = opts.now ?? new Date();
  const conds = [eq(schema.events.status, "published"), gte(schema.events.endsAt, now)];
  if (filters.city) conds.push(eq(schema.events.city, filters.city));
  if (isFormat(filters.format)) conds.push(eq(schema.events.format, filters.format));
  const range = monthRange(filters.month);
  if (range) conds.push(gte(schema.events.startsAt, range.start), lt(schema.events.startsAt, range.end));
  const rows = await getDb()
    .select()
    .from(schema.events)
    .where(and(...conds))
    .orderBy(asc(schema.events.startsAt))
    .limit(opts.limit ?? 100);
  const att = await attendance(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, ...att.get(r.id)! }));
}

/** Cities that have upcoming published events (filter options). */
export async function upcomingEventCities(now = new Date()): Promise<string[]> {
  const rows = await getDb()
    .selectDistinct({ city: schema.events.city })
    .from(schema.events)
    .where(and(eq(schema.events.status, "published"), gte(schema.events.endsAt, now)))
    .orderBy(asc(schema.events.city));
  return rows.map((r) => r.city);
}

/** Every event (any status) for the host dashboard section on /events. */
export async function listAllEventsForHost(): Promise<EventRow[]> {
  return getDb().select().from(schema.events).orderBy(desc(schema.events.startsAt)).limit(200);
}

/* ── Detail ──────────────────────────────────────────────────────── */
export type EventChallenge = { id: string; titleJa: string; titleEn: string; problemJa: string; problemEn: string; city: string; industry: string; businessName: string; skills: string[]; status: string };
export type EventGrant = GrantMatchRow & { challenge: { id: string; titleJa: string; titleEn: string; city: string } };

export async function getEventBySlug(slug: string): Promise<EventRow | null> {
  const [row] = await getDb().select().from(schema.events).where(eq(schema.events.slug, slug));
  return row ?? null;
}

export async function getEventById(id: string): Promise<EventRow | null> {
  const [row] = await getDb().select().from(schema.events).where(eq(schema.events.id, id));
  return row ?? null;
}

export async function eventChallengeIds(eventId: string): Promise<string[]> {
  const rows = await getDb().select({ id: schema.eventChallenges.briefId }).from(schema.eventChallenges).where(eq(schema.eventChallenges.eventId, eventId));
  return rows.map((r) => r.id);
}

/** Linked challenges that are publicly visible. */
async function eventChallenges(eventId: string): Promise<EventChallenge[]> {
  const rows = await getDb()
    .select({ brief: schema.briefs, business: schema.businesses })
    .from(schema.eventChallenges)
    .innerJoin(schema.briefs, eq(schema.eventChallenges.briefId, schema.briefs.id))
    .innerJoin(schema.businesses, eq(schema.briefs.businessId, schema.businesses.id))
    .where(and(eq(schema.eventChallenges.eventId, eventId), inArray(schema.briefs.status, PUBLIC_STATUSES)))
    .orderBy(asc(schema.businesses.city));
  return rows.map(({ brief, business }) => ({
    id: brief.id,
    titleJa: brief.content.ja?.title ?? "",
    titleEn: brief.content.en?.title ?? "",
    problemJa: brief.content.ja?.problem ?? "",
    problemEn: brief.content.en?.problem ?? "",
    city: business.city,
    industry: business.industry,
    businessName: business.name,
    skills: brief.skillsNeeded,
    status: brief.status,
  }));
}

/**
 * Open grant matches across the given challenges, best first. The same programme matched to
 * several briefs is listed once (highest score wins).
 */
export async function topGrantsForBriefs(briefIds: string[], opts: { now?: Date; limit?: number } = {}): Promise<EventGrant[]> {
  if (briefIds.length === 0) return [];
  const now = opts.now ?? new Date();
  const rows = await getDb()
    .select({ g: schema.grantMatches, brief: schema.briefs, business: schema.businesses })
    .from(schema.grantMatches)
    .innerJoin(schema.briefs, eq(schema.grantMatches.briefId, schema.briefs.id))
    .innerJoin(schema.businesses, eq(schema.briefs.businessId, schema.businesses.id))
    .where(
      and(
        inArray(schema.grantMatches.briefId, briefIds),
        or(isNull(schema.grantMatches.deadline), gte(schema.grantMatches.deadline, now)),
      ),
    )
    .orderBy(desc(schema.grantMatches.score), sql`${schema.grantMatches.deadline} ASC NULLS LAST`);
  const seen = new Set<string>();
  const out: EventGrant[] = [];
  for (const { g, brief, business } of rows) {
    const key = `${g.source}:${g.externalId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...g, challenge: { id: brief.id, titleJa: brief.content.ja?.title ?? "", titleEn: brief.content.en?.title ?? "", city: business.city } });
    if (out.length >= (opts.limit ?? 8)) break;
  }
  return out;
}

export type EventDetail = {
  event: EventRow;
  host: { id: string; displayName: string } | null;
  going: number;
  waitlist: number;
  attendees: Attendee[];
  challenges: EventChallenge[];
  grants: EventGrant[];
  myRsvp: { role: RsvpRole; status: RsvpStatus; waitlistPosition: number | null } | null;
};

export async function getEventDetail(slug: string, viewerId?: string | null): Promise<EventDetail | null> {
  const event = await getEventBySlug(slug);
  if (!event) return null;
  const db = getDb();
  const [att, challenges, hostRow] = await Promise.all([
    attendance([event.id], 24),
    eventChallenges(event.id),
    event.hostUserId
      ? db.select({ id: schema.users.id, displayName: schema.users.displayName }).from(schema.users).where(eq(schema.users.id, event.hostUserId))
      : Promise.resolve([]),
  ]);
  const grants = await topGrantsForBriefs(challenges.map((c) => c.id)).catch(() => []);
  const myRsvp = viewerId ? await getMyRsvp(event.id, viewerId) : null;
  const a = att.get(event.id)!;
  return { event, host: hostRow[0] ?? null, ...a, challenges, grants, myRsvp };
}

export async function getMyRsvp(eventId: string, userId: string): Promise<EventDetail["myRsvp"]> {
  const db = getDb();
  const [r] = await db
    .select()
    .from(schema.eventRsvps)
    .where(and(eq(schema.eventRsvps.eventId, eventId), eq(schema.eventRsvps.userId, userId)));
  if (!r || r.status === "cancelled") return null;
  let waitlistPosition: number | null = null;
  if (r.status === "waitlist") {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.eventRsvps)
      .where(and(eq(schema.eventRsvps.eventId, eventId), eq(schema.eventRsvps.status, "waitlist"), lt(schema.eventRsvps.createdAt, r.createdAt)));
    waitlistPosition = Number(n) + 1;
  }
  return { role: r.role, status: r.status, waitlistPosition };
}

/* ── RSVP with capacity + waitlist ───────────────────────────────── */
const RSVP_ROLES: RsvpRole[] = ["participant", "mentor", "observer"];

async function lockEvent(tx: Exec, eventId: string): Promise<EventRow> {
  const [ev] = await tx.select().from(schema.events).where(eq(schema.events.id, eventId)).for("update");
  if (!ev) throw new EventError("not_found");
  return ev;
}

/** Seats taken: going RSVPs except the host's own "owner" row. */
async function goingCount(tx: Exec, eventId: string): Promise<number> {
  const [{ n }] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.eventRsvps)
    .where(and(eq(schema.eventRsvps.eventId, eventId), eq(schema.eventRsvps.status, "going"), ne(schema.eventRsvps.role, "owner")));
  return Number(n);
}

export type Promotion = { userId: string; eventId: string };

/** Move the oldest waitlisted RSVPs into free seats. Call inside a transaction holding the event lock. */
async function promoteWaitlist(tx: Exec, ev: EventRow): Promise<Promotion[]> {
  const free = ev.capacity - (await goingCount(tx, ev.id));
  if (free <= 0) return [];
  const next = await tx
    .select({ id: schema.eventRsvps.id, userId: schema.eventRsvps.userId })
    .from(schema.eventRsvps)
    .where(and(eq(schema.eventRsvps.eventId, ev.id), eq(schema.eventRsvps.status, "waitlist")))
    .orderBy(asc(schema.eventRsvps.createdAt), asc(schema.eventRsvps.id))
    .limit(free);
  if (next.length === 0) return [];
  await tx.update(schema.eventRsvps).set({ status: "going" }).where(inArray(schema.eventRsvps.id, next.map((n) => n.id)));
  return next.map((n) => ({ userId: n.userId, eventId: ev.id }));
}

export type RsvpResult = { status: RsvpStatus; role: RsvpRole; changed: boolean };

/**
 * RSVP to a published, not-yet-ended event. Seats are first come first served; once full,
 * new RSVPs join the waitlist. Re-RSVPing after cancelling goes to the back of the queue.
 */
export async function rsvp(eventId: string, userId: string, role: RsvpRole = "participant", now = new Date()): Promise<RsvpResult> {
  if (!RSVP_ROLES.includes(role)) throw new EventError("invalid", "role");
  return getDb().transaction(async (tx) => {
    const ev = await lockEvent(tx, eventId);
    if (ev.status !== "published") throw new EventError("not_open");
    if (ev.endsAt.getTime() < now.getTime()) throw new EventError("ended");
    const [existing] = await tx
      .select()
      .from(schema.eventRsvps)
      .where(and(eq(schema.eventRsvps.eventId, eventId), eq(schema.eventRsvps.userId, userId)));
    if (existing && existing.status !== "cancelled") {
      if (existing.role === "owner") return { status: existing.status, role: existing.role, changed: false };
      if (existing.role !== role) await tx.update(schema.eventRsvps).set({ role }).where(eq(schema.eventRsvps.id, existing.id));
      return { status: existing.status, role, changed: existing.role !== role };
    }
    const status: RsvpStatus = (await goingCount(tx, eventId)) < ev.capacity ? "going" : "waitlist";
    await tx
      .insert(schema.eventRsvps)
      .values({ eventId, userId, role, status, createdAt: now })
      .onConflictDoUpdate({ target: [schema.eventRsvps.eventId, schema.eventRsvps.userId], set: { role, status, createdAt: now } });
    return { status, role, changed: true };
  });
}

/** Cancel an RSVP; a freed seat is handed to the waitlist (returned so callers can notify). */
export async function cancelRsvp(eventId: string, userId: string): Promise<{ cancelled: boolean; promoted: Promotion[] }> {
  return getDb().transaction(async (tx) => {
    const ev = await lockEvent(tx, eventId);
    const [existing] = await tx
      .select()
      .from(schema.eventRsvps)
      .where(and(eq(schema.eventRsvps.eventId, eventId), eq(schema.eventRsvps.userId, userId)));
    if (!existing || existing.status === "cancelled") return { cancelled: false, promoted: [] };
    if (existing.role === "owner") throw new EventError("forbidden", "the host cannot cancel their own seat");
    await tx.update(schema.eventRsvps).set({ status: "cancelled" }).where(eq(schema.eventRsvps.id, existing.id));
    const promoted = existing.status === "going" && ev.status === "published" ? await promoteWaitlist(tx, ev) : [];
    return { cancelled: true, promoted };
  });
}

/* ── Host create / edit / publish ────────────────────────────────── */
const bilingual = (max: number) => z.object({ ja: z.string().trim().min(1).max(max), en: z.string().trim().min(1).max(max) });
const optUrl = z.preprocess((v) => (v === "" || v == null ? null : v), z.string().url().max(500).nullable());

const eventInputSchema = z
  .object({
    title: bilingual(120),
    summary: bilingual(2000),
    format: z.enum(["hackathon", "charrette", "test_kitchen"]),
    startsAt: z.date(),
    endsAt: z.date(),
    city: z.string().trim().min(1).max(80),
    venueName: z.string().trim().min(1).max(160),
    venueAddress: z.string().trim().min(1).max(300),
    onlineUrl: optUrl,
    coverImage: optUrl,
    capacity: z.number().int().min(1).max(5000),
    briefIds: z.array(z.string().uuid()).max(20).default([]),
  })
  .refine((v) => v.endsAt.getTime() > v.startsAt.getTime(), { message: "endsAt must be after startsAt", path: ["endsAt"] });
export type EventInput = z.input<typeof eventInputSchema>;

function assertHost(user: Pick<User, "id" | "role"> | null | undefined): asserts user is Pick<User, "id" | "role"> {
  if (!user || user.role !== "host") throw new EventError("forbidden", "host only");
}

function parseInput(input: EventInput) {
  const r = eventInputSchema.safeParse(input);
  if (!r.success) throw new EventError("invalid", r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  return r.data;
}

async function uniqueSlug(base: string): Promise<string> {
  const db = getDb();
  let slug = base === "new" ? "new-event" : base;
  for (let i = 2; i < 50; i++) {
    const [hit] = await db.select({ id: schema.events.id }).from(schema.events).where(eq(schema.events.slug, slug));
    if (!hit) return slug;
    slug = `${base}-${i}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

async function setChallenges(tx: Exec, eventId: string, briefIds: string[]) {
  await tx.delete(schema.eventChallenges).where(eq(schema.eventChallenges.eventId, eventId));
  const ids = [...new Set(briefIds)];
  if (ids.length) await tx.insert(schema.eventChallenges).values(ids.map((briefId) => ({ eventId, briefId }))).onConflictDoNothing();
}

/** Host-only. Creates the event (draft unless `publish`) and gives the host an "owner" seat. */
export async function createEvent(
  user: Pick<User, "id" | "role"> | null | undefined,
  input: EventInput,
  opts: { publish?: boolean; slug?: string; isDemo?: boolean } = {},
): Promise<EventRow> {
  assertHost(user);
  const v = parseInput(input);
  const slug = await uniqueSlug(opts.slug ? slugify(opts.slug) : slugify(v.title.en));
  return getDb().transaction(async (tx) => {
    const [ev] = await tx
      .insert(schema.events)
      .values({
        slug,
        title: v.title,
        summary: v.summary,
        format: v.format,
        startsAt: v.startsAt,
        endsAt: v.endsAt,
        city: v.city,
        venueName: v.venueName,
        venueAddress: v.venueAddress,
        onlineUrl: v.onlineUrl,
        coverImage: v.coverImage,
        capacity: v.capacity,
        status: opts.publish ? "published" : "draft",
        hostUserId: user.id,
        isDemo: opts.isDemo ?? false,
      })
      .returning();
    await setChallenges(tx, ev.id, v.briefIds);
    await tx.insert(schema.eventRsvps).values({ eventId: ev.id, userId: user.id, role: "owner", status: "going" }).onConflictDoNothing();
    return ev;
  });
}

/** Host-only edit. Raising capacity promotes waitlisted RSVPs. */
export async function updateEvent(
  user: Pick<User, "id" | "role"> | null | undefined,
  eventId: string,
  input: EventInput,
): Promise<{ event: EventRow; promoted: Promotion[] }> {
  assertHost(user);
  const v = parseInput(input);
  return getDb().transaction(async (tx) => {
    await lockEvent(tx, eventId);
    const [ev] = await tx
      .update(schema.events)
      .set({
        title: v.title,
        summary: v.summary,
        format: v.format,
        startsAt: v.startsAt,
        endsAt: v.endsAt,
        city: v.city,
        venueName: v.venueName,
        venueAddress: v.venueAddress,
        onlineUrl: v.onlineUrl,
        coverImage: v.coverImage,
        capacity: v.capacity,
        updatedAt: new Date(),
      })
      .where(eq(schema.events.id, eventId))
      .returning();
    await setChallenges(tx, eventId, v.briefIds);
    const promoted = ev.status === "published" ? await promoteWaitlist(tx, ev) : [];
    return { event: ev, promoted };
  });
}

/** Host-only status change (publish / unpublish to draft / cancel). */
export async function setEventStatus(user: Pick<User, "id" | "role"> | null | undefined, eventId: string, status: EventStatus): Promise<EventRow> {
  assertHost(user);
  return getDb().transaction(async (tx) => {
    await lockEvent(tx, eventId);
    const [ev] = await tx.update(schema.events).set({ status, updatedAt: new Date() }).where(eq(schema.events.id, eventId)).returning();
    if (status === "published") await promoteWaitlist(tx, ev);
    return ev;
  });
}

/** Published challenges a host can link to an event. */
export async function linkableChallenges(): Promise<EventChallenge[]> {
  const rows = await getDb()
    .select({ brief: schema.briefs, business: schema.businesses })
    .from(schema.briefs)
    .innerJoin(schema.businesses, eq(schema.briefs.businessId, schema.businesses.id))
    .where(inArray(schema.briefs.status, PUBLIC_STATUSES))
    .orderBy(asc(schema.businesses.city));
  return rows.map(({ brief, business }) => ({
    id: brief.id,
    titleJa: brief.content.ja?.title ?? "",
    titleEn: brief.content.en?.title ?? "",
    problemJa: brief.content.ja?.problem ?? "",
    problemEn: brief.content.en?.problem ?? "",
    city: business.city,
    industry: business.industry,
    businessName: business.name,
    skills: brief.skillsNeeded,
    status: brief.status,
  }));
}

export async function userContact(userId: string): Promise<{ email: string; displayName: string; locale: string } | null> {
  const [u] = await getDb()
    .select({ email: schema.users.email, displayName: schema.users.displayName, locale: schema.users.locale })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  return u ?? null;
}
