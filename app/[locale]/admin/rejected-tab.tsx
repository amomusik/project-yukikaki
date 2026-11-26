import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { adminRejected } from "@/lib/queries";
import { StatusBadge } from "@/components/badges";
import { Card, Empty } from "@/components/ui";

/** Briefs a host returned: they wait for the owner to revise & resubmit from /me. */
export async function RejectedTab({ locale }: { locale: string }) {
  const t = await getTranslations("admin");
  const lang = locale === "en" ? "en" : "ja";
  const rows = await adminRejected();
  if (rows.length === 0) return <Empty>{t("noRejected")}</Empty>;
  return (
    <div className="space-y-4" data-testid="rejected-list">
      <p className="text-sm text-slate-600 dark:text-slate-300">{t("rejectedHint")}</p>
      {rows.map(({ brief, business, rejection }) => (
        <Card key={brief.id} data-testid="rejected-card">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={brief.status} />
            {rejection && <span className="text-xs text-slate-600 dark:text-slate-300">{rejection.decidedAt.toISOString().slice(0, 16).replace("T", " ")}</span>}
          </div>
          <Link href={`/challenges/${brief.id}`} className="mt-2 block text-lg font-semibold hover:underline">
            {brief.content[lang].title}
          </Link>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {business.name} · {business.city} · {business.industry}
          </p>
          <p className="mt-2 text-sm">
            <span className="font-semibold">{t("rejectionNote")}: </span>
            {rejection?.note || "—"}
          </p>
        </Card>
      ))}
    </div>
  );
}
