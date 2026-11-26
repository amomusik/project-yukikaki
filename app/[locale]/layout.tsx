import { ClerkProvider } from "@clerk/nextjs";
import { enUS, jaJP } from "@clerk/localizations";
import type { Metadata, Viewport } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Header } from "@/components/header";
import { authEnabled } from "@/lib/env";
import { YukikakiMark } from "@/components/landing/mark";
import { MobileActionBar } from "@/components/landing/mobile-action-bar";
import { routing } from "@/i18n/routing";

// Without Clerk keys (fresh clone) there is no ClerkProvider: the app renders signed-out with sign-in disabled.
function NoAuth({ children }: React.ComponentProps<typeof ClerkProvider>) {
  return <>{children}</>;
}

// Clerk's stock copy greets everyone with "Welcome back!", which is wrong for a first-time owner coming from
// "Bring a problem". Name the product and say what the account is for; JA uses ログイン like the rest of the site.
const clerkCopy = {
  en: {
    signIn: { title: "Sign in to Yukikaki", subtitle: "Bring a problem, RSVP to events or join a team.", titleCombined: "Continue to Yukikaki" },
    signUp: { title: "Create your Yukikaki account", subtitle: "It takes about a minute.", titleCombined: "Create your Yukikaki account" },
  },
  ja: {
    signIn: { title: "Yukikakiにログイン", subtitle: "課題の相談、イベントへの参加登録、チームへの参加ができます。", titleCombined: "Yukikakiへ進む" },
    signUp: { title: "Yukikakiのアカウントを作成", subtitle: "1分ほどで登録できます。", titleCombined: "Yukikakiのアカウントを作成" },
  },
} as const;

function clerkLocalization(locale: string) {
  const base = locale === "ja" ? jaJP : enUS;
  const copy = locale === "ja" ? clerkCopy.ja : clerkCopy.en;
  return {
    ...base,
    signIn: { ...base.signIn, start: { ...base.signIn?.start, ...copy.signIn, subtitleCombined: copy.signIn.subtitle } },
    signUp: { ...base.signUp, start: { ...base.signUp?.start, ...copy.signUp, subtitleCombined: copy.signUp.subtitle } },
  };
}

// Every page depends on the signed-in user and live data, so render on request.
export const dynamic = "force-dynamic";

// viewport-fit=cover exposes env(safe-area-inset-*) so the mobile action bar clears the home indicator.
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

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
  const Auth = authEnabled() ? ClerkProvider : NoAuth;

  return (
    <Auth
      localization={clerkLocalization(locale)}
      signInUrl={`/${locale}/sign-in`}
      signUpUrl={`/${locale}/sign-up`}
      signInFallbackRedirectUrl={`/${locale}/onboarding`}
      signUpFallbackRedirectUrl={`/${locale}/onboarding`}
      afterSignOutUrl={`/${locale}`}
      // Brand the Clerk widgets: night-navy primary, inherited type, the site's 0.75rem corners.
      appearance={{ variables: { colorPrimary: "#0c1a2b", fontFamily: "inherit", borderRadius: "0.75rem" } }}
    >
      <html lang={locale}>
        <body className="flex min-h-screen flex-col antialiased">
          <NextIntlClientProvider>
            <Header locale={locale} />
            <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">{children}</main>
            {/* Static (never sticky). On phones the MobileActionBar renders a night-coloured spacer right after
                this footer, so the fixed bar never covers it. */}
            <footer className="relative overflow-hidden border-t border-white/10 bg-night text-slate-300">
              <div aria-hidden className="yk-snow yk-snow--far" />
              <div className="relative mx-auto grid max-w-6xl gap-8 px-4 pb-4 pt-12 sm:px-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-start md:gap-12">
                <div className="flex items-start gap-3">
                  <YukikakiMark className="h-10 w-10 shrink-0 bg-night-2 ring-white/15 dark:bg-night-2 dark:text-white" />
                  <div className="min-w-0 leading-snug">
                    <p className="font-bold text-white">{tn("brand")}</p>
                    <p className="text-sm text-slate-200">{tn("tagline")}</p>
                    <p className="mt-2 max-w-md text-balance text-sm leading-relaxed text-slate-400 [word-break:auto-phrase]">{t("footerStory")}</p>
                  </div>
                </div>
                <div className="flex flex-col gap-2 text-sm md:items-end md:text-right">
                  <p className="[word-break:auto-phrase]">
                    {t("openSource")} <span className="text-white">{t("anyTown")}</span>
                  </p>
                  <a
                    href="https://github.com/amomusik/project-yukikaki"
                    className="inline-flex items-center gap-1.5 self-start font-medium md:self-end text-lantern hover:text-lantern-hover hover:underline"
                  >
                    <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                      <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2z" />
                    </svg>
                    {t("github")}
                  </a>
                </div>
              </div>
              {/* Faint wordmark: sized to the viewport so it never clips (text is ~8.4× its font size wide). */}
              <p
                aria-hidden
                className="relative mx-auto max-w-6xl select-none whitespace-nowrap px-4 pb-6 pt-2 text-center text-[clamp(2rem,calc((100vw-2rem)/8.4),9rem)] font-extrabold leading-[1.1] tracking-[-0.045em] text-white/[0.07] sm:px-6"
              >
                Yukikaki <span lang="ja" className="font-[family-name:var(--font-mincho)] tracking-[0.05em]">雪かき</span>
              </p>
            </footer>
            <MobileActionBar />
          </NextIntlClientProvider>
        </body>
      </html>
    </Auth>
  );
}
