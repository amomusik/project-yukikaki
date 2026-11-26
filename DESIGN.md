---
name: Project Yukikaki
description: AI-native hackathons for Sapporo and beyond.
colors:
  snow: "#f6f9fc"
  surface: "#ffffff"
  ice: "#e4eef7"
  ice-strong: "#a9c8de"
  frost: "#386a91"
  night: "#0c1a2b"
  night-2: "#16304b"
  hero-sky: "#041a40"
  lantern: "#e9a23b"
  lantern-hover: "#f2b457"
  lantern-ink: "#2b1a02"
  ink: "#0f1d2c"
  muted: "#52667b"
  line: "#d9e4ee"
  dark-snow: "#08131f"
  dark-surface: "#0f1f31"
  dark-ice: "#142c44"
  dark-frost: "#8fbbe0"
  dark-lantern: "#f0b04f"
  dark-ink: "#e6eef6"
  dark-muted: "#9db1c5"
  dark-line: "#1d3550"
  dark-lantern-hover: "#f6c372"
  lantern-deep: "#c9862c"
  lantern-bright: "#ffd27a"
  pixel-rim: "#e9eef7"
  pixel-ink: "#0b1a33"
  robot-visor: "#38bdf8"
typography:
  wordmark:
    fontFamily: "Hiragino Sans, Hiragino Kaku Gothic ProN, Noto Sans JP, Yu Gothic, system-ui, sans-serif"
    fontSize: "clamp(3.5rem, 10vw, 8rem)"
    fontWeight: 800
    lineHeight: 0.92
    letterSpacing: "-0.045em"
  display:
    fontFamily: "Hiragino Sans, Hiragino Kaku Gothic ProN, Noto Sans JP, Yu Gothic, system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Hiragino Sans, Hiragino Kaku Gothic ProN, Noto Sans JP, Yu Gothic, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  headline-sm:
    fontFamily: "Hiragino Sans, Hiragino Kaku Gothic ProN, Noto Sans JP, Yu Gothic, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.25
  title:
    fontFamily: "Hiragino Sans, Hiragino Kaku Gothic ProN, Noto Sans JP, Yu Gothic, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.4
  body:
    fontFamily: "Hiragino Sans, Hiragino Kaku Gothic ProN, Noto Sans JP, Yu Gothic, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.65
    fontFeature: "\"palt\" 1"
  body-sm:
    fontFamily: "Hiragino Sans, Hiragino Kaku Gothic ProN, Noto Sans JP, Yu Gothic, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
  body-dialog:
    fontFamily: "Hiragino Sans, Hiragino Kaku Gothic ProN, Noto Sans JP, Yu Gothic, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontFamily: "Hiragino Sans, Hiragino Kaku Gothic ProN, Noto Sans JP, Yu Gothic, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.4
  caption:
    fontFamily: "Hiragino Sans, Hiragino Kaku Gothic ProN, Noto Sans JP, Yu Gothic, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 700
    lineHeight: 1.3
  mincho-accent:
    fontFamily: "Hiragino Mincho ProN, Yu Mincho, YuMincho, Noto Serif JP, Shippori Mincho, serif"
    fontSize: "1.25rem"
    fontWeight: 600
    letterSpacing: "0.3em"
rounded:
  pixel: "0px"
  sm: "4px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  2xl: "24px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  section: "80px"
components:
  button-primary:
    backgroundColor: "{colors.lantern}"
    textColor: "{colors.lantern-ink}"
    rounded: "{rounded.full}"
    padding: "12px 24px"
  button-primary-hover:
    backgroundColor: "{colors.lantern-hover}"
  button-hero-light:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.night}"
    rounded: "{rounded.full}"
    padding: "8px 20px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    padding: "12px 24px"
  button-signin:
    backgroundColor: "{colors.night}"
    textColor: "{colors.surface}"
    rounded: "{rounded.full}"
    padding: "6px 16px"
  input-search-hero:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    height: "52px"
  chip-skill:
    backgroundColor: "{colors.ice}"
    textColor: "{colors.frost}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.2xl}"
    padding: "24px"
  pixel-frame:
    backgroundColor: "{colors.night}"
    rounded: "{rounded.pixel}"
    padding: "6px"
---

# Design System: Project Yukikaki

## Overview

**Creative North Star: "Clear the Path"**

雪かき (yukikaki) is shoveling snow: someone clears the path before anyone else gets through. Every screen should feel like that path on a winter night in Sapporo. The page is quiet and cold (snow, ice, navy). One warm lantern-amber thing on each screen tells you where to go next. The 8-bit pixel hero (a kid shoveling a path to a lit hall where builders arrive) carries the story, and the interactive pieces (kitchen quest, formats harness, party builder) use the same pixel language. Operational pages (events, challenges, grants, admin) stay calm, readable and plain. The brand lives in small details there: the palette, the snow grain and the lantern focus ring.

Audience: host towns and city staff (hosts), small-business owners with an everyday problem (owners), student and professional builders (builders), and sponsors. Everyone uses both Japanese and English. JA is not a translation layer: it gets its own line breaks, phrasing and type settings. English is the default locale.

