import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { ensureUser } from "@/lib/auth";
import { SKILLS } from "@/lib/skills";
import { Button, Card, PageHeader } from "@/components/ui";
import { chooseRoleAction } from "./actions";

export default async function Onboarding({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await ensureUser();
  if (!user) redirect(`/${locale}/sign-in`);
  if (user.role === "host") redirect(`/${locale}/admin`);
  if (user.role) redirect(`/${locale}/me`);
  const t = await getTranslations("onboarding");

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t("title")} />
      <form action={chooseRoleAction} className="space-y-6">
        <input type="hidden" name="locale" value={locale} />
        <div className="grid gap-4 sm:grid-cols-2">
          {(["business", "student"] as const).map((role) => (
            <label key={role} className="cursor-pointer">
              <input type="radio" name="role" value={role} required className="peer sr-only" />
              <Card className="h-full text-center peer-checked:border-sky-500 peer-checked:ring-2 peer-checked:ring-sky-200">
                <div className="text-3xl">{role === "business" ? "🏪" : "🎓"}</div>
                <div className="mt-2 font-semibold">{t(role)}</div>
              </Card>
            </label>
          ))}
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">{t("skills")}</legend>
          <div className="flex flex-wrap gap-2">
            {SKILLS.map((s) => (
              <label key={s} className="cursor-pointer">
                <input type="checkbox" name="skills" value={s} className="peer sr-only" />
                <span className="inline-block rounded-full border border-slate-300 px-3 py-1 text-sm peer-checked:border-sky-500 peer-checked:bg-sky-50 dark:border-slate-700 dark:peer-checked:bg-sky-950">
                  {s}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <Button type="submit">{t("continue")}</Button>
        <p className="text-xs text-slate-500">{t("hostNote")}</p>
      </form>
    </div>
  );
}
