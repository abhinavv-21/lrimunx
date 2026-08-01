# DESIGN.md — LRI MUN X Operations Hub

The single source of truth for every visual decision in this application. No component introduces a color, size, radius, or timing that is not defined here. If something you need is missing, add it here first, then use it.

## Brand

- **Name:** LRI MUN X Operations Hub
- **Identity:** The operations desk behind a Model UN conference. A control room, not a brochure. Every screen answers an operational question: who has paid, who has checked in, which committee is short a placard.
- **Personality:** Institutional, precise, calm under load. Diplomatic formality without stiffness.
- **Tone:** Short declarative labels. Active voice. Never cute. "3 unassigned delegates" not "Oops, looks like some delegates need homes!"
- **The one distinctive element:** the magenta rule. A 3px magenta bar anchors every page header and every active nav item. It is the only place the brand color appears at full width, and it is how you know where you are.

## Users

Two roles. **Roles are scopes of responsibility, not device profiles.** Both roles are used on a phone in a corridor and on a laptop at the secretariat desk, often by the same person within the same hour.

- **ADMIN** — secretariat. Owns delegates, committees, users, audit and exports. Works in dense tables, places delegates into committees, resolves requests.
- **CONTRIBUTOR** — floor staff. Raises logistics requests, submits attendance check-ins, reads delegate lists.

Design consequences, applying equally to both roles:

- Every surface a role can reach is **fully usable at 390px and at 1440px**. An admin must be able to edit a delegate, reassign a country, and resolve a request from a phone; a contributor must get a real desktop layout, not a stretched mobile view.
- Admin tables get the mobile card treatment defined under Data Display. "Use a laptop for this" is never an acceptable answer.
- Offline resilience and 48px tap targets are properties of the **application**, not of the contributor's screens. An admin on venue wifi loses connection just as often.
- The only thing that differs by role is *which* surfaces exist. How a surface behaves at a given width never depends on who is looking at it.

## Colors

Cool slate ground, magenta signal. The background is never pure white and text is never pure black.

### Surfaces
- Background: `#F8FAFC` — the app canvas
- Surface: `#FFFFFF` — cards, tables, modals
- Surface sunken: `#F1F5F9` — table headers, inset panels, disabled fields
- Surface inverted: `#2F0924` — plum. Sidebar, footer, inverted blocks (17.7:1 behind white)

### Ink
- Ink primary: `#1A0715` — headings and body (18.5:1 on background)
- Ink secondary: `#4A3D46` — labels, metadata, help text (9.8:1)
- Ink tertiary: `#96878F` — placeholders, disabled text. **Never** for content that must be read.
- Ink inverted: `#FBF7FA` — text on inverted surfaces

### Brand
- Accent: `#B41884` — magenta. Primary actions, active nav, the page rule. (5.9:1 on background, 6.2:1 behind white text)
- Accent hover: `#98136F`
- Accent pressed: `#7C0F5A`
- Accent wash: `#FDF2F9` — selected rows, accent-tinted callouts
- Accent bright: `#E24BA8` — the accent **only** where it sits on the inverted plum surface. The base accent reaches just 2.9:1 there; this reaches 4.9:1.

### Status
Status colors carry meaning and are used consistently everywhere:
- Success `#15803D` / wash `#F0FDF4` — RESOLVED, CHECKED_IN
- Warning `#B45309` / wash `#FFFBEB` — PENDING, OPEN, capacity nearly full
- Danger `#991B1B` / wash `#FEF2F2` — FAILED, over capacity, destructive confirmation
- Info `#1D4ED8` / wash `#EFF6FF` — IN_PROGRESS, sync in flight, neutral system notices

### Structure
- Border: `#E2E8F0` — default hairlines, card edges, table rules
- Border strong: `#CBD5E1` — input borders, dividers that must read as separations
- Focus ring: `#1D4ED8` at 2px offset 2px — deliberately blue, never magenta, so focus is never confused with brand emphasis. Blue is also the furthest hue from the brand, which makes it unmistakable.

> **Note on the palette:** the accent is magenta and the chrome is plum, so brand colour and status colour are now clearly separate hues — danger red `#991B1B` can no longer be mistaken for the brand. Status is still never communicated by colour alone: every status carries an icon and a text label. See Rules.

## Typography

Two UI families. Mono is a functional third, permitted only for data that benefits from fixed advance width.

