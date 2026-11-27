import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { listChallenges, totalHoursSaved } from "@/lib/queries";
import { listTestimonials, type Testimonial } from "@/lib/testimonials";
import { ChallengeMarquee, type MarqueeChallenge } from "@/components/landing/challenge-marquee";
import { HeroSearch } from "@/components/landing/hero-search";
import { HeroQuoteBar } from "@/components/landing/hero-quote-bar";
import { MarqueePause } from "@/components/landing/marquee-pause";
import { cityLabel, industryLabel } from "@/components/landing/labels";
import { CountUp } from "@/components/landing/count-up";
import { HeroArt } from "@/components/landing/hero-art";
import { parseHeroVariant } from "@/components/landing/hero-variant";
import { PathDivider, SnowbankEdge } from "@/components/landing/path-divider";
import { KitchenQuest, type KitchenQuestStep } from "@/components/landing/kitchen-quest";
import { PartyBuilder } from "@/components/landing/party-builder";
import { FormatsHarness } from "@/components/landing/formats-harness";

export const dynamic = "force-dynamic";

/** Real owners' reported hours only (demo/synthetic briefs excluded). 0 hides the stat. */
async function realHoursSaved(): Promise<number> {
  try {
    return await totalHoursSaved();
  } catch {
    return 0;
  }
}

async function loadChallenges(lang: "en" | "ja"): Promise<MarqueeChallenge[]> {
  try {
    const rows = await listChallenges({});
    return rows.map(({ brief, business }) => ({
      id: brief.id,
      title: brief.content[lang]?.title || brief.content.ja.title,
      city: business.city,
      industry: business.industry,
      status: brief.status,
      hoursLostPerWeek: brief.hoursLostPerWeek,
      skills: brief.skillsNeeded,
      isDemo: brief.isSynthetic,
    }));
  } catch {
    return [];
  }
}

/** Most common skills and cities across public challenges, for the quick-filter chips. */
function topFacets(items: MarqueeChallenge[]) {
  const count = (xs: string[]) => {
    const m = new Map<string, number>();
    for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k]) => k);
  };
  return {
    skills: count(items.flatMap((i) => i.skills)).slice(0, 4),
    cities: count(items.map((i) => i.city)).slice(0, 3),
  };
}

const fullBleed = "relative left-1/2 w-screen -translate-x-1/2";

