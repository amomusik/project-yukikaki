/** Pure display/date helpers for events (shared by pages, ICS, email and tests). */
import type { EventFormat } from "@/lib/db/schema";

export const EVENT_FORMATS: EventFormat[] = ["hackathon", "charrette", "test_kitchen"];
const EVENT_TZ = "Asia/Tokyo";
/** Japan has no DST, so JST is always UTC+9. */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

type Lang = "ja" | "en";
const intlLocale = (l: Lang) => (l === "ja" ? "ja-JP" : "en-US");
export const toLang = (locale: string): Lang => (locale === "ja" ? "ja" : "en");

/** Calendar-badge parts ("DEC", "12", "Sat") in the event's time zone. */
export function dateBadge(d: Date, locale: string, timeZone = EVENT_TZ) {
  const l = intlLocale(toLang(locale));
  const month = new Intl.DateTimeFormat(l, { timeZone, month: "short" }).format(d);
  const day = new Intl.DateTimeFormat("en-US", { timeZone, day: "numeric" }).format(d);
  const weekday = new Intl.DateTimeFormat(l, { timeZone, weekday: "short" }).format(d);
  return { month: toLang(locale) === "en" ? month.toUpperCase() : month, day, weekday };
}

/** "Sat, Dec 12, 2026" / "2026年12月12日(土)" */
export function formatEventDay(d: Date, locale: string, timeZone = EVENT_TZ): string {
  return new Intl.DateTimeFormat(intlLocale(toLang(locale)), { timeZone, weekday: "short", year: "numeric", month: "short", day: "numeric" }).format(d);
}

/** "Dec 12" / "12月12日" */
export function formatMonthDay(d: Date, locale: string, timeZone = EVENT_TZ): string {
  return new Intl.DateTimeFormat(intlLocale(toLang(locale)), { timeZone, month: "short", day: "numeric" }).format(d);
}

function formatTime(d: Date, timeZone = EVENT_TZ): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

/** Same-day: "10:00–18:00 JST"; multi-day: "Dec 12 10:00 – Dec 13 17:00 JST". */
export function formatTimeRange(start: Date, end: Date, locale: string, timeZone = EVENT_TZ): string {
  const tz = timeZone === EVENT_TZ ? "JST" : timeZone;
  if (jstDateKey(start) === jstDateKey(end)) return `${formatTime(start, timeZone)}–${formatTime(end, timeZone)} ${tz}`;
  const md = new Intl.DateTimeFormat(intlLocale(toLang(locale)), { timeZone, month: "short", day: "numeric" });
  return `${md.format(start)} ${formatTime(start, timeZone)} – ${md.format(end)} ${formatTime(end, timeZone)} ${tz}`;
}

/** YYYY-MM-DD in JST. */
export function jstDateKey(d: Date): string {
  return new Date(d.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

/** YYYY-MM in JST. */
function jstMonthKey(d: Date): string {
  return jstDateKey(d).slice(0, 7);
}

/** "2026-12" → [start, end) instants of that month in JST; null when malformed. */
export function monthRange(month: string | null | undefined): { start: Date; end: Date } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month ?? "");
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  const start = new Date(Date.UTC(y, mo - 1, 1) - JST_OFFSET_MS);
  const end = new Date(Date.UTC(y, mo, 1) - JST_OFFSET_MS);
  return { start, end };
}

/** Next `n` month keys starting with the month of `from` (JST). */
export function upcomingMonths(n = 6, from = new Date()): string[] {
  const [y, m] = jstMonthKey(from).split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 + i, 1));
    return d.toISOString().slice(0, 7);
  });
}

export function monthLabel(month: string, locale: string): string {
  const r = monthRange(month);
  if (!r) return month;
  return new Intl.DateTimeFormat(intlLocale(toLang(locale)), { timeZone: EVENT_TZ, year: "numeric", month: "long" }).format(r.start);
}

/** `<input type="datetime-local">` value (JST wall clock) → instant. */
export function jstLocalToDate(v: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v ?? "");
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  const t = Date.UTC(y, mo - 1, d, h, mi) - JST_OFFSET_MS;
  return Number.isNaN(t) ? null : new Date(t);
}

/** Instant → `datetime-local` value in JST. */
export function dateToJstLocal(d: Date): string {
  return new Date(d.getTime() + JST_OFFSET_MS).toISOString().slice(0, 16);
}

export function spotsLeft(capacity: number, going: number): number {
  return Math.max(0, capacity - going);
}

export function mapUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

/** URL-safe slug from an English title (ASCII only; falls back to "event"). */
export function slugify(s: string): string {
  const slug = s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug || "event";
}

export function initials(name: string): string {
  const parts = name.replace(/\(.*?\)/g, "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (/^[\x00-\x7F]+$/.test(parts[0])) return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
  return parts[0].slice(0, 1);
}
