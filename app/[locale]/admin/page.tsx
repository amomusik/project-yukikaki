import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireRole } from "@/lib/auth";
import { adminDeliveries, adminQueue, adminTeams, impactStats, recentDecisions, serviceStatus } from "@/lib/queries";
import { AiBadge, GroundingBadge, SourceBadge, StatusBadge } from "@/components/badges";
import { Badge, Button, Card, Empty, Input, PageHeader, cn } from "@/components/ui";
import { grantMatchSummary } from "@/lib/grants/store";
import { decideAction, reEnrichAction } from "./actions";
import { refreshAllGrantsAction, refreshGrantsAction } from "./grant-actions";
import { ImpactCheckButton } from "./impact-check-button";
import { RejectedTab } from "./rejected-tab";

// Server actions on this page start the brief/team pipeline with after(); that work counts
// against this function's duration (300 s = Vercel Hobby max; Pro allows up to 800 s).
export const maxDuration = 300;

export const dynamic = "force-dynamic";

const TABS = ["briefs", "rejected", "teams", "deliveries", "impact"] as const;
type Tab = (typeof TABS)[number];
const SERVICES = ["neon", "neo4j", "elevenlabs", "linkup", "dify", "adaption", "resend", "jgrants"];

export default async function AdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRole(locale, "host");
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as Tab) : "briefs";
  const t = await getTranslations("admin");
  const tn = await getTranslations("nav");
  const status = await serviceStatus().catch(() => []);
  const tabLabel: Record<Tab, string> = { briefs: t("tabBriefs"), rejected: t("tabRejected"), teams: t("tabTeams"), deliveries: t("tabDeliveries"), impact: t("tabImpact") };

  return (
    <div>
      <PageHeader title={t("title")}>
        {/* The graph left the header nav (≤5 items); hosts reach it from here. */}
        <Link href="/admin/graph" className="text-sm font-semibold text-frost underline-offset-4 hover:underline">
          {tn("graph")} →
        </Link>
      </PageHeader>
      <div className="mb-6 flex flex-wrap items-center gap-2 text-xs" data-testid="service-status">
        <span className="font-semibold text-muted">{t("serviceStatus")}:</span>
        {SERVICES.map((s) => {
          const ev = status.find((x) => x.service === s);
          const tone = !ev ? "slate" : ev.ok ? "green" : "amber";
          return (
            <Badge key={s} tone={tone} title={ev?.error ?? undefined}>
              {s} · {!ev ? t("unknown") : ev.ok ? t("ok") : t("degraded")}
            </Badge>
          );
        })}
      </div>
      <nav className="mb-6 flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {TABS.map((k) => (
          <Link
            key={k}
            href={`/admin?tab=${k}`}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm",
              tab === k ? "border-slate-900 font-semibold dark:border-sky-200" : "border-transparent text-muted hover:text-slate-800",
            )}
          >
            {tabLabel[k]}
          </Link>
        ))}
      </nav>
      {tab === "briefs" && <BriefsTab locale={locale} />}
      {tab === "rejected" && <RejectedTab locale={locale} />}
      {tab === "teams" && <TeamsTab locale={locale} />}
      {tab === "deliveries" && <DeliveriesTab locale={locale} />}
      {tab === "impact" && <ImpactTab locale={locale} />}
    </div>
  );
}

async function DecisionForm({ locale, subjectType, subjectId }: { locale: string; subjectType: "brief" | "team"; subjectId: string }) {
  const t = await getTranslations("admin");
  return (
    <form action={decideAction} className="mt-4 flex flex-wrap items-center gap-2" data-testid="decision-form">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="subjectType" value={subjectType} />
      <input type="hidden" name="subjectId" value={subjectId} />
      <Input name="note" placeholder={t("note")} className="max-w-sm flex-1" />
      <Button name="decision" value="approve" type="submit">✓ {t("approve")}</Button>
      <Button name="decision" value="reject" type="submit" variant="secondary">↩ {t("reject")}</Button>
    </form>
  );
}

