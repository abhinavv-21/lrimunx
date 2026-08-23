# Bug review

What was broken, what caused it, and how each fix was checked. Written after the
work, from what happened rather than from what was planned.

Most of these were introduced during the recent build-out, by me. They are marked
**mine** so the pattern is visible rather than buried.

---

## 1. Every dropdown inside a dialog was completely dead

**Mine, in the sense that I twice failed to find it.**

The tier picker, the committee picker and the country picker did nothing on
hover, did nothing on click, and clicking an option *closed* the menu without
selecting.

**Cause.** Radix sets `document.body.style.pointerEvents = 'none'` for a modal
dialog and re-enables it only on its own layer. `Select` portals its menu to
`document.body` as a **sibling** of that layer, so it inherited the block and
stopped being hit-testable. `onMouseEnter` never fired, so the highlight never
moved. `onClick` never fired, so nothing was ever selected. The document-level
outside-press listener still ran, resolved the target to `<html>`, and dispatched
`close`. Three symptoms, one cause.

Only inside dialogs. The same component was fine on the budget filter, which is
why it looked like a styling problem.

**Why I missed it twice.** I checked whether `bg-edge` was a valid Tailwind class
and whether `edge` had a `DEFAULT` key. Both were fine. I was verifying that the
paint was correct on an element that could not receive events at all.

**Fix.** `pointerEvents: 'auto'` on the portaled container, set **inline**. My
first attempt used a utility class, which is wrong twice over: it does not exist
in jsdom so the test could not see it, and Radix sets its own block inline, so a
class loses the moment specificity shifts.

`apps/hub/src/components/ui/Select.tsx`

**Verified.** Two tests using `user-event`, which refuses to interact with an
element that cannot receive pointer events. Removed the fix, watched both fail,
restored it, watched both pass:

```
fix temporarily removed
  × highlights the row under the pointer
  × selects the row that was clicked, rather than dismissing the menu
    → Unable to perform pointer interaction as the element has `pointer-events: none`
  Tests  2 failed | 31 passed (33)
--- restored ---
  Tests  33 passed (33)
```

**The more important problem was the test suite.** `Select.test.tsx` already
rendered inside a `Modal`, so this looked covered. Its only in-dialog assertion
dispatched a raw `WheelEvent` through `node.dispatchEvent`, which bypasses the
pointer-events check entirely. The suite was green for days over a control that
did nothing.

---

## 2. The hero headline was clipped mid-letter

**Mine.** It rendered `LRI / MODEI / UNITEI / NATIOI`.

**Cause.** I capped `.hero__masthead` at `max-inline-size: 34ch`. `ch` resolves
against **the element's own font**, and that element is a plain `div` inheriting
General Sans at 16px, so the cap measured **316.6px**. The `h1` inside it is
Fraunces at up to 108px, where "NATIONS" needs **432.5px**. `.line-mask` carries
`overflow: hidden` to mask the vertical reveal animation, so the overshoot was
sheared sideways instead of wrapping.

Each word is one unbreakable token, so it could not wrap out of trouble.

The 8fr column was never the constraint: at 1440px it would hold "NATIONS" up to
a 222px font size. Clipping began at any viewport above roughly 950px.

**Fix.** Removed the cap. The tagline already carries `--measure-tight`, which is
what the constraint was reaching for.

`apps/site/src/styles/sections/hero.css`

**Verified.** Site builds; the 31 DOM contract tests against the real
`index.html` pass. Rendered width still needs a human eye at 1280 and 1440.

---

## 3. Three more hero faults, all mine

- **The hero was inset ~22px tighter than every other section.** I added
  `padding-inline` to `.hero__inner` under a `min-width: 1024px` query.
  `.hero__inner` also carries `.shell`, both are single-class specificity, and
  `hero.css` imports after `base.css`, so it **replaced** the shell gutter rather
  than adding to it. The rule it replaced only set `padding-inline-start`, so
  this silently pulled the right edge in too. Removed.
