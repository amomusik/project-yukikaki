import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { authEnabled } from "@/lib/env";

// Shown instead of sign-in, sign-up and every signed-in page when the Clerk keys are missing
// (a fresh clone with an empty .env.local). Copy lives here, not in messages/*.json: it's developer setup text.
const COPY = {
  en: {
    kicker: "Sign-in not configured",
    title: "This page needs sign-in",
    body: "Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY to enable sign-in (see README → Clerk).",
    note: "Public pages (challenges, events, grants) work without any keys.",
    home: "Back to the home page",
  },
  ja: {
    kicker: "ログイン未設定",
    title: "このページにはログインが必要です",
    body: "ログインを有効にするには NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY と CLERK_SECRET_KEY を設定してください（README → Clerk を参照）。",
    note: "公開ページ（課題・イベント・助成金）はキーなしで閲覧できます。",
    home: "トップページへ戻る",
  },
} as const;

export default async function AuthSetup({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (authEnabled()) redirect(`/${locale}/sign-in`);
  const c = COPY[locale === "ja" ? "ja" : "en"];
  return (
    <section className="mx-auto flex max-w-xl flex-col items-center py-10 text-center sm:py-16">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-frost">{c.kicker}</p>
      <h1 className="mt-2 text-balance text-3xl font-bold tracking-tight text-ink">{c.title}</h1>
      <p className="mt-4 text-pretty text-muted [word-break:auto-phrase]">{c.body}</p>
      <p className="mt-2 text-pretty text-sm text-muted [word-break:auto-phrase]">{c.note}</p>
      <Link
        href="/"
        className="mt-8 inline-flex items-center gap-2 rounded-full bg-lantern px-5 py-2.5 font-semibold text-lantern-ink transition hover:bg-lantern-hover"
      >
        {c.home} <span aria-hidden>→</span>
      </Link>
    </section>
  );
}
