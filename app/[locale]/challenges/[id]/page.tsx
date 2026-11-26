import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { ensureUser } from "@/lib/auth";
import { challengeNeighborhood, suggestBuilders } from "@/lib/graph/queries";
import { getGrantMatches } from "@/lib/grants/store";
import { GrantList, GrantNotice } from "../../grants/grant-list";
import { refreshGrantsAction } from "../../admin/grant-actions";
import { PUBLIC_STATUSES, getBriefDetail } from "@/lib/queries";
import { isUuid } from "@/lib/uuid";
import { GraphView } from "@/components/graph-view";
import { GroundingBadge, SourceBadge, StatusBadge } from "@/components/badges";
import { Badge, Card, buttonClass } from "@/components/ui";
import { cityLabel, industryLabel } from "@/components/landing/labels";

export const dynamic = "force-dynamic";
// The host-only "Find grants" action runs jGrants matching via after() inside this function.
export const maxDuration = 120;

export default async function ChallengePage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  if (!isUuid(id)) notFound();
  const detail = await getBriefDetail(id);
  const user = await ensureUser().catch(() => null);
  if (!detail) notFound();
  const isOwnerOrHost = user && (user.role === "host" || user.id === detail.business.ownerUserId);
  if (!PUBLIC_STATUSES.includes(detail.brief.status) && !isOwnerOrHost) notFound();

  const t = await getTranslations("challenges");
  const ta = await getTranslations("admin");
  const tt = await getTranslations("teams");
  const lang = locale === "en" ? "en" : "ja";
  const { brief, business, sources, teams } = detail;
  const tg = await getTranslations("grants");
  const tc = await getTranslations("common");
  const skillLabel = (s: string) => (tc.has(`skills.${s}`) ? tc(`skills.${s}`) : s);
  const [graph, builders, grants] = await Promise.all([challengeNeighborhood(id), suggestBuilders(id), getGrantMatches(id).catch(() => [])]);
  const c = brief.content[lang];
  const canFormTeam = user?.role === "student" && ["approved", "in_progress"].includes(brief.status);

  return (
    <div className="space-y-8">
      <div>
        <div className="mb-3 flex flex-wrap gap-2">
          <StatusBadge status={brief.status} />
          <GroundingBadge level={brief.groundingLevel} />
          {brief.isSynthetic && <Badge tone="violet">{tc("synthetic")}</Badge>}
        </div>
        <h1 className="text-3xl font-bold tracking-tight">{c.title}</h1>
        <p className="mt-2 text-muted [word-break:auto-phrase]">
          {business.name} · {cityLabel(business.city, lang)}
          {business.ward ? ` ${business.ward}` : ""} · {industryLabel(business.industry, lang)}
          {brief.hoursLostPerWeek != null && ` · ${t("hours", { n: brief.hoursLostPerWeek })}`}
        </p>
        {!user && ["approved", "in_progress"].includes(brief.status) && (
          // Signed-out builders otherwise hit a dead end here: say how to join, and come back after sign-in.
          <a
            href={`/${locale}/sign-in?redirect_url=${encodeURIComponent(`/${locale}/challenges/${brief.id}`)}`}
            className={buttonClass("secondary", "mt-5 rounded-full")}
          >
            {t("signInToJoin")}
          </a>
        )}
        {canFormTeam && (
          <Link href={{ pathname: "/teams/new", query: { brief: brief.id } }} className={buttonClass("primary", "mt-5")}>
            {t("formTeam")}
          </Link>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          [t("problem"), c.problem],
          [t("currentProcess"), c.current_process],
          [t("desiredOutcome"), c.desired_outcome],
        ].map(([h, body]) => (
          <Card key={h}>
            <h2 className="mb-2 text-sm font-semibold text-muted">{h}</h2>
            <p className="whitespace-pre-wrap text-sm">{body || "—"}</p>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-6 text-sm">
        <div>
          <span className="mr-2 font-semibold">{t("skills")}:</span>
          {brief.skillsNeeded.map((s) => <Badge key={s} className="mr-1">{skillLabel(s)}</Badge>)}
        </div>
        {brief.toolsUsed.length > 0 && (
          <div>
            <span className="mr-2 font-semibold">{t("tools")}:</span>
            {brief.toolsUsed.join(", ")}
          </div>
        )}
      </div>

      <section>
        <h2 className="mb-3 text-xl font-bold">{t("data")}</h2>
        <div className="space-y-3">
          {sources.map((s) => (
            <Card key={s.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <SourceBadge source={s} />
                  <p className="mt-2 font-medium">
                    {s.url ? <a href={s.url} target="_blank" rel="noreferrer" className="hover:underline">{s.title}</a> : s.title}
                  </p>
                  {s.snippet && <p className="mt-1 line-clamp-2 max-w-prose text-sm text-muted">{s.snippet}</p>}
                  {s.kind === "synthetic" && s.groundedOn.length > 0 && (
                    <p className="mt-1 text-xs text-muted">
                      {t("groundedOn")}: {sources.filter((x) => s.groundedOn.includes(x.id)).map((x) => x.matchedCity ?? x.title).join(", ")}
                    </p>
                  )}
                </div>
                {s.kind === "synthetic" && !s.pending && (
                  <span className="flex gap-2 text-sm">
                    <a className={buttonClass("secondary", "py-1")} href={`/api/datasets/${s.id}`}>JSON</a>
                    <a className={buttonClass("secondary", "py-1")} href={`/api/datasets/${s.id}?format=csv`}>CSV</a>
                  </span>
                )}
              </div>
            </Card>
          ))}
          {sources.length === 0 && <p className="text-sm text-muted">—</p>}
        </div>
      </section>

      <section data-testid="grants-section">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-bold">{tg("title")}</h2>
          <span className="flex flex-wrap items-center gap-3 text-sm">
            {user?.role === "host" && (
              <form action={refreshGrantsAction} data-testid="grants-refresh">
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="briefId" value={brief.id} />
                <button type="submit" className={buttonClass("secondary", "py-1 text-xs")} title={tg("background")}>
                  🔎 {grants.length ? tg("refresh") : tg("find")}
                </button>
              </form>
            )}
            <Link href="/grants" className="text-slate-600 hover:underline dark:text-slate-400">{tg("seeAll")} →</Link>
          </span>
        </div>
        <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">{tg("sectionLead")}</p>
        <div className="space-y-3">
          <GrantList grants={grants} locale={locale} />
          <GrantNotice locale={locale} />
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
        <section>
          <h2 className="mb-3 text-xl font-bold">{t("graph")}</h2>
          <GraphView data={graph} unavailableLabel={ta("graphUnavailable")} />
        </section>
        <section className="space-y-6">
          <div>
            <h2 className="mb-3 text-xl font-bold">{t("builders")}</h2>
            {builders.length === 0 ? (
              <p className="text-sm text-muted">{t("noBuilders")}</p>
            ) : (
              <ul className="space-y-2">
                {builders.map((b) => (
                  <li key={b.id} className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
                    <p className="font-medium">{b.name}</p>
                    <p className="mt-1 flex flex-wrap gap-1">{b.sharedSkills.map((s) => <Badge key={s} tone="green">{s}</Badge>)}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {teams.length > 0 && (
            <div>
              <h2 className="mb-3 text-xl font-bold">{t("teams")}</h2>
              <ul className="space-y-2">
                {teams.map((tm) => (
                  <li key={tm.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
                    <Link href={`/teams/${tm.id}`} className="font-medium hover:underline">{tm.name}</Link>
                    <span className="text-xs text-muted">{tt("status")}: <StatusBadge status={tm.status} /></span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
