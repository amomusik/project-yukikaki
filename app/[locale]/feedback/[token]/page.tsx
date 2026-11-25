import { getTranslations, setRequestLocale } from "next-intl/server";
import { configured, env } from "@/lib/env";
import { checkFeedbackToken } from "@/lib/feedback";
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
  const t = await getTranslations("feedback");
  const check = await checkFeedbackToken(token);
  if (!check.ok) {
    return (
      <Card className="mx-auto max-w-xl text-center" data-testid="feedback-closed">
        <p className="text-lg">{t(check.reason)}</p>
      </Card>
    );
  }
  const keys = ["hours", "satisfaction", "stillInUse", "wouldRecommend", "issues", "yes", "no", "voice", "voiceDone", "submit", "thanks", "used", "expired", "invalid"] as const;
  const labels = Object.fromEntries(keys.map((k) => [k, t(k)])) as Record<(typeof keys)[number], string>;
  const tv = await getTranslations("interview");

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <FeedbackForm
        token={token}
        deliveryId={check.deliveryId}
        voiceAvailable={configured.elevenlabs() && Boolean(env.ELEVENLABS_IMPACT_AGENT_ID)}
        labels={labels}
        voiceLabels={{ start: t("voice"), stop: tv("stop"), connecting: tv("connecting"), listening: tv("listening"), speaking: tv("speaking"), micNote: tv("micNote") }}
      />
    </div>
  );
}
