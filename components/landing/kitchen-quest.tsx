"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import Image, { type ImageLoader } from "next/image";
import { Link } from "@/i18n/navigation";
import "./kitchen-quest.css";

/**
 * "A test kitchen for your town" as a tiny 8-bit quest: the red-hat kid from the hero walks the
 * snowy floor of a pixel hall, stopping at four stations (bring → prototype → taste → keep/rework/drop)
 * while an RPG dialogue box tells what happens there and what Yukikaki does.
 *
 * The art (public/images/kitchen-pixel*.webp) is the interior band of the generated scene, resized
 * with a nearest-neighbour kernel; positions below are percentages of that cropped frame.
 */

export type KitchenQuestStep = { title: string; body: string; does: string; cta: string };
export type KitchenQuestCopy = {
  kicker: string;
  title: string;
  lead: string;
  steps: KitchenQuestStep[];
  next: string;
  back: string;
  /** "Step {n} of {total}" */
  stepLabel: string;
  /** "Go to step {n}: {title}" */
  goTo: string;
  doesLabel: string;
  play: string;
  pause: string;
  sceneAlt: string;
  loop: string;
};

const HREFS = ["/interview", "/challenges", "/challenges", "/grants"] as const;

// Station centres (x) and the hotspot heights (y), in % of the cropped frame.
const STATIONS = [
  { x: 13.8, y: 24 },
  { x: 37.6, y: 20 },
  { x: 63.4, y: 20 },
  { x: 86.6, y: 25 },
] as const;
const FRAME_W = 2664;
const FRAME_H = 986;

const ART = {
  base: "kitchen-pixel",
  blur: "data:image/webp;base64,UklGRoIAAABXRUJQVlA4IHYAAAAQBACdASoYAAkAPtFWpEuoJKOhsAgBABoJYgCdAB6VrkD/eisbJ132AAD+wcmnrq7yXiRLX/jI8RRfNBdzWeagYYodYjj2QhKY0upKTXROw3OQnRAbbgFGo64BNSH1ggWg6yATAGaCVSDA4hPIIMv+NGueQAAA",
} as const;
const VARIANTS = [960, 1600, 2400] as const;
const loader: ImageLoader = ({ width }) => {
  const w = VARIANTS.find((v) => v >= width) ?? 2400;
  return `/images/${w === 2400 ? ART.base : `${ART.base}-${w}`}.webp?w=${width}`;
};

const AUTOPLAY_MS = 6000;
const TYPE_MS = 22;

// ── Sprite: the hero's red-hat kid on a 16×16 grid, two walk frames, facing right ──────────────
const PALETTE: Record<string, string> = {
  k: "#1a1424", // outline
  w: "#f6f2e8", // pompom
  R: "#d23a3a", // hat + coat
  r: "#8e2230", // hat band
  m: "#b02c33", // coat seam
  h: "#6a3a1e", // hair
  s: "#f3c49b", // skin
  e: "#1a1424", // eyes
  c: "#e8826e", // cheek
  b: "#3d63b0", // jeans
  d: "#3a2a2a", // boots
};
const HEAD = [
  "......kwwk......",
  ".....kwwwwk.....",
  "....kRRRRRRk....",
  "...kRRRRRRRRk...",
  "...krrrrrrrrk...",
  "...khhsssssk....",
  "...khssesesk....",
  "...khsssssck....",
  "....kssssk......",
];
const FRAME_A = [
  ...HEAD,
  "...kRmRRRRRk....",
  "..kRRmRRRRRRk...",
  "..ksRmRRRRRsk...",
  "...kRRRRRRRk....",
  "...kbbbkbbbk....",
  "..kddk...kddk...",
  "..kkk.....kkk...",
];
const FRAME_B = [
  "................",
  ...HEAD,
  "...kRmRRRRRk....",
  "...ksmRRRRsk....",
  "...kRRRRRRRk....",
  "....kbbbbbk.....",
  ".....kddddk.....",
  ".....kkkkk......",
];

