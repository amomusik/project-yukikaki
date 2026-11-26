import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { dateToJstLocal, toLang } from "@/lib/events/format";
import { eventChallengeIds, getEventBySlug, linkableChallenges } from "@/lib/events/store";
import { PageHeader } from "@/components/ui";
import { EventForm } from "../../event-form";

export const dynamic = "force-dynamic";

/** Host-only: edit an event (and its linked challenges). */
export default async function EditEventPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  await requireRole(locale, "host");
  const ev = await getEventBySlug(slug);
  if (!ev) notFound();
  const t = await getTranslations("events");
  const lang = toLang(locale);
  const [challenges, linked] = await Promise.all([linkableChallenges(), eventChallengeIds(ev.id)]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t("editTitle")} subtitle={ev.title[lang] || ev.title.en} />
      <EventForm
        locale={locale}
        challenges={challenges.map((c) => ({ id: c.id, title: (lang === "en" ? c.titleEn : c.titleJa) || c.titleJa, city: c.city, industry: c.industry }))}
        values={{
          eventId: ev.id,
          status: ev.status,
          titleJa: ev.title.ja,
          titleEn: ev.title.en,
          summaryJa: ev.summary.ja,
          summaryEn: ev.summary.en,
          format: ev.format,
          startsAt: dateToJstLocal(ev.startsAt),
          endsAt: dateToJstLocal(ev.endsAt),
          city: ev.city,
          venueName: ev.venueName,
          venueAddress: ev.venueAddress,
          onlineUrl: ev.onlineUrl ?? "",
          coverImage: ev.coverImage ?? "",
          capacity: ev.capacity,
          briefIds: linked,
        }}
      />
    </div>
  );
}
