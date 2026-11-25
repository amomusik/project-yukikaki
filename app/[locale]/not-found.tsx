import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ShovelKid } from "@/components/mascot";

// Rendered for notFound() inside the [locale] segment (and unknown paths via [...rest]).
export default function LocaleNotFound() {
  const t = useTranslations("notFound");
  return (
    <section className="mx-auto flex max-w-xl flex-col items-center py-10 text-center sm:py-16">
      <ShovelKid className="h-40 w-48 sm:h-48 sm:w-56" />
      <p className="mt-6 text-xs font-semibold uppercase tracking-[0.3em] text-frost">{t("kicker")}</p>
      <h1 className="mt-2 text-balance text-3xl font-bold tracking-tight text-ink sm:text-4xl">{t("title")}</h1>
      <p className="mt-3 text-pretty text-muted">{t("body")}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/" className="inline-flex items-center gap-2 rounded-full bg-lantern px-5 py-2.5 font-semibold text-lantern-ink transition hover:bg-lantern-hover">
          {t("home")} <span aria-hidden>→</span>
        </Link>
        <Link href="/challenges" className="inline-flex items-center rounded-full border border-ice-strong bg-surface px-5 py-2.5 font-semibold text-ink transition hover:border-frost">
          {t("challenges")}
        </Link>
      </div>
    </section>
  );
}
