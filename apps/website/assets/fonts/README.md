# /assets/fonts

Self-hosted. Nothing here is fetched from a CDN — the hero headline is the LCP
element and must not wait on a third-party handshake.

**These files are present and working.** They are not placeholders.

| File | Family | Notes | Licence |
| --- | --- | --- | --- |
| `Fraunces-Variable-latin.woff2` | Fraunces | True variable font: `opsz` 9–144, `wght` 100–900, `SOFT`, `WONK`. Latin subset. 121 KB | SIL OFL 1.1 |
| `GeneralSans-400.woff2` | General Sans | Regular — body copy | ITF Free Font Licence |
| `GeneralSans-500.woff2` | General Sans | Medium — nav, labels | ITF Free Font Licence |
| `GeneralSans-600.woff2` | General Sans | Semibold — buttons, small caps | ITF Free Font Licence |

**Why Fraunces is variable and General Sans is not:** Fraunces publishes a
variable build, and the optical-size axis is what lets the same family be a
128 px display face in the hero and a 20 px sub-head in a committee card
without either looking like the other scaled up. The `WONK` axis — the flared
leg on the R, the wedge serifs — is where its character lives, and it is used
at display sizes only. General Sans has no public variable build, so the three
weights the design actually uses are self-hosted as static cuts. **Adding a
fourth weight means adding a file**, so keep to 400/500/600.

**Subsetting:** only the Latin subset of Fraunces is shipped. `U+0000–00FF`
covers every accented glyph the page uses (e.g. "Chargé d'Affaires"). If you
add copy in another script, pull the matching subset from Google Fonts and add
a second `@font-face` with the right `unicode-range`.

Both families are declared in `src/styles/base.css` with `font-display: swap`,
and Fraunces plus GeneralSans-500 are preloaded from `index.html`.