- **The emblem watermark landed on the seal.** Restored at
  `clamp(12rem, 22vw, 22rem)` = 316.8px against a 244.8px seal, starting 0.8px
  from it. It is the same wreath, so the watermark sat behind the mark it
  duplicates. Smaller, lower, further out.
- **The seal column kept its old width.** I shrank the seal from
  `clamp(15rem, 24vw, 23rem)` to `clamp(12rem, 17vw, 17rem)` without touching its
  track, leaving ~100px dead on each side of it. Column is now 7fr/3fr.

---

## 4. The committee rail: four faults at once

**Mine, three of the four.**

- **Snapping was scoped to `(hover: none)`.** Every mouse and trackpad user had
  none. Combined with a wheel handler moving by raw pixel deltas, cards came to
  rest sheared exactly on the gutter line. Now `x proximity` on pointer devices,
  `mandatory` on touch.
- **The drag never settled.** `endDrag` released the pointer capture and stopped
  wherever the button came up. It now snaps to the nearest card, like the arrows.
- **The readout ran ahead of the rail.** I changed it to derive from scroll
  progress so it could reach its stated total. With 12 cards and 3 visible it
  advanced 11/9 as fast as the rail, was wrong by up to 2 even at snapped
  positions, and showed `02` while card 01 was still up to 269px visible. Back to
  the leftmost card, which is what the number describes.
- **The reveal panel covered the Details button.** At `62%` of a 432px card it
  spanned y164 to y432 and buried the entire footer: seat count, level tag and
  the button that opens the dialog. Hovering a card hid the control being reached
  for. It now stops above the footer.
- **Dragging killed hover.** `.is-dragging * { pointer-events: none }` blinded
  `elementFromPoint`, which `syncHover` calls every scroll frame, so every card
  lost its hover state for the duration and snapped back on release.
  `user-select` alone does the job.
- **The click guard leaked.** Registered on every drag end whether or not a click
  followed, so a gesture ending elsewhere left it armed to swallow the user's
  next real click, including one on Details.
- **`stepSize` measured a rotated card.** `getBoundingClientRect` returns the
  transformed box and the entry animation holds each card at `rotateZ 0.6deg`, so
  a 424px card measured 428.5px and every step drifted 4.5px with nothing to
  correct it. Uses `offsetWidth`.

`apps/site/src/styles/sections/committees.css`, `apps/site/src/modules/committees.js`

---

## 5. Payment could not be amended from the delegate form

**Pre-existing gap.** The data was already on the wire: `delegates.routes.ts`
includes `registration { id, reference, priceTier, amountPaid, paymentProofUrl }`
on list, get, create and update. Only the UI was missing.

**Fix.** The body of `PaymentDialog` was extracted into `PaymentFields` and
mounted in both places, rather than duplicating it or nesting two Radix modals.
It renders only when there is a registration to charge against; a hand-added
delegate gets a line saying so rather than a dead form.

**Two real bugs found on the way:**

- `useRecordPayment` did not invalidate `['delegates']`. Recording a payment from
  the delegate form would have left the list and the open form showing stale
  figures.
- The field-reset effect depended on the `payable` **object**, which was harmless
  in a dialog but wrong in a long-lived form: any unrelated refetch hands back a
  new object with identical fields and would wipe an amount someone was midway
  through typing. It now depends on the values.

---

## 6. The conference could not be ended

**Pre-existing.** `ConferenceState` was a closed union of `PREPARING | RUNNING`
with `POST /conference/start` the only writer. No way back.

```
PREPARING --start (admin)--> RUNNING --end (owner)--> ENDED
                                ^                       |
                                +---- reopen (owner) ---+
```

Nothing returns to PREPARING; that still takes a reset.

**Four things that would have failed silently**, which is why this was not a
one-line change:

- `readConferenceMode` collapsed anything not equal to `'RUNNING'` back to
  `PREPARING`, so a stored `ENDED` would have reverted on the very next read.
- `defaultDay` returned the active day only while RUNNING, so a check-in the
  morning after would have landed on day 1. It now keeps the last active day.
- The logistics priority clock runs faster while RUNNING. Left at the ordinary
  step once ended, because leaving it compressed pins every leftover request at
  CRITICAL forever.
