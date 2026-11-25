import { ClerkProvider } from "@clerk/nextjs";
import { enUS, jaJP } from "@clerk/localizations";
import type { Metadata } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Header } from "@/components/header";
import { YukikakiMark } from "@/components/landing/mark";
import { routing } from "@/i18n/routing";

// Every page depends on the signed-in user and live data, so render on request.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return { title: t("title"), description: t("description") };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("landing");
  const tn = await getTranslations("nav");

  return (
    <ClerkProvider
      localization={locale === "ja" ? jaJP : enUS}
      signInUrl={`/${locale}/sign-in`}
      signUpUrl={`/${locale}/sign-up`}
      signInFallbackRedirectUrl={`/${locale}/onboarding`}
      signUpFallbackRedirectUrl={`/${locale}/onboarding`}
      afterSignOutUrl={`/${locale}`}
    >
      <html lang={locale}>
        <body className="flex min-h-screen flex-col antialiased">
          <NextIntlClientProvider>
            <Header locale={locale} />
            <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">{children}</main>
            <footer className="relative overflow-hidden bg-night text-slate-300">
              <div aria-hidden className="yk-snow yk-snow--far" />
              <div className="relative mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div className="flex items-center gap-3">
                  <YukikakiMark className="h-10 w-10 bg-night-2 ring-white/15 dark:bg-night-2 dark:text-white" />
                  <div className="leading-snug">
                    <p className="font-bold text-white">{tn("brand")}</p>
                    <p className="text-sm text-slate-400">{tn("tagline")}</p>
                  </div>
                </div>
                <div className="flex flex-col gap-1 text-sm sm:items-end">
                  <p>
                    {t("openSource")} <span className="text-white">{t("anyTown")}</span>
                  </p>
                  <a
                    href="https://github.com/amomusik/project-yukikaki"
                    className="inline-flex items-center gap-1.5 font-medium text-lantern hover:text-lantern-hover hover:underline"
                  >
                    <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                      <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2z" />
                    </svg>
                    {t("github")}
                  </a>
                </div>
              </div>
            </footer>
          </NextIntlClientProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