- **Headings:** Space Grotesk 600/700, tracking `-0.02em`, line-height 1.15
- **Body & UI:** Inter 400/500, line-height 1.55
- **Data:** JetBrains Mono 400 — IDs, country codes, timestamps, currency, table numerics only

### Scale
| Token | Size / Line | Usage |
|---|---|---|
| `display` | 40px / 1.1, Grotesk 700 | Dashboard stat numbers only |
| `h1` | 28px / 1.2, Grotesk 700 | Page title |
| `h2` | 20px / 1.25, Grotesk 600 | Section and card headers |
| `h3` | 16px / 1.35, Grotesk 600 | Sub-headers, modal titles |
| `body` | 15px / 1.55, Inter 400 | Default |
| `body-sm` | 13px / 1.5, Inter 400 | Table cells, secondary detail |
| `label` | 11px / 1.4, Inter 600, uppercase, tracking `0.06em` | Field labels, column headers, badges |
| `mono` | 13px / 1.5, JetBrains Mono 400 | Data cells, IDs |

Body copy sits under 75 characters per line — use `max-w-[68ch]` on prose blocks. Headings never wrap past two lines at 390px.

## Spacing

Base unit **4px**. Every margin, padding, and gap is a multiple. Permitted steps: 4, 8, 12, 16, 24, 32, 48, 64.

- Page padding: 16px mobile, 32px desktop
- Card padding: 20px mobile, 24px desktop
- Section gap: 24px mobile, 32px desktop
- Grid gap: 16px
- Table row height: 52px desktop, 56px mobile (tap target)
- Form field vertical gap: 16px; label to input: 6px

Density is a feature on desktop tables and a liability on mobile forms. Spacing steps up on small screens, not down.

## Radius & Elevation

Mixed intentionally — not one radius on everything.

- Buttons, inputs, badges: `6px`
- Cards, modals, panels: `10px`
- Pills and avatars: `999px`
- Images, table containers, dividers: `0px` — sharp, to contrast with the soft controls

Elevation is restrained. Depth comes from borders first, shadow second.
- `flat` — 1px border `#E2E8F0`, no shadow. Default for cards in a grid.
- `raised` — `0 1px 2px rgba(26,7,21,0.08)` + border. Hovered cards, dropdowns.
- `overlay` — `0 12px 32px rgba(26,7,21,0.18)` + border. Modals, sheets, popovers.

No shadow on any element that also sits on an inverted surface.

## Motion

- Micro (hover, focus, badge): 120ms `ease-out`
- Standard (dropdown, accordion, toast): 180ms `cubic-bezier(0.2, 0, 0, 1)`
- Overlay (modal, mobile sheet): 240ms `cubic-bezier(0.2, 0, 0, 1)`

Never animate `width`/`height` — use `transform` and `opacity`. Under `prefers-reduced-motion: reduce`, all transitions collapse to 1ms and sheets appear without slide.

## Buttons

Minimum target 48×48px on mobile, 40px height permitted on desktop. All buttons use Inter 500 and a visible focus ring.

- **Primary** — Accent bg, white text, radius 6px, padding 12px 20px. Hover: accent hover. Active: accent pressed. Disabled: surface sunken bg, ink tertiary text, no pointer.
- **Secondary** — Surface bg, ink primary text, 1px border strong. Hover: surface sunken.
- **Ghost** — transparent, ink secondary text. Hover: surface sunken. For toolbar and table row actions.
- **Destructive** — Danger bg, white text. Only inside a confirmation step, never as the first click of a delete.

One primary action per view. If a screen appears to need two, one of them is secondary.

## Cards

- Surface bg, 1px border, radius 10px, padding 24px
- Header row: `h2` left, actions right, 16px below
- Interactive cards lift to `raised` on hover and show the focus ring on keyboard focus
- On the inverted sidebar, do not nest cards — place content directly on the surface

## Data Display

This is a data application. These rules carry the most weight.

