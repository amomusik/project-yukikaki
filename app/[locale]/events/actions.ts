"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ensureUser, requireRole } from "@/lib/auth";
import type { EventStatus, RsvpRole } from "@/lib/db/schema";
import { sendRsvpEmail } from "@/lib/events/email";
import { parseEventForm } from "@/lib/events/form";
import {
  EventError,
  cancelRsvp,
  createEvent,
  getEventById,
  setEventStatus,
  updateEvent,
  userContact,
  type Promotion,
  rsvp,
} from "@/lib/events/store";
import { isUuid } from "@/lib/uuid";

const loc = (f: FormData) => (String(f.get("locale") ?? "en") === "ja" ? "ja" : "en");
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** Email promoted waitlisters after the response (their own locale). */
function notifyPromoted(promoted: Promotion[]) {
  if (promoted.length === 0) return;
  after(async () => {
    for (const p of promoted) {
      const [ev, who] = await Promise.all([getEventById(p.eventId), userContact(p.userId)]);
      if (!ev || !who) continue;
      await sendRsvpEmail({ to: who.email, name: who.displayName, ev, kind: "promoted", locale: who.locale === "en" ? "en" : "ja" });
    }
  });
}

export async function rsvpAction(formData: FormData) {
  const locale = loc(formData);
  const eventId = str(formData, "eventId");
  const slug = str(formData, "slug");
  const back = `/${locale}/events/${encodeURIComponent(slug)}`;
  const user = await ensureUser();
  if (!user) redirect(`/${locale}/sign-in?redirect_url=${encodeURIComponent(back)}`);
  if (!isUuid(eventId)) redirect(back);
  const role = (str(formData, "role") || "participant") as RsvpRole;
  let status: string;
  try {
    const r = await rsvp(eventId, user.id, role);
    status = r.status;
    if (r.changed && r.status !== "cancelled") {
      const kind = r.status;
      after(async () => {
        const ev = await getEventById(eventId);
        if (ev) await sendRsvpEmail({ to: user.email, name: user.displayName, ev, kind, locale });
      });
    }
  } catch (e) {
    if (e instanceof EventError) redirect(`${back}?error=${e.code}`);
    throw e;
  }
  revalidatePath(back);
  redirect(`${back}?rsvp=${status}`);
}

export async function cancelRsvpAction(formData: FormData) {
  const locale = loc(formData);
  const eventId = str(formData, "eventId");
  const slug = str(formData, "slug");
  const back = `/${locale}/events/${encodeURIComponent(slug)}`;
  const user = await ensureUser();
  if (!user) redirect(`/${locale}/sign-in?redirect_url=${encodeURIComponent(back)}`);
  if (!isUuid(eventId)) redirect(back);
  try {
    const { promoted } = await cancelRsvp(eventId, user.id);
    notifyPromoted(promoted);
  } catch (e) {
    if (e instanceof EventError) redirect(`${back}?error=${e.code}`);
    throw e;
  }
  revalidatePath(back);
  redirect(`${back}?rsvp=cancelled`);
}

export type SaveEventState = { error?: string } | undefined;

/** Host-only create/edit. intent=publish publishes; intent=draft saves without publishing. */
export async function saveEventAction(_prev: SaveEventState, formData: FormData): Promise<SaveEventState> {
  const locale = loc(formData);
  const user = await requireRole(locale, "host");
  const eventId = str(formData, "eventId");
  const publish = str(formData, "intent") === "publish";
  const input = parseEventForm(formData);
  let slug: string;
  try {
    if (eventId) {
      if (!isUuid(eventId)) return { error: "not_found" };
      const { event, promoted } = await updateEvent(user, eventId, input);
      notifyPromoted(promoted);
      slug = event.slug;
      if (publish && event.status !== "published") notifyPromoted((await setEventStatus(user, eventId, "published")).promoted);
    } else {
      slug = (await createEvent(user, input, { publish })).slug;
    }
  } catch (e) {
    if (e instanceof EventError) return { error: e.code === "invalid" ? e.message : e.code };
    throw e;
  }
  revalidatePath(`/${locale}/events`);
  redirect(`/${locale}/events/${slug}`);
}

export async function setEventStatusAction(formData: FormData) {
  const locale = loc(formData);
  const user = await requireRole(locale, "host");
  const eventId = str(formData, "eventId");
  const status = str(formData, "status") as EventStatus;
  if (!isUuid(eventId) || !["draft", "published", "cancelled"].includes(status)) redirect(`/${locale}/events`);
  let slug: string;
  try {
    const { event, promoted } = await setEventStatus(user, eventId, status);
    notifyPromoted(promoted);
    slug = event.slug;
  } catch (e) {
    if (!(e instanceof EventError)) throw e;
    const ev = e.code === "not_found" ? null : await getEventById(eventId);
    redirect(ev ? `/${locale}/events/${ev.slug}?error=${e.code}` : `/${locale}/events`);
  }
  revalidatePath(`/${locale}/events`);
  redirect(`/${locale}/events/${slug}`);
}
