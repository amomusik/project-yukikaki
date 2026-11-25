"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { LocaleToggle } from "@/components/locale-toggle";

export type NavItem = { href: string; label: string };

/** Disclosure menu for narrow screens: closes on navigation, Escape and outside click. */
export function MobileNav({
  items,
  locale,
  tagline,
  languageLabel,
  languageAria,
  openLabel,
  closeLabel,
}: {
  items: NavItem[];
  locale: string;
  tagline: string;
  languageLabel: string;
  languageAria: string;
  openLabel: string;
  closeLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <div ref={root} className="lg:hidden">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? closeLabel : openLabel}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-line text-ink transition hover:bg-ice"
      >
        <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h10" />}
        </svg>
      </button>
      <div
        id={panelId}
        hidden={!open}
        className="absolute inset-x-0 top-full border-b border-line bg-snow shadow-lg"
      >
        <nav aria-label="Mobile" className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-4 sm:px-6">
          <p className="mb-2 text-sm text-muted">{tagline}</p>
          {items.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className="rounded-xl px-3 py-2.5 text-base font-medium text-ink transition hover:bg-ice"
              onClick={() => setOpen(false)}
            >
              {i.label}
            </Link>
          ))}
          <div className="mt-2 border-t border-line pt-3 sm:hidden">
            <LocaleToggle locale={locale} label={languageLabel} ariaLabel={languageAria} />
          </div>
        </nav>
      </div>
    </div>
  );
}
