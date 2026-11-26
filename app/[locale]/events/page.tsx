import { MapPin, Plus } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ensureUser } from "@/lib/auth";
import { EVENT_FORMATS, dateBadge, formatEventDay, formatMonthDay, formatTimeRange, jstDateKey, monthLabel, spotsLeft, toLang, upcomingMonths } from "@/lib/events/format";
import { listAllEventsForHost, listUpcomingEvents, upcomingEventCities, type EventCard } from "@/lib/events/store";
import { Badge, buttonClass } from "@/components/ui";
import { AvatarStack, DemoBadge, EventCover, FormatPill } from "./event-bits";
import { EventFilters } from "./filters";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "events" });
  return { title: `${t("pageTitle")} · Yukikaki`, description: t("pageSubtitle") };
}

type SP = { city?: string; format?: string; month?: string };

/** Public: upcoming hackathons, charrettes and test kitchens (Luma-style timeline). */
export default async function EventsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<SP> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations("events");
  const lang = toLang(locale);
  const [events, cities, user] = await Promise.all([listUpcomingEvents(sp), upcomingEventCities(), ensureUser().catch(() => null)]);
  const isHost = user?.role === "host";
  const drafts = isHost ? (await listAllEventsForHost()).filter((e) => e.status !== "published") : [];

  // Group by JST calendar day for the timeline.
  const days: { key: string; date: Date; items: EventCard[] }[] = [];
  for (const e of events) {
    const key = jstDateKey(e.startsAt);
    const last = days.at(-1);
    if (last?.key === key) last.items.push(e);
    else days.push({ key, date: e.startsAt, items: [e] });
  }
  const filtered = Boolean(sp.city || sp.format || sp.month);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-frost">{t("eyebrow")}</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">{t("pageTitle")}</h1>
          <p className="mt-2 max-w-2xl text-muted">{t("pageSubtitle")}</p>
        </div>
        {isHost && (
          <Link href="/events/new" className={buttonClass("primary", "rounded-full")} data-testid="new-event">
            <Plus aria-hidden className="h-4 w-4" />
            {t("newEvent")}
          </Link>
        )}
      </div>

      <EventFilters
        cities={cities}
        formats={EVENT_FORMATS.map((f) => ({ value: f, label: t(`format.${f}`) }))}
        months={upcomingMonths(6).map((m) => ({ value: m, label: monthLabel(m, locale) }))}
        current={sp}
      />

      {days.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line p-10 text-center text-muted" data-testid="events-empty">
          <p>{filtered ? t("emptyFiltered") : t("empty")}</p>
          {filtered && (
            <Link href="/events" className="mt-3 inline-block font-medium text-ink underline">
              {t("filters.clear")}
            </Link>
          )}
        </div>
      ) : (
        <ol className="space-y-8" data-testid="event-list">
          {days.map((d) => {
            const b = dateBadge(d.date, locale);
            return (
              <li key={d.key} className="grid gap-3 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-6">
                <div className="flex items-baseline gap-2 sm:sticky sm:top-20 sm:block sm:self-start">
                  <p className="font-bold text-ink">{formatMonthDay(d.date, locale)}</p>
                  <p className="text-sm text-muted">{b.weekday}</p>
                </div>
                <ul className="relative space-y-3 border-l border-dashed border-line pl-4 sm:pl-6">
                  {d.items.map((e) => {
                    const left = spotsLeft(e.capacity, e.going);
                    const title = e.title[lang] || e.title.en;
                    return (
                      <li key={e.id}>
                        <Link
                          href={`/events/${e.slug}`}
                          className="group grid grid-cols-[minmax(0,1fr)_5.5rem] gap-4 rounded-2xl border border-line bg-surface p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-frost hover:shadow-md sm:grid-cols-[4rem_minmax(0,1fr)_7.5rem]"
                          data-testid="event-card"
                        >
                          <div className="hidden flex-col items-center justify-center rounded-xl border border-line bg-snow text-center sm:flex" aria-hidden>
                            <span className="text-[11px] font-bold tracking-wider text-rose-600">{b.month}</span>
                            <span className="text-2xl font-extrabold leading-none text-ink">{b.day}</span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm text-muted">
                              <time dateTime={e.startsAt.toISOString()}>{formatTimeRange(e.startsAt, e.endsAt, locale)}</time>
                            </p>
                            <h2 className="mt-0.5 text-lg font-bold leading-snug text-ink group-hover:underline">{title}</h2>
                            <p className="mt-1 flex items-center gap-1 text-sm text-muted">
                              <MapPin aria-hidden className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">
                                {e.venueName} · {e.city}
                              </span>
                            </p>
                            <div className="mt-2.5 flex flex-wrap items-center gap-2">
                              <FormatPill format={e.format} />
                              {left === 0 ? (
                                <Badge tone="rose">{t("full")}{e.waitlist > 0 ? ` · ${t("waitlistCount", { n: e.waitlist })}` : ""}</Badge>
                              ) : (
                                <Badge tone={left <= 5 ? "amber" : "green"}>{t("spotsLeft", { n: left })}</Badge>
                              )}
                              {e.going > 0 && (
                                <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                                  <AvatarStack attendees={e.attendees.filter((a) => a.role !== "owner")} total={e.going} showMore={false} />
                                  {t("goingCount", { n: e.going })}
                                </span>
                              )}
                              {e.isDemo && <DemoBadge />}
                            </div>
                          </div>
                          <EventCover format={e.format} src={e.coverImage} alt="" className="self-start" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ol>
      )}

      {isHost && drafts.length > 0 && (
        <section className="rounded-2xl border border-line bg-snow p-5" data-testid="host-drafts">
          <h2 className="font-bold text-ink">{t("hostDrafts")}</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {drafts.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2">
                <Badge tone={e.status === "cancelled" ? "rose" : "slate"}>{t(`status.${e.status}`)}</Badge>
                <Link href={`/events/${e.slug}`} className="font-medium hover:underline">
                  {e.title[lang] || e.title.en}
                </Link>
                <span className="text-muted">{formatEventDay(e.startsAt, locale)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
