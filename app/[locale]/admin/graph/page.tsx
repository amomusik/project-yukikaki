import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireRole } from "@/lib/auth";
import { fullGraph } from "@/lib/graph/queries";
import { GraphView } from "@/components/graph-view";
import { Button, PageHeader } from "@/components/ui";
import { rebuildGraphAction } from "../actions";

// Server actions on this page start the brief/team pipeline with after(); that work counts
// against this function's duration (300 s = Vercel Hobby max; Pro allows up to 800 s).
export const maxDuration = 300;

export const dynamic = "force-dynamic";

export default async function AdminGraphPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRole(locale, "host");
  const t = await getTranslations("admin");
  const data = await fullGraph();
  return (
    <div>
      <PageHeader title={t("graphTitle")}>
        <form action={rebuildGraphAction}>
          <input type="hidden" name="locale" value={locale} />
          <Button variant="secondary" type="submit">↻ {t("rebuildGraph")}</Button>
        </form>
      </PageHeader>
      <GraphView data={data} height={640} unavailableLabel={t("graphUnavailable")} />
    </div>
  );
}
