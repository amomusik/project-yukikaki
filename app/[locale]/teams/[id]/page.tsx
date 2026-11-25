import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth";
import { getTeamDetail } from "@/lib/queries";
import { isUuid } from "@/lib/uuid";
import { AiBadge, StatusBadge } from "@/components/badges";
import { Badge, Button, Card, PageHeader, Select, buttonClass } from "@/components/ui";
import { transferLeadAction } from "../actions";

// Server actions on this page start the brief/team pipeline with after(); that work counts
// against this function's duration (300 s = Vercel Hobby max; Pro allows up to 800 s).
export const maxDuration = 300;

export const dynamic = "force-dynamic";

export default async function TeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ unknown?: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale);
  if (!isUuid(id)) notFound();
  const detail = await getTeamDetail(id);
  if (!detail) notFound();
  const { unknown } = await searchParams;
  const t = await getTranslations("teams");
  const lang = locale === "en" ? "en" : "ja";
  const { team, members, brief, delivery } = detail;
  const lead = members.find((m) => m.role === "lead");
  const isLead = lead?.user.id === user.id;
  const others = members.filter((m) => m.role !== "lead");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={team.name} subtitle={brief.content[lang].title}>
        <StatusBadge status={team.status} />
      </PageHeader>
      {unknown && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{t("unknown", { emails: unknown })}</p>}

      <Card>
        <p className="whitespace-pre-wrap text-sm">{team.pitch}</p>
        <div className="mt-3"><AiBadge review={team.aiReview} /></div>
      </Card>

      <Card>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {members.map((m) => (
            <li key={m.user.id} className="flex items-center justify-between py-2 text-sm">
              <span>{m.user.displayName}</span>
              {m.role === "lead" ? <Badge tone="amber">👑 {t("lead")}</Badge> : <Badge>{t("member")}</Badge>}
            </li>
          ))}
        </ul>
        {isLead && others.length > 0 && team.status !== "delivered" && (
          <form action={transferLeadAction} className="mt-4 flex flex-wrap items-end gap-2">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="teamId" value={team.id} />
            <label className="text-sm">
              {t("transferTo")}
              <Select name="toUserId" className="mt-1">
                {others.map((m) => <option key={m.user.id} value={m.user.id}>{m.user.displayName}</option>)}
              </Select>
            </label>
            <Button variant="secondary" type="submit">{t("transfer")}</Button>
          </form>
        )}
      </Card>

      {delivery ? (
        <Card>
          <h2 className="mb-2 font-semibold">{t("deliverTitle")}</h2>
          <p className="text-sm">{delivery.summary[lang]}</p>
          <ul className="mt-2 text-sm">
            {delivery.links.map((l) => <li key={l}><a className="text-sky-700 hover:underline" href={l}>{l}</a></li>)}
          </ul>
          <p className="mt-3 text-xs text-slate-500">{t("supportUntil", { date: delivery.supportUntil })}</p>
        </Card>
      ) : team.status === "approved" ? (
        isLead ? (
          <Link href={`/teams/${team.id}/deliver`} className={buttonClass("primary")}>
            {t("deliver")}
          </Link>
        ) : (
          <p className="text-sm text-slate-500">{t("onlyLead")}</p>
        )
      ) : null}
    </div>
  );
}
