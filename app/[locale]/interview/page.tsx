import { desc, eq } from "drizzle-orm";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireRole } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { configured, env } from "@/lib/env";
import { PageHeader } from "@/components/ui";
import { InterviewClient } from "./interview-client";

// Server actions on this page start the brief/team pipeline with after(); that work counts
// against this function's duration (300 s = Vercel Hobby max; Pro allows up to 800 s).
export const maxDuration = 300;

export default async function InterviewPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireRole(locale, "business", "host");
  const t = await getTranslations("interview");
  const [business] = await getDb()
    .select()
    .from(schema.businesses)
    .where(eq(schema.businesses.ownerUserId, user.id))
    .orderBy(desc(schema.businesses.createdAt))
    .limit(1);
  const voiceAvailable = configured.elevenlabs() && Boolean(env.ELEVENLABS_INTERVIEW_AGENT_ID);

  const keys = [
    "start", "stop", "connecting", "listening", "speaking", "micNote", "preparing", "toMe", "voiceUnavailable", "textTitle",
    "textSubtitle", "businessName", "industry", "city", "ward", "problem", "currentProcess", "desiredOutcome", "toolsUsed",
    "hoursLost", "sensitivity", "sensPublic", "sensPrivate", "sensSynthetic", "submit",
    "noticeTitle", "noticePurpose", "noticeRecording", "noticeProcessors", "noticeRetention", "noticePrivacyLink", "consentLabel", "consentRequired",
  ] as const;
  const labels = Object.fromEntries(keys.map((k) => [k, t(k)])) as Record<(typeof keys)[number], string>;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <InterviewClient
        locale={locale}
        voiceAvailable={voiceAvailable}
        dynamicVariables={{ user_id: user.id, business_id: business?.id ?? "", locale }}
        defaults={{ businessName: business?.name ?? "", industry: business?.industry ?? "", city: business?.city ?? "", ward: business?.ward ?? "" }}
        labels={labels}
      />
    </div>
  );
}
