# LRI Model UN 10.0 — landing page

Single-page site for the tenth edition of LRI School's Model United Nations
conference (Kalanki, Kathmandu). Static, no framework runtime, built so the
output can be dropped into the school's existing CMS.

---

## Commands

```bash
npm install      # once
npm run dev      # local dev server → http://localhost:5173
npm run build    # production build → dist/
npm run preview  # serve dist/ locally to check the real build
```

**Stack:** Vite + vanilla HTML/CSS/JS + GSAP (ScrollTrigger) + Lenis.

Chosen over Next.js for two reasons: the deliverable is one static document
that has to survive being injected into an existing CMS template (a framework
runtime and hydration boundary do not paste), and there is no data layer and no
second route. If yearly archive pages are ever added they become sibling static
pages via Vite's multi-page input — no migration of this code.

### Deploying under a sub-path

`vite.config.js` sets `base: '/'`. If the page is served from something like
`school.edu.np/mun/`, change `base` to `'/mun/'` and rebuild; every asset URL
follows automatically.

---

## File tree

```
/
├── index.html                  # all authored markup: nav, hero, committees,
│                               # registration, footer
├── package.json
├── vite.config.js              # + inline plugin that mirrors assets/ into dist/
├── src/
│   ├── main.js                 # entry: styles, motion context, module boot,
│   │                           # anchor scroll, shared reveal batch
│   ├── styles/
│   │   ├── tokens.css          # colour, type scale, space, motion, z-index
│   │   │                       # + the measured contrast contract
│   │   ├── base.css            # @font-face, reset, focus, grid, buttons, tags
│   │   └── sections/
│   │       ├── nav.css         ├── hero.css      ├── committees.css
│   │       ├── oc.css          ├── gallery.css   └── footer.css
│   └── modules/
│       ├── nav.js              # glass state, scrollspy, overlay + focus trap
│       ├── hero.js             # load choreography, foil sweep, ribbon, parallax
│       ├── committees.js       # rail keyboard contract, arrows, progress
│       ├── oc.js               # roster data + render
│       ├── gallery.js          # archive data, filter, row-span masonry
│       └── footer.js           # year, registration reveal, back-to-top
└── assets/
    ├── lri-mun-logo.png        ├── school-logo.png
    ├── icons/                  ├── oc/
    ├── past-galleries/         └── fonts/
```

Two structural notes:

- **The registration block ships inside `footer.js` / `footer.css`.** It is one
  CTA panel sharing the footer's ground and its outbound form link; a seventh
  module for it would be structure for its own sake.
- **`assets/` is a root sibling of `src/`, not Vite's `publicDir`.** Dev serves
  it natively; the build mirrors it via a ten-line plugin in `vite.config.js`.

---

## Where to drop the real assets

Each folder has its own README with filenames and specs:

| Path | What goes in | Notes |
| --- | --- | --- |
| ~~`assets/hero-bg.mp4`~~ | **No longer used** | The hero is now type-first — see below. |
| ~~`assets/hero-poster.jpg`~~ | **No longer used** | " |
| `assets/lri-mun-logo.png` | LRI MUN emblem | Supplied. Cropped + downscaled to 512px, 45 KB. |
| `assets/school-logo.png` | LRI School crest | Supplied. Cropped + downscaled to 256px, 95 KB. |
| `assets/icons/` | 6 committee icons | `unsc · unhrc · disec · ecosoc · who · hcc`.svg, 24×24 line art. |
| `assets/oc/` | 16 headshots | See `assets/oc/README.md`. |
| `assets/past-galleries/` | 9 photos, one per `edition-01/` … `edition-09/` | See that folder's README. |
| `assets/fonts/` | Supplied — Fraunces variable + General Sans 400/500/600 | See that folder's README. |

### The hero no longer uses a video

The hero is type-first: warm white, no imagery above the fold, the headline
itself as the LCP element. That was a deliberate change — it is the single
biggest performance lever available (nothing above the fold waits on a network
request), it makes 375px trivial rather than a fight, and it removes a
dependency on footage that did not exist. `hero-bg.mp4` and `hero-poster.jpg`
are no longer referenced anywhere. If you want the video back, say so — it is a
design decision, not a technical limit.

**Nothing breaks while these are missing.** Headshots and gallery frames fall
back to gold monogram/edition plates. Fonts and both logos are now supplied, so
the only outstanding media are the OC headshots and the nine edition
photographs — and the console is clean either way.

---

## Placeholder inventory

Everything below is fake and must be replaced before launch. Every one is
marked `PLACEHOLDER` or `TODO` in the source.

### Links — 6 occurrences

| What | Where | Current value |
| --- | --- | --- |
| Google Form | `index.html` — nav CTA, overlay CTA, hero CTA, registration CTA (**4×**) | `https://forms.gle/PLACEHOLDER` |
| Instagram | `index.html` — footer, gallery `<noscript>` (**2×**) | `https://www.instagram.com/PLACEHOLDER` |