Voice: short, plain, confident and warm. Lead with the action or the benefit. No jargon walls: if a Japanese business term matters (nemawashi, 根回し), use it once and in context. Every section is one headline, at most two sentences and a visual. Fixed terms: **challenge** (a problem once it is public; not "brief"), **owner** (the business with the problem), **builder** (whoever builds; never "student" in UI copy), **host** (the person or town running the event; JA 主催者). "Bring a problem" is the owner's action everywhere.

**Key Characteristics:**
- Winter palette: snow, ice and night navy, with lantern amber for the next action only.
- 8-bit pixel art and steps() motion for story pieces; soft, quiet UI everywhere else.
- Bilingual by construction: JA phrase-aware line breaks, no faux italics on CJK.
- Search is the primary action in the hero and stays above the fold at 1440×900 and 390×844.
- Robots, never ghosts: AI helpers are drawn as friendly robots.

## Colors

A cold, low-chroma winter field with a single warm accent. Tokens live in `app/globals.css` as CSS variables (`--snow`, `--ice`, …) exposed to Tailwind as `bg-snow`, `text-frost` and so on. Dark mode swaps the values under `prefers-color-scheme: dark` (the `dark-*` tokens above).

### Primary
- **Lantern Amber** (lantern): the one thing to do next. Primary CTAs, the search button, active pixel hotspots and the focus ring. Text on it is always lantern-ink.

### Secondary
- **Lantern Deep / Bright** (lantern-deep, lantern-bright, dark-lantern-hover): pixel-only amber steps for idle, active and hover hotspots and pips.
- **Frost Blue** (frost): links, secondary emphasis and skill-chip text on ice. On night backgrounds use `sky-200` or `dark-frost`, never frost (3.5:1 fails).

### Neutral
- **Fresh Snow** (snow): page background.
- **Surface White** (surface): cards and inputs.
- **Pale Ice** (ice) / **Packed Ice** (ice-strong): tinted panels, chips, lines and the swept-path divider.
- **Night Navy** (night, night-2, hero-sky): hero, footer and dark story sections. `hero-sky` matches the pixel art's sky so the art meets the section without a seam.
- **Ink** (ink) / **Muted Slate** (muted) / **Frost Line** (line): body text, secondary text, borders. Secondary text is always `text-muted` (it adapts to dark mode), never `text-slate-500` (3.7:1 on dark).

### Named Rules
**The One Lantern Rule.** At most one lantern-amber control per viewport region. If two things are amber, one of them is wrong.

**The No-Violet Rule.** Generated surfaces (event covers, avatars, gradients) stay inside the winter palette. Violet, fuchsia and rose gradients belong to other products.

## Typography

**Body Font:** Hiragino Sans (with Hiragino Kaku Gothic ProN, Noto Sans JP, Yu Gothic, system-ui)
**Accent Font:** Hiragino Mincho ProN (with Yu Mincho, Noto Serif JP) for 雪かき only
**Pixel/Mono:** ui-monospace, only inside pixel UI (step labels, hotspot numbers, party tags)

**Character:** One Japanese-first gothic family for both scripts keeps EN and JA on the same rhythm. The mincho accent is a seal, not a voice.

### Hierarchy
- **Wordmark** (800, clamp(3.5rem, 10vw, 8rem), 0.92): "Yukikaki" in the hero only, with the two-step pixel drop shadow.
- **Display** (700, 1.5rem → 2.25rem, 1.25): the hero h2 "Your test kitchen for ideas and prototypes." Once per site.
- **Headline** (700, 1.5rem → 1.875rem, 1.2): section h2s and page h1s.
- **Title** (700, 1.125rem): card and step titles.
- **Body** (400, 1rem, 1.65; 0.875rem in cards): keep measure at 65–75ch (`max-w-2xl`/`max-w-3xl`).
- **Label** (600, 0.75rem): badges and meta.
- **Caption** (700, 0.6875rem = 11px): pixel tags, calendar month, avatar initials. **This is the floor.** Nothing functional is smaller.

### Named Rules
**The Phrase Break Rule.** JA headings and lead lines use `word-break: auto-phrase` (globals.css sets it for h1–h3 and `.yk-phrase`); body uses `line-break: strict` and `palt`.

**The No Eyebrow Rule.** No kicker or eyebrow above a heading. The one exception is the hero's tagline line above the wordmark, which is the brand line itself.

**The Upright CJK Rule.** Never italicize Japanese. CJK fonts ship no italic, so the browser fakes a slant.

## Layout

Content sits in a centered 72rem (`max-w-6xl`) column with 16px/24px gutters. Story sections break out full-bleed (`left-1/2 w-screen -translate-x-1/2`). Sections are separated by 80px (`pt-20`) or the animated swept-path divider. The landing tells one story in this order: hero (what it is) → why (one headline, two sentences) → how (kitchen quest, formats harness) → proof (live challenges, hours given back, two owner quotes) → what's coming (roadmap, party builder, one waitlist) → act (closing CTAs).

