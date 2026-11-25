import { cn } from "@/components/ui";

/** 雪 on a night-navy tile, with one lantern-amber shovel stroke sweeping beneath it. */
export function YukikakiMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      lang="ja"
      className={cn(
        "relative inline-flex items-center justify-center overflow-hidden rounded-xl bg-night text-white shadow-sm ring-1 ring-white/10 dark:bg-ice dark:text-ink",
        className,
      )}
    >
      <span className="-mt-1 text-[1.05em] font-bold leading-none">雪</span>
      <svg viewBox="0 0 36 10" className="absolute bottom-[14%] left-1/2 w-[70%] -translate-x-1/2" fill="none">
        <path d="M2 7 C 10 2, 24 2, 34 5" stroke="var(--lantern)" strokeWidth="2.6" strokeLinecap="round" />
      </svg>
    </span>
  );
}