### Contact — 4 occurrences

`index.html`: `placeholder@example.org` in the nav overlay, the OC
`<noscript>`, and the footer address; `tel:+000000000000` in the footer.

### Conference facts

| Field | Where | Current value |
| --- | --- | --- |
| Dates | `index.html` hero facts | "To be announced" |
| Registration deadline | `index.html` `.register__note` | "Deadline to be announced" |
| Delegate fee | `index.html` `.register__facts` | "To be announced" |
| Eligibility | `index.html` `.register__facts` | "To be announced" |
| Delegation policy | `index.html` `.register__facts` | "Individual and school delegations" |

### Committees — `index.html`, committee rail

The six bodies and the one-line description of what each does are factual. These
are **not** and need OC sign-off:

- **Seat counts** — 15 / 40 / 60 / 45 / 50 / 20 are invented numbers.
- **Difficulty tags** — Beginner / Intermediate / Advanced were assigned by us.
- **Agendas** — all six read "Agenda to be announced".
- **Procedure notes** — "Double-delegate", "Position paper required",
  "Chair-led training", etc.
- **The line-up itself** — six committees is the structure the rail was built
  for; swapping one is a copy edit, adding a seventh needs no code change.

### Organizing committee — `src/modules/oc.js`

All **16 names** read "To be announced" (three advisors including the Chief
Advisor, five upper secretariat, eight under secretariat). Role titles are the conference's own
org chart and can stay. `social` is `null` on every member — the render path
exists, the shape is documented in the file header, and no fake handle was
invented. **Alt text is generated from name + role, so review it after the
names land.**

### Past editions — `src/modules/gallery.js`

- **9 alt strings**, all placeholder text describing photographs that do not
  exist yet.
- **3 testimonials** in the `QUOTES` array. No quote, name, committee or year in
  them is real — every one reads "to be added" / "to be announced". Replace them
  with sourced, attributed reviews or delete the entries.

### Meta — `index.html` `<head>`

`og:image` (`/assets/og-image.jpg`, not yet created) and `og:url`
(`https://example.org/mun`).

---

## Ground sequence (the duotone)

`dark → light → dark → light → LOUD → dark`

| Section | Ground |
| --- | --- |
| Hero | `--color-ink` deep plum |
| Committees | `--color-paper` warm white |
| Secretariat | `--color-ink` |
| Past editions | `--color-blush` palest pink |
| **Registration** | **`--color-primary` magenta** — the one saturated ground, at the conversion point |
| Footer | `--color-ink` |

Hard cuts between sections — no gradient bleeds. Each ground publishes
`--accent-on-ground` and `--border-interactive`, so a section's CSS never names
a literal colour and a ground can be swapped without stranding a value at
1.02:1. That indirection is what makes the sequence safe to change.

## The seal

The anniversary mark and the emblem are **one object**, not two. The laurel
wreath is redrawn as SVG line art (`assets/wreath.svg`, generated) — branches
and ribbon only, no shield or lotus, since those turn to mud above ~60px — and
it frames a **typeset** Fraunces X. It is inlined in `index.html` rather than
loaded via `<img>` so `currentColor` reaches it from CSS and `hero.js` can draw
it on with `stroke-dashoffset`.

The crown is left **open**. That gap is the single detail that makes it read as
a laurel rather than a spinner ring.

The full-colour PNG emblem now appears **only at small scale** — nav, footer,
preloader, favicon — where its shield, endless knot and lotus are legible. The
extracted device is used large. That split also takes a 44.7 KB raster off the
critical path: the hero's LCP element is the masthead text, and nothing above
the fold makes a network request.

## Anchor scrolling — why there is no nav-height offset

`ctx.scrollTo` lands a section's top edge **flush with the viewport top**, with
no offset for the bar. That looks wrong and isn't. Two separate bugs lived in
the "obvious" version:

1. **Lenis double-counts.** Given an *element*, `lenis.scrollTo` applies the
   document's `scroll-padding-top` on top of whatever `offset` you pass — so the
   bar height was subtracted twice and every jump stopped 71px short (measured:
   the section top sat 144px down instead of 73). Passing a **number** removes
   its element resolution entirely.
2. **The bar hides itself.** Even once corrected, reserving the bar's height
   exposed a strip of the *previous* section, because the nav tucks away on
   downward scroll and the space it had reserved was left showing.

Every section carries a `--section-y` top padding of 88–176px — comfortably more
than the bar — so the heading is never covered. `scroll-padding-top` is `0` to
match, so the no-JS path behaves identically.

## Design system contract

`src/styles/tokens.css` is the only file allowed to contain a hex value —
verified, there are zero others in the codebase. Three colour rules are enforced
throughout and documented with measured ratios at the top of that file:

1. On ink grounds, small text is `--color-text-inverse` or `--color-accent-gold`
   — never magenta (2.9:1 on plum), so on dark grounds magenta is a fill or a
   decorative wash only, never a text or indicator colour.
