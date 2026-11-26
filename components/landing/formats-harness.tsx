"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import Image, { type ImageLoader } from "next/image";
import { useTranslations } from "next-intl";
import { prefersReducedMotion } from "./use-in-view";

/**
 * "One harness, any format": an 8-bit building with three lit windows (hackathon, design charrette,
 * test kitchen) under one snowy roof. Pick a window and a phase (before / during / after) to see what
 * Yukikaki supplies. Both pickers are ARIA radio groups with roving focus; on phones the windows
 * become a horizontal snap carousel and scrolling to a window selects it.
 */

const FORMATS = ["hackathon", "charrette", "kitchen"] as const;
const PHASES = ["before", "during", "after"] as const;
type Format = (typeof FORMATS)[number];
type Phase = (typeof PHASES)[number];

// Window bounds in the source art, as fractions of its width/height (frames included).
const PANEL_X: Record<Format, [number, number]> = {
  hackathon: [0.045, 0.338],
  charrette: [0.352, 0.646],
  kitchen: [0.661, 0.955],
};
const PANEL_Y: [number, number] = [0.255, 0.828];
const SKY = "#070a29"; // the art's night sky, so the section and the image meet without a seam

const ART_W = 2400;
const ART_H = 1347;
const BLUR =
  "data:image/webp;base64,UklGRoIAAABXRUJQVlA4IHYAAADQAwCdASoYAA0APu1iqk2ppaQiMAgBMB2JQBOgBDqUaLmztYvdngAA/qwX5zRW2AM8C7Mp4bmmpAyNKkL+y4+GJVSV7YcD/BF6dboc2TyLWtEfYUaZ6u/fkGYbkKJ0Ao2s3+6DDUbHT/mULhvEwe/rTrK3AAAA";
const SIZES = [960, 1600, 2400] as const;
const src = (w: number) => `/images/${w === 2400 ? "formats-pixel" : `formats-pixel-${w}`}.webp`;
const loader: ImageLoader = ({ width }) => `${src(SIZES.find((v) => v >= width) ?? 2400)}?w=${width}`;

const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

/** Crops one window out of the full art with background-size/position (used by the mobile carousel). */
function cropStyle(f: Format): React.CSSProperties {
  const [x0, x1] = PANEL_X[f];
  const [y0, y1] = PANEL_Y;
  const w = x1 - x0;
  const h = y1 - y0;
  return {
    aspectRatio: `${(w * ART_W) / (h * ART_H)}`,
    backgroundImage: `image-set(url("${src(1600)}") 1x, url("${src(2400)}") 2x)`,
    backgroundSize: `${pct(1 / w)} ${pct(1 / h)}`,
    backgroundPosition: `${pct(x0 / (1 - w))} ${pct(y0 / (1 - h))}`,
    backgroundRepeat: "no-repeat",
    imageRendering: "pixelated",
  };
}

/** Arrow / Home / End handling for a radio group: returns the new index, or null if the key isn't ours. */
function radioKey(e: KeyboardEvent, i: number, n: number): number | null {
  switch (e.key) {
    case "ArrowRight":
    case "ArrowDown":
      return (i + 1) % n;
    case "ArrowLeft":
    case "ArrowUp":
      return (i - 1 + n) % n;
    case "Home":
      return 0;
    case "End":
      return n - 1;
    default:
      return null;
  }
}

/** The lit window: amber pixel frame plus a warm lantern glow from the top. */
function Glow({ on }: { on: boolean }) {
  return (
    <>
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-0 transition-opacity duration-300 motion-reduce:transition-none ${on ? "opacity-100" : "opacity-0"}`}
        style={{
          background: "radial-gradient(ellipse 70% 55% at 50% 8%, rgb(255 196 104 / 0.42), rgb(255 170 60 / 0.12) 55%, transparent 75%)",
          mixBlendMode: "screen",
        }}
      >
        <span className="yk-fh-flicker absolute inset-0" />
      </span>
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-0 ${on ? "opacity-100" : "opacity-0"}`}
        style={{
          // Two hard rings (amber, then dark) read as a pixel frame; no radius, no blur.
          boxShadow: "0 0 0 3px #f0b04f, 0 0 0 6px #2b1a02, 0 0 28px 6px rgb(240 176 79 / 0.45)",
        }}
      />
    </>
  );
}

