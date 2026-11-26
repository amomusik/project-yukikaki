"use client";

import { useActionState, useId, useMemo, useState } from "react";
import Image, { type ImageLoader } from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { fillParty, ROADMAP_FEATURES, TEAM_MEMBERS, WAITLIST_ROLES, type RoadmapFeature, type TeamMember } from "@/lib/party";
import { joinWaitlistAction } from "@/app/[locale]/waitlist-actions";
import type { WaitlistResult } from "@/lib/waitlist";

/**
 * COMING SOON roadmap block: three upcoming features (any team + AI helper robots, a virtual
 * product manager, points & rewards), a party-builder demo for feature 1, and one shared waitlist.
 * The demo is computed in the browser from a fixed mapping (lib/party.ts); only the waitlist
 * form talks to the server. Nothing here is live yet, and the copy says so.
 */

/* ── 8-bit art (public/images/party-pixel*.webp, nearest-neighbour resized) ───────── */
const ART_BLUR =
  "data:image/webp;base64,UklGRpIAAABXRUJQVlA4IIYAAACwAwCdASoYAA0APu1iqk2ppaQiMAgBMB2JagCdMoABAodSwJIHgAD+hdLtNx4yUbiPKSfiZbDuBta9nCSFWqVLprzddYKlkCaW9Jo/Hq8cVw3MpBYnzcZYr5J8/Jn7xY13RPTIkrJeLLDMPguHJWzu7UyoQYBFW0K83W9qsP9yV3yxix4AAA==";
const ART_WIDTHS = [960, 1600, 2400] as const;
const artLoader: ImageLoader = ({ width }) => {
  const w = ART_WIDTHS.find((v) => v >= width) ?? 2400;
  return `/images/${w === 2400 ? "party-pixel" : `party-pixel-${w}`}.webp?w=${width}`;
};

/* ── Pixel sprites: 12×14 grids drawn as crisp SVG rects ──────────────────────────── */
const ROBOT = [
  ".....rr.....",
  ".....dd.....",
  "...dddddd...",
  "..dsssssssd.",
  ".dsvvvvvvvsd",
  ".dsvwvvvwvsd",
  ".dsvvvvvvvsd",
  "..dsssssssd.",
  "...ddddddd..",
  "....dsssd...",
  ".dddsbbbsddd",
  ".s..dsssd..s",
  "....dd.dd...",
  "....dd.dd...",
];
const HUMAN = [
  "...hhhhhh...",
  "..hhhhhhhh..",
  "..hffffffh..",
  "..fkffffkf..",
  "..ffffffff..",
  "...ffffff...",
  "..rrrrrrrr..",
  ".cccccrcccc.",
  ".cccccccccc.",
  ".f.cccccc.f.",
  "...cccccc...",
  "...nn..nn...",
  "...nn..nn...",
  "..ttt..ttt..",
];
const CLIPBOARD = [".ggg.", "ppppp", "plllp", "ppppp", "plllp", "ppppp", "ppppp"];
const TROPHY = [
  ".yyyyyyyyyy.",
  "yyWyyyyyyyoy",
  "y.yWyyyyyo.y",
  "y.yyyyyyyo.y",
  ".yyyyyyyyoy.",
  "...yyyyyo...",
  ".....yo.....",
  ".....yo.....",
  "....yyyo....",
  "...dddddd...",
  "...dddddd...",
  "..dddddddd..",
];
const COIN = [".ccc.", "cCcoc", "cCcoc", "ccooc", ".ooo."];

