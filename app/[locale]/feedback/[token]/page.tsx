import { getTranslations, setRequestLocale } from "next-intl/server";
import { configured, env } from "@/lib/env";
import { checkFeedbackToken } from "@/lib/feedback";
import { withdrawUrlForToken } from "@/lib/testimonials";
import { Card, PageHeader } from "@/components/ui";
import { FeedbackForm } from "./feedback-form";

// Server actions on this page start the brief/team pipeline with after(); that work counts
// against this function's duration (300 s = Vercel Hobby max; Pro allows up to 800 s).
export const maxDuration = 300;

export const dynamic = "force-dynamic";

/** Public page reached through the one-time link. The token is the only credential. */
export default async function FeedbackPage({ params }: { params: Promise<{ locale: string; token: string }> }) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const lang = locale === "en" ? "en" : "ja";
  const t = await getTranslations("feedback");
  const check = await checkFeedbackToken(token);
  if (!check.ok) {
    // Already answered: let the owner take a public quote down at any time.
    const withdrawUrl = check.reason === "used" ? await withdrawUrlForToken(token, lang).catch(() => null) : null;
    return (
      <Card className="mx-auto max-w-xl text-center" data-testid="feedback-closed">
        <p className="text-lg">{t(check.reason)}</p>
        {withdrawUrl && (
          <p className="mt-3 text-sm text-muted">
            {t("withdrawHint")}{" "}
            <a href={withdrawUrl} className="underline" data-testid="withdraw-link">{t("withdrawLink")}</a>
          </p>
        )}
      </Card>
    );
  }
  const keys = [
    "hours", "satisfaction", "satisfactionScale", "stillInUse", "wouldRecommend", "issues", "yes", "no", "voice", "voiceDone", "submit", "thanks",
    "used", "expired", "invalid", "incomplete", "quoteConsent", "quoteConsentHint", "withdrawHint", "withdrawLink",
  ] as const;
  const labels = Object.fromEntries(keys.map((k) => [k, t(k)])) as Record<(typeof keys)[number], string>;
  const tv = await getTranslations("interview");

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <FeedbackForm
        token={token}
        locale={lang}
        deliveryId={check.deliveryId}
        voiceAvailable={configured.elevenlabs() && Boolean(env.ELEVENLABS_IMPACT_AGENT_ID)}
        labels={labels}
        voiceLabels={{ start: t("voice"), stop: tv("stop"), connecting: tv("connecting"), listening: tv("listening"), speaking: tv("speaking"), micNote: tv("micNote") }}
      />
    </div>
  );
}
