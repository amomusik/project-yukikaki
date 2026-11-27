import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getBriefDetail } from "@/lib/queries";
import { Button, Card, Input, Label, PageHeader, Textarea } from "@/components/ui";
import { createTeamAction } from "../actions";

// Server actions on this page start the brief/team pipeline with after(); that work counts
// against this function's duration (300 s = Vercel Hobby max; Pro allows up to 800 s).
export const maxDuration = 300;

export default async function NewTeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ brief?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRole(locale, "student");
  const { brief: briefId } = await searchParams;
  if (!briefId) notFound();
  const detail = await getBriefDetail(briefId);
  if (!detail) notFound();
  const t = await getTranslations("teams");
  const lang = locale === "en" ? "en" : "ja";

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t("newTitle")} subtitle={detail.brief.content[lang].title} />
      <Card>
        <form action={createTeamAction} className="space-y-4">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="briefId" value={briefId} />
          <div>
            <Label htmlFor="name">{t("name")}</Label>
            <Input id="name" name="name" required maxLength={80} />
          </div>
          <div>
            <Label htmlFor="pitch">{t("pitch")}</Label>
            <Textarea id="pitch" name="pitch" required rows={5} />
          </div>
          <div>
            <Label htmlFor="emails">{t("invite")}</Label>
            <Input id="emails" name="emails" placeholder="a@example.com, b@example.com" aria-describedby="emails-note" />
            <p id="emails-note" className="mt-1 text-xs text-muted">{t("inviteNote")}</p>
          </div>
          <p className="rounded-lg bg-sky-50 p-3 text-sm text-sky-900 dark:bg-sky-950 dark:text-sky-100">👑 {t("leadNote")}</p>
          <Button type="submit">{t("create")}</Button>
        </form>
      </Card>
    </div>
  );
}
