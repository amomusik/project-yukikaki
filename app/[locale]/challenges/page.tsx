import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SEARCH_MAX_LENGTH, challengeFacets, listChallenges } from "@/lib/queries";
import { GroundingBadge, StatusBadge } from "@/components/badges";
import { ShovelKid } from "@/components/mascot";
import { Badge, Card, Empty, Input, PageHeader, Select, buttonClass } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ChallengesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ city?: string | string[]; industry?: string | string[]; skill?: string | string[]; q?: string | string[] }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const raw = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
  const filters = { city: one(raw.city), industry: one(raw.industry), skill: one(raw.skill), q: one(raw.q)?.slice(0, SEARCH_MAX_LENGTH) };
  const filtered = Boolean(filters.q || filters.city || filters.industry || filters.skill);
  // "Clear search" drops q but keeps the other filters.
  const clearSearch = { pathname: "/challenges", query: Object.fromEntries(Object.entries({ ...filters, q: undefined }).filter(([, v]) => v)) as Record<string, string> };
  const t = await getTranslations("challenges");
  const lang = (await getLocale()) === "en" ? "en" : "ja";
  const [rows, facets] = await Promise.all([listChallenges(filters), challengeFacets()]);

  return (
    <div>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <form className="mb-4 grid gap-3 sm:grid-cols-4" method="get" role="search">
        <div className="relative sm:col-span-4">
          <label htmlFor="challenge-search" className="sr-only">{t("searchLabel")}</label>
          <span aria-hidden className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-lg text-slate-400">🔎</span>
          <Input
            id="challenge-search"
            type="search"
            name="q"
            defaultValue={filters.q ?? ""}
            placeholder={t("searchPlaceholder")}
            maxLength={SEARCH_MAX_LENGTH}
            autoComplete="off"
            enterKeyHint="search"
            className="py-3 pl-11 text-base shadow-sm"
          />
        </div>
        <Select name="city" defaultValue={filters.city ?? ""} aria-label={t("filterCity")}>
          <option value="">{t("filterCity")}: {t("all")}</option>
          {facets.cities.map((c) => <option key={c}>{c}</option>)}
        </Select>
        <Select name="industry" defaultValue={filters.industry ?? ""} aria-label={t("filterIndustry")}>
          <option value="">{t("filterIndustry")}: {t("all")}</option>
          {facets.industries.map((c) => <option key={c}>{c}</option>)}
        </Select>
        <Select name="skill" defaultValue={filters.skill ?? ""} aria-label={t("filterSkill")}>
          <option value="">{t("filterSkill")}: {t("all")}</option>
          {facets.skills.map((c) => <option key={c}>{c}</option>)}
        </Select>
        <button className={buttonClass("primary")}>{t("searchButton")}</button>
      </form>

      <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600 dark:text-slate-400" aria-live="polite">
        <span>{filters.q ? t("resultsFor", { count: rows.length, q: filters.q }) : t("resultsCount", { count: rows.length })}</span>
        {filters.q && (
          <Link href={clearSearch} className="text-sky-700 underline-offset-2 hover:underline dark:text-sky-400">
            {t("clearSearch")}
          </Link>
        )}
      </div>

      {rows.length === 0 ? (
        filtered ? (
          <Empty>
            <ShovelKid className="mx-auto mb-3 block h-28 w-32" />
            <span className="block font-medium text-slate-700 dark:text-slate-300">
              {filters.q ? t("noResultsFor", { q: filters.q }) : t("noResults")}
            </span>
            <span className="mt-1 block">{t("noResultsHint")}</span>
            <span className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2">
              {filters.q && (
                <Link href={clearSearch} className="font-medium text-sky-700 hover:underline dark:text-sky-400">
                  {t("clearSearch")}
                </Link>
              )}
              <Link href="/challenges" className="font-medium text-sky-700 hover:underline dark:text-sky-400">
                {t("clearAll")}
              </Link>
            </span>
            <Link
              href="/interview"
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-lantern px-5 py-2 font-semibold text-lantern-ink transition hover:bg-lantern-hover"
            >
              {t("emptyTitle")} <span aria-hidden>→</span>
            </Link>
          </Empty>
        ) : (
          <div className="rounded-3xl border border-dashed border-ice-strong bg-surface px-6 py-12 text-center">
            <ShovelKid className="mx-auto h-32 w-36" />
            <h2 className="mt-4 text-xl font-bold text-ink">{t("emptyTitle")}</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted">{t("emptyBody")}</p>
            <Link
              href="/interview"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-lantern px-5 py-2.5 font-semibold text-lantern-ink transition hover:bg-lantern-hover"
            >
              {t("emptyCta")} <span aria-hidden>→</span>
            </Link>
          </div>
        )
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map(({ brief, business }) => (
            <Link key={brief.id} href={`/challenges/${brief.id}`} className="block">
              <Card className="h-full transition hover:border-sky-400 hover:shadow-md">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <StatusBadge status={brief.status} />
                  <GroundingBadge level={brief.groundingLevel} />
                  {brief.isSynthetic && <Badge tone="violet">合成 / Synthetic</Badge>}
                </div>
                <h2 className="text-lg font-semibold">{brief.content[lang].title}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {business.name} · {business.city}
                  {business.ward ? ` ${business.ward}` : ""} · {business.industry}
                </p>
                <p className="mt-3 line-clamp-3 text-sm text-slate-700 dark:text-slate-300">{brief.content[lang].problem}</p>
                <div className="mt-4 flex flex-wrap gap-1">
                  {brief.hoursLostPerWeek != null && <Badge tone="amber">{t("hours", { n: brief.hoursLostPerWeek })}</Badge>}
                  {brief.skillsNeeded.map((s) => <Badge key={s}>{s}</Badge>)}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
