import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getTeamDetail } from "@/lib/queries";
import { isUuid } from "@/lib/uuid";
import { Button, Card, Label, PageHeader, Textarea } from "@/components/ui";
import { deliverAction } from "../../actions";

// Server actions on this page start the brief/team pipeline with after(); that work counts
// against this function's duration (300 s = Vercel Hobby max; Pro allows up to 800 s).
export const maxDuration = 300;

export default async function DeliverPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireRole(locale, "student");
  if (!isUuid(id)) notFound();
  const detail = await getTeamDetail(id);
  if (!detail) notFound();
  const lead = detail.members.find((m) => m.role === "lead");
  if (lead?.user.id !== user.id || detail.team.status !== "approved") redirect(`/${locale}/teams/${id}`);
  const t = await getTranslations("teams");

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t("deliverTitle")} subtitle={detail.team.name} />
      <Card>
        <form action={deliverAction} className="space-y-4">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="teamId" value={id} />
          <div>
            <Label htmlFor="summaryJa">{t("summaryJa")}</Label>
            <Textarea id="summaryJa" name="summaryJa" required rows={4} />
          </div>
          <div>
            <Label htmlFor="summaryEn">{t("summaryEn")}</Label>
            <Textarea id="summaryEn" name="summaryEn" rows={3} />
          </div>
          <div>
            <Label htmlFor="links">{t("links")}</Label>
            <Textarea id="links" name="links" rows={3} placeholder="https://github.com/…" />
          </div>
          <div>
            <Label htmlFor="handoverNotes">{t("handover")}</Label>
            <Textarea id="handoverNotes" name="handoverNotes" rows={4} />
          </div>
          <Button type="submit">{t("submitDelivery")}</Button>
        </form>
      </Card>
    </div>
  );
}