export function FormatsHarness() {
  const t = useTranslations("landing.formatsHarness");
  const [format, setFormat] = useState<Format>("hackathon");
  const [phase, setPhase] = useState<Phase>("before");
  const panelRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const slideRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const phaseRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const carousel = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);

  const scrollToSlide = useCallback((i: number) => {
    const track = carousel.current;
    const slide = slideRefs.current[i];
    if (!track || !slide || track.offsetParent === null) return; // hidden on desktop
    const left = slide.offsetLeft - (track.clientWidth - slide.clientWidth) / 2;
    track.scrollTo({ left, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, []);

  const pickFormat = (i: number, focus?: "panel" | "slide") => {
    setFormat(FORMATS[i]);
    scrollToSlide(i);
    if (focus === "panel") panelRefs.current[i]?.focus();
    if (focus === "slide") slideRefs.current[i]?.focus({ preventScroll: true });
  };

  // Phones: when a swipe settles, the window nearest the centre becomes the selection.
  useEffect(() => {
    const track = carousel.current;
    if (!track) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const mid = track.scrollLeft + track.clientWidth / 2;
        let best = 0;
        let dist = Infinity;
        slideRefs.current.forEach((s, i) => {
          if (!s) return;
          const d = Math.abs(s.offsetLeft + s.clientWidth / 2 - mid);
          if (d < dist) [best, dist] = [i, d];
        });
        setFormat(FORMATS[best]);
      }, 120);
    };
    track.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      track.removeEventListener("scroll", onScroll);
    };
  }, []);

  const fi = FORMATS.indexOf(format);
  const pi = PHASES.indexOf(phase);
  const gloss = t.has(`formats.${format}.gloss`) ? t(`formats.${format}.gloss`) : null;
  const items = t.raw(`formats.${format}.${phase}`) as string[];
  const guardrails = t.raw("guardrails") as string[];

  const radioProps = (i: number, selected: boolean, refs: typeof panelRefs, focus: "panel" | "slide") => ({
    ref: (el: HTMLButtonElement | null) => {
      refs.current[i] = el;
    },
    type: "button" as const,
    role: "radio",
    "aria-checked": selected,
    tabIndex: selected ? 0 : -1,
    onClick: () => pickFormat(i),
    onKeyDown: (e: KeyboardEvent) => {
      const n = radioKey(e, i, FORMATS.length);
      if (n === null) return;
      e.preventDefault();
      pickFormat(n, focus);
    },
  });

  return (
    <section
      aria-labelledby="formats-harness"
      className="relative left-1/2 mt-20 w-screen -translate-x-1/2 overflow-hidden pb-16 pt-14 text-white sm:mt-24 sm:pb-20"
      style={{ backgroundColor: SKY }}
    >
      <div aria-hidden className="yk-snow yk-pxsnow yk-pxsnow--far" />
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <h2 id="formats-harness" className="yk-wordmark--pixel text-balance text-2xl font-bold tracking-tight sm:text-4xl">
            {t("title")}
          </h2>
          <p className="mt-3 text-base text-sky-100/90 [word-break:auto-phrase] sm:text-lg">{t("lead")}</p>
        </div>

        {/* ── Desktop: the whole building, windows as radio buttons ── */}
        <div className="relative mt-8 hidden sm:block">
          <Image
            loader={loader}
            src={src(2400)}
            alt={t("artAlt")}
            width={ART_W}
            height={ART_H}
            sizes="(min-width: 1152px) 1104px, calc(100vw - 3rem)"
            placeholder={BLUR}
            onLoad={() => setLoaded(true)}
            className={`block h-auto w-full ${loaded ? "[image-rendering:pixelated]" : ""}`}
            // The art's side drifts and bottom snowbank fade into the section sky.
            style={{
              maskImage: "linear-gradient(to right, transparent, #000 5%, #000 95%, transparent), linear-gradient(#000 78%, transparent)",
              maskComposite: "intersect",
            }}
          />
          <div role="radiogroup" aria-label={t("formatLabel")} className="absolute inset-0">
            {FORMATS.map((f, i) => {
              const on = f === format;
              const [x0, x1] = PANEL_X[f];
              return (
                <button
                  key={f}
                  {...radioProps(i, on, panelRefs, "panel")}
                  className="group absolute cursor-pointer outline-none"
                  style={{ left: pct(x0), width: pct(x1 - x0), top: pct(PANEL_Y[0]), height: pct(PANEL_Y[1] - PANEL_Y[0]) }}
                >
                  <span
                    aria-hidden
                    className={`absolute inset-0 transition-colors duration-200 motion-reduce:transition-none ${
                      on ? "bg-transparent" : "bg-[#070a29]/45 group-hover:bg-[#070a29]/20"
                    }`}
                  />
                  <Glow on={on} />
                  {/* Keyboard focus: a dashed white pixel ring outside the frame. */}
                  <span aria-hidden className="pointer-events-none absolute -inset-[10px] hidden border-2 border-dashed border-white group-focus-visible:block" />
                  <span
                    className={`absolute bottom-[4%] left-1/2 -translate-x-1/2 whitespace-nowrap border-2 px-2.5 py-1 text-xs font-bold tracking-wide shadow-[3px_3px_0_#000] lg:text-sm ${
                      on ? "border-[#2b1a02] bg-lantern text-lantern-ink" : "border-white/30 bg-[#0b1238]/90 text-sky-50"
                    }`}
                  >
                    {t(`formats.${f}.title`).replace(/（.*）$/, "")}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Phones: one window per slide ── */}
        <div className="mt-8 sm:hidden">
          <div
            ref={carousel}
            role="radiogroup"
            aria-label={t("formatLabel")}
            className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-[11%] pb-3 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {FORMATS.map((f, i) => {
              const on = f === format;
              return (
                <button
                  key={f}
                  {...radioProps(i, on, slideRefs, "slide")}
                  className="group relative w-[78%] shrink-0 snap-center outline-none"
                >
                  <span className="relative block w-full" style={cropStyle(f)}>
                    <span
                      aria-hidden
                      className={`absolute inset-0 transition-colors duration-200 motion-reduce:transition-none ${on ? "bg-transparent" : "bg-[#070a29]/45"}`}
                    />
                    <Glow on={on} />
                    <span aria-hidden className="pointer-events-none absolute -inset-[9px] hidden border-2 border-dashed border-white group-focus-visible:block" />
                  </span>
                  <span
                    className={`mx-auto mt-3 block w-fit border-2 px-2.5 py-1 text-xs font-bold shadow-[3px_3px_0_#000] ${
                      on ? "border-[#2b1a02] bg-lantern text-lantern-ink" : "border-white/30 bg-[#0b1238] text-sky-50"
                    }`}
                  >
                    {t(`formats.${f}.title`).replace(/（.*）$/, "")}
                  </span>
                </button>
              );
            })}
          </div>
          <p aria-hidden className="mt-1 flex items-center justify-center gap-2 text-xs text-sky-100/70">
            {FORMATS.map((f) => (
              <span key={f} className={`h-2 w-2 ${f === format ? "bg-lantern" : "bg-white/25"}`} />
            ))}
            <span className="ml-1">{t("swipeHint")}</span>
          </p>
        </div>

        {/* ── Phase toggle + what Yukikaki supplies ── */}
        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-100/70" id="fh-phase">
              {t("phaseLabel")}
            </p>
            <div role="radiogroup" aria-labelledby="fh-phase" className="mt-2 inline-flex border-2 border-black bg-[#0b1238] p-1 shadow-[4px_4px_0_#000]">
              {PHASES.map((p, i) => {
                const on = p === phase;
                return (
                  <button
                    key={p}
                    ref={(el) => {
                      phaseRefs.current[i] = el;
                    }}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    tabIndex={on ? 0 : -1}
                    onClick={() => setPhase(p)}
                    onKeyDown={(e) => {
                      const n = radioKey(e, i, PHASES.length);
                      if (n === null) return;
                      e.preventDefault();
                      setPhase(PHASES[n]);
                      phaseRefs.current[n]?.focus();
                    }}
                    className={`min-w-[5.5rem] px-4 py-2 text-sm font-bold outline-none transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dashed focus-visible:outline-white motion-reduce:transition-none ${
                      on ? "bg-lantern text-lantern-ink shadow-[inset_-3px_-3px_0_#b8781f]" : "text-sky-100 hover:bg-white/10"
                    }`}
                  >
                    <span aria-hidden className="mr-1.5 font-mono text-[0.7em] opacity-70">
                      {i + 1}
                    </span>
                    {t(`phases.${p}`)}
                  </button>
                );
              })}
            </div>

            <div className="mt-6">
              {/* JA titles carry their gloss in （…）; set it as a smaller second line. */}
              <h3 className="text-xl font-bold [word-break:auto-phrase] sm:text-2xl">
                {(() => {
                  const [, main, paren] = t(`formats.${format}.title`).match(/^(.*?)(（.*）)?$/) ?? [];
                  return (
                    <>
                      {main}
                      {paren && <span className="mt-1 block text-sm font-semibold text-sky-100/80 sm:text-base">{paren}</span>}
                    </>
                  );
                })()}
              </h3>
              {gloss && <p className="mt-0.5 text-sm text-sky-100/80">{gloss}</p>}
              <p className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                <span className="border border-white/25 px-2 py-1 text-sky-50">{t(`formats.${format}.who`)}</span>
                <span className="border border-white/25 px-2 py-1 text-sky-50">{t(`formats.${format}.time`)}</span>
              </p>
              <p className="mt-3 flex items-start gap-2 text-sm font-semibold text-lantern">
                <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 bg-lantern" />
                {t(`formats.${format}.out`)}
              </p>
            </div>
          </div>

          <div
            aria-live="polite"
            className="relative border-2 border-black bg-[#f6f9fc] p-5 text-[#0f1d2c] shadow-[6px_6px_0_#000] sm:p-6"
          >
            {/* Pixel corner notches */}
            {["-left-0.5 -top-0.5", "-right-0.5 -top-0.5", "-bottom-0.5 -left-0.5", "-bottom-0.5 -right-0.5"].map((c) => (
              <span key={c} aria-hidden className={`absolute h-1.5 w-1.5 ${c}`} style={{ backgroundColor: SKY }} />
            ))}
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#3f739c]">
              {t(`phases.${phase}`)} · {t("supplies")}
            </p>
            <ul key={`${format}-${phase}`} className="mt-4 space-y-2.5">
              {items.map((it, i) => (
                <li
                  key={it}
                  className="yk-fh-item flex items-start gap-3 text-base leading-snug [word-break:auto-phrase]"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <span aria-hidden className="mt-1.5 h-2.5 w-2.5 shrink-0 border-2 border-[#2b1a02] bg-[#e9a23b]" />
                  {it}
                </li>
              ))}
            </ul>
            <p aria-hidden className="mt-5 flex gap-1.5">
              {PHASES.map((p, i) => (
                <span key={p} className={`h-1.5 flex-1 ${i <= pi ? "bg-[#e9a23b]" : "bg-[#d9e4ee]"}`} />
              ))}
            </p>
            <span className="sr-only">{`${fi + 1}/${FORMATS.length}`}</span>
          </div>
        </div>

        {/* ── Shared across every format ── */}
        <div className="mt-10 border-t-2 border-dashed border-white/15 pt-8">
          <p className="text-lg font-bold [word-break:auto-phrase] sm:text-xl">{t("sharedTitle")}</p>
          <ul className="mt-4 flex flex-wrap gap-3">
            {guardrails.map((g) => (
              <li key={g} className="flex items-center gap-2 border-2 border-white/20 bg-[#0b1238] px-3 py-2 text-sm font-semibold text-sky-50 shadow-[3px_3px_0_#000]">
                <svg aria-hidden viewBox="0 0 7 7" shapeRendering="crispEdges" className="h-3.5 w-3.5 shrink-0 fill-lantern">
                  <path d="M0 3h1v1H0zM1 4h1v1H1zM2 5h1v1H2zM3 4h1v1H3zM4 3h1v1H4zM5 2h1v1H5zM6 1h1v1H6z" />
                </svg>
                {g}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