- **Stat blocks:** `display` numeral in Space Grotesk 700 over an uppercase `label`. One stat per block is magenta — the number that most needs attention (unassigned delegates, open requests). The rest are ink primary.
- **Tables:** header row on surface sunken with `label` styling; 1px bottom border per row; no zebra striping. Numerics and IDs right-aligned in mono. Row hover: accent wash. Selected row: accent wash with a 3px magenta left edge.
- **Mobile tables:** below 768px a table becomes a stacked card list — label above value, primary identifier as the card heading, row actions in a bottom-anchored menu. Tables never scroll horizontally.
- **Status badges:** pill, 11px `label`, status wash bg, status text color, 1px status border at 30% opacity, with a 14px Lucide icon. Icon plus text always — never a bare color dot.
- **Capacity meters:** committee seat fill as a 6px track. Success under 80%, warning 80–99%, danger at 100%. Always paired with a `12 / 15 seats` mono readout.
- **Empty tables** get the empty state below, never a blank grid.

## Required States

Every data surface designs all four. A screen that only handles the loaded-and-populated case is not finished.

- **Loading** — skeleton rows matching final layout and row height, shimmering at 1.4s. Never a centered spinner for table content; never a layout shift when data lands.
- **Empty** — 32px Lucide icon in ink tertiary, an `h3` statement of what is missing, one line of `body-sm` explaining how it gets filled, and the primary action if the user has permission to take it. Real copy: "No logistics requests yet — volunteers can raise one from the Logistics tab."
- **Error** — danger wash panel, danger border, AlertTriangle icon, plain description of what failed, and a Retry button. Surface the API `error` string; never print a raw stack or a bare code.
- **Permission denied** — CONTRIBUTOR views never render an admin control in a disabled state. The control is absent, and where the whole surface is restricted, an explanatory panel appears instead. Server-side authorization remains the actual boundary; this is only presentation.

## Offline & Sync

Venue wifi fails; the interface must stay honest about it.

- **Status pill** in the header at all times: `Online` (success, Wifi icon) / `Offline — N queued` (warning, WifiOff icon) / `Syncing N` (info, animated RefreshCw).
- Queued-locally rows render at 70% opacity with a warning `Queued` badge until the server confirms them.
- On drain, one success toast: "3 requests synced." On failure, a danger toast with a Retry action. Never silently drop a queued item.

## Layout

- Max content width 1440px, page gutters as specified in Spacing
- **Desktop (≥1024px):** fixed 240px inverted sidebar; nav items in Inter 500 with a 3px magenta left edge when active; main content scrolls independently
- **Tablet (768–1023px):** sidebar collapses to a 64px icon rail with tooltips
- **Mobile (<768px):** sidebar becomes a bottom tab bar, 5 destinations max, 56px tall, safe-area padded. Overflow lives in a "More" sheet.
- Page header: `h1`, a 3px magenta rule beneath it, then optional description and actions
- Breakpoints: 390 / 768 / 1024 / 1440

## Accessibility

Non-negotiable, verified rather than assumed:

- Contrast ≥4.5:1 for body text, ≥3:1 for large text and interactive boundaries
- Every interactive element has a visible focus ring; focus order follows visual order
- Tap targets ≥48×48px with ≥8px between adjacent targets
- Zero horizontal scrolling on `body` at any width from 390px up
- All inputs have persistent labels — placeholders are never the only label
- Icon-only buttons carry `aria-label`; tables use real `<th scope>`; modals trap focus and restore it on close
- Live regions announce sync state and toast content
- `prefers-reduced-motion` respected throughout

## Rules

1. Only tokens defined in this file. No arbitrary Tailwind values (`text-[#ff0000]`, `p-[13px]`) in feature code.
2. Magenta is a signal, not a decoration. It appears on the page rule, the active nav edge, primary buttons, and at most one stat per view. If a screen looks magenta, it is wrong.
3. Status is never color alone — icon plus text label, always.
4. No gradients. No stock photography. No emoji as icons — Lucide only, 1.5px stroke, 16/20/24px.
5. Never `lorem ipsum`. Use real operational content: "DISEC — France", "Placard request for UNHRC", "Ridge International School".
6. Design with hostile content: 60-character school names, delegates with no assignment, a committee at 0 seats, a 400-row table.
7. One dominant element per section. If everything is emphasized, nothing is.
8. Never let a role imply a device. Every screen either role can reach is designed and verified at both 390px and 1440px, including admin tables and delegate editing.
9. Disabled is a last resort. Prefer removing an unavailable action, or explaining why it is unavailable.
10. Every destructive action requires a confirmation naming the specific record: "Delete delegate Aarav Menon? This cannot be undone."