/** Paint smaller grids onto a w×h canvas (later layers win). */
function compose(w: number, h: number, layers: [string[], number, number][]): string[] {
  const out = Array.from({ length: h }, () => Array<string>(w).fill("."));
  for (const [g, ox, oy] of layers)
    g.forEach((row, y) => [...row].forEach((c, x) => c !== "." && out[oy + y]?.[ox + x] !== undefined && (out[oy + y][ox + x] = c)));
  return out.map((r) => r.join(""));
}
const ICON_TEAM = compose(25, 14, [
  [HUMAN, 0, 0],
  [ROBOT, 13, 0],
]);
const ICON_PM = compose(16, 14, [
  [ROBOT, 0, 0],
  [CLIPBOARD, 11, 7],
]);
const ICON_POINTS = compose(18, 14, [
  [TROPHY, 0, 1],
  [COIN, 13, 9],
]);
const HAIR: Record<TeamMember, string> = {
  students: "#3b2a20",
  shop: "#7a4b2a",
  town: "#1f2937",
  designer: "#b4532a",
  developer: "#4b3621",
  translator: "#5b4636",
};
const COAT: Record<TeamMember, string> = {
  students: "#334155",
  shop: "#7c2d12",
  town: "#1e3a5f",
  designer: "#6d28d9",
  developer: "#14532d",
  translator: "#9a3412",
};

function Sprite({ grid, palette, className }: { grid: string[]; palette: Record<string, string>; className?: string }) {
  const rects: React.ReactNode[] = [];
  grid.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c === ".") return;
      const cls = c === "v" ? "yk-party-visor" : c === "b" ? "yk-party-core" : undefined;
      rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={palette[c]} className={cls} />);
    }),
  );
  return (
    <svg aria-hidden viewBox={`0 0 ${grid[0].length} ${grid.length}`} shapeRendering="crispEdges" className={className}>
      {rects}
    </svg>
  );
}

const ROBOT_PALETTE = { r: "#ef4444", d: "#334155", s: "#cbd5e1", v: "#38bdf8", w: "#e0f2fe", b: "#38bdf8" };
const humanPalette = (m: TeamMember) => ({
  h: HAIR[m],
  f: "#f5c9a5",
  k: "#1f2937",
  r: "#dc2626",
  c: COAT[m],
  n: "#1e293b",
  t: "#3f2a1d",
});
const ICON_PALETTE = {
  ...humanPalette("students"),
  ...ROBOT_PALETTE,
  g: "#94a3b8",
  p: "#f8fafc",
  l: "#64748b",
  y: "#fbbf24",
  W: "#fef3c7",
  o: "#b45309",
  c: "#fbbf24",
  C: "#fef3c7",
};
// "c" is the coin in ICON_POINTS but the coat in ICON_TEAM, so the team icon keeps the human palette for it.
const ICONS: Record<RoadmapFeature, { grid: string[]; palette: Record<string, string>; className: string }> = {
  team: { grid: ICON_TEAM, palette: { ...ICON_PALETTE, c: COAT.students }, className: "h-12 w-[5.35rem]" },
  pm: { grid: ICON_PM, palette: ICON_PALETTE, className: "h-12 w-[3.43rem]" },
  points: { grid: ICON_POINTS, palette: ICON_PALETTE, className: "h-12 w-[3.86rem]" },
};

/* Small, self-contained styles so this section needs no globals.css edits. */
const STYLES = `
@keyframes yk-party-walk { 0% { opacity: 0; transform: translateY(10px) } 60% { opacity: 1; transform: translateY(-2px) } 100% { opacity: 1; transform: none } }
@keyframes yk-party-power { 0%, 45% { fill: #1e293b } 55% { fill: #7dd3fc } 70% { fill: #1e293b } 100% { fill: #38bdf8 } }
@keyframes yk-party-hover { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-2px) } }
.yk-party-in { animation: yk-party-walk 0.5s steps(5, end) both; }
.yk-party-in .yk-party-visor, .yk-party-in .yk-party-core { animation: yk-party-power 0.9s steps(1, end) both; }
.yk-party-bob { animation: yk-party-hover 1.6s steps(2, end) infinite; }
.yk-party-frame { box-shadow: 0 0 0 3px #0b1630, 0 0 0 6px #a9c8de, 0 0 0 9px #0b1630; }
.yk-party-badge { box-shadow: 0 -3px 0 0 #7a4a0c, 0 3px 0 0 #7a4a0c, -3px 0 0 0 #7a4a0c, 3px 0 0 0 #7a4a0c; }
@media (prefers-reduced-motion: reduce) {
  .yk-party-in, .yk-party-in .yk-party-visor, .yk-party-in .yk-party-core, .yk-party-bob { animation: none; }
}
`;

