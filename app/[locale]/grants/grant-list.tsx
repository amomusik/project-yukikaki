import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { GrantMatchRow } from "@/lib/db/schema";
import { daysLeft, formatDateJst, formatYen, grantlineUrl } from "@/lib/grants/format";
import { Badge, Card, buttonClass } from "@/components/ui";

type Row = GrantMatchRow & { challenge?: { id: string; titleJa: string; titleEn: string; city: string } };

/** The 行政書士 notice + Grantline hand-off. Required wherever grants are shown. */
export async function GrantNotice({ locale }: { locale: string }) {
  const t = await getTranslations("grants");
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100" data-testid="grants-notice">
      <p>{t("notice")}</p>
      <a href={grantlineUrl(locale)} target="_blank" rel="noreferrer" className="mt-2 inline-block font-medium underline">
        {t("grantline")} ↗
      </a>
    </div>
  );
}

export async function GrantList({ grants, locale, showChallenge = false }: { grants: Row[]; locale: string; showChallenge?: boolean }) {
  const t = await getTranslations("grants");
  const lang = locale === "en" ? "en" : "ja";
  if (grants.length === 0) return <p className="text-sm text-slate-500">{t("empty")}</p>;
  return (
    <ul className="space-y-3" data-testid="grant-list">
      {grants.map((g) => {
        const amount = formatYen(g.amountMax, lang);
        const date = formatDateJst(g.deadline);
        const left = daysLeft(g.deadline);
        return (
          <li key={g.id}>
            <Card className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={g.source === "jgrants" ? "sky" : "violet"}>{g.source === "jgrants" ? t("sourceJgrants") : t("sourceLinkup")}</Badge>
                {left != null && <Badge tone={left <= 14 ? "amber" : "green"}>{t("daysLeft", { n: left })}</Badge>}
              </div>
              <p className="mt-2 font-medium">
                <a href={g.url} target="_blank" rel="noreferrer" className="hover:underline">{g.title}</a>
              </p>
              <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm text-slate-600 sm:grid-cols-2 dark:text-slate-400">
                <div><dt className="inline font-semibold">{t("deadline")}: </dt><dd className="inline">{date ?? t("noDeadline")}</dd></div>
                <div><dt className="inline font-semibold">{t("amountLabel")}: </dt><dd className="inline">{amount ?? t("noAmount")}</dd></div>
                {g.subsidyRate && <div><dt className="inline font-semibold">{t("rate")}: </dt><dd className="inline">{g.subsidyRate}</dd></div>}
                {g.area && <div><dt className="inline font-semibold">{t("area")}: </dt><dd className="inline">{g.area}</dd></div>}
                {g.issuer && <div><dt className="inline font-semibold">{t("issuer")}: </dt><dd className="inline">{g.issuer}</dd></div>}
                {showChallenge && g.challenge && (
                  <div className="sm:col-span-2">
                    <dt className="inline font-semibold">{t("forChallenge")}: </dt>
                    <dd className="inline">
                      <Link href={`/challenges/${g.challenge.id}`} className="hover:underline">
                        {(lang === "en" ? g.challenge.titleEn : g.challenge.titleJa) || g.challenge.titleJa} · {g.challenge.city}
                      </Link>
                    </dd>
                  </div>
                )}
              </dl>
              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                <a href={g.url} target="_blank" rel="noreferrer" className={buttonClass("secondary", "py-1")}>{t("official")} ↗</a>
                <a href={grantlineUrl(lang)} target="_blank" rel="noreferrer" className={buttonClass("ghost", "py-1")}>{t("grantline")} ↗</a>
              </div>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
