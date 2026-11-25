"use client";

import { useParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "./ui";

export function LocaleToggle({
  locale,
  label,
  ariaLabel,
  className,
}: {
  locale: string;
  label: string;
  ariaLabel?: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const next = locale === "ja" ? "en" : "ja";
  return (
    <button
      type="button"
      lang={next}
      onClick={() => {
        // Keep the query string (e.g. ?q= on challenges) when switching language.
        const query = Object.fromEntries(new URLSearchParams(window.location.search));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        router.replace({ pathname, params, query } as any, { locale: next });
      }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm font-medium text-muted transition hover:border-ice-strong hover:bg-ice hover:text-ink",
        className,
      )}
      aria-label={ariaLabel ?? `Switch language to ${next}`}
    >
      <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
      </svg>
      {label}
    </button>
  );
}
