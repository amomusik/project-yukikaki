import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireRole } from "@/lib/auth";
import { dateToJstLocal, toLang } from "@/lib/events/format";
import { linkableChallenges } from "@/lib/events/store";
import { PageHeader } from "@/components/ui";
import { EventForm } from "../event-form";

export const dynamic = "force-dynamic";

/** Host-only: create an event. */
export default async function NewEventPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRole(locale, "host");
  const t = await getTranslations("events");
  const lang = toLang(locale);
  const challenges = await linkableChallenges();
  // Default: two weeks out, Saturday-ish 10:00–18:00 JST.
  const start = new Date(Date.now() + 14 * 86_400_000);
  const startLocal = `${dateToJstLocal(start).slice(0, 10)}T10:00`;
  const endLocal = `${dateToJstLocal(start).slice(0, 10)}T18:00`;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t("newTitle")} subtitle={t("newSubtitle")} />
      <EventForm
        locale={locale}
        challenges={challenges.map((c) => ({ id: c.id, title: (lang === "en" ? c.titleEn : c.titleJa) || c.titleJa, city: c.city, industry: c.industry }))}
        values={{
          titleJa: "",
          titleEn: "",
          summaryJa: "",
          summaryEn: "",
          format: "hackathon",
          startsAt: startLocal,
          endsAt: endLocal,
          city: "",
          venueName: "",
          venueAddress: "",
          onlineUrl: "",
          coverImage: "",
          capacity: 30,
          briefIds: [],
        }}
      />
    </div>
  );
}