2. On paper grounds, gold is decorative only (2.2:1) and never the sole carrier
   of information — every gold numeral on a light ground is `aria-hidden`.
3. On magenta grounds, text is `--color-text-inverse` at full alpha (5.7:1) and
   gold is never used for text (2.5:1).

Rule 3 is why the registration panel's gradient runs near-vertically: a
horizontal run would put every line of left-aligned copy on the magenta end,
where anything below full opacity fails AA.

---

## Viewing this page

**It must be served. Do not open `index.html` by double-clicking it.**

Under `file://` the page renders as raw unstyled HTML — bulleted nav, default
link colours, system serif — and **no error is reported anywhere**. Two reasons:
the entry script is `<script type="module" src="/src/main.js">`, and that
root-absolute path resolves to the filesystem root rather than the project; and
all CSS is imported from JS (`import './styles/tokens.css'`), which browsers
cannot do natively — only a bundler can. Nothing is broken; the stylesheets were
simply never fetched.

```bash
npm run dev     # → http://localhost:5173
```

Open the URL the terminal prints. On WSL, the dev server runs on the Windows
side and Windows `localhost` reaches it directly; add `-- --host 0.0.0.0` only
if you need another device on the network to connect.

## QA status

**Verified in a real browser** (Edge, headless, driven over CDP at 1440×900 and
375×812, scrolled with real wheel input so Lenis and ScrollTrigger behave as
they would for a person):

- Every stylesheet returns HTTP 200; `--color-primary` resolves to `#b41884` in
  the live document.
- Hero headline reveal completes (`matrix(1, 0, 0, 1, 0, 0)`).
- All scroll reveals fire: committees 6/6, OC cards 16/16, gallery tiles 12/12,
  registration 3/3 — at both widths.
- Nav picks up `is-scrolled` / `is-tucked` on scroll.
- Gallery masonry: 0 overlapping tile pairs.
- No horizontal overflow: `scrollWidth === innerWidth` at 1440 and at 375.
- Zero page errors and zero failed requests, in dev **and** against the
  production build via `npm run preview`.

Two bugs were found this way and fixed — see "Bugs found in browser testing"
below.

**Verified statically:**

- Production build succeeds; output is one JS file (56.3 KB gzipped, against a
  60 KB ceiling), one CSS file (7.6 KB gzipped), 6.7 KB gzipped HTML.
- Markup audit clean: balanced tags, no duplicate IDs, alt on every image,
  `rel="noopener noreferrer"` on all 6 external links, every in-page anchor and
  every `aria-controls` / `aria-labelledby` resolves, exactly one `<h1>`, no
  unlabelled `<section>` or `<nav>`.
- Every text-on-colour pair computed against WCAG 2.1. Two real failures were
  found and fixed: the difficulty tags (gold-on-paper at 2.2:1 and
  tint-on-paper at 1.2:1, rebuilt as an outline → magenta-outline → magenta-fill
  ladder) and the registration panel's gradient direction.
- No hardcoded hex outside `tokens.css`; no undefined custom properties.

## Bugs found in browser testing

Both were invisible to static analysis and to the production build — only
rendering the page surfaced them.

**1. The hero headline never appeared** (`src/modules/hero.js`).

The CSS start-state is `transform: translate3d(0, 110%, 0)`. The browser
resolves that percentage against the line's own height before GSAP sees it, so
GSAP parses the computed matrix as a *pixel* offset and caches `y = 130px`.
Animating `yPercent` 110 → 0 zeroed only the percent component; the cached
pixel baseline survived, and the tween finished with the headline still sitting
one full line-height below its `overflow: hidden` mask. The tween reported
complete, which is what made it confusing. Fixed by declaring `y: 0` in the
from-vars, which discards the parsed baseline.

**2. The gallery masonry collapsed into overlapping strips**
(`src/styles/sections/gallery.css`).

Row-span masonry sets `grid-auto-rows: 8px`. Grid items stretch to their area
by default, so before any span was assigned every tile was 8px tall — and
`layout()` measured that 8px instead of the tile's real height, handed every
tile `span 1`, and the figures painted over each other. Fixed with
`align-self: start`, which makes item height content-driven and the measurement
stable. Verified: 0 overlapping pairs, spans now range 30–71.

**Still not verified — needs tooling this environment doesn't have:**

- **Lighthouse Performance ≥90 / Accessibility ≥95.** No Lighthouse/CI runner
  here. The build is engineered for it, but the score is unmeasured — and it
  cannot be measured meaningfully until the real video and photographs are in
  place, since those are the payload that actually moves it. Run it from Chrome
  DevTools (mobile preset, incognito).
- **768 / 1024 / 1280px.** Only 1440 and 375 were rendered and inspected. Those
  three have explicit rules but no screenshot.
- **Safari and Firefox**, keyboard walk-through, and screen-reader passes. All
  testing was Chromium-based (Edge).
