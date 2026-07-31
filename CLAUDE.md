# CLAUDE.md
Project memory file — place at repository root. Claude Code reads this automatically.

## Project
LRI Model UN 10.0 — single landing page for the 10th anniversary edition of LRI School's Model United Nations conference (Kalanki, Kathmandu). Audience: prospective delegates, parents, school administration. Student-run, but must read as a polished, prestige, gala-tier event page — not a school club flyer.

## Non-negotiable design tokens
Do not alter these without explicit instruction.

Revised twice on explicit instruction. Magenta measured #B41884 in the school
crest (27% of non-ground pixels) and #B42484 in the MUN emblem — it is the
genuine shared brand colour and is the anchor. The dark ground is a deep
plum-wine pulled from the crest's own shield: the magenta taken down, not a
different hue introduced. The page is LIGHT-DOMINANT — warm white and lotus
pink alternate, and only the hero foot band, the registration panel and the
footer are dark.

- Primary: #B41884 (LRI Magenta, sampled from both marks)
- Primary Dark: #8A1268
- Primary Tint: #F7DCEE (lotus pink)
- Blush (alternating light ground): #FDF4F9
- Paper (light bg): #FAF7F3
- Ink (dark blocks): #2B0A21 deep plum-wine
- Ink Raised (cards on plum): #3D1030
- Accent Gold (anniversary marker only, use sparingly): #D9A441
- Gold Light ("white gold", hairlines + small text on plum): #F0D9A8
- Royal (crest lettering blue — LIGHT grounds only, rare): #243C84
- Text on light: #1E1018 / Text on dark: #FBF4EF
- Border/hairline: #EADFE6
- Display serif: Fraunces (variable, opsz + WONK; self-hosted, latin subset)
- UI sans: General Sans (static 400/500/600 — no public variable build)

Four colour rules are enforced and documented with measured ratios at the top
of `src/styles/tokens.css`:
1. On plum, text is text-inverse, gold or white-gold — never magenta (2.9:1)
   and never royal (1.8:1). Magenta appears on plum only as a fill or a wash.
2. On light grounds, gold is decorative only (2.1:1) and always aria-hidden.
3. On magenta, text is text-inverse at full alpha; gold is never text there.
4. Royal blue is a light-ground colour only, used sparingly.

## Ground sequence
dark → light → dark → light → LOUD → dark: hero plum, committees paper,
secretariat plum, editions blush, registration MAGENTA (the one saturated
ground, at the conversion point), footer plum. Hard cuts, no gradient bleeds.
Each ground publishes `--accent-on-ground` (gold on plum 7.99:1, magenta on
light 5.78:1) and `--border-interactive`. Sections must read those, never a
literal — a hardcoded `--color-text-primary` on a plum ground is 1.02:1.

## The seal — the anniversary mark
The X and the emblem are ONE object. `assets/wreath.svg` (laurel line art,
open at the crown) is inlined in the hero and frames a typeset Fraunces X.
The emblem PNG is used ONLY at small scale (nav, footer, preloader, favicon).
The emblem never rotates, never tilts, never crops, and never appears large as
a low-opacity watermark. Do not draw the X by hand — typeset it.

## Anchor scrolling
Sections land FLUSH with the viewport top — no nav-height offset. Pass Lenis a
number, never an element (given an element it also applies
`scroll-padding-top`, double-counting the bar). `scroll-padding-top: 0`.

## The nav is persistent
It never hides on scroll-down. An anchor jump is itself a downward scroll, so
hide-on-scroll made the bar disappear the moment you used it, and it took the
Register CTA with it for most of the session. Do not reintroduce `.is-tucked`.
Scrollspy keeps a Set of what is in the middle band and re-derives the marker
from it, so `aria-current` CLEARS when no linked section is there (top of page,
registration panel) rather than stranding the last one.