const pixelFont = "font-mono uppercase tracking-[0.18em]";

const Badge = ({ children }: { children: React.ReactNode }) => (
  <span className={`yk-party-badge mx-[3px] inline-block bg-lantern px-2 py-0.5 text-[11px] font-bold leading-5 text-lantern-ink ${pixelFont}`}>{children}</span>
);

export function PartyBuilder() {
  const t = useTranslations("landing.party");
  const [team, setTeam] = useState<TeamMember[]>(["students", "shop"]);
  const [loaded, setLoaded] = useState(false);
  const slots = useMemo(() => fillParty(team), [team]);
  const humans = slots.filter((s) => s.by).length;
  const toggle = (m: TeamMember) => setTeam((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));

  return (
    <section aria-labelledby="roadmap" className="relative left-1/2 w-screen -translate-x-1/2 overflow-hidden bg-night py-20 text-white">
      <style>{STYLES}</style>
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-3xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-lantern">{t("kicker")}</p>
          <h2 id="roadmap" className="text-balance text-2xl font-bold tracking-tight [word-break:auto-phrase] sm:text-3xl">
            {t("sectionTitle")}
          </h2>
          <p className="mt-3 text-base leading-relaxed text-slate-300 [word-break:auto-phrase] sm:text-lg">{t("sectionLead")}</p>
        </div>

        <ol className="mt-10 grid gap-8 md:grid-cols-3">
          {ROADMAP_FEATURES.map((f, i) => (
            <li key={f} className="yk-party-frame mx-[9px] flex flex-col bg-night-2 p-5">
              <div className="flex items-start justify-between gap-3">
                <Sprite grid={ICONS[f].grid} palette={ICONS[f].palette} className={`${ICONS[f].className} shrink-0`} />
                <Badge>{t("badge")}</Badge>
              </div>
              <p className={`mt-4 text-[11px] font-bold text-sky-200 ${pixelFont}`}>0{i + 1}</p>
              <h3 className="mt-1 text-lg font-bold leading-snug [word-break:auto-phrase]">{t(`features.${f}.title`)}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-300 [word-break:auto-phrase]">{t(`features.${f}.body`)}</p>
              {f === "team" && (
                <a
                  href="#party-demo"
                  className="mt-4 inline-flex items-center gap-1 self-start text-sm font-semibold text-lantern underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lantern"
                >
                  {t("demoLink")} <span aria-hidden>↓</span>
                </a>
              )}
            </li>
          ))}
        </ol>

        {/* ── Feature 1 preview: art + party builder ─────────────────── */}
        <div id="party-demo" className="mt-16 scroll-mt-24">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-frost">{t("demoKicker")}</p>
            <Badge>{t("badge")}</Badge>
          </div>
          <h3 id="party" className="mt-3 max-w-3xl text-balance text-xl font-bold tracking-tight [word-break:auto-phrase] sm:text-2xl">
            {t("title")}
          </h3>
          <p className="mt-3 max-w-3xl text-base leading-relaxed text-slate-300 [word-break:auto-phrase]">{t("lead")}</p>
        </div>

        <div className="yk-party-frame mx-[9px] mt-10 overflow-hidden bg-[#0b1630]">
          <Image
            loader={artLoader}
            src="/images/party-pixel.webp"
            alt={t("artAlt")}
            width={2400}
            height={1347}
            sizes="(min-width: 1152px) 1104px, 100vw"
            placeholder={ART_BLUR}
            onLoad={() => setLoaded(true)}
            // The art may finish loading before hydration, when onLoad has already fired.
            ref={(el) => {
              if (el?.complete && el.naturalWidth > 0) setLoaded(true);
            }}
            className={`block h-auto w-full ${loaded ? "[image-rendering:pixelated]" : ""}`}
          />
        </div>

        {/* ── Demo ─────────────────────────────────────────────────── */}
        <div className="mt-12 grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div>
            <h4 className="text-xl font-bold">{t("demoTitle")}</h4>
            <p className="mt-2 text-sm text-slate-300">{t("demoHint")}</p>
            <div role="group" aria-label={t("membersLabel")} className="mt-5 flex flex-wrap gap-2">
              {TEAM_MEMBERS.map((m) => {
                const on = team.includes(m);
                return (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(m)}
                    className={`inline-flex items-center gap-2 border-2 px-3 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lantern ${
                      on ? "border-lantern bg-lantern text-lantern-ink" : "border-white/30 bg-night-2 text-white hover:border-white"
                    }`}
                  >
                    <span aria-hidden className={`inline-block h-2.5 w-2.5 ${on ? "bg-lantern-ink" : "border-2 border-white/50"}`} />
                    {t(`members.${m}`)}
                  </button>
                );
              })}
            </div>
            <p className="mt-6 flex items-start gap-3 text-sm leading-relaxed text-slate-300">
              <span aria-hidden className="mt-1.5 h-2.5 w-2.5 shrink-0 bg-lantern" />
              {t("guardrails")}
            </p>
          </div>

          <div className="yk-party-frame mx-[9px] bg-[#0b1630] p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-dashed border-white/20 pb-3">
              <p className={`text-sm font-bold text-sky-100 ${pixelFont}`}>{t("partyTitle")}</p>
              <p aria-live="polite" className="text-xs text-slate-300">
                {humans === 0 ? t("emptyTeam") : t("partyCount", { humans, helpers: 6 - humans })}
              </p>
            </div>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {slots.map((s) => (
                <li
                  key={s.role}
                  className={`flex min-h-[5.5rem] items-center gap-3 border-2 p-3 ${
                    s.by ? "border-lantern/70 bg-[#1a2238]" : "border-sky-300/50 bg-[#0f2547]"
                  }`}
                >
                  {/* Re-keyed on change so the walk-in / power-on replays when a slot flips. */}
                  <div key={`${s.role}-${s.by ?? "bot"}`} className="yk-party-in shrink-0">
                    {s.by ? (
                      <Sprite grid={HUMAN} palette={humanPalette(s.by)} className="h-14 w-12" />
                    ) : (
                      <div className="yk-party-bob">
                        <Sprite grid={ROBOT} palette={ROBOT_PALETTE} className="h-14 w-12 drop-shadow-[0_0_6px_rgb(56_189_248/0.55)]" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-white">{t(`roles.${s.role}.name`)}</span>
                      <span
                        className={`px-1.5 py-0.5 text-[10px] font-bold ${pixelFont} ${
                          s.by ? "bg-lantern text-lantern-ink" : "bg-sky-300 text-night"
                        }`}
                      >
                        {s.by ? t("humanTag") : t("helperTag")}
                      </span>
                    </p>
                    <p className="mt-1 text-xs leading-snug text-slate-300">
                      {s.by ? t("coveredBy", { who: t(`members.${s.by}`) }) : t(`roles.${s.role}.job`)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <WaitlistForm />
      </div>
    </section>
  );
}

/* ── Waitlist ──────────────────────────────────────────────────────────────────── */
function WaitlistForm() {
  const t = useTranslations("landing.party");
  const locale = useLocale();
  const id = useId();
  const [state, action, pending] = useActionState<WaitlistResult | null, FormData>(joinWaitlistAction, null);
  const bad = (f: string) => state?.ok === false && state.error === "invalid" && state.fields.includes(f);
  const done = state?.ok === true;

  const input =
    "mt-1 block w-full border-2 bg-white px-3 py-2 text-base text-night placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lantern";
  const border = (f: string) => (bad(f) ? "border-red-500" : "border-white/40");

  return (
    <div className="yk-party-frame mx-[9px] mt-14 bg-night-2 p-6 sm:p-8">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:items-start">
        <div>
          <h3 className="text-xl font-bold">{t("formTitle")}</h3>
          <p className="mt-2 text-sm text-slate-300">{t("formLead")}</p>
          <p className="mt-2 text-xs text-slate-400">{t("privacy")}</p>
        </div>

        {done ? (
          <p role="status" className="flex items-start gap-3 border-2 border-emerald-400 bg-emerald-950/40 p-4 text-base font-semibold text-emerald-100">
            <span aria-hidden>✓</span>
            {state.status === "already" ? t("already") : state.emailed ? t("success") : t("successNoEmail")}
          </p>
        ) : (
          <form action={action} noValidate className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="locale" value={locale} />
            {/* Honeypot: off-screen and skipped by keyboard and screen readers. */}
            <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
              <label htmlFor={`${id}-website`}>{t("honeypot")}</label>
              <input id={`${id}-website`} type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor={`${id}-email`} className="text-sm font-semibold">
                {t("email")}
              </label>
              <input
                id={`${id}-email`}
                name="email"
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                maxLength={254}
                aria-invalid={bad("email") || undefined}
                aria-describedby={bad("email") ? `${id}-email-err` : undefined}
                className={`${input} ${border("email")}`}
              />
              {bad("email") && (
                <p id={`${id}-email-err`} className="mt-1 text-sm text-red-300">
                  {t("errorEmail")}
                </p>
              )}
            </div>

            <div>
              <label htmlFor={`${id}-org`} className="text-sm font-semibold">
                {t("org")}
              </label>
              <input
                id={`${id}-org`}
                name="org"
                type="text"
                autoComplete="organization"
                maxLength={120}
                aria-invalid={bad("org") || undefined}
                aria-describedby={bad("org") ? `${id}-org-err` : undefined}
                className={`${input} ${border("org")}`}
              />
              {bad("org") && (
                <p id={`${id}-org-err`} className="mt-1 text-sm text-red-300">
                  {t("errorOrg")}
                </p>
              )}
            </div>

            <div>
              <label htmlFor={`${id}-role`} className="text-sm font-semibold">
                {t("role")}
              </label>
              <select
                id={`${id}-role`}
                name="role"
                required
                defaultValue=""
                aria-invalid={bad("role") || undefined}
                aria-describedby={bad("role") ? `${id}-role-err` : undefined}
                className={`${input} ${border("role")}`}
              >
                <option value="" disabled>
                  {t("rolePlaceholder")}
                </option>
                {WAITLIST_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(`roleOptions.${r}`)}
                  </option>
                ))}
              </select>
              {bad("role") && (
                <p id={`${id}-role-err`} className="mt-1 text-sm text-red-300">
                  {t("errorRole")}
                </p>
              )}
            </div>

            <fieldset
              className="sm:col-span-2"
              aria-invalid={bad("features") || undefined}
              aria-describedby={bad("features") ? `${id}-features-err` : undefined}
            >
              <legend className="text-sm font-semibold">{t("featuresLabel")}</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {ROADMAP_FEATURES.map((f) => (
                  <label
                    key={f}
                    className={`inline-flex cursor-pointer items-center gap-2 border-2 px-3 py-1.5 text-sm font-semibold has-[:checked]:border-lantern has-[:checked]:bg-lantern/15 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-lantern ${
                      bad("features") ? "border-red-500" : "border-white/30"
                    }`}
                  >
                    <input type="checkbox" name="features" value={f} defaultChecked className="h-4 w-4 accent-[var(--lantern)]" />
                    {t(`featureOptions.${f}`)}
                  </label>
                ))}
              </div>
              {bad("features") && (
                <p id={`${id}-features-err`} className="mt-1 text-sm text-red-300">
                  {t("errorFeatures")}
                </p>
              )}
            </fieldset>

            <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
              <button
                type="submit"
                disabled={pending}
                className="inline-flex items-center gap-2 bg-lantern px-6 py-3 font-bold text-lantern-ink transition-colors hover:bg-lantern-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-70"
              >
                {pending ? t("submitting") : t("submit")} {!pending && <span aria-hidden>→</span>}
              </button>
              <p role="alert" aria-live="assertive" className="text-sm font-semibold text-red-300">
                {state?.ok === false &&
                  (state.error === "invalid" ? t("errorInvalid") : state.error === "rateLimited" ? t("errorRate") : t("errorServer"))}
              </p>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
