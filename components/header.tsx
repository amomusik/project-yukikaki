import { SignInButton, UserButton } from "@clerk/nextjs";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ensureUser } from "@/lib/auth";
import { authEnabled } from "@/lib/env";
import { MobileNav, type NavItem } from "./landing/mobile-nav";
import { MarkFlurry } from "./landing/mark-flurry";
import { LocaleToggle } from "./locale-toggle";

export async function Header({ locale }: { locale: string }) {
  const t = await getTranslations("nav");
  const user = await ensureUser().catch(() => null);

  // Shared by the desktop nav and <MobileNav>; Events comes first.
  const items: NavItem[] = [
    { href: "/events", label: t("events") },
    { href: "/challenges", label: t("challenges") },
    { href: "/grants", label: t("grants") },
  ];
  if (!user || user.role === "business") items.push({ href: "/interview", label: t("interview") });
  if (user) items.push({ href: "/me", label: t("me") });
  if (user?.role === "host") items.push({ href: "/admin", label: t("admin") }, { href: "/admin/graph", label: t("graph") });

  const link =
    "rounded-full px-3 py-1.5 text-sm font-medium text-muted transition hover:bg-ice hover:text-ink focus-visible:bg-ice";

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-snow/85 backdrop-blur-md supports-[backdrop-filter]:bg-snow/70">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5 sm:px-6">
        <Link href="/" aria-label={t("home")} className="group mr-2 flex min-w-0 items-center gap-3 rounded-lg">
          <MarkFlurry className="h-9 w-9 shrink-0" />
          <span className="min-w-0 leading-tight">
            <span className="flex items-baseline gap-2">
              <span className="truncate text-ink">
                <span className="mr-1 text-xs font-medium tracking-wide text-muted">Project</span>
                <span className="text-xl font-extrabold tracking-[-0.03em]">Yukikaki</span>
              </span>
              <span lang="ja" className="hidden font-[family-name:var(--font-mincho)] text-sm font-semibold tracking-[0.18em] text-frost sm:inline">
                雪かき
              </span>
            </span>
            <span className="hidden truncate text-xs text-muted md:block">{t("tagline")}</span>
          </span>
        </Link>

        <nav aria-label="Main" className="ml-auto hidden items-center gap-1 lg:flex">
          {items.map((i) => (
            <Link key={i.href} href={i.href} className={link}>
              {i.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-2">
          <div className="hidden sm:block">
            <LocaleToggle locale={locale} label={t("language")} ariaLabel={t("switchLanguage")} />
          </div>
          {!authEnabled() ? (
            // No Clerk keys (fresh clone): Clerk's buttons would crash without <ClerkProvider>.
            <span className="hidden rounded-full border border-line px-3 py-1 text-xs text-muted sm:inline" title="NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY / CLERK_SECRET_KEY">
              {locale === "ja" ? "ログイン未設定" : "Sign-in not configured"}
            </span>
          ) : user ? (
            <UserButton />
          ) : (
            <SignInButton mode="redirect">
              <button className="inline-flex items-center rounded-full bg-night px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-night-2 dark:bg-ice dark:text-ink dark:hover:bg-ice-strong">
                {t("signIn")}
              </button>
            </SignInButton>
          )}
          <MobileNav
            items={items}
            locale={locale}
            tagline={t("tagline")}
            languageLabel={t("language")}
            languageAria={t("switchLanguage")}
            openLabel={t("openMenu")}
            closeLabel={t("closeMenu")}
          />
        </div>
      </div>
    </header>
  );
}
