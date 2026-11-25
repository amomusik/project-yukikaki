"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ShovelKid } from "@/components/mascot";
import { cityLabel, industryLabel } from "./labels";

type Suggestion = {
  id: string;
  title: string;
  city: string;
  industry: string;
  status: string;
  hoursLostPerWeek: number | null;
  skills: string[];
};

type State = "idle" | "loading" | "ready" | "unavailable";

function parseResults(data: unknown): Suggestion[] {
  const results = (data as { results?: unknown })?.results;
  if (!Array.isArray(results)) return [];
  return results
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object" && typeof (r as { id?: unknown }).id === "string")
    .map((r) => ({
      id: String(r.id),
      title: String(r.title ?? ""),
      city: String(r.city ?? ""),
      industry: String(r.industry ?? ""),
      status: String(r.status ?? ""),
      hoursLostPerWeek: r.hoursLostPerWeek == null || r.hoursLostPerWeek === "" ? null : Number(r.hoursLostPerWeek),
      skills: Array.isArray(r.skills) ? r.skills.map(String) : [],
    }))
    .slice(0, 6);
}

/**
 * The primary CTA: a plain GET form to /{locale}/challenges?q=… (works without JS),
 * enhanced with debounced live suggestions from /api/challenges/search (ARIA 1.2 combobox).
 * If the search route is missing (404) or fails, the dropdown just offers "press Enter".
 */
export function HeroSearch({ locale }: { locale: "en" | "ja" }) {
  const t = useTranslations("landing");
  const ts = useTranslations("status");
  const tc = useTranslations("common");
  const router = useRouter();
  const [q, setQ] = useState("");
  const [state, setState] = useState<State>("idle");
  const [results, setResults] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const statusId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = q.trim();
    if (!query) {
      setState("idle");
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setState("loading");
      try {
        const params = new URLSearchParams({ q: query, locale, limit: "6" });
        const res = await fetch(`/api/challenges/search?${params}`, { signal: ctrl.signal, headers: { accept: "application/json" } });
        if (!res.ok) throw new Error(String(res.status));
        setResults(parseResults(await res.json()));
        setState("ready");
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setResults([]);
        setState("unavailable");
      }
      setActive(-1);
    }, 220);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q, locale]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const query = q.trim();
  const showList = open && query.length > 0 && state !== "idle";
  const optionCount = results.length;

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      if (optionCount) setActive((a) => (a + 1) % optionCount);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (optionCount) setActive((a) => (a <= 0 ? optionCount - 1 : a - 1));
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setActive(-1);
      } else {
        setQ("");
      }
    } else if (e.key === "Enter" && showList && active >= 0 && results[active]) {
      e.preventDefault();
      router.push(`/challenges/${results[active].id}`);
    } else if (e.key === "Home" || e.key === "End") {
      setActive(-1);
    }
  }

  const statusText =
    state === "loading"
      ? t("searchLoading")
      : state === "ready"
        ? optionCount
          ? t("searchResultsCount", { count: optionCount })
          : t("searchEmpty")
        : state === "unavailable"
          ? t("searchUnavailable")
          : "";

  return (
    <div ref={wrapRef} className="relative mx-auto w-full max-w-2xl">
      <form action={`/${locale}/challenges`} method="get" role="search" aria-label={t("searchLabel")} className="relative">
        <label htmlFor="hero-search" className="sr-only">
          {t("searchLabel")}
        </label>
        <div className="yk-sweep group flex items-center gap-2 rounded-2xl bg-white p-2 text-[#0f1d2c] shadow-[0_20px_60px_-20px_rgb(0_0_0/0.55)] ring-1 ring-white/30 transition focus-within:ring-4 focus-within:ring-lantern/50">
          <svg aria-hidden viewBox="0 0 24 24" className="ml-3 h-6 w-6 shrink-0 text-[#52667b]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            ref={inputRef}
            id="hero-search"
            name="q"
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder={t("searchPlaceholder")}
            autoComplete="off"
            enterKeyHint="search"
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
            aria-describedby={statusId}
            className="min-w-0 flex-1 bg-transparent py-3 text-base text-[#0f1d2c] placeholder:text-[#5b6f84] focus:outline-none focus-visible:outline-none sm:text-lg [&::-webkit-search-cancel-button]:hidden"
          />
          <button
            type="submit"
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-lantern px-4 py-3 text-base font-semibold text-lantern-ink transition hover:bg-lantern-hover sm:px-6"
          >
            <span className="hidden sm:inline">{t("searchButton")}</span>
            <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5 sm:hidden" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <span className="sr-only sm:hidden">{t("searchButton")}</span>
          </button>
        </div>
      </form>

      <p id={statusId} role="status" aria-live="polite" className="sr-only">
        {showList ? statusText : ""}
      </p>

      <div
        hidden={!showList}
        className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-line bg-surface text-left shadow-2xl"
      >
        <ul id={listId} role="listbox" aria-label={t("suggestionsLabel")} className="max-h-[22rem] overflow-y-auto py-1">
          {results.map((r, i) => (
            <li
              key={r.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => router.push(`/challenges/${r.id}`)}
              className={`cursor-pointer px-4 py-3 ${i === active ? "bg-ice" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="font-semibold text-ink">{r.title}</span>
                {r.status && <span className="shrink-0 rounded-full bg-ice px-2 py-0.5 text-xs text-frost">{ts.has(r.status) ? ts(r.status) : r.status}</span>}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                <span>{[r.city && cityLabel(r.city, locale), r.industry && industryLabel(r.industry, locale)].filter(Boolean).join(" · ")}</span>
                {r.hoursLostPerWeek != null && Number.isFinite(r.hoursLostPerWeek) && (
                  <span className="text-amber-700 dark:text-amber-300">{t("hoursLost", { n: r.hoursLostPerWeek })}</span>
                )}
                {r.skills.slice(0, 3).map((s) => (
                  <span key={s} className="rounded-full border border-line px-2 py-0.5">
                    {tc.has(`skills.${s}`) ? tc(`skills.${s}`) : s}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
        {state === "ready" && optionCount === 0 ? (
          <div className="flex items-center gap-3 px-4 py-3">
            <ShovelKid className="h-14 w-16 shrink-0" />
            <p className="text-sm text-muted">{statusText}</p>
          </div>
        ) : state !== "ready" ? (
          <p className="px-4 py-3 text-sm text-muted">{statusText}</p>
        ) : null}
        {query && (
          <a
            href={`/${locale}/challenges?${new URLSearchParams({ q: query })}`}
            className="block border-t border-line px-4 py-3 text-sm font-medium text-frost hover:bg-ice"
          >
            {t("searchSeeAll", { q: query })} →
          </a>
        )}
      </div>
    </div>
  );
}
