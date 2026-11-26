"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

// Flows with their own on-screen controls (or forms) where a floating CTA bar would get in the way.
const HIDDEN_ON = ["/interview", "/sign-in", "/sign-up", "/onboarding"];

const isTextEntry = (el: Element | null) =>
  !!el &&
  (el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement ||
    (el instanceof HTMLElement && el.isContentEditable) ||
    (el instanceof HTMLInputElement && !["button", "checkbox", "radio", "submit", "reset", "range", "color", "file", "image"].includes(el.type)));

/**
 * Mobile-only (below md) sticky bottom bar with the two main actions. On the landing page it
 * slides in once the hero search has scrolled out of view and "Search challenges" brings that
 * search back and focuses it; elsewhere it appears after a short scroll and links to the list.
 * It steps aside while any text field is focused or the on-screen keyboard is open, and a
 * matching spacer after the footer keeps it from covering the last of the page.
 */
export function MobileActionBar() {
  const t = useTranslations("landing");
  const pathname = usePathname();
  const isLanding = pathname === "/";
  const enabled = !HIDDEN_ON.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const sentinel = useRef<HTMLDivElement>(null);
  const [past, setPast] = useState(false);
  const [typing, setTyping] = useState(false);

  // Scrolled past the hero search (landing) or past the top of the page (elsewhere)?
  useEffect(() => {
    setPast(false);
    if (!enabled) return;
    const target = (isLanding && document.getElementById("hero-search")?.closest("form")) || sentinel.current;
    if (!target) return;
    const io = new IntersectionObserver(
      ([entry]) => setPast(!entry.isIntersecting && entry.boundingClientRect.top < (entry.rootBounds?.top ?? 0) + 1),
      // The sticky header covers the top ~56px, so treat anything under it as already scrolled past.
      { rootMargin: "-56px 0px 0px 0px" },
    );
    io.observe(target);
    return () => io.disconnect();
  }, [enabled, isLanding, pathname]);

  // Hide while typing: a focused text field, or the virtual keyboard shrinking the visual viewport.
  useEffect(() => {
    if (!enabled) return;
    let focused = isTextEntry(document.activeElement);
    let keyboard = false;
    const sync = () => setTyping(focused || keyboard);
    const onFocusIn = (e: FocusEvent) => {
      focused = isTextEntry(e.target as Element);
      sync();
    };
    const onFocusOut = () => {
      // Wait a tick so focus moving between fields doesn't flash the bar.
      requestAnimationFrame(() => {
        focused = isTextEntry(document.activeElement);
        sync();
      });
    };
    const vv = window.visualViewport;
    const onResize = () => {
      keyboard = !!vv && window.innerHeight - vv.height > 150;
      sync();
    };
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    vv?.addEventListener("resize", onResize);
    sync();
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      vv?.removeEventListener("resize", onResize);
    };
  }, [enabled]);

  if (!enabled) return null;
  const visible = past && !typing;

  function searchHero(e: React.MouseEvent<HTMLAnchorElement>) {
    const input = document.getElementById("hero-search") as HTMLInputElement | null;
    if (!input) return; // fall through to the /challenges link
    e.preventDefault();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    input.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    // Focus inside the tap so mobile browsers open the keyboard; the scroll above does the moving.
    input.focus({ preventScroll: true });
  }

  const btn =
    "inline-flex h-12 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-2 text-sm font-semibold transition active:scale-[0.98]";

  return (
    <>
      {/* Scroll sentinel for non-landing pages: the bar appears once this has left the viewport. */}
      <div ref={sentinel} aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-72 md:hidden" />
      {/* Spacer so the fixed bar never covers the bottom of the footer. */}
      <div aria-hidden className="h-[calc(4.5rem+env(safe-area-inset-bottom))] bg-night md:hidden" />
      <nav
        aria-label={t("actionBarLabel")}
        inert={!visible}
        data-visible={visible}
        className={`fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-night/95 pb-[calc(0.625rem+env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pt-2.5 shadow-[0_-12px_32px_-12px_rgb(0_0_0/0.45)] backdrop-blur-md transition duration-300 ease-out motion-reduce:transition-none md:hidden ${
          visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0"
        }`}
      >
        <div className="mx-auto flex max-w-md gap-2">
          <Link href="/challenges" onClick={isLanding ? searchHero : undefined} className={`${btn} bg-lantern text-lantern-ink hover:bg-lantern-hover`}>
            <svg aria-hidden viewBox="0 0 24 24" className="h-[1.125rem] w-[1.125rem] shrink-0" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <span className="truncate">{t("actionBarSearch")}</span>
          </Link>
          <Link href="/interview" className={`${btn} border border-white/25 bg-white/10 text-white hover:bg-white/15`}>
            <span className="truncate">{t("actionBarProblem")}</span>
            <span aria-hidden>→</span>
          </Link>
        </div>
      </nav>
    </>
  );
}
