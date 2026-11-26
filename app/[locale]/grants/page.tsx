import { getTranslations, setRequestLocale } from "next-intl/server";
import { listOpenGrants } from "@/lib/grants/store";
import { PageHeader } from "@/components/ui";
import { GrantList, GrantNotice } from "./grant-list";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "grants" });
  return { title: `${t("pageTitle")} · Yukikaki`, description: t("pageSubtitle") };
}

/** Public: open grants matched across published challenges. */
export default async function GrantsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("grants");
  const grants = await listOpenGrants();
  return (
    <div className="space-y-6">
      <PageHeader title={t("pageTitle")} subtitle={t("pageSubtitle")} />
      <GrantNotice locale={locale} />
      <GrantList grants={grants} locale={locale} showChallenge />
      <p className="text-xs text-muted">{t("sourcesNote")}</p>
    </div>
  );
}
