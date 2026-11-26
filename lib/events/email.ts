import { Resend } from "resend";
import { configured, env } from "@/lib/env";
import type { EventRow, RsvpStatus } from "@/lib/db/schema";
import { NotConfiguredError, withFallback } from "@/lib/integrations/_guard";
import { formatEventDay, formatTimeRange, mapUrl } from "./format";
import { buildIcs } from "./ics";

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function eventUrl(slug: string, locale: string, appUrl = env.APP_URL): string {
  return `${appUrl.replace(/\/$/, "")}/${locale === "ja" ? "ja" : "en"}/events/${slug}`;
}

export function eventIcs(ev: EventRow, locale: string, appUrl = env.APP_URL): string {
  const lang = locale === "ja" ? "ja" : "en";
  const url = eventUrl(ev.slug, lang, appUrl);
  return buildIcs({
    uid: `${ev.id}@yukikaki`,
    title: ev.title[lang] || ev.title.en,
    description: `${ev.summary[lang] || ev.summary.en}\n\n${url}`,
    location: [ev.venueName, ev.venueAddress].filter(Boolean).join(", "),
    url,
    start: ev.startsAt,
    end: ev.endsAt,
    stamp: ev.updatedAt,
    status: ev.status === "cancelled" ? "CANCELLED" : "CONFIRMED",
  });
}

export type RsvpEmailKind = RsvpStatus | "promoted";

/** Locale-first bilingual RSVP confirmation (going / waitlist / promoted from waitlist). */
export function rsvpEmail(i: { ev: EventRow; kind: Exclude<RsvpEmailKind, "cancelled">; locale: "ja" | "en"; name: string; appUrl?: string }) {
  const appUrl = i.appUrl ?? env.APP_URL;
  const part = (l: "ja" | "en") => {
    const title = escape(i.ev.title[l] || i.ev.title.en);
    const when = `${formatEventDay(i.ev.startsAt, l)} · ${formatTimeRange(i.ev.startsAt, i.ev.endsAt, l)}`;
    const where = escape(`${i.ev.venueName}, ${i.ev.venueAddress}`);
    const link = escape(eventUrl(i.ev.slug, l, appUrl));
    const map = escape(mapUrl(i.ev.venueAddress));
    const lead =
      l === "ja"
        ? { going: "参加登録が完了しました。", waitlist: "満席のため、キャンセル待ちに登録しました。席が空いたら自動で繰り上がり、メールでお知らせします。", promoted: "キャンセルが出たため、キャンセル待ちから参加確定に繰り上がりました。" }[i.kind]
        : { going: "You're in — your spot is confirmed.", waitlist: "The event is full, so you're on the waitlist. If a seat opens you'll be promoted automatically and we'll email you.", promoted: "A seat opened up — you've been moved from the waitlist to confirmed." }[i.kind];
    const btn = l === "ja" ? "イベントページを見る" : "View event";
    const cal = l === "ja" ? "カレンダー用の .ics ファイルを添付しています。" : "A calendar invite (.ics) is attached.";
    return `<p>${l === "ja" ? `${escape(i.name)} さん` : `Hi ${escape(i.name)},`}</p>
<p>${lead}</p>
<h2 style="margin:16px 0 4px">${title}</h2>
<p style="margin:0;color:#334155">${escape(when)}<br/><a href="${map}">${where}</a></p>
<p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#0f172a;color:#fff;border-radius:8px;text-decoration:none">${btn}</a></p>
${i.kind === "waitlist" ? "" : `<p style="color:#64748b;font-size:12px">${cal}</p>`}`;
  };
  const titleL = i.ev.title[i.locale] || i.ev.title.en;
  const subject =
    i.locale === "ja"
      ? { going: `【雪かき】参加登録完了: ${titleL}`, waitlist: `【雪かき】キャンセル待ち登録: ${titleL}`, promoted: `【雪かき】参加確定（繰り上がり）: ${titleL}` }[i.kind]
      : { going: `You're going: ${titleL}`, waitlist: `Waitlisted: ${titleL}`, promoted: `You're off the waitlist: ${titleL}` }[i.kind];
  const other = i.locale === "ja" ? "en" : "ja";
  const html = `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto">${part(i.locale)}<hr/>${part(other)}</div>`;
  const text = `${subject}\n${formatEventDay(i.ev.startsAt, i.locale)} ${formatTimeRange(i.ev.startsAt, i.ev.endsAt, i.locale)}\n${i.ev.venueName}, ${i.ev.venueAddress}\n${eventUrl(i.ev.slug, i.locale, appUrl)}`;
  return { subject, html, text };
}

/** Send via Resend with the .ics attached (not for waitlist). Logged as a service event; never throws. */
export async function sendRsvpEmail(i: { to: string; name: string; ev: EventRow; kind: Exclude<RsvpEmailKind, "cancelled">; locale: "ja" | "en" }) {
  return withFallback(
    "resend",
    `event-rsvp-${i.kind}`,
    async () => {
      if (!configured.resend()) throw new NotConfiguredError("resend");
      if (!i.to) throw new Error("no recipient email");
      const resend = new Resend(env.RESEND_API_KEY);
      const { subject, html, text } = rsvpEmail(i);
      const attachments =
        i.kind === "waitlist" ? undefined : [{ filename: `${i.ev.slug}.ics`, content: Buffer.from(eventIcs(i.ev, i.locale)), contentType: "text/calendar" }];
      const { data, error } = await resend.emails.send({ from: env.EMAIL_FROM, to: i.to, subject, html, text, attachments });
      if (error || !data) throw new Error(`Resend: ${error?.message ?? "no id returned"}`);
      return { id: data.id };
    },
    null,
  );
}