function SpriteFrame({ rows, className }: { rows: string[]; className?: string }) {
  return (
    <g className={className}>
      {rows.flatMap((row, y) =>
        [...row].map((ch, x) => (ch === "." ? null : <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={PALETTE[ch]} />)),
      )}
    </g>
  );
}

function Kid({ walking, className, style }: { walking?: boolean; className?: string; style?: CSSProperties }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" shapeRendering="crispEdges" className={className} style={style} data-walking={walking ? "" : undefined}>
      <SpriteFrame rows={FRAME_A} className="kq-frame-a" />
      <SpriteFrame rows={FRAME_B} className="kq-frame-b" />
    </svg>
  );
}

const fill = (template: string, vars: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    setReduced(mq.matches);
    const on = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

function DialogText({
  title,
  body,
  caret,
  does,
  doesLabel,
  loop,
  hideExtras,
}: {
  title: string;
  body: string;
  caret?: boolean;
  does: string;
  doesLabel: string;
  loop?: string;
  hideExtras?: boolean;
}) {
  return (
    <>
      <h3 className="mt-1 text-lg font-bold leading-snug text-white sm:text-xl">{title}</h3>
      <p className="mt-2 text-[15px] leading-relaxed text-sky-50 [word-break:auto-phrase] sm:text-base">
        {body}
        {caret && <span className="kq-caret" />}
      </p>
      <div className={`kq-reveal mt-3 ${hideExtras ? "opacity-0" : "opacity-100"}`}>
        <p className="flex items-start gap-2 text-sm leading-relaxed text-sky-100 [word-break:auto-phrase]">
          <span className="mt-[7px] h-2 w-2 shrink-0 bg-lantern" />
          <span>
            <span className="font-semibold text-lantern">{doesLabel}: </span>
            {does}
          </span>
        </p>
        {loop && <p className="mt-2 text-xs text-sky-200/80">↻ {loop}</p>}
      </div>
    </>
  );
}

export function KitchenQuest({ copy }: { copy: KitchenQuestCopy }) {
  const steps = copy.steps.slice(0, 4);
  const total = steps.length;
  const reduced = useReducedMotion();

  const [step, setStep] = useState(0);
  const [walk, setWalk] = useState({ ms: 0, facing: 1 as 1 | -1, walking: false });
  const [typed, setTyped] = useState<number | null>(null); // null = full text shown
  const [auto, setAuto] = useState(true);
  const [hovering, setHovering] = useState(false);
  const [focused, setFocused] = useState(false);
  const [inView, setInView] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const rootRef = useRef<HTMLElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const walkerRef = useRef<HTMLDivElement>(null);
  const stepRef = useRef(0);
  const walkTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const followRaf = useRef(0);

  /** Keep the walker centred in the phone-width scroller (no-op when the whole scene fits). */
  const follow = useCallback((untilMs: number) => {
    cancelAnimationFrame(followRaf.current);
    const end = performance.now() + untilMs;
    const tick = () => {
      const sc = scrollerRef.current;
      const wk = walkerRef.current;
      if (sc && wk && sc.scrollWidth > sc.clientWidth + 1) {
        sc.scrollLeft = wk.offsetLeft - sc.clientWidth / 2;
      }
      if (performance.now() < end) followRaf.current = requestAnimationFrame(tick);
    };
    tick();
  }, []);

  const goTo = useCallback(
    (target: number, fromUser: boolean) => {
      const next = ((target % total) + total) % total;
      const from = stepRef.current;
      if (fromUser) setAuto(false);
      if (next === from) return;
      stepRef.current = next;
      const dist = Math.abs(STATIONS[next].x - STATIONS[from].x);
      const ms = reduced ? 0 : Math.round(Math.max(600, dist * 42));
      clearTimeout(walkTimer.current);
      setWalk({ ms, facing: next > from ? 1 : -1, walking: ms > 0 });
      setStep(next);
      if (ms > 0) walkTimer.current = setTimeout(() => setWalk((w) => ({ ...w, walking: false })), ms);
      follow(ms + 80);
    },
    [follow, reduced, total],
  );

  // Typewriter for the dialogue body; reduced motion shows the full line at once.
  const body = steps[step]?.body ?? "";
  const chars = useMemo(() => Array.from(body), [body]);
  useEffect(() => {
    if (reduced) {
      setTyped(null);
      return;
    }
    setTyped(0);
    // Driven by elapsed time, so throttled timers (background tabs, busy main thread) catch up.
    const start = performance.now();
    const id = setInterval(() => {
      const i = Math.floor((performance.now() - start) / TYPE_MS);
      if (i >= chars.length) {
        clearInterval(id);
        setTyped(null);
      } else setTyped(i);
    }, TYPE_MS);
    return () => clearInterval(id);
  }, [chars, reduced]);
  const typing = typed !== null;

  // Autoplay: only while untouched, on screen, and not being read (hover/focus).
  const paused = hovering || focused || !inView;
  useEffect(() => {
    if (!auto || paused) return;
    const id = setTimeout(() => goTo(stepRef.current + 1, false), AUTOPLAY_MS);
    return () => clearTimeout(id);
  }, [auto, paused, step, goTo]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.45 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    follow(0);
    const sc = scrollerRef.current;
    if (!sc) return;
    const ro = new ResizeObserver(() => follow(0));
    ro.observe(sc);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(followRaf.current);
      clearTimeout(walkTimer.current);
    };
  }, [follow]);

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const map: Record<string, number> = { ArrowRight: step + 1, ArrowLeft: step - 1, Home: 0, End: total - 1 };
    if (!(e.key in map)) return;
    if (e.key === "ArrowLeft" && step === 0) return;
    e.preventDefault();
    goTo(map[e.key], true);
  };

  const current = steps[step];
  const station = STATIONS[step];
  const pauseHandlers = {
    onPointerEnter: () => setHovering(true),
    onPointerLeave: () => setHovering(false),
    onFocus: () => setFocused(true),
    onBlur: (e: React.FocusEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
    },
  };

  return (
    <section ref={rootRef} aria-labelledby="kitchen-quest" className="kq pt-20 sm:pt-24" onKeyDown={onKeyDown} data-reduced={reduced ? "" : undefined}>
      <div className="max-w-2xl">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-frost">{copy.kicker}</p>
        <h2 id="kitchen-quest" className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          {copy.title}
        </h2>
        <p className="mt-3 text-lg text-muted [word-break:auto-phrase]">{copy.lead}</p>
      </div>

      <div className="kq-frame mt-10" {...pauseHandlers}>
        {/* ── Scene ── */}
        <div
          ref={scrollerRef}
          className="kq-scroller relative overflow-x-auto overflow-y-hidden bg-[#04101f] [scrollbar-width:none] sm:overflow-hidden [&::-webkit-scrollbar]:hidden"
        >
          <div className="relative w-[230%] max-w-none sm:w-full" style={{ aspectRatio: `${FRAME_W} / ${FRAME_H}` }}>
            <Image
              loader={loader}
              src={`/images/${ART.base}.webp`}
              alt={copy.sceneAlt}
              width={2400}
              height={888}
              sizes="(max-width: 639px) 230vw, (max-width: 1216px) 100vw, 1152px"
              placeholder={ART.blur}
              onLoad={() => setLoaded(true)}
              className={`absolute inset-0 h-full w-full select-none ${loaded ? "[image-rendering:pixelated]" : ""}`}
              draggable={false}
            />

            {/* Lantern glow that follows the active station. */}
            <div
              aria-hidden
              className="kq-glow pointer-events-none absolute inset-y-0 w-[34%] -translate-x-1/2"
              style={{ left: `${station.x}%`, transitionDuration: `${walk.ms}ms` }}
            />

            {/* Hotspots */}
            {STATIONS.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => goTo(i, true)}
                aria-label={fill(copy.goTo, { n: i + 1, title: steps[i]?.title ?? "" })}
                aria-current={i === step ? "step" : undefined}
                className="kq-hotspot group absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
                style={{ left: `${s.x}%`, top: `${s.y}%` }}
              >
                <span aria-hidden className="kq-diamond">
                  <span className="kq-diamond__n">{i + 1}</span>
                </span>
              </button>
            ))}

            {/* Walker: outer box moves along the floor, inner sprite flips and steps. */}
            <div
              ref={walkerRef}
              aria-hidden
              className="kq-walker pointer-events-none absolute w-[5.5%] -translate-x-1/2"
              style={{ left: `${station.x}%`, bottom: "9.5%", transitionDuration: `${walk.ms}ms` }}
              data-walking={walk.walking ? "" : undefined}
            >
              <span className="kq-shadow" />
              <Kid walking={walk.walking} className="kq-kid block w-full" style={{ transform: `scaleX(${walk.facing})` }} />
            </div>
          </div>
        </div>

        {/* ── Dialogue box ── */}
        <div className="kq-dialog relative bg-[#0b1a33] px-4 py-4 text-white sm:px-6 sm:py-5">
          <div className="flex gap-4 sm:gap-5">
            <div aria-hidden className="kq-portrait hidden shrink-0 sm:block">
              <Kid className="block h-full w-full" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-lantern">
                {fill(copy.stepLabel, { n: step + 1, total })}
              </p>

              {/* Screen readers get each step once, in full; the typed copy below is visual only. */}
              <div className="sr-only" aria-live="polite" aria-atomic="true">
                {current ? `${fill(copy.stepLabel, { n: step + 1, total })}. ${current.title}. ${current.body} ${copy.doesLabel}: ${current.does}` : ""}
              </div>

              {/* Every step is stacked invisibly in one grid cell, so the box keeps the height of the
                  longest step and nothing below it jumps while typing or switching steps. */}
              <div className="grid">
                {steps.map((s, i) => (
                  <div key={i} aria-hidden className="invisible col-start-1 row-start-1">
                    <DialogText title={s.title} body={s.body} does={s.does} doesLabel={copy.doesLabel} loop={i === total - 1 ? copy.loop : undefined} />
                  </div>
                ))}
                <div aria-hidden className="col-start-1 row-start-1 cursor-default" onClick={() => setTyped(null)}>
                  <DialogText
                    title={current?.title ?? ""}
                    body={typing ? chars.slice(0, typed ?? 0).join("") : body}
                    caret={typing}
                    does={current?.does ?? ""}
                    doesLabel={copy.doesLabel}
                    loop={step === total - 1 ? copy.loop : undefined}
                    hideExtras={typing}
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-white/15 pt-3">
            <Link
              href={HREFS[step]}
              tabIndex={typing ? -1 : undefined}
              className={`kq-reveal inline-flex items-center gap-2 font-mono text-sm font-bold text-lantern hover:text-lantern-hover hover:underline ${typing ? "opacity-0" : "opacity-100"}`}
              onClick={() => setAuto(false)}
            >
              <span aria-hidden className="kq-cursor">▶</span>
              {current?.cta}
            </Link>
            {!typing && <span aria-hidden className="kq-more hidden font-mono text-lantern sm:inline">▼</span>}
          </div>
        </div>
      </div>

      {/* ── Controls ── */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2" aria-hidden>
          {steps.map((s, i) => (
            <button
              key={i}
              type="button"
              tabIndex={-1}
              onClick={() => goTo(i, true)}
              className={`kq-pip ${i === step ? "kq-pip--on" : ""} ${i < step ? "kq-pip--done" : ""}`}
              title={s.title}
            />
          ))}
          <span className="ml-2 font-mono text-xs font-semibold tabular-nums text-muted">
            {step + 1}/{total}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAuto((a) => !a)}
            className="kq-btn kq-btn--quiet"
            aria-label={auto ? copy.pause : copy.play}
          >
            <span aria-hidden className="font-mono">{auto ? "❚❚" : "▶"}</span>
            <span className="hidden sm:inline">{auto ? copy.pause : copy.play}</span>
          </button>
          <button type="button" onClick={() => goTo(step - 1, true)} disabled={step === 0} className="kq-btn">
            <span aria-hidden>◀</span> {copy.back}
          </button>
          <button type="button" onClick={() => goTo(step + 1, true)} className="kq-btn kq-btn--primary">
            {copy.next} <span aria-hidden>▶</span>
          </button>
        </div>
      </div>
    </section>
  );
}