async function BriefsTab({ locale }: { locale: string }) {
  const t = await getTranslations("admin");
  const ts = await getTranslations("status");
  const lang = locale === "en" ? "en" : "ja";
  const tg = await getTranslations("grants");
  const [queue, decisions] = await Promise.all([adminQueue(), recentDecisions()]);
  const grantSummary = await grantMatchSummary(queue.map((q) => q.brief.id)).catch(() => new Map<string, { count: number; fetchedAt: Date | null }>());
  return (
    <div className="space-y-4">
      {queue.length === 0 && <Empty>{t("empty")}</Empty>}
      {queue.map(({ brief, business, sources }) => (
        <Card key={brief.id} data-testid="brief-card">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={brief.status} />
            <AiBadge review={brief.aiReview} />
            <GroundingBadge level={brief.groundingLevel} city={sources.find((s) => s.matchedCity)?.matchedCity} />
          </div>
          <Link href={`/challenges/${brief.id}`} className="mt-2 block text-lg font-semibold hover:underline">
            {brief.content[lang].title}
          </Link>
          <p className="text-sm text-muted">
            {business.name} · {business.city} · {business.industry}
            {brief.hoursLostPerWeek != null && ` · ${brief.hoursLostPerWeek}h/week`}
          </p>
          <p className="mt-2 text-sm">{brief.content[lang].problem}</p>
          {(brief.aiReview?.issues?.length || brief.aiReview?.error) && (
            <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
              <p className="font-semibold">{t("issues")}</p>
              <ul className="ml-4 list-disc">
                {brief.aiReview?.error && <li>{brief.aiReview.error}</li>}
                {brief.aiReview?.issues?.map((i) => <li key={i}>{i}</li>)}
              </ul>
              {brief.aiReview?.grounding_comment && <p className="mt-1 text-xs">{brief.aiReview.grounding_comment}</p>}
            </div>
          )}
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-slate-600">{t("sources")} ({sources.length})</summary>
            <ul className="mt-2 space-y-2">
              {sources.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2">
                  <SourceBadge source={s} />
                  {s.url ? <a href={s.url} target="_blank" rel="noreferrer" className="hover:underline">{s.title}</a> : <span>{s.title}</span>}
                </li>
              ))}
            </ul>
          </details>
          {brief.transcript && (
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer text-slate-600">{t("transcript")}</summary>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-3 text-xs dark:bg-slate-950">{brief.transcript}</pre>
            </details>
          )}
          {brief.status === "in_review" ? (
            <>
              <DecisionForm locale={locale} subjectType="brief" subjectId={brief.id} />
              <form action={reEnrichAction} className="mt-2">
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="briefId" value={brief.id} />
                <Button type="submit" variant="secondary" data-testid="re-enrich">↻ {t("reEnrich")}</Button>
              </form>
            </>
          ) : (
            <p className="mt-3 text-xs text-muted">{ts(brief.status)}…</p>
          )}
          <form action={refreshGrantsAction} className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-xs text-muted dark:border-slate-800" data-testid="grants-refresh">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="briefId" value={brief.id} />
            {(() => {
              const g = grantSummary.get(brief.id);
              return (
                <>
                  <span>
                    {g?.count ? tg("count", { n: g.count, date: g.fetchedAt ? g.fetchedAt.toISOString().slice(0, 16).replace("T", " ") : "—" }) : tg("none")}
                  </span>
                  <Button type="submit" variant="secondary" className="py-1 text-xs" title={tg("background")}>
                    🔎 {g?.count ? tg("refresh") : tg("find")}
                  </Button>
                  <span className="text-slate-400">{tg("background")}</span>
                </>
              );
            })()}
          </form>
        </Card>
      ))}
      <form action={refreshAllGrantsAction} className="flex flex-wrap items-center gap-2 text-xs text-muted" data-testid="grants-refresh-all">
        <input type="hidden" name="locale" value={locale} />
        <Button type="submit" variant="secondary" className="py-1 text-xs">🔎 {tg("refreshAll")}</Button>
        <Link href="/grants" className="hover:underline">{tg("seeAll")} →</Link>
        <span className="text-slate-400">{tg("background")}</span>
      </form>
      {decisions.length > 0 && (
        <div className="pt-4">
          <h3 className="mb-2 text-sm font-semibold text-muted">{t("recentDecisions")}</h3>
          <ul className="space-y-1 text-xs text-muted">
            {decisions.map(({ decision, host }) => (
              <li key={decision.id}>
                {decision.createdAt.toISOString().slice(0, 16).replace("T", " ")} · {host.displayName} · {decision.subjectType} · {decision.decision}
                {decision.note ? ` — ${decision.note}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

async function TeamsTab({ locale }: { locale: string }) {
  const t = await getTranslations("admin");
  const tt = await getTranslations("teams");
  const lang = locale === "en" ? "en" : "ja";
  const teams = await adminTeams();
  if (teams.length === 0) return <Empty>{t("empty")}</Empty>;
  return (
    <div className="space-y-4">
      {teams.map(({ team, brief, members }) => (
        <Card key={team.id}>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={team.status} />
            <AiBadge review={team.aiReview} />
          </div>
          <h3 className="mt-2 text-lg font-semibold">{team.name}</h3>
          <p className="text-sm text-muted">{brief.content[lang].title}</p>
          <p className="mt-2 whitespace-pre-wrap text-sm">{team.pitch}</p>
          <p className="mt-3 text-sm">
            <span className="font-semibold">{t("members")}: </span>
            {members.map((m) => (
              <span key={m.user.id} className="mr-2">
                {m.role === "lead" ? `👑 ${m.user.displayName} (${tt("lead")})` : m.user.displayName}
                <span className="text-slate-400"> [{m.user.skills.join(", ")}]</span>
              </span>
            ))}
          </p>
          {team.aiReview?.issues?.length ? <p className="mt-2 text-sm text-amber-700">{team.aiReview.issues.join(" · ")}</p> : null}
          <DecisionForm locale={locale} subjectType="team" subjectId={team.id} />
        </Card>
      ))}
    </div>
  );
}

async function DeliveriesTab({ locale }: { locale: string }) {
  const t = await getTranslations("admin");
  const tt = await getTranslations("teams");
  const lang = locale === "en" ? "en" : "ja";
  const rows = await adminDeliveries();
  if (rows.length === 0) return <Empty>{t("empty")}</Empty>;
  return (
    <div className="space-y-4">
      {rows.map(({ delivery, team, brief, business, lead, evaluation }) => (
        <Card key={delivery.id} data-testid="delivery-card">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={brief.status} />
          </div>
          <h3 className="mt-2 font-semibold">{brief.content[lang].title}</h3>
          <p className="text-sm text-muted">
            {business.name} · {team.name} · 👑 {lead.displayName} · {tt("supportUntil", { date: delivery.supportUntil })}
          </p>
          <p className="mt-2 text-sm">{delivery.summary[lang]}</p>
          <div className="mt-4">
            {evaluation ? (
              <Badge tone="green">
                ✓ {evaluation.hoursSavedPerWeek}h/week · ★{evaluation.satisfaction}
              </Badge>
            ) : (
              <ImpactCheckButton
                deliveryId={delivery.id}
                locale={locale}
                labels={{ send: t("sendImpact"), emailed: t("emailed", { email: "{email}" }), fallback: t("linkFallback"), copy: t("copyLink"), copied: t("copied") }}
              />
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}

async function ImpactTab({ locale }: { locale: string }) {
  const t = await getTranslations("admin");
  const lang = locale === "en" ? "en" : "ja";
  const { rows, total, avg, inUse } = await impactStats();
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-4">
        <Card><p className="text-xs text-muted">{t("totalHours")}</p><p className="text-3xl font-bold" data-testid="impact-total">{total}<span className="text-base font-normal text-muted"> h/week</span></p></Card>
        <Card><p className="text-xs text-muted">{t("avgSatisfaction")}</p><p className="text-3xl font-bold">{avg ? avg.toFixed(1) : "—"}</p></Card>
        <Card><p className="text-xs text-muted">{t("evaluations")}</p><p className="text-3xl font-bold">{rows.length}</p></Card>
        <Card><p className="text-xs text-muted">{t("stillInUse")}</p><p className="text-3xl font-bold">{inUse}/{rows.length}</p></Card>
      </div>
      {rows.length === 0 && <Empty>{t("noEvaluations")}</Empty>}
      {rows.map(({ evaluation, brief, business, team }) => {
        const quote = (evaluation.impactSummary as { quote?: string } | null)?.quote;
        return (
          <Card key={evaluation.id}>
            <p className="font-semibold">{brief.content[lang].title}</p>
            <p className="text-sm text-muted">{business.name} · {team.name}</p>
            <p className="mt-2 text-sm">
              {evaluation.hoursSavedPerWeek}h/week · ★{evaluation.satisfaction} · {evaluation.stillInUse ? "✓" : "✗"}
            </p>
            {quote && <blockquote className="mt-2 border-l-4 border-sky-300 pl-3 text-sm italic">“{quote}”</blockquote>}
            {evaluation.issues && <p className="mt-2 text-sm text-amber-700">{evaluation.issues}</p>}
            {evaluation.impactTranscript && (
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer text-slate-600">{t("transcript")}</summary>
                <pre className="mt-2 whitespace-pre-wrap text-xs">{evaluation.impactTranscript}</pre>
              </details>
            )}
          </Card>
        );
      })}
    </div>
  );
}