The pixel hero is sized from the art (2400×1347, H = 56.14vw at full bleed). globals.css keeps the text stack above the hall's roof line and drops optional rows (quick-filter chips, the duplicate eyebrow) on short viewports, so the search stays above the fold. Anything floating over the art must clear the shoveller (bottom ~9.5vw at the left), e.g. the AI-teammates teaser sits at `bottom: calc(9.5vw + 1.5rem)`.

Header navigation has at most five items: Events, Challenges, Grants, then this visitor's one action (Bring a problem or My page), and Admin for hosts.

## Elevation & Depth

Mostly flat, with tonal layering (snow → surface → ice) and 1px lines. Cards rest with `shadow-sm` and lift on hover (`shadow-md`/`shadow-lg` plus a 2px rise). Inside the pixel world, depth is the 8-bit frame: a two-tone ring (night/rim) and a soft offset block shadow (`8px 12px 0 8px rgb(11 26 51 / 0.18)`), the one place a zero-blur shadow is part of the world.

### Named Rules
**The Pixel-Only Hard Shadow Rule.** Zero-blur offset shadows appear only on pixel components (`.kq-*`, `.yk-party-frame`, the wordmark). Never on ordinary cards or buttons.

## Shapes

UI is soft and round: pill buttons and chips (`rounded-full`), 12px inputs, 16–24px cards and panels. The pixel world is square: 0 radius, `image-rendering: pixelated`, `shape-rendering: crispEdges`, diamonds and plus-shaped flakes.

## Components

### Buttons
- **Shape:** pills (9999px).
- **Primary:** lantern on lantern-ink, 12px × 24px, for the single next action ("Bring a problem", search).
- **Hero light / outline:** white-on-night pill and translucent outline pill for the two hero CTAs.
- **Secondary:** surface with ice-strong border.
- **Focus:** 2px lantern outline at 2px offset everywhere (`:focus-visible`).
- **Targets:** at least 24×24 CSS px (WCAG 2.5.8); aim for 44px on primary touch controls.

### Chips
- **Skill chips:** ice background, frost text, pill. Always show the translated skill label (`common.skills.*`), never the raw key.
- **Status / format pills:** tinted background with matching dark text; format colors stay in the winter range.

### Cards / Containers
- **Corner Style:** 16–24px.
- **Background:** surface on snow; night-2 inside dark sections.
- **Border:** 1px line; hover border frost or ice-strong.
- **Internal Padding:** 20–28px.

### Inputs / Fields
- **Style:** surface, 1px slate/line border, 8–12px radius. Placeholder ≥4.5:1 (`slate-500` light, `slate-400` dark).
- **Focus:** sky border plus a soft ring; the hero search uses the lantern ring and a one-shot "shovel sweep".
- **Errors:** name the problem and the fix, next to the field.

### Navigation
- Sticky snow header with backdrop blur, the 雪 mark, wordmark and tagline. Links are muted pills that tint ice on hover. Mobile collapses into a sheet plus a bottom action bar (search, bring a problem).

### Pixel story components
- **Kitchen quest, formats harness, party builder:** square pixel frames, steps() animation, a play/pause control, keyboard-operable hotspots. Robots only.
- **Hero quote bar:** floating testimonial footer pinned to the viewport bottom on load; hides on the first scroll and returns at the top. Upright type for JA quotes; byline at full sky-100 on a strong night scrim.

### Motion
- Pixel motion uses `steps()` (snow 5 fps, sprites 2-frame). UI motion uses exponential ease-out (`cubic-bezier(0.16, 1, 0.3, 1)`), 150–300ms for state, ≤800ms for one authored focal moment. No bounce or elastic easing.
- Everything that moves for more than 5 seconds has a pause (marquee button, kitchen quest pause) and stops under `prefers-reduced-motion`. Reduced motion keeps state changes visible (opacity/colour) and removes travel.

## Do's and Don'ts

### Do:
- **Do** keep search as the hero's primary action and check it above the fold at 1440×900 and 390×844 after any hero change.
- **Do** use `text-muted` for secondary text and tokens (`bg-surface`, `border-line`) instead of raw slate/white, so dark mode holds.
- **Do** show localized labels for every stored key (city, industry, skill) through `cityLabel`, `industryLabel` and `common.skills.*`.
- **Do** write one headline and at most two sentences per section, in both languages, and read the JA aloud before shipping.
- **Do** say why on every sign-in wall (what the visitor can do after signing in).
- **Do** run `pnpm design:check` before a PR and update this file when the brand changes.

### Don't:
- **Don't** add eyebrows or kickers above headings, or a second "Your test kitchen…" line anywhere (it appears once, as the hero h2).
- **Don't** put text smaller than 11px on anything functional.
- **Don't** use frost (#386a91) text on night; use sky-200 or dark-frost.
- **Don't** cover the shoveller or the hall in the hero art with floating UI.
- **Don't** use bounce/elastic easing, infinite motion without a pause control, or motion that ignores reduced-motion.
- **Don't** draw AI as ghosts; draw robots.
- **Don't** use emoji as an icon system in product UI (use lucide-react or authored pixel sprites). The hero teaser's 🤖 row is the one sanctioned brand flourish.
