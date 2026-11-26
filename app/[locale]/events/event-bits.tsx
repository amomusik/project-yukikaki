import { ChefHat, Laptop, PencilRuler } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { EventFormat } from "@/lib/db/schema";
import { initials } from "@/lib/events/format";
import type { Attendee } from "@/lib/events/store";
import { cn } from "@/components/ui";

const formatTone: Record<EventFormat, string> = {
  hackathon: "bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200",
  charrette: "bg-surface text-frost ring-1 ring-inset ring-ice-strong",
  test_kitchen: "bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100",
};
const formatGradient: Record<EventFormat, string> = {
  // Winter palette only (frost, ice, lantern over night navy); raw hex so covers read the same in dark mode.
  hackathon: "from-[#5b8db4] via-[#16304b] to-[#0c1a2b]",
  charrette: "from-[#a9c8de] via-[#3f739c] to-[#0c1a2b]",
  test_kitchen: "from-[#f2b457] via-[#c9862c] to-[#16304b]",
};
const FormatIcon = { hackathon: Laptop, charrette: PencilRuler, test_kitchen: ChefHat };

export async function FormatPill({ format, className }: { format: EventFormat; className?: string }) {
  const t = await getTranslations("events");
  const Icon = FormatIcon[format];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", formatTone[format], className)} data-testid="format-pill">
      <Icon aria-hidden className="h-3.5 w-3.5" />
      {t(`format.${format}`)}
    </span>
  );
}

/** Cover image, or a format-coloured gradient with the format icon when none is set. */
export function EventCover({ format, src, alt, className }: { format: EventFormat; src: string | null; alt: string; className?: string }) {
  const Icon = FormatIcon[format];
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} className={cn("aspect-square w-full rounded-xl object-cover", className)} />;
  }
  return (
    <div aria-hidden className={cn("relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br text-white", formatGradient[format], className)}>
      <div className="yk-snow yk-snow--far absolute inset-0 opacity-60" />
      <Icon className="relative h-1/3 w-1/3 opacity-90" strokeWidth={1.4} />
    </div>
  );
}

// Winter palette only (No-Violet Rule); dark text on light tints reads the same in both themes.
const avatarColors = ["bg-sky-200 text-sky-950", "bg-amber-200 text-amber-950", "bg-emerald-200 text-emerald-950", "bg-[#a9c8de] text-[#0c1a2b]", "bg-slate-200 text-slate-900"];

/**
 * Overlapping attendee initials. Circles are 32px with a 4px overlap, so the 2px surface ring
 * never reaches the 11px initials of the avatar underneath (no clipped letters).
 */
export function AvatarStack({ attendees, total, max = 5, showMore = true }: { attendees: Attendee[]; total: number; max?: number; showMore?: boolean }) {
  const shown = attendees.slice(0, max);
  return (
    <span className="inline-flex items-center">
      <span className="flex -space-x-1">
        {shown.map((a, i) => (
          <span
            key={a.userId}
            title={a.displayName}
            className={cn(
              "relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] leading-none font-bold tracking-tight ring-2 ring-surface",
              avatarColors[i % avatarColors.length],
            )}
          >
            {initials(a.displayName)}
          </span>
        ))}
      </span>
      {showMore && total > shown.length && (
        <span className="ml-2 inline-flex h-6 items-center rounded-full bg-ice px-2 text-xs font-semibold text-muted">+{total - shown.length}</span>
      )}
    </span>
  );
}

export async function DemoBadge() {
  const t = await getTranslations("events");
  return <span className="inline-flex items-center rounded-full border border-dashed border-slate-400 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300">{t("demo")}</span>;
}