export default async function Landing({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ hero?: string | string[] }>;
}) {
  const { locale } = await params;
  // The 8-bit "Pixel 1" hero is the default; /{locale}?hero=paper shows the paper-cut art for comparison.
  const hero = parseHeroVariant((await searchParams).hero);
  const pixel = hero === "pixel";
  setRequestLocale(locale);
  const lang = locale === "en" ? "en" : "ja";
  const t = await getTranslations("landing");
  const tc = await getTranslations("common");
  const [hours, challenges, testimonials] = await Promise.all([realHoursSaved(), loadChallenges(lang), listTestimonials(6)]);
  const facets = topFacets(challenges);


  return (
    <div className="-mt-10 -mb-10">
      {/* ── HERO: wordmark, one search box, 8-bit snow scene (paper-cut via ?hero=paper) ── */}
      {/* The hero navy matches the illustration's sky (paper-cut #041329, pixel #041a40; see HERO_SKY)
          so the two meet without a seam. */}
      <section
        data-hero={hero}
        className={`${fullBleed} overflow-hidden ${pixel ? "bg-[#041a40]" : "bg-[#041329]"} text-white sm:min-h-[calc(56.14vw+3rem)]`}
      >
        {/* Illustration anchored to the bottom; its sky fades into the hero navy. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0">
          <HeroArt
            alt={t("heroAlt")}
            variant={hero}
            className={`block h-[260px] w-full object-cover ${pixel ? "object-[50%_100%]" : "object-[62%_100%]"} sm:h-auto sm:object-bottom`}
          />
          <div
            aria-hidden
            className={`absolute inset-x-0 top-0 bg-gradient-to-b to-transparent ${pixel ? "h-[50%] from-[#041a40]" : "h-[40%] from-[#041329]"}`}
          />
          {/* Soften the illustration's bottom snow into the page snow. */}
          <div
            aria-hidden
            className={`absolute inset-x-0 bottom-0 ${pixel ? "h-6" : "h-10"} bg-gradient-to-b from-transparent to-snow/80 sm:h-16`}
          />
        </div>
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgb(91_141_180/0.22),transparent_55%)]" />
        {pixel ? (
          <>
            {/* Chunky square flakes on a stepped, frame-by-frame fall. */}
            <div aria-hidden className="yk-snow yk-pxsnow yk-pxsnow--far" />
            <div aria-hidden className="yk-snow yk-pxsnow" />
            <div aria-hidden className="yk-snow yk-pxsnow yk-pxsnow--near" />
          </>
        ) : (
          <>
            <div aria-hidden className="yk-snow yk-snow--far" />
            <div aria-hidden className="yk-snow" />
            <div aria-hidden className="yk-snow yk-snow--big" />
            <div aria-hidden className="yk-snow yk-snow--near" />
          </>
        )}
        {/* Soft scrim so the text keeps AA contrast wherever it meets the scene. */}
        <div aria-hidden className="absolute inset-x-0 top-0 h-[70%] bg-[radial-gradient(ellipse_60%_70%_at_50%_35%,rgb(4_12_26/0.55),transparent_75%)] sm:h-[62%]" />

        <div className="relative mx-auto max-w-4xl px-4 pb-[200px] pt-8 text-center sm:px-6 sm:pb-[23vw] sm:pt-10">
          <div className="flex flex-col items-center">
            {/* Positioning eyebrow ("AI-native hackathons · Sapporo and beyond"); one line on phones, so the hero height is unchanged. */}
            <p className="flex items-center gap-3 whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-100/80 sm:text-sm sm:tracking-[0.3em]">
              <span>{t("eyebrow")}</span>
              <span aria-hidden className="hidden h-px w-8 bg-sky-100/40 sm:inline-block" />
              <span lang="ja" className="hidden font-[family-name:var(--font-mincho)] text-base normal-case tracking-[0.3em] text-white sm:inline sm:text-xl">
                雪かき
              </span>
            </p>
            <h1 aria-label={t("wordmarkLabel")} className={`yk-wordmark${pixel ? " yk-wordmark--pixel" : ""} relative mt-2 text-white sm:mt-3`}>
              <span aria-hidden>Yukikaki</span>
              <svg aria-hidden viewBox="0 0 400 24" preserveAspectRatio="none" className="absolute -bottom-[0.14em] left-[2%] h-[0.16em] w-[96%]" fill="none">
                <defs>
                  <linearGradient id="yk-stroke" x1="0" x2="1">
                    <stop offset="0" stopColor="#a9c8de" stopOpacity="0.15" />
                    <stop offset="0.45" stopColor="#a9c8de" stopOpacity="0.85" />
                    <stop offset="1" stopColor="#e9a23b" />
                  </linearGradient>
                </defs>
                <path d="M4 16 C 90 6, 230 4, 396 12" stroke="url(#yk-stroke)" strokeWidth="7" strokeLinecap="round" />
              </svg>
            </h1>
          </div>
          <h2 className="mt-7 text-balance text-2xl font-bold leading-tight tracking-tight sm:mt-9 sm:text-4xl">{t("title")}</h2>
          <p className="yk-phrase mx-auto mt-3 max-w-2xl text-balance text-base text-sky-100 sm:text-xl">{t("subtitle")}</p>

          <div className="mt-7 sm:mt-8">
            <HeroSearch locale={lang} />
          </div>

          {/* Value strip: what Yukikaki does, in three pills. */}
          <ul aria-label={t("valueStrip.label")} className="mx-auto mt-4 flex max-w-3xl flex-wrap items-center justify-center gap-2 text-sm">
            {(["find", "prep", "grants"] as const).map((k) => (
              <li
                key={k}
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-left font-medium text-white backdrop-blur-sm"
              >
                <span aria-hidden className="h-2 w-2 shrink-0 bg-lantern" />
                {t(`valueStrip.${k}`)}
              </li>
            ))}
          </ul>

          {(facets.skills.length > 0 || facets.cities.length > 0) && (
            <div className="mx-auto mt-4 flex max-w-3xl flex-wrap items-center justify-center gap-2 text-sm">
              <span className="mr-1 text-slate-300">{t("quickFilters")}:</span>
              {facets.skills.map((s) => (
                <Link
                  key={`s-${s}`}
                  href={{ pathname: "/challenges", query: { skill: s } }}
                  className="rounded-full border border-white/20 bg-night/60 px-3 py-1 text-sky-50 backdrop-blur-sm transition hover:border-lantern hover:bg-white/10"
                >
                  {tc.has(`skills.${s}`) ? tc(`skills.${s}`) : s}
                </Link>
              ))}
              {facets.cities.map((c) => (
                <Link
                  key={`c-${c}`}
                  href={{ pathname: "/challenges", query: { city: c } }}
                  className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-night/60 px-3 py-1 text-sky-50 backdrop-blur-sm transition hover:border-lantern hover:bg-white/10"
                >
                  <span aria-hidden className="text-xs">📍</span>
                  {cityLabel(c, lang)}
                </Link>
              ))}
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/interview"
              className="inline-flex items-center gap-2 rounded-full bg-white/95 px-5 py-2 text-sm font-semibold text-night transition hover:bg-sky-50"
            >
              {t("ctaProblem")} <span aria-hidden>→</span>
            </Link>
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-night/50 px-5 py-2 text-sm font-semibold text-white backdrop-blur-sm transition hover:border-white hover:bg-white/10"
            >
              {t("ctaTowns")}
            </Link>
          </div>
        </div>
        <a
          href="#party-demo"
          className="absolute bottom-[calc(9.5vw+1.5rem)] left-4 z-10 hidden max-w-[15rem] rounded-2xl border border-lantern/60 bg-night/75 p-4 text-left text-white shadow-xl backdrop-blur-md transition hover:border-lantern lg:block xl:left-10"
        >
          <span className="inline-block rounded-sm bg-lantern px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-night">{lang === "ja" ? "近日公開" : "Coming soon"}</span>
          <span className="mt-2 block text-sm font-bold leading-snug">{lang === "ja" ? "どんなチームでも大丈夫。足りない役はAIの仲間が埋めます。" : "Bring any team. AI teammates fill the missing roles."}</span>
          <span aria-hidden className="mt-2 block text-lg tracking-widest">🤖🤖🤖</span>
          <span className="mt-1 block text-xs text-sky-100/80">{lang === "ja" ? "プレビューを見る ↓" : "Try the preview ↓"}</span>
        </a>
        {testimonials[0] && (
          <HeroQuoteBar
            quote={testimonials[0].quote}
            lang={hasJapanese(testimonials[0].quote) ? "ja" : undefined}
            byline={`${testimonials[0].businessName} · ${cityLabel(testimonials[0].city, lang)} · ${"★".repeat(testimonials[0].satisfaction)}${testimonials[0].isDemo ? ` (${tc("demoData")})` : ""}`}
          />
        )}
        {/* On phones the pixel scene's shoveller stands right at the bottom edge; keep the bank low there. */}
        <SnowbankEdge className={`absolute inset-x-0 bottom-0 ${pixel ? "h-5" : "h-8"} sm:h-20`} />
      </section>

      {/* ── WHY: one headline, two sentences ─────────────────────────── */}
      <section aria-labelledby="why" className="mx-auto mt-14 max-w-2xl text-pretty text-center">
        <h2 id="why" className="text-balance text-2xl font-bold tracking-tight text-ink [word-break:auto-phrase] sm:text-3xl">
          {t("needsLead")}
        </h2>
        <p className="mt-3 text-base leading-relaxed text-muted [word-break:auto-phrase] sm:text-lg">{t("needs")}</p>
      </section>

      <PathDivider />

      {/* ── HOW IT WORKS, shown not listed: the interactive kitchen, then the formats harness ── */}
      <KitchenQuest
        copy={{
          title: t("kitchenQuest.title"),
          lead: t("kitchenQuest.lead"),
          steps: t.raw("kitchenQuest.steps") as KitchenQuestStep[],
          next: t("kitchenQuest.next"),
          back: t("kitchenQuest.back"),
          stepLabel: t.raw("kitchenQuest.stepLabel") as string,
          goTo: t.raw("kitchenQuest.goTo") as string,
          doesLabel: t("kitchenQuest.doesLabel"),
          play: t("kitchenQuest.play"),
          pause: t("kitchenQuest.pause"),
          sceneAlt: t("kitchenQuest.sceneAlt"),
          loop: t("kitchenQuest.loop"),
        }}
      />

      <FormatsHarness />

      {/* ── PROOF: live challenges, hours given back, owners' words ─── */}
      {challenges.length > 0 && (
        <section aria-labelledby="on-the-path" className={`${fullBleed} pt-20`}>
          <div className="mx-auto mb-6 flex max-w-6xl flex-wrap items-end justify-between gap-4 px-4 sm:px-6">
            <div>
              <h2 id="on-the-path" className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{t("marqueeTitle")}</h2>
              <p className="mt-2 max-w-xl text-muted">{t("marqueeSubtitle")}</p>
            </div>
            <div className="flex items-center gap-4">
              <MarqueePause target="challenge-marquee" pauseLabel={t("marqueePause")} playLabel={t("marqueePlay")} />
              <Link href="/challenges" className="text-sm font-semibold text-frost hover:underline">
                {t("marqueeAll")} →
              </Link>
            </div>
          </div>
          <ChallengeMarquee items={challenges} lang={lang} label={t("marqueeLabel")} />
        </section>
      )}

      {/* Proof only when there is some: a "0 h/week" stat reads as anti-proof. */}
      {hours > 0 && (
        <section className="mx-auto mt-16 max-w-3xl">
          <div className="yk-snow-texture relative overflow-hidden rounded-3xl border border-line bg-surface px-6 py-10 text-center sm:px-10">
            <p className="text-sm font-medium text-muted">{t("statLabel")}</p>
            <p className="mt-3 text-6xl font-bold tracking-tight text-ink sm:text-7xl" data-testid="hours-saved">
              <CountUp value={hours} />
              <span className="ml-2 text-xl font-medium text-muted sm:text-2xl">{t("statUnit")}</span>
            </p>
            <p className="mt-3 text-xs text-muted">{t("statNote")}</p>
          </div>
        </section>
      )}

      {testimonials.length > 0 && (
        <div className="mt-20">
          <Testimonials items={testimonials.slice(0, 2)} lang={lang} />
        </div>
      )}

      {/* ── WHAT'S COMING: roadmap + party-builder preview + one waitlist ── */}
      <div className="h-20" />
      <PartyBuilder />

      {/* ── CLOSING ──────────────────────────────────────────────────── */}
      <section className="mb-20 mt-20 rounded-3xl bg-ice px-6 py-12 text-center sm:px-12">
        <h2 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{t("closingTitle")}</h2>
        <p className="mx-auto mt-3 max-w-xl text-muted">{t("closingBody")}</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link href="/interview" className="inline-flex items-center gap-2 rounded-full bg-lantern px-6 py-3 font-semibold text-lantern-ink transition hover:bg-lantern-hover">
            {t("ctaProblem")} <span aria-hidden>→</span>
          </Link>
          <Link href="/admin" className="inline-flex items-center rounded-full border border-ice-strong bg-surface px-6 py-3 font-semibold text-ink transition hover:border-frost">
            {t("ctaTowns")}
          </Link>
        </div>
      </section>
    </div>
  );
}

