import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { StatusBadge } from "@/components/badges";
import type { BriefStatus } from "@/lib/db/schema";
import { cityLabel, industryLabel } from "./labels";

export type MarqueeChallenge = {
  id: string;
  title: string;
  city: string;
  industry: string;
  status: BriefStatus;
  hoursLostPerWeek: number | null;
  skills: string[];
  isDemo: boolean;
};

async function ChallengeCard({ c, lang, hidden }: { c: MarqueeChallenge; lang: "en" | "ja"; hidden?: boolean }) {
  const t = await getTranslations("landing");
  const tc = await getTranslations("common");
  return (
    <Link
      href={`/challenges/${c.id}`}
      tabIndex={hidden ? -1 : undefined}
      className="group flex h-full w-[19rem] shrink-0 flex-col rounded-2xl border border-line bg-surface p-5 shadow-[0_1px_0_rgb(0_0_0/0.02)] transition hover:-translate-y-0.5 hover:border-ice-strong hover:shadow-lg sm:w-[21rem]"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <StatusBadge status={c.status} />
        {c.hoursLostPerWeek != null && (
          <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900">
            {t("hoursLost", { n: c.hoursLostPerWeek })}
          </span>
        )}
      </div>
      <h3 className="line-clamp-2 min-h-[3em] text-base font-bold leading-snug text-ink group-hover:text-frost">{c.title}</h3>
      <p className="mt-2 flex items-center gap-1.5 text-sm text-muted">
        <svg aria-hidden viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
          <circle cx="12" cy="9.5" r="2.5" />
        </svg>
        {cityLabel(c.city, lang)} · {industryLabel(c.industry, lang)}
      </p>
      <div className="mt-auto flex flex-wrap gap-1.5 pt-4">
        {c.skills.slice(0, 3).map((s) => (
          <span key={s} className="rounded-full bg-ice px-2.5 py-0.5 text-xs font-medium text-frost">
            {tc.has(`skills.${s}`) ? tc(`skills.${s}`) : s}
          </span>
        ))}
        {c.isDemo && (
          <span className="rounded-full border border-dashed border-line px-2.5 py-0.5 text-xs text-muted">{tc("demoData")}</span>
        )}
      </div>
    </Link>
  );
}

async function Row({ items, lang, reverse, duration }: { items: MarqueeChallenge[]; lang: "en" | "ja"; reverse?: boolean; duration: number }) {
  // Pad short lists so one half of the track is always wider than the viewport.
  const half: MarqueeChallenge[] = [];
  while (half.length < Math.max(8, items.length)) half.push(...items);
  return (
    <div
      className={`yk-marquee ${reverse ? "yk-marquee--reverse" : ""}`}
      style={{ "--yk-duration": `${duration}s` } as React.CSSProperties}
      aria-hidden={reverse ? true : undefined}
    >
      <ul className="yk-marquee__track">
        {half.map((c, i) => (
          // Only the first, unpadded pass is in the tab order / accessibility tree.
          <li key={`a-${i}`} className={`flex ${i >= items.length ? "yk-marquee__dup" : ""}`} aria-hidden={reverse || i >= items.length ? true : undefined}>
            <ChallengeCard c={c} lang={lang} hidden={reverse || i >= items.length} />
          </li>
        ))}
        {half.map((c, i) => (
          <li key={`b-${i}`} className="yk-marquee__dup flex" aria-hidden>
            <ChallengeCard c={c} lang={lang} hidden />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Two rows drifting in opposite directions; hover or keyboard focus pauses them.
 * With prefers-reduced-motion the second row and the loop copies disappear,
 * leaving one static, horizontally scrollable row of every challenge (see globals.css).
 */
export async function ChallengeMarquee({ items, lang, label }: { items: MarqueeChallenge[]; lang: "en" | "ja"; label: string }) {
  if (!items.length) return null;
  const second = [...items].reverse();
  return (
    <div role="region" aria-label={label} className="space-y-3">
      <Row items={items} lang={lang} duration={Math.max(50, items.length * 11)} />
      {items.length > 1 && <Row items={second} lang={lang} reverse duration={Math.max(60, items.length * 13)} />}
    </div>
  );
}
