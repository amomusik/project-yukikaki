import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth";
import { briefsForOwner, teamsForUser } from "@/lib/queries";
import { GroundingBadge, StatusBadge } from "@/components/badges";
import { Badge, Button, Card, Empty, PageHeader, buttonClass } from "@/components/ui";
import { deleteMyDataAction } from "./actions";
import { ResubmitForm } from "./resubmit-form";

export const dynamic = "force-dynamic";
// Resubmitting a returned brief re-runs enrichment with after(); that work counts against this function.
export const maxDuration = 300;

export default async function MePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ resubmit?: string; delete?: string; deleted?: string }>;
}) {
  const { locale } = await params;
  const { resubmit, delete: deleteStep, deleted } = await searchParams;
  setRequestLocale(locale);
  const user = await requireUser(locale);
  if (user.role === "host") redirect(`/${locale}/admin`);
  const t = await getTranslations("me");
  const tt = await getTranslations("teams");
  const lang = locale === "en" ? "en" : "ja";

  if (user.role === "business") {
    const briefs = await briefsForOwner(user.id);
    return (
      <div>
        <PageHeader title={t("title")}>
          <Link href="/interview" className={buttonClass("primary")}>🎙️ {t("newInterview")}</Link>
        </PageHeader>
        {resubmit && (
          <p role="status" className="mb-4 rounded-lg bg-sky-50 p-3 text-sm dark:bg-sky-950" data-testid="resubmit-status">
            {resubmit === "ok" ? t("resubmitted") : t("resubmitFailed")}
          </p>
        )}
        {deleted && (
          <p role="status" className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm dark:bg-emerald-950" data-testid="delete-status">
            {t("deleteDone")}
          </p>
        )}
        <h2 className="mb-3 text-lg font-semibold">{t("myBriefs")}</h2>
        {briefs.length === 0 ? (
          <Empty>{t("empty")}</Empty>
        ) : (
          <div className="space-y-3">
            {briefs.map(({ brief, business, deliveries, rejection }) => (
              <Card key={brief.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={brief.status} />
                  <GroundingBadge level={brief.groundingLevel} />
                </div>
                <Link href={`/challenges/${brief.id}`} className="mt-2 block text-lg font-semibold hover:underline">
                  {brief.content[lang].title}
                </Link>
                <p className="text-sm text-muted">{business.name} · {business.city}</p>
                {brief.status === "rejected" && <ResubmitForm locale={locale} briefId={brief.id} content={brief.content} rejection={rejection} />}
                {deliveries.map(({ delivery, lead, team }) => (
                  <div key={delivery.id} className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm dark:bg-emerald-950">
                    <p className="font-semibold">🛟 {t("support")} — {team.name}</p>
                    <p className="mt-1">{delivery.summary[lang]}</p>
                    <p className="mt-1 text-slate-600 dark:text-slate-300">
                      {t("supportContact", { name: lead.displayName, email: lead.email, date: delivery.supportUntil })}
                    </p>
                  </div>
                ))}
              </Card>
            ))}
          </div>
        )}
        <section className="mt-10" aria-labelledby="delete-my-data">
          <h2 id="delete-my-data" className="mb-2 text-lg font-semibold">{t("deleteTitle")}</h2>
          <p className="mb-3 text-sm text-muted">{t("deleteExplain")}</p>
          {deleteStep === "confirm" ? (
            <Card className="border-rose-300" data-testid="delete-confirm">
              <form action={deleteMyDataAction} className="space-y-3">
                <input type="hidden" name="locale" value={locale} />
                <p className="text-sm font-medium">{t("deleteConfirmText")}</p>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="confirm" value="yes" required className="mt-1" />
                  <span>{t("deleteConfirmCheck")}</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" variant="danger">{t("deleteConfirm")}</Button>
                  <Link href="/me" className={buttonClass("secondary")}>{t("deleteCancel")}</Link>
                </div>
              </form>
            </Card>
          ) : (
            <Link href="/me?delete=confirm" className={buttonClass("secondary")} data-testid="delete-start">
              {t("deleteStart")}
            </Link>
          )}
          <p className="mt-3 text-xs text-muted">
            <Link href="/privacy" className="underline">{t("privacyLink")}</Link>
          </p>
        </section>
      </div>
    );
  }

  const teams = await teamsForUser(user.id);
  return (
    <div>
      <PageHeader title={t("title")}>
        <Link href="/challenges" className={buttonClass("primary")}>{t("browse")}</Link>
      </PageHeader>
      <div className="mb-6 flex flex-wrap gap-1">{user.skills.map((s) => <Badge key={s} tone="green">{s}</Badge>)}</div>
      <h2 className="mb-3 text-lg font-semibold">{t("myTeams")}</h2>
      {teams.length === 0 ? (
        <Empty>{t("empty")}</Empty>
      ) : (
        <div className="space-y-3">
          {teams.map(({ team, role, brief }) => (
            <Card key={team.id} className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <Link href={`/teams/${team.id}`} className="font-semibold hover:underline">{team.name}</Link>
                <p className="text-sm text-muted">{brief.content[lang].title}</p>
              </div>
              <div className="flex items-center gap-2">
                {role === "lead" && <Badge tone="amber">👑 {tt("lead")}</Badge>}
                <StatusBadge status={team.status} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
