import { getTranslations } from "next-intl/server";
import type { BriefContent } from "@/lib/db/schema";
import type { Rejection } from "@/lib/queries";
import { Button, Input, Label, Textarea } from "@/components/ui";
import { resubmitBriefAction } from "./actions";

/** Owner-facing "Revise & resubmit" for a returned brief: the host's note, editable text, resubmit. */
export async function ResubmitForm({
  locale,
  briefId,
  content,
  rejection,
}: {
  locale: string;
  briefId: string;
  content: BriefContent;
  rejection: Rejection | null;
}) {
  const t = await getTranslations("me");
  const lang = locale === "en" ? "en" : "ja";
  const c = content[lang];
  return (
    <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-50" data-testid="resubmit">
      <p className="font-semibold">↩ {t("returned")}</p>
      <p className="mt-1 whitespace-pre-wrap">{rejection?.note ? t("hostNote", { note: rejection.note }) : t("noHostNote")}</p>
      <details className="mt-3">
        <summary className="cursor-pointer font-semibold underline-offset-4 hover:underline">{t("revise")}</summary>
        <form action={resubmitBriefAction} className="mt-3 space-y-3" data-testid="resubmit-form">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="briefId" value={briefId} />
          <div>
            <Label htmlFor={`title-${briefId}`}>{t("fieldTitle")}</Label>
            <Input id={`title-${briefId}`} name="title" defaultValue={c.title} maxLength={120} required />
          </div>
          {(["problem", "current_process", "desired_outcome"] as const).map((f) => (
            <div key={f}>
              <Label htmlFor={`${f}-${briefId}`}>{t(`field_${f}`)}</Label>
              <Textarea id={`${f}-${briefId}`} name={f} defaultValue={c[f]} maxLength={4000} rows={f === "problem" ? 4 : 3} required={f === "problem"} />
            </div>
          ))}
          <p className="text-xs">{t("resubmitHint")}</p>
          <Button type="submit">{t("resubmit")}</Button>
        </form>
      </details>
    </div>
  );
}
