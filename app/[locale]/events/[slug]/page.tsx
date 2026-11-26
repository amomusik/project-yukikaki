import { CalendarDays, CalendarPlus, Globe, MapPin, Pencil } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { ensureUser } from "@/lib/auth";
import { formatEventDay, formatTimeRange, mapUrl, spotsLeft, toLang } from "@/lib/events/format";
import { getEventBySlug, getEventDetail } from "@/lib/events/store";
import { Badge, Card, Select, buttonClass, cn } from "@/components/ui";
import { GrantList, GrantNotice } from "../../grants/grant-list";
import { cancelRsvpAction, rsvpAction, setEventStatusAction } from "../actions";
import { AvatarStack, DemoBadge, EventCover, FormatPill } from "../event-bits";
import { ShareButton } from "../share-button";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  const ev = await getEventBySlug(slug).catch(() => null);
  if (!ev || ev.status === "draft") return { title: "Yukikaki" };
  const lang = toLang(locale);
  return { title: `${ev.title[lang] || ev.title.en} · Yukikaki`, description: (ev.summary[lang] || ev.summary.en).slice(0, 160) };
}

export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ rsvp?: string; error?: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const { rsvp: flash, error } = await searchParams;
  const user = await ensureUser().catch(() => null);
  const detail = await getEventDetail(slug, user?.id);
  if (!detail) notFound();
  const isHost = user?.role === "host";
  const { event: ev, host, going, waitlist, attendees, challenges, grants, myRsvp } = detail;
  if (ev.status === "draft" && !isHost) notFound();

  const t = await getTranslations("events");
  const tg = await getTranslations("grants");
  const lang = toLang(locale);
  const title = ev.title[lang] || ev.title.en;
  const left = spotsLeft(ev.capacity, going);
  const pct = Math.min(100, Math.round((going / Math.max(1, ev.capacity)) * 100));
  const ended = ev.endsAt.getTime() < Date.now();
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "localhost"}`;
  const path = `/${locale}/events/${ev.slug}`;
  const shareUrl = `${origin}${path}`;
  const icsHref = `/api/events/${ev.slug}/ics?locale=${lang}`;
  const guests = attendees.filter((a) => a.role !== "owner");

  return (
    <div className="space-y-10">
      {ev.status !== "published" && (
        <p className={cn("rounded-xl p-3 text-sm font-medium", ev.status === "cancelled" ? "bg-rose-50 text-rose-900 dark:bg-rose-950 dark:text-rose-100" : "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100")} data-testid="event-status-banner">
          {ev.status === "cancelled" ? t("cancelledBanner") : t("draftBanner")}
        </p>
      )}
      {flash && ["going", "waitlist", "cancelled"].includes(flash) && (
        <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100" data-testid="rsvp-flash">
          {t(`flash.${flash}`)}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm font-medium text-rose-900 dark:bg-rose-950 dark:text-rose-100">
          {t.has(`errors.${error}`) ? t(`errors.${error}`) : t("errors.generic")}
        </p>
      )}

      {/* Hero card */}
      <div className="grid gap-8 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <div className="space-y-5">
          <EventCover format={ev.format} src={ev.coverImage} alt={title} className="aspect-[5/2] shadow-lg md:aspect-square" />
          <div className="hidden space-y-4 md:block">
            {host && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("hostedBy")}</p>
                <p className="mt-1 font-medium text-ink">{host.displayName}</p>
              </div>
            )}
            {going > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("goingCount", { n: going })}</p>
                <div className="mt-2">
                  <AvatarStack attendees={guests} total={going} max={10} />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0 space-y-6">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <FormatPill format={ev.format} />
              {ev.isDemo && <DemoBadge />}
            </div>
            <h1 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight text-ink sm:text-4xl" data-testid="event-title">
              {title}
            </h1>
          </div>

          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line bg-snow">
                <CalendarDays aria-hidden className="h-5 w-5 text-muted" />
              </span>
              <div>
                <p className="font-semibold text-ink">{formatEventDay(ev.startsAt, locale)}</p>
                <p className="text-sm text-muted" data-testid="event-time">
                  {formatTimeRange(ev.startsAt, ev.endsAt, locale)}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line bg-snow">
                <MapPin aria-hidden className="h-5 w-5 text-muted" />
              </span>
              <div className="min-w-0">
                <a href={mapUrl(ev.venueAddress)} target="_blank" rel="noreferrer" className="font-semibold text-ink hover:underline" data-testid="map-link">
                  {ev.venueName} ↗
                </a>
                <p className="text-sm text-muted">{ev.venueAddress}</p>
              </div>
            </div>
            {ev.onlineUrl && (
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line bg-snow">
                  <Globe aria-hidden className="h-5 w-5 text-muted" />
                </span>
                <a href={ev.onlineUrl} target="_blank" rel="noreferrer" className="self-center break-all text-sm font-medium text-ink hover:underline">
                  {t("joinOnline")} ↗
                </a>
              </div>
            )}
          </div>

          {/* Registration */}
          <Card className="rounded-2xl border-line bg-surface p-0" data-testid="rsvp-card">
            <div className="rounded-t-2xl border-b border-line bg-snow px-5 py-3 text-sm font-semibold text-muted">{t("registration")}</div>
            <div className="space-y-4 p-5">
              <div>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium text-ink">{t("capacityLine", { going, capacity: ev.capacity })}</span>
                  <span className={left === 0 ? "font-semibold text-rose-600" : "text-muted"}>
                    {left === 0 ? (waitlist > 0 ? `${t("full")} · ${t("waitlistCount", { n: waitlist })}` : t("full")) : t("spotsLeft", { n: left })}
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" role="progressbar" aria-valuemin={0} aria-valuemax={ev.capacity} aria-valuenow={going} aria-label={t("capacity")}>
                  <div className={cn("h-full rounded-full", left === 0 ? "bg-rose-500" : left <= 5 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${pct}%` }} />
                </div>
              </div>

              {ev.status === "cancelled" ? (
                <p className="text-sm text-muted">{t("cancelledBanner")}</p>
              ) : ended ? (
                <p className="text-sm text-muted">{t("ended")}</p>
              ) : ev.status !== "published" ? (
                <p className="text-sm text-muted">{t("draftBanner")}</p>
              ) : !user ? (
                <a href={`/${locale}/sign-in?redirect_url=${encodeURIComponent(path)}`} className={buttonClass("primary", "w-full rounded-full py-2.5")} data-testid="rsvp-signin">
                  {t("signInToRsvp")}
                </a>
              ) : myRsvp?.role === "owner" ? (
                <p className="text-sm font-medium text-ink">{t("youreHosting")}</p>
              ) : myRsvp ? (
                <div className="space-y-3">
                  <p className="font-semibold text-ink" data-testid="my-rsvp">
                    {myRsvp.status === "going" ? t("youreGoing", { role: t(`role.${myRsvp.role}`) }) : t("youreWaitlisted", { n: myRsvp.waitlistPosition ?? 1 })}
                  </p>
                  <form action={cancelRsvpAction}>
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="eventId" value={ev.id} />
                    <input type="hidden" name="slug" value={ev.slug} />
                    <button type="submit" className={buttonClass("ghost", "px-0 text-rose-600 hover:bg-transparent hover:underline")} data-testid="rsvp-cancel">
                      {myRsvp.status === "going" ? t("cancelRsvp") : t("leaveWaitlist")}
                    </button>
                  </form>
                </div>
              ) : (
                <form action={rsvpAction} className="space-y-3">
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="eventId" value={ev.id} />
                  <input type="hidden" name="slug" value={ev.slug} />
                  <label className="block text-sm">
                    <span className="mb-1 block text-muted">{t("joinAs")}</span>
                    <Select name="role" defaultValue="participant">
                      {(["participant", "mentor", "observer"] as const).map((r) => (
                        <option key={r} value={r}>
                          {t(`role.${r}`)}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <button type="submit" className={buttonClass("primary", "w-full rounded-full py-2.5")} data-testid="rsvp-submit">
                    {left === 0 ? t("joinWaitlist") : t("rsvp")}
                  </button>
                  <p className="text-xs text-muted">{t("rsvpNote")}</p>
                </form>
              )}

              <div className="flex flex-wrap gap-2 border-t border-line pt-4">
                <a href={icsHref} className={buttonClass("secondary", "rounded-full")} data-testid="ics-link">
                  <CalendarPlus aria-hidden className="h-4 w-4" />
                  {t("addToCalendar")}
                </a>
                <ShareButton url={shareUrl} title={title} label={t("share")} copiedLabel={t("copied")} />
              </div>
            </div>
          </Card>

          {isHost && (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-line p-4" data-testid="host-controls">
              <span className="mr-1 text-sm font-semibold text-muted">{t("hostTools")}</span>
              <Link href={`/events/${ev.slug}/edit`} className={buttonClass("secondary", "rounded-full py-1.5")}>
                <Pencil aria-hidden className="h-3.5 w-3.5" />
                {t("edit")}
              </Link>
              {(["published", "draft", "cancelled"] as const)
                .filter((s) => s !== ev.status)
                .map((s) => (
                  <form key={s} action={setEventStatusAction}>
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="eventId" value={ev.id} />
                    <input type="hidden" name="status" value={s} />
                    <button type="submit" className={buttonClass(s === "cancelled" ? "ghost" : "secondary", cn("rounded-full py-1.5", s === "cancelled" && "text-rose-600"))}>
                      {t(`statusAction.${s}`)}
                    </button>
                  </form>
                ))}
            </div>
          )}

          <section>
            <h2 className="border-b border-line pb-2 text-sm font-semibold uppercase tracking-wide text-muted">{t("about")}</h2>
            <p className="mt-3 whitespace-pre-wrap leading-relaxed text-ink">{ev.summary[lang] || ev.summary.en}</p>
          </section>
        </div>
      </div>

      {/* Linked challenges */}
      <section data-testid="event-challenges">
        <h2 className="text-xl font-bold text-ink">{t("challengesTitle")}</h2>
        <p className="mt-1 text-sm text-muted">{t("challengesSubtitle")}</p>
        {challenges.length === 0 ? (
          <p className="mt-4 text-sm text-muted">{t("noChallenges")}</p>
        ) : (
          <ul className="mt-4 grid gap-4 md:grid-cols-2">
            {challenges.map((c) => (
              <li key={c.id}>
                <Link href={`/challenges/${c.id}`} className="block h-full rounded-2xl border border-line bg-surface p-5 shadow-sm transition hover:border-frost hover:shadow-md">
                  <p className="text-xs text-muted">
                    {c.businessName} · {c.city} · {c.industry}
                  </p>
                  <h3 className="mt-1 font-bold text-ink">{(lang === "en" ? c.titleEn : c.titleJa) || c.titleJa}</h3>
                  <p className="mt-2 line-clamp-3 text-sm text-muted">{(lang === "en" ? c.problemEn : c.problemJa) || c.problemJa}</p>
                  {c.skills.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {c.skills.slice(0, 4).map((s) => (
                        <Badge key={s}>{s}</Badge>
                      ))}
                    </div>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Grants & subsidies for this event's projects */}
      <section className="space-y-4" data-testid="event-grants">
        <div>
          <h2 className="text-xl font-bold text-ink">{t("grantsTitle")}</h2>
          <p className="mt-1 text-sm text-muted">{t("grantsSubtitle")}</p>
        </div>
        <GrantNotice locale={locale} />
        {grants.length === 0 ? <p className="text-sm text-muted">{tg("empty")}</p> : <GrantList grants={grants} locale={locale} showChallenge />}
      </section>

      {/* Mobile: host + attendees under the content */}
      <div className="space-y-3 md:hidden">
        {host && (
          <p className="text-sm text-muted">
            {t("hostedBy")} <span className="font-medium text-ink">{host.displayName}</span>
          </p>
        )}
        {going > 0 && <AvatarStack attendees={guests} total={going} max={8} />}
      </div>
    </div>
  );
}
