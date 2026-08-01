# /assets/past-galleries — editions I–IX

One folder per edition, **one frame each**. The list lives in
`src/modules/gallery.js` and expects:

```
edition-01/01.jpg     ← edition I
edition-02/01.jpg     ← edition II
…
edition-09/01.jpg     ← edition IX
```

Nine photographs, not eighteen. Two frames per edition turned the archive into
a contact sheet — too much to look at, and each tile ended up too small for
anything in it to be legible. The section is a summary that points at
Instagram, not the whole shoot.

To add more, extend the `PHOTOS` list in `gallery.js`; the masonry sizes itself
from the `ratio` field, so give each new entry a ratio that matches its crop or
the tile will letterbox.

**Specs**

- 1600 px on the long edge, ~200 KB each. Everything here is below the fold and
  lazy-loaded, but it is still the heaviest section on the page.
- The `ratio` field reserves the tile box before the image loads — that is what
  keeps cumulative layout shift at zero. Don't remove it.

**Missing files are safe.** Any frame that 404s falls back to a gold edition
plate.

**Before launch:** every `alt` string in `gallery.js` is placeholder text and
every entry in the `QUOTES` array is a placeholder testimonial — no quote, name,
committee or year in it is real. Replace them with sourced, attributed reviews
or delete the entries.