- The UI told the user that going back took a reset. No longer true.

**Read-only is enforced server-side**, not by hiding buttons:
`assertConferenceOpen` guards attendance check-in, bulk check-in, and logistics
create, update and delete. It answers **409**, not 403, because the caller has
every permission they need and the same request would have worked yesterday.

---

## 7. The budget layout was inverted

**Mine.** I put the short panel in the 3fr track and the tall wide one in 2fr.

`LedgerByCategory` is three columns, two `auto`-sized around short figures, so it
could not fill 3fr. `RegistrationIncome` holds a six-column table whose intrinsic
min-content is ~578px, squeezed into ~390px, so it scrolled horizontally.

**There was no `min-width` causing that scroll** — it is an auto-layout table
refusing to shrink below its contents. Worth recording, because the obvious fix
is to go looking for a `min-w-*` that does not exist.

**My instruction to truncate the tier description was wrong.** `truncate` sets
`white-space: nowrap`, which makes min-content the *whole string*. It would have
made the overflow worse. Wrapped, min-content is the longest word, "concession",
about 67px, and never the dominant term. The real culprit was the four uppercase
letter-spaced headers at roughly 280px before padding. Constrained with
`max-w-cell` instead.

Also fixed: the footer used `sm:grid-cols-3`, and Tailwind breakpoints are
**viewport**-based, so that rule was unconditionally active inside a ~390px
column. It wraps now, because a breakpoint cannot see its own container.

**Known trade-off.** The two cards sit side by side only at 1536px and above.
Below that they stack full width. No ratio works at 1280 without crushing the
category list, and stacking beats a horizontal scrollbar.

---

## 8. CSV import was unreachable from the country matrix

**Pre-existing.** The empty state told the user to go to the committees list.

Both paths are now offered in place: **Import this committee**, which builds a
one-column CSV headed with that committee's code, and **Import the whole sheet**,
which opens the existing multi-committee dialog unchanged. No new endpoint; the
scoping *is* the single column heading, because `/matrix/import` keys off
headings.

Every existing behaviour preserved: a country cannot be removed while a delegate
holds it, import never creates a committee, and the "placed before the matrix
existed" warning stays.

---

## Still open

- **Screenshot upload does not work, and it is not a code bug.** No `S3_*`
  variables exist, so the server correctly answers `503` and the form says
  uploads are not switched on. Deferred to Oracle, where Object Storage is
  documented in `SETUP.md` §14. Registration completes without one.
- ~~**Nothing here was seen in a browser.**~~ **No longer true.** Playwright and
  Chromium are installed now, and both apps have been driven in a real browser:
  the site at seven viewports across all six pages, and the hub signed in and
  walked through all eleven routes at 390 and 1440. That pass found three things
  the arithmetic could not have: an About plate that collapsed to 2x3px, a nav
  link that broke over two lines at 900px, and every subpage rendering invisible
  under the Express deployment's Content-Security-Policy. All three are fixed.
- **The backend suite crashes on exit roughly one run in fifteen** with
  `Error: Worker exited unexpectedly`. Every test passes first; it is a segfault
  during teardown from Prisma 5.22 against Node 24. Production runs Node 20.
- **`ConferenceControl`'s ENDED branch and the reopen confirmation have no
  component test.**

---

## What changed about how this gets checked

The dropdown is the lesson. A green suite covered a control that did nothing at
all, for days, because the one test that rendered it in a dialog reached past the
browser's own rules to poke the element directly.

Two things follow:

1. **Interaction tests drive the interaction.** `user-event`, not
   `dispatchEvent`. It enforces what a real pointer can and cannot touch, and
   that enforcement is the entire value.
2. **A fix is not verified until it has been watched to fail.** Both new tests
   were run against the unfixed code first. That is what caught my own first
   attempt being useless in jsdom.

One process note: an agent ran `git stash --include-untracked` for a clean test
baseline while another was mid-edit, and swept six untracked files from both.
All six were recovered and diffed against the stash before it was dropped. Do not
stash a shared tree.
