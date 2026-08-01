# /assets/oc — organizing committee headshots

The roster is defined in `src/modules/oc.js`. Each member's `photo` field is a
filename in this folder. The filenames the code currently expects:

```
chief-advisor.jpg
advisor-01.jpg               advisor-02.jpg
secretary-general.jpg        deputy-secretary-general.jpg
director-general.jpg         charge-daffaires.jpg
head-committee-affairs.jpg
usg-delegate-affairs.jpg     usg-logistics.jpg
usg-finance.jpg              usg-press.jpg
usg-design.jpg               usg-outreach.jpg
usg-technology.jpg           usg-hospitality.jpg
```

**Specs**

- Portrait crop. Advisors and Upper Secretariat render at 4:5, Under
  Secretariat at 1:1 — supply a square-safe crop with headroom and the CSS
  `object-fit: cover` handles both.
- 800×1000 px is plenty; anything larger is wasted bytes on a lazy-loaded card.
- Compress to ~120 KB or below each. Fifteen headshots is the heaviest thing
  on this page by a wide margin.

**Missing files are safe.** Any headshot that 404s falls back to a gold
monogram plate (the `mono` field in the data), so the grid reads as an
intentional placeholder rather than a broken image.

**Before launch:** replace the placeholder `name` values in `oc.js` and review
each generated `alt` string — alt text is built from the name and role.