const hasJapanese = (s: string) => /[\u3040-\u30ff\u3400-\u9fff]/u.test(s);

async function Testimonials({ items, lang }: { items: Testimonial[]; lang: "en" | "ja" }) {
  const t = await getTranslations("landing");
  const tc = await getTranslations("common");
  return (
    <section aria-labelledby="voices">
      <div className="max-w-2xl">
        <h2 id="voices" className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{t("testimonialsTitle")}</h2>
        <p className="mt-2 text-sm text-muted">{t("testimonialsNote")}</p>
      </div>
      <div className={`mt-10 grid gap-5 ${items.length > 1 ? "md:grid-cols-2" : "max-w-3xl"}`}>
        {items.map((x) => (
          <figure key={x.id} className="relative flex flex-col rounded-3xl border border-line bg-surface p-7 sm:p-9">
            <span aria-hidden className="absolute left-6 top-3 font-serif text-6xl leading-none text-ice-strong">“</span>
            <blockquote lang={hasJapanese(x.quote) ? "ja" : undefined} className="mt-6 text-lg leading-relaxed text-ink sm:text-xl">
              {x.quote}
            </blockquote>
            {lang === "en" && hasJapanese(x.quote) && <p className="mt-2 text-xs text-muted">{t("originalJa")}</p>}
            <figcaption className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-5 text-sm">
              <span>
                <span className="font-bold text-ink">{x.businessName}</span>
                <span className="text-muted"> · {cityLabel(x.city, lang)} · {industryLabel(x.industry, lang)}</span>
              </span>
              <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900">
                {t("hoursSaved", { n: x.hoursSavedPerWeek })}
              </span>
              <span role="img" aria-label={t("satisfaction", { n: x.satisfaction })} className="tracking-wider text-lantern">
                {"★".repeat(x.satisfaction)}
                <span className="text-line">{"★".repeat(5 - x.satisfaction)}</span>
              </span>
              {x.isDemo && (
                <span className="rounded-full border border-dashed border-ice-strong px-2.5 py-0.5 text-xs text-muted">{tc("demoData")}</span>
              )}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