## Reveal language — one system, five modules
Every scroll reveal on the page uses the same four numbers: start `top 94%`,
travel 26px (`--reveal-y`), duration ~1.2s, `expo.out`, stagger ~0.075. Starting
at 85% with 14px of travel is what made text read as "appearing out of nowhere":
the element sat visibly empty for a beat, then switched on, because 14px is
below the distance the eye reads as movement. Section titles do not fade at all
— `splitWords()` in main.js wraps each word in a `.mask-word` and they rise out
from behind it, so the line assembles left to right. Keep the literal space
text nodes between masks; they are what preserves `textContent` and word
boundaries for assistive tech.

## Signature interaction — "The Mount"
A 1px hairline frame that draws itself clockwise around a control, sitting just
outside the plate. Four arms, each scaled along its own long axis so the 1px
thickness is never scaled. Gold on dark grounds and magenta fills; MAGENTA on
light grounds, where it is the only state indicator and must clear 3:1. Resting
state is two corner ticks, which is also the touch affordance. Implemented in
`base.css` §6; reuse it rather than inventing new hover treatments.

## Stack
Default: Vite + vanilla HTML/CSS/JS + GSAP (ScrollTrigger) + Lenis for smooth scroll. Reason: single static landing page, portable for embedding into the school's existing CMS, no framework overhead needed. Switch to Next.js + Tailwind + Framer Motion only if the project scope expands to multiple pages/routes — do not switch without confirming first.

## Folder structure

```
/
├── index.html
├── src/
│   ├── main.js
│   ├── styles/
│   │   ├── tokens.css          # CSS custom properties: colors, type scale, spacing
│   │   ├── base.css
│   │   └── sections/           # one file per section module
│   └── modules/
│       ├── nav.js
│       ├── hero.js
│       ├── committees.js
│       ├── oc.js
│       ├── gallery.js
│       └── footer.js
├── assets/
│   ├── hero-bg.mp4
│   ├── lri-mun-logo.svg
│   ├── school-logo.svg
│   ├── icons/
│   ├── oc/
│   ├── past-galleries/
│   └── fonts/
└── CLAUDE.md
```

Notes on structure:
- `src/styles/` and `src/modules/` are both direct children of `src/`, as siblings — not nested inside each other.
- `styles/sections/` holds one CSS file per landing-page section (hero.css, nav.css, committees.css, oc.css, gallery.css, footer.css), matching the JS modules in `src/modules/` one-to-one.
- `assets/` is a direct child of the project root, a sibling of `src/`, not nested inside it.

## Conventions
- CSS: custom properties for all colors/spacing/type — no hardcoded hex values outside tokens.css.
- JS: ES modules, one module per section, no global scope pollution.
- Animation: transform/opacity only for scroll-triggered motion; GPU-accelerated; respect prefers-reduced-motion.
- Images/video: lazy-load everything below the fold; hero video needs a poster fallback and preload="metadata".
- Accessibility: semantic landmarks (nav, main, section[aria-label]), visible focus states, alt text on every image (placeholder text flagged as TODO if real copy isn't available), keyboard-operable carousel/slider.
- Never fabricate real content (names, dates, testimonials, sponsor names). Use clearly marked placeholders and flag them at the end of output.

## Explicitly avoid ("AI slop" patterns)
- Centered-icon-in-rounded-square feature cards
- Uniform 3-column Bootstrap-style grids with identical card shadows
- Default purple-to-blue gradients
- Generic Unsplash-style stock hero collages
- Bouncy/elastic easing on content reveals (reserve for micro-interactions only)
- Hamburger-in-a-box mobile nav with no distinct treatment

## Commands
- `npm run dev` — local dev server
- `npm run build` — production build
- `npm run preview` — preview production build locally

## Definition of done
Lighthouse Performance >= 90 and Accessibility >= 95 (mobile + desktop), verified at 375/768/1024/1280/1440px, no console errors, all external links use rel="noopener noreferrer", all placeholders listed in final output.
