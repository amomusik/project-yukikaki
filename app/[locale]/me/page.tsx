import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth";
import { briefsForOwner, teamsForUser } from "@/lib/queries";
import { GroundingBadge, StatusBadge } from "@/components/badges";
import { Badge, Card, Empty, PageHeader, buttonClass } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function MePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
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
        <h2 className="mb-3 text-lg font-semibold">{t("myBriefs")}</h2>
        {briefs.length === 0 ? (
          <Empty>{t("empty")}</Empty>
        ) : (
          <div className="space-y-3">
            {briefs.map(({ brief, business, deliveries }) => (
              <Card key={brief.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={brief.status} />
                  <GroundingBadge level={brief.groundingLevel} />
                </div>
                <Link href={`/challenges/${brief.id}`} className="mt-2 block text-lg font-semibold hover:underline">
                  {brief.content[lang].title}
                </Link>
                <p className="text-sm text-muted">{business.name} · {business.city}</p>
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
