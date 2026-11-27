import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/ui";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "privacy" });
  return { title: t("metaTitle") };
}

const REPORT_URL = "https://github.com/amomusik/project-yukikaki/security/advisories/new";

/** Public privacy notice (EN/JA): collection, purpose, processors, APPI overseas transfer, retention, deletion. */
export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("privacy");
  const list = (key: string) => (
    <ul className="mt-2 list-disc space-y-1.5 pl-5">
      {(t.raw(key) as string[]).map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
  const section = (id: string, title: string, body: React.ReactNode) => (
    <section aria-labelledby={id} className="mt-8">
      <h2 id={id} className="text-lg font-semibold">{title}</h2>
      {body}
    </section>
  );

  return (
    <article className="mx-auto max-w-3xl text-sm leading-relaxed [word-break:auto-phrase]" data-testid="privacy-page">
      <PageHeader title={t("title")} subtitle={t("updated")} />
      <p>{t("intro")}</p>
      {section("collected", t("collectedTitle"), list("collected"))}
      {section("purpose", t("purposeTitle"), list("purpose"))}
      {section(
        "processors",
        t("processorsTitle"),
        <>
          <p className="mt-2">{t("processorsIntro")}</p>
          {list("processors")}
        </>,
      )}
      {section("transfer", t("transferTitle"), <p className="mt-2">{t("transfer")}</p>)}
      {section("retention", t("retentionTitle"), list("retention"))}
      {section("delete", t("deleteTitle"), list("delete"))}
      {section(
        "contact",
        t("contactTitle"),
        <>
          <p className="mt-2">{t("contact")}</p>
          <p className="mt-2">
            <a href={REPORT_URL} className="font-medium underline">{t("contactLink")}</a>
          </p>
        </>,
      )}
    </article>
  );
}
