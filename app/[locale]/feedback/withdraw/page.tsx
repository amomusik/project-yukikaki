import { getTranslations, setRequestLocale } from "next-intl/server";
import { Button, Card, PageHeader } from "@/components/ui";
import { verifyWithdrawSig } from "@/lib/testimonials";
import { isUuid } from "@/lib/uuid";
import { withdrawQuoteAction } from "./actions";

export const dynamic = "force-dynamic";

/** Signed link from the feedback thank-you / closed page: take a public quote down. */
export default async function WithdrawQuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ e?: string; sig?: string; done?: string }>;
}) {
  const { locale } = await params;
  const { e = "", sig = "", done } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("feedback");

  if (done !== undefined) {
    return (
      <Card className="mx-auto max-w-xl text-center" role="status" data-testid="withdraw-result">
        <p className="text-lg">{done === "1" ? t("withdrawn") : t("withdrawInvalid")}</p>
      </Card>
    );
  }
  const valid = isUuid(e) && verifyWithdrawSig(e, sig);
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title={t("withdrawTitle")} />
      <Card>
        {valid ? (
          <form action={withdrawQuoteAction} className="space-y-4">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="e" value={e} />
            <input type="hidden" name="sig" value={sig} />
            <p className="text-sm">{t("withdrawExplain")}</p>
            <Button type="submit" variant="danger">{t("withdrawConfirm")}</Button>
          </form>
        ) : (
          <p className="text-sm">{t("withdrawInvalid")}</p>
        )}
      </Card>
    </div>
  );
}
