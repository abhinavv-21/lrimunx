# DESIGN.md Templates

8 complete design systems. Paste one into Stitch (or feed it to any AI design tool) to lock in consistent colors, fonts, spacing, components, SVG patterns, and interaction behaviors across multiple pages.

Each template is a different universe. Different palette. Different texture. Different button philosophy. Different SVG language. No two templates share colors, fonts, or interaction patterns.

A DESIGN.md tells AI design tools exactly how your site should look AND feel. Without one, every page gets random styling. With one, every page feels like the same hand built it.

---

## How to Use

1. Pick the template closest to your brand's personality
2. Customize the values (brand name, hex codes, font choices, SVG descriptions)
3. Paste it into Stitch as your DESIGN.md
4. Every page you create will follow these rules

---

## Template 1: Organic Tech (Clinical Boutique)

A bridge between a biological research lab and an avant-garde luxury magazine. Think: if a biotech startup was designed by a fashion editor.

```markdown
# DESIGN.md — [Your Brand Name]

## Brand
- Name: [Your Brand]
- Identity: Clinical precision meets organic warmth. A biological research lab designed by a luxury magazine art director.
- Personality: Intelligent, grounded, quietly premium
- Tone: Confident but not corporate. Scientific but not cold.

## Colors
- Background: Cream #F2F0E9
- Surface: White #FFFFFF
- Surface dark: Charcoal #1A1A1A (for contrast sections)
- Text primary: Charcoal #1A1A1A
- Text secondary: Stone #6B6560
- Text on dark: Cream #F2F0E9
- Accent primary: Moss #2E4036
- Accent hover: Moss Light #3D5548
- Accent secondary: Clay #CC5833
- Success: Forest #2D6A4F
- Warning: Saffron #E8A838
- Error: Terra #C44D2A
- Border: #D4CFC6
- Highlight: rgba(46,64,54,0.06)

## Typography
- Headings: Plus Jakarta Sans 700, tracking -0.02em
- Display/Drama: Cormorant Garamond 400 italic (used for hero statements, pull quotes, and emotional emphasis — always at 2-3x body size)
- Body: Outfit 400, 16px, line-height 1.7
- Data/Code: IBM Plex Mono 400, 14px
- Labels: Outfit 500, 12px, uppercase, tracking 0.06em, Stone color
- Max body width: 680px

## Spacing
- Hero padding: 120px vertical minimum
- Section padding: 80px vertical (light sections), 100px vertical (dark sections)
- Card padding: 28px
- Grid gap: 24px
- Component gap: 16px
- Base unit: 8px (all spacing divisible by 8)

## Visual Texture
- Global noise overlay: Inline SVG feTurbulence filter at 0.04 opacity on the body. This eliminates flat digital gradients and adds organic warmth. NEVER remove this.
- Background pattern: Subtle organic dot grid — small circles (2px diameter) at 40px intervals, #D4CFC6 at 6% opacity. Applied via SVG background-image.

## Custom SVG Language
Every SVG in this design system uses these rules:
- Stroke width: 1.5px
- Stroke linecap: round
- Stroke linejoin: round
- Color: Moss #2E4036 (default) or Clay #CC5833 (emphasis)
- Style: Organic, slightly botanical — curves over straight lines, leaf-like forms

Required SVG elements:
- Brand mark: A stylized leaf or fern frond inside a circle
- Section dividers: A horizontal vine/branch line with 2-3 small leaves
- Icon set: Leaf, molecule, droplet, root, sun — all in the stroke style above
- Loading indicator: A growing fern that unfurls in a spiral animation

## Buttons
NEVER use flat buttons. NEVER use gradient-only buttons. Every button must have physical depth.

- Primary: Moss #2E4036 background, Cream text. Inner highlight: 1px inset top border at rgba(255,255,255,0.12). Bottom shadow: 0 2px 0 #1A2D22 (darker moss). On hover: button lifts 1px (translateY -1px), bottom shadow extends to 3px. On click: button drops 1px, shadow shrinks to 1px. Transition: 150ms cubic-bezier(0.25,0.46,0.45,0.94).
- Secondary: Transparent background, 1px Moss border, Moss text. On hover: background fills with rgba(46,64,54,0.06), border thickens to 2px.
- Destructive: Clay #CC5833 background, same depth treatment as primary.
- All buttons: 12px radius, 14px 28px padding, Plus Jakarta Sans 600.

## Cards
- Background: #FFFFFF
- Border: 1px solid #D4CFC6
- Radius: 20px (generous, organic feel)
- Shadow: 0 2px 8px rgba(26,26,26,0.04), 0 8px 24px rgba(26,26,26,0.03)
- Hover: shadow deepens to 0 4px 16px rgba(26,26,26,0.06), 0 16px 40px rgba(26,26,26,0.05). Card lifts translateY(-2px). Transition: 200ms ease.
- Dark cards (on cream bg): Charcoal #1A1A1A bg, Cream text, 1px rgba(255,255,255,0.06) border, Moss accent elements.

## Containers & Radius System
- Cards: 20px
- Buttons: 12px
- Input fields: 10px
- Tags/badges: 999px (full pill)
- Image frames: 16px
- Modal/dialog: 24px
- Tooltips: 8px
- NEVER use sharp corners (0px) in this system. Minimum radius is 8px.

## Layout
- Max content width: 1120px, centered
- Navigation: Fixed pill-shaped container, centered horizontally. Transparent at top with cream text. Morphs to cream/60% background with backdrop-blur-xl and Charcoal text when scrolled past hero. Use IntersectionObserver.
- Grid: 12-column. Content typically spans 8-10 columns centered.
- Footer: Charcoal background, rounded-t-[3rem], 4-column grid, Cream text.
- Mobile: Single column below 768px. Increase body text to 17px. Navbar becomes minimal with hamburger.

## Interactive Sections
- Philosophy/manifesto sections: Full-width dark backgrounds with parallaxing organic texture image behind text at low opacity (8-12%).
- Feature cards: Each card should feel like a functional artifact, not a static marketing card. Include micro-animations: pulsing dots, typing effects, or subtle data visualizations.
- Scroll-triggered sections: Use staggered fade-up animations. Default: y:30 → 0, opacity: 0 → 1, stagger 0.12s, ease power3.out.

## Rules
- The noise overlay is mandatory. Never ship without it.
- Cormorant Garamond italic is only for emotional/dramatic moments — never for body text or labels.
- Clay #CC5833 is the "attention" color — use it for important CTAs, alerts, and key metrics only.
- No stock photos. Use real product photography or organic texture images.
- White space is generous. When in doubt, add more space.
- Every section transition should include either a custom SVG divider or a color shift.
```

---

## Template 2: Midnight Command (Dark Operations)

A private members' club meets a spacecraft control room. Dense information delivered with zero noise. For products that handle serious work and need interfaces that match.

```markdown
# DESIGN.md — [Your Product Name]

## Brand
- Name: [Your Product]
- Identity: A mission control room designed by a luxury watchmaker. Every pixel justified. No decoration.
- Personality: Dense, precise, powerful, calm
- Tone: No-nonsense. Technical. Trustworthy.

## Colors
- Background: Obsidian #0D0D12
- Surface: Slate #16161D
- Surface raised: Elevated #1E1E28
- Surface hover: #252530
- Text primary: Ivory #FAF8F5
- Text secondary: Ash #8B8B93
- Text disabled: #55555E
- Accent primary: Champagne #C9A84C
- Accent hover: Champagne Light #D4B760
- Accent dim: rgba(201,168,76,0.10)
- Accent border: rgba(201,168,76,0.25)
- Success: Mint #2DD4A0
- Warning: Amber #F59E0B
- Error: Coral #FF6B6B
- Info: Steel #4A8FBF
- Border: #2A2A35
- Border subtle: #1F1F28

## Typography
- Headings: Inter 600, tracking -0.02em
- Display/Drama: Playfair Display 400 italic (hero statements only — never in the product UI)
- Body: Inter 400, 14px, line-height 1.5
- Data/Metrics: JetBrains Mono 500, 13px, tabular-nums
- Labels: Inter 500, 11px, uppercase, tracking 0.06em, Ash color
- Stat numbers: JetBrains Mono 700, 32px

## Spacing
- Section padding: 48px vertical
- Card padding: 20px
- Compact card padding: 16px
- Grid gap: 16px (compact), 24px (relaxed)
- Data table row height: 48px
- Base unit: 4px

## Visual Texture
- No noise overlay (dark interfaces stay clean)
- Subtle grid pattern: 1px lines at 60px intervals, rgba(255,255,255,0.02), applied as SVG background on specific sections only (not global)
- Glow effects: Accent elements get a subtle glow — box-shadow 0 0 20px rgba(201,168,76,0.08) on hover

## Custom SVG Language
Every SVG uses these rules:
- Stroke width: 1.5px
- Color: Champagne #C9A84C (primary), Ivory #FAF8F5 (secondary)
- Style: Geometric, precise — straight lines, perfect circles, 45-degree angles

Required SVG elements:
- Brand mark: A geometric monogram inside a hexagonal or circular badge
- Status indicators: Small circle (8px) with inner glow for active/inactive states
- Icon set: Grid, chart, shield, bolt, gear, bell — geometric, angular style
- Loading indicator: A rotating hexagonal ring with a traveling dot
- Chart elements: Custom line/bar/donut charts with Champagne accent fills at 15-25% opacity

## Buttons
Every button has a physical feel. No flat. No pure gradient.

- Primary: Champagne #C9A84C background, Obsidian #0D0D12 text. Bottom shadow: 0 2px 0 #A08535 (darker champagne). Inner top highlight: 1px inset rgba(255,255,255,0.15). On hover: glow appears (box-shadow 0 0 16px rgba(201,168,76,0.2)), button scales to 1.02. On click: scale 0.98, shadow flattens.
- Secondary: Transparent bg, 1px #2A2A35 border, Ivory text. On hover: border shifts to Champagne at 40% opacity, background fills with rgba(201,168,76,0.04).
- Ghost: No border, no background. Ivory text with Champagne underline on hover (animated left-to-right, 200ms).
- Danger: Coral #FF6B6B bg, same depth treatment as primary but with darker coral shadow.
- All buttons: 8px radius, 10px 20px padding, Inter 500 at 13px.
- Keyboard shortcut badges: Inline kbd elements next to button text, Slate bg, 4px radius, 11px JetBrains Mono.

## Cards
- Background: Slate #16161D
- Border: 1px solid #2A2A35
- Radius: 12px
- Shadow: none (dark UIs use borders, not shadows)
- Hover: border shifts to rgba(201,168,76,0.15), background lightens to #1E1E28
- Accent indicator: 3px left border in Champagne for active/highlighted cards
- Stat cards: Include a colored accent bar (4px tall) at top indicating category

## Containers & Radius System
- Cards: 12px
- Buttons: 8px
- Input fields: 8px
- Tags/badges: 6px (not pill — more structured feel)
- Tooltips: 6px
- Modals: 16px
- NEVER exceed 16px radius in this system. Keep it tight.

## Layout
- Sidebar: 240px wide, fixed left, Obsidian bg. Collapsible to 64px (icons only). Logo at top, nav items with icon + label, user avatar at bottom. Active item: Champagne left border + accent dim background.
- Top bar: Breadcrumb + search + notifications + user avatar. Elevated bg.
- Main content: Fluid, max 1400px, left-aligned (not centered — this is a tool, not a marketing page).
- Data tables: Full-width, alternating row bg (Slate / Elevated), sortable column headers with arrow indicators.
- Mobile: Sidebar collapses to bottom tab nav. Tables scroll horizontally.

## Interactive Elements
- Hover states: All interactive elements brighten 10% (use brightness filter or lighter bg color)
- Active states: Champagne underline or Champagne left-border indicator
- Focus states: 2px Champagne ring with 2px offset (outline-offset: 2px)
- Tooltips: Elevated bg, Champagne border top (2px), 6px radius, 12px padding, JetBrains Mono text
- Toast notifications: Slide in from top-right, dark bg, left accent bar (color matches type: Mint/Amber/Coral/Steel), auto-dismiss after 5s

## Data Visualization
- Line charts: Champagne line, area fill at 8% opacity, Steel axis lines at 30% opacity
- Bar charts: Champagne fill at 60%, hover fills to 100%
- Donut/pie: Champagne primary, Steel secondary, Mint tertiary segments
- Sparklines: 1px line, no fill, Champagne color
- All charts: No grid lines. Axis labels in JetBrains Mono 11px. Tooltips on hover.

## Rules
- No shadows in the dark UI. Use borders and background color differences for elevation.
- Champagne #C9A84C is the only warm color. Everything else is cool or neutral.
- Information density is a feature. Don't over-space. Data tables, stat grids, and dense layouts are welcome.
- Playfair Display italic is ONLY for landing page / marketing hero. Never in the product UI.
- Every data point should be in JetBrains Mono. Never use a proportional font for numbers.
- Status indicators: Mint = active/success, Amber = warning/pending, Coral = error/critical, Steel = info/neutral.
```

---

## Template 3: Warm Atelier (Artisan Editorial)

A Japanese ceramics studio meets a Paris bookshop. Photography-dominant. Extreme whitespace. Everything is intentional down to the kerning. For brands where the craft is the product.

```markdown
# DESIGN.md — [Your Brand Name]

## Brand
- Name: [Your Brand]
- Identity: A master craftsperson's workshop — every tool has a place, every surface tells a story. Print magazine quality on screen.
- Personality: Refined, unhurried, sensory, genuine
- Tone: First-person. Thoughtful. Descriptive without being flowery.

## Colors
- Background: Linen #FAF7F2
- Surface: Parchment #F0EBE3
- Surface contrast: Deep Walnut #1A1714 (for inverted sections)
- Text primary: Walnut #1A1714
- Text secondary: Driftwood #6B6560
- Text on dark: Linen #FAF7F2
- Accent primary: Kiln #8B6F47 (warm brown with golden undertone)
- Accent hover: Kiln Light #A08558
- Accent secondary: Sage #5B7A5E
- Border: Sandstone #D4C8B8
- Highlight: rgba(139,111,71,0.06)

## Typography
- Headings: Libre Baskerville 700, tracking 0.01em
- Display: Cormorant Garamond 300 italic, tracking 0.04em (extreme letter spacing for display — used for product names, hero statements, and pull quotes)
- Body: Inter 400, 16px, line-height 1.8 (extra generous for readability)
- Captions: Inter 400, 13px, uppercase, tracking 0.04em, Driftwood color
- Price/data: DM Mono 500, Kiln color
- Max body width: 620px (narrow — like a book column)

## Spacing
- Hero padding: 160px vertical (extreme breathing room)
- Section padding: 120px vertical (light), 100px vertical (dark)
- Card padding: 32px
- Image margin: 48px bottom
- Between unrelated elements: 80px
- Between related elements: 24px
- Base unit: 8px

## Visual Texture
- Linen texture: Subtle SVG pattern of thin crosshatch lines at 3% opacity, applied as background-image on Linen sections. Think canvas/fabric feel.
- No noise filter. The linen pattern provides enough organic texture.
- Paper fold: A subtle SVG in the top-right corner of cards — a small triangle suggesting a folded page corner (8px, Sandstone color at 30%).

## Custom SVG Language
Every SVG uses these rules:
- Stroke width: 1px (thinner than other templates — delicate)
- Stroke linecap: round
- Color: Kiln #8B6F47 (default), Sage #5B7A5E (secondary)
- Style: Hand-crafted feel — slightly imperfect curves, as if drawn with a fine brush

Required SVG elements:
- Brand mark: A ceramic bowl or vessel in profile, single-line drawing
- Section dividers: A single horizontal line with a small botanical element centered (a sprig, a leaf, or a seed)
- Icon set: Bowl, hand, flame, thread, mountain — all brush-like single-line drawings
- Navigation arrows: Thin, delicate, with a slight serif at the arrow point

## Buttons
Photography-forward sites need buttons that don't compete with images. Subtle but tactile.

- Primary: Transparent background, 1px Kiln border. On hover: background fills inward from center (radial transition, 300ms ease) with Kiln, text inverts from Kiln to Linen. The slow fill feels like ink soaking into paper.
- Buy/Add to Cart: Deep Walnut #1A1714 background, Linen text. Inner top highlight: 1px inset rgba(255,255,255,0.08). Bottom edge: 1px solid #0D0B08 (darker). On hover: shifts to Kiln background. Transition: 200ms.
- Text button: No background, no border. Kiln text with a thin underline that draws left-to-right on hover (SVG animated line, 250ms).
- All buttons: 0px radius (sharp corners — matches editorial precision), 14px 32px padding, Inter 500 at 14px.

## Cards
- Background: transparent (content on the background texture, not in boxes)
- Separation: Top border only — 1px Sandstone
- No radius (0px — print doesn't have rounded corners)
- No shadows (separation comes from typography hierarchy and space)
- Product cards: Image (full width, no radius), then product name in Cormorant Garamond italic below, price in DM Mono, category in caption style above

## Image Treatment
- Product photography: Full-bleed or contained, never cropped into circles or unusual shapes. Always rectangular.
- Aspect ratios: 3:4 (portrait, preferred), 1:1 (square, for grids), 16:9 (landscape, for hero only)
- Image borders: None. Let the image float on the background naturally.
- Hover effect: Images scale 1.02 on hover with overflow hidden on the container. Slow transition (400ms ease).
- Dark vignette: Subtle radial gradient overlay on hero images (transparent center, rgba(26,23,20,0.3) edges).

## Layout
- Content centered, max 960px
- Navigation: Minimal. Brand name centered (Cormorant Garamond italic), 2-3 links on each side in small caps Inter. No sticky nav — it scrolls away. Appears again only in footer.
- Grid: Asymmetric. Mix 60/40 splits, full-width sections, and narrow centered text.
- Footer: Single centered column. Brand name, 4-5 links, social icons (custom SVG), legal text. All in Driftwood color.
- Mobile: Content naturally stacks. Increase body to 17px. Images go full width. Navigation becomes a simple hamburger.

## Interactive Elements
- Page transitions: Crossfade between pages (300ms, opacity only)
- Scroll animations: Subtle parallax on hero images (0.3 speed). Text fades in gently (opacity 0→1 over 400ms, no movement — movement is too aggressive for this aesthetic).
- Product gallery: Thumbnails below main image. Click to swap. Main image crossfades (no slide, no zoom).
- No loading spinners. Use skeleton screens that match the Parchment background with Sandstone pulse animation.

## Rules
- Photography takes up 40-60% of every page. If there's more text than image, something is wrong.
- Cormorant Garamond display text must ALWAYS have letter-spacing 0.04em or wider. It needs air.
- No sharp color contrasts. Everything should feel blended, warm, analog.
- No hover effects that feel "digital" (no scale, no glow). Use subtle opacity shifts and gentle color transitions only.
- Every section should feel like a page in a print catalog. If it wouldn't look good printed, it doesn't belong.
- Price is always in DM Mono. Every price is a design element, not just text.
```

---

## Template 4: Signal System (Raw Information)

A control room for the future. No decoration. Pure information density wrapped in intentional typography. For products that are pure signal, zero noise.

```markdown
# DESIGN.md — [Your Brand Name]

## Brand
- Name: [Your Brand]
- Identity: A stock exchange ticker board meets a design museum. Information as art. Density as a feature.
- Personality: Direct, raw, opinionated, functional
- Tone: Short sentences. Active voice. No adjectives.

## Colors
- Background: Paper #E8E4DD
- Surface: Off-white #F5F3EE
- Surface dark: Black #111111 (for inverted sections)
- Text primary: Black #111111
- Text secondary: Graphite #555555
- Text on dark: Paper #E8E4DD
- Accent: Signal Red #E63B2E
- Accent hover: Signal Red Dark #C42F22
- Success: Signal Green #2D8B4E
- Warning: Signal Amber #D4943E
- Border: #C4BFB6 (thick, visible)
- Grid lines: #D4D0C8 at 10% opacity

## Typography
- Headings: Space Grotesk 700, tracking -0.03em (tight)
- Display/Drama: DM Serif Display 400 italic (single use per page — one statement per section maximum)
- Body: Inter 400, 15px, line-height 1.6
- Data: Space Mono 400, 14px
- Labels: Space Grotesk 600, 11px, uppercase, tracking 0.08em
- Stat numbers: Space Grotesk 800, 48px+ (massive, impactful)

## Spacing
- Section padding: 60px vertical (dense — this system isn't about breathing room)
- Card padding: 20px
- Grid gap: 16px
- Data table row height: 40px
- Base unit: 4px

## Visual Texture
- No noise. No patterns. No textures. The typography and grid IS the texture.
- Visible grid: Optional 1px lines at 40px intervals on Paper sections. The grid is a design element, not a background.
- Thick dividers: Section separators are 3px solid #111111 (not subtle — statement pieces).

## Custom SVG Language
SVGs in this system are diagrams, not illustrations:
- Stroke width: 2px (thick, bold)
- Color: Black #111111 (primary), Signal Red #E63B2E (highlights)
- Style: Technical drawing — precise angles, clean intersections, labeled dimensions

Required SVG elements:
- Brand mark: A bold geometric shape — square, circle, or triangle with the brand initial knocked out
- Dividers: Thick horizontal rules (3px) with occasional break points
- Icon set: Arrow (→), cross (×), check (✓), dot (●) — minimal, functional, not decorative
- Charts: High-contrast bar charts and dot plots in Black with Red highlights

## Buttons
Brutalist buttons. They look like physical controls.

- Primary: Black #111111 background, Paper #E8E4DD text. Thick 3px border in Black. A 4px offset shadow in Black (#111111), positioned bottom-right. On hover: shadow jumps to 6px offset, button lifts 2px. On click: shadow disappears, button drops to flat. Transition: 100ms (snappy, not smooth).
- Secondary: Paper background, Black text, 3px Black border. No shadow. On hover: Black background, Paper text (instant swap, no transition — feels like a switch flipping).
- Tag/filter: Paper background, 2px Black border, Black text. When active: Red background, Paper text.
- All buttons: 4px radius only (barely rounded — almost sharp), 12px 24px padding, Space Grotesk 600.

## Cards
- Background: Off-white #F5F3EE
- Border: 2px solid #111111 (thick, visible)
- Radius: 4px
- Shadow: 3px 3px 0 #111111 (flat offset, neubrutalist)
- Hover: shadow shifts to 5px 5px, card lifts 2px
- NO background cards on dark sections. Use content directly on the dark surface with Paper-colored text.

## Containers & Radius System
- Everything: 4px maximum. This is a brutalist system. Softness is banned.
- Exception: Tags and pills get 999px (full pill) for contrast against the sharpness.

## Layout
- Max content width: 1100px, centered
- Navigation: Left-aligned. Brand mark + name, then nav links in a horizontal row. 3px bottom border separating nav from content. No sticky nav. No transparency effects.
- Grid: Strict columns. Use 12-column grid visibly — content aligns to grid intersections.
- Footer: 3px top border, then a dense 3-column grid of links. "System Status" indicator with color dot.
- Mobile: Stack with maintained borders and shadows. Nav collapses to brand mark + hamburger.

## Data Display
- Statistics: Massive numbers (48px+) in Space Grotesk 800, with labels in small uppercase below. Signal Red for the key number in any group.
- Tables: No alternating row colors. Use 1px bottom borders only. Header row in Black bg with Paper text.
- Lists: Use → arrow instead of bullet points. Each item is a statement.
- Comparisons: Side-by-side columns with a thick vertical divider.

## Rules
- No gradients anywhere. Flat colors only.
- No subtle borders. If there's a border, it's 2-3px and visible.
- Signal Red #E63B2E is used sparingly — only for THE most important element per section.
- Every interactive element has a visible border.
- Typography does ALL the design work. If you remove the type, the page should feel empty.
- Dark sections (#111111) should be 30-40% of the page to create rhythm.
- Rotation: Occasional 1-2 degree rotation on cards or labels for personality. Use sparingly.
```

---

## Template 5: Neon Lab (Biotech Futurism)

A genome sequencing lab inside a Tokyo nightclub. Glowing data on void-black surfaces. Bioluminescent. Alien. For products that feel like the future.

```markdown
# DESIGN.md — [Your Product Name]

## Brand
- Name: [Your Product]
- Identity: Bioluminescence meets precision engineering. Data that glows. Interfaces that pulse.
- Personality: Cutting-edge, mysterious, powerful, beautiful
- Tone: Technical. Sparse. Let the visuals speak.

## Colors
- Background: Deep Void #0A0A14
- Surface: Dark Matter #151520
- Surface raised: Nebula #1E1E2E
- Text primary: Ghost #F0EFF4
- Text secondary: Smoke #7A7890
- Accent primary: Plasma #7B61FF
- Accent hover: Plasma Light #9580FF
- Accent dim: rgba(123,97,255,0.08)
- Accent glow: rgba(123,97,255,0.25)
- Secondary: Biolume #06D6A0 (bioluminescent green)
- Tertiary: Ice #38BDF8
- Error: Flare #FF6B8A
- Warning: Pulse #FFB547
- Border: rgba(123,97,255,0.12)
- Border hover: rgba(123,97,255,0.30)

## Typography
- Headings: Sora 600, tracking -0.02em
- Display/Drama: Instrument Serif 400 italic (hero and manifesto sections — always massive, always with glow)
- Body: Inter 400, 15px, line-height 1.6
- Data: Fira Code 400, 13px, tabular-nums
- Labels: Sora 500, 11px, uppercase, tracking 0.06em
- Stat numbers: Fira Code 700, 36px

## Spacing
- Hero padding: 100px vertical
- Section padding: 80px vertical
- Card padding: 24px
- Grid gap: 20px
- Base unit: 4px

## Visual Texture
- Noise overlay: Inline SVG feTurbulence at 0.03 opacity (very subtle on dark bg)
- Glow effects: Primary interactive elements get a Plasma glow on hover — box-shadow 0 0 24px rgba(123,97,255,0.15), 0 0 48px rgba(123,97,255,0.08). This is the signature visual.
- Scan lines: Optional — repeating 1px horizontal lines at 2% opacity for a CRT/holographic feel on hero sections only.
- Gradient mesh: Hero backgrounds use a subtle radial gradient of Plasma at 5% opacity in the upper-left quadrant.

## Custom SVG Language
SVGs in this system glow and pulse:
- Stroke width: 1.5px
- Color: Plasma #7B61FF (primary), Biolume #06D6A0 (secondary), Ice #38BDF8 (tertiary)
- Style: Bioluminescent — organic flowing shapes, rounded, with glow filters
- Animation: SVGs should use stroke-dasharray and stroke-dashoffset for draw-on effects. Pulsing opacity for living/active states.

Required SVG elements:
- Brand mark: An abstract bioluminescent shape — a cell, a DNA strand, or a neural network node — with animated glow
- Background pattern: A constellation-style dot map — random dots (2px) at 3% opacity connected by thin lines (0.5px) at 2% opacity
- Icon set: Waveform, cell, neural node, pulse, DNA helix — all with rounded curves and glow potential
- Loading: A pulsing ring that cycles through Plasma → Biolume → Ice colors

## Buttons
Every button glows. That's the identity.

- Primary: Plasma #7B61FF background. Inner highlight: 1px inset top rgba(255,255,255,0.12). Bottom: 1px solid #5A45CC (darker plasma). On hover: glow activates — box-shadow 0 0 20px rgba(123,97,255,0.3), 0 0 40px rgba(123,97,255,0.1). Scale: 1.02. On click: glow intensifies briefly then fades, scale 0.98.
- Secondary: Transparent bg, 1px Plasma border at 30% opacity. On hover: border goes to 60%, subtle Plasma glow appears behind the button.
- Pill CTA: Full-radius pill shape. Gradient fill from Plasma to Biolume (left to right). Inner top highlight. Glow on hover uses the gradient colors. Text: Ghost white.
- Danger: Flare #FF6B8A bg, same glow behavior but with Flare color.
- All buttons: 10px radius (standard) or 999px (pill CTAs), 12px 24px padding, Sora 500.

## Cards
- Background: Dark Matter #151520
- Border: 1px solid rgba(123,97,255,0.12)
- Radius: 16px
- Shadow: none by default
- Hover: border shifts to rgba(123,97,255,0.30), subtle Plasma glow — box-shadow 0 0 30px rgba(123,97,255,0.06)
- Featured card: Plasma border at 40%, with a faint gradient tint inside (radial, from center, Plasma at 3% opacity)
- Glass cards (optional): backdrop-filter blur(20px), background rgba(123,97,255,0.04), border rgba(255,255,255,0.08)

## Layout
- Max content width: 1200px, centered
- Navigation: Centered pill, fixed. Deep Void/60% bg with backdrop-blur. Plasma glow on active nav item. CTA button at right end.
- Hero: 100dvh. Content pushed to bottom-left third. Massive Instrument Serif italic headline with text-shadow glow in Plasma.
- Footer: Deep Void bg, rounded-t-[3rem]. Status indicator with pulsing Biolume dot.
- Mobile: Stack everything. Reduce glow intensity by 50% (performance). Nav becomes minimal top bar.

## Animation
- Default entrance: Fade up (y:30→0, opacity 0→1), stagger 0.1s, ease power3.out
- Glow pulse: Accent elements softly pulse (opacity 0.8→1→0.8) over 3s, infinite
- Data counters: Numbers count up from 0 to final value on scroll-into-view
- SVG draw-on: Stroke-dashoffset animation over 1.5s for diagrams entering viewport

## Rules
- Glow is the identity. Every accent-colored element should have at least a subtle glow on hover.
- NEVER use warm colors in this system. Everything is cool/electric.
- Instrument Serif italic display text must have text-shadow glow: 0 0 40px rgba(123,97,255,0.2).
- Dark surfaces should have subtle depth — use background color differences, not shadows.
- The three accent colors (Plasma, Biolume, Ice) create a triad. Use all three per page for visual richness.
- No stock photos. Use abstract gradients, mesh backgrounds, or custom SVG illustrations.
```

---

## Template 6: Street Corner (Urban Direct-Sales)

A food truck poster meets a zine meets a Gumroad page. Bold, immediate, personal. For creators selling directly to their audience. Low fidelity on purpose. Personality over polish.

```markdown
# DESIGN.md — [Your Product/Brand Name]

## Brand
- Name: [Your Brand]
- Identity: A handmade flyer for the best thing you've ever tried. Not polished. Not corporate. Real.
- Personality: Loud, personal, immediate, honest
- Tone: First person. Exclamation points allowed. Real talk.

## Colors
- Background: Newsprint #FFF8EB
- Surface: White #FFFFFF
- Surface contrast: Deep Navy #0F1A2E (for punch sections)
- Text primary: Ink Black #111111
- Text secondary: Pencil Gray #555555
- Accent: Hot Tangerine #FF6B35
- Accent hover: Hot Tangerine Dark #E85A28
- Secondary: Pool Blue #2596BE
- Border: Ink Black #111111 (always thick)

## Typography
- Headings: Space Grotesk 800 (heavy, punchy)
- Display: Permanent Marker 400 (handwritten feel — used for ONE element per page only: a callout, a price, or a badge)
- Body: Inter 400, 16px, line-height 1.6
- Price: Space Grotesk 800, 48px+ (prices are visual events)
- Labels: Space Mono 400, 12px, uppercase

## Spacing
- Section padding: 40px vertical (tight — dense feels human)
- Card padding: 20px
- Grid gap: 16px
- Base unit: 4px

## Visual Texture
- Dot grid: SVG pattern of 2px dots at 20px intervals, #D4CFC6 at 8% opacity on Newsprint sections
- Tape/sticker SVGs: Decorative elements that look like tape strips, stickers, or stamps placed on the page

## Custom SVG Language
Hand-drawn aesthetic:
- Stroke width: 2.5px (thick, marker-like)
- Stroke linecap: round
- Color: Ink Black #111111 (outlines), Hot Tangerine #FF6B35 (fills/highlights)
- Style: Deliberately imperfect — wobbly lines, not perfectly closed shapes, sketch feel

Required SVG elements:
- Brand mark: Hand-drawn badge/seal — a circle with rough edges containing the brand initial
- Arrows: Thick, hand-drawn arrows pointing to important elements (like "THIS ONE!" callouts)
- Star bursts: Sale/feature badges that look hand-drawn
- Scribble underlines: Wavy lines under important text (SVG paths, not CSS)

## Buttons
Neubrutalist but with personality. These are stickers, not software buttons.

- Primary (buy): Hot Tangerine background, White text. Thick 3px Ink Black border. 5px offset black shadow (bottom-right). Slight rotation: transform rotate(-1deg). On hover: rotation corrects to 0deg, shadow jumps to 7px, button lifts. On click: shadow disappears, button snaps flat. Feels like pressing a sticker onto paper.
- Secondary: White bg, 3px Ink Black border, 4px offset shadow. On hover: same lift behavior.
- Ghost/link: Just text with a hand-drawn SVG underline. On hover: underline thickens and gets a slight wiggle animation.
- All buttons: 6px radius, 14px 28px padding, Space Grotesk 700.

## Cards
- Background: White #FFFFFF
- Border: 3px solid #111111
- Radius: 6px (barely rounded)
- Shadow: 4px 4px 0 #111111 (flat neubrutalist offset)
- Hover: Shadow extends to 6px 6px, card lifts 2px
- Feature: One card per page can have a Hot Tangerine background with White text for emphasis

## Layout
- Max content width: 640px (narrow — single column. This is a sales page, not a dashboard)
- Navigation: Minimal. Brand name left, "Buy" button right. That's it.
- Hero: Product image (large, dominant), name, price (massive), buy button. Nothing else.
- Sections stack vertically. No multi-column layouts.
- Footer: Minimal. "Made by [name]" + payment icons + social links.
- Mobile: Already single column. Just reduce padding.

## Interactive Elements
- Sticky buy bar: On mobile, a fixed bottom bar appears after scrolling past the hero. Hot Tangerine bg, price and "Buy" button.
- Image gallery: Polaroid-style. Images rotated slightly (-2 to 2 degrees) with white borders.
- Testimonials: Styled as handwritten notes — slightly rotated cards with Permanent Marker font for the quote.

## Rules
- No subtle anything. Borders are thick. Colors are saturated. Type is heavy.
- Permanent Marker font is used ONCE per page maximum. It's a spice, not a base.
- The product image is always the hero. No gradient hero. No text-only hero.
- Price is always visible and always massive. Never hide the price.
- Show the buy button at LEAST twice (after hero, after reviews).
- This system values personality over perfection. A slight rotation, a thick border, a hand-drawn element — these are features.
- NO glassmorphism, NO gradients, NO blur effects. Flat. Bold. Direct.
```

---

## Template 7: Warm Console (Analog Dashboard)

A recording studio control board meets a leather-bound notebook. For data products that need warmth. Every metric feels handcrafted instead of machine-generated.

```markdown
# DESIGN.md — [Your Dashboard Name]

## Brand
- Name: [Your Product]
- Identity: A vintage recording console — physical controls, warm indicators, analog feel with digital precision.
- Personality: Warm, organized, reliable, crafted
- Tone: Clear and helpful. Instrumentation language ("levels", "signals", "channels").

## Colors
- Background: Dark Mahogany #161412
- Surface: Console #1E1C18
- Surface raised: Walnut #282520
- Surface hover: #302D28
- Text primary: Cream #E8E2D8
- Text secondary: Dusty #8A8478
- Accent primary: Amber #D4943E
- Accent hover: Amber Light #E0A550
- Accent dim: rgba(212,148,62,0.10)
- Success: Olive #7FB069
- Warning: Gold #E8C840
- Error: Rust #C0513F
- Info: Copper #B87340
- Border: rgba(212,148,62,0.12)
- Border subtle: #2A2722

## Typography
- Headings: DM Sans 600, tracking -0.01em
- Display: Libre Caslon Text 400 italic (for dashboard titles and section headers only — analog feel)
- Body: Inter 400, 14px, line-height 1.5
- Data: DM Mono 500, 13px, tabular-nums
- Labels: DM Sans 500, 11px, uppercase, tracking 0.05em, Dusty color
- Stat numbers: DM Mono 700, 28px

## Spacing
- Section padding: 24px
- Card padding: 20px
- Grid gap: 16px
- Table row height: 44px
- Base unit: 4px

## Visual Texture
- Wood grain: Subtle SVG pattern on the main background — very fine horizontal lines with slight variation at 3% opacity, suggesting a wood surface.
- No noise filter. The wood grain IS the texture.
- Groove lines: Thin inset effects (1px darker on top, 1px lighter on bottom) on section separators, creating a physical groove/channel feel.

## Custom SVG Language
Analog instrument aesthetic:
- Stroke width: 1.5px
- Color: Amber #D4943E (primary), Cream #E8E2D8 (secondary)
- Style: Instrument faces — circular gauges, analog meters, needle indicators

Required SVG elements:
- Brand mark: A VU meter or gauge icon — circular with a needle
- Meter bars: Horizontal bars segmented into zones (green→yellow→red) like audio level meters. Used for all percentage/health metrics.
- Gauge: Semi-circular SVG with a rotating needle for score/health indicators
- Waveform: Audio-style waveform for time-series data visualization
- Knob: Circular SVG that looks like a physical control knob (used for settings/adjusters)

## Buttons
Buttons look like physical console controls:

- Primary: Amber #D4943E background, Dark Mahogany text. A convex effect: 1px inset-top highlight rgba(255,255,255,0.15), 1px inset-bottom shadow rgba(0,0,0,0.2), 2px outer bottom shadow #8A6220 (darker amber). On hover: subtle warm glow box-shadow 0 0 12px rgba(212,148,62,0.15). On click: convex inverts to concave (inset shadows swap). Feels like pressing a physical button.
- Secondary: Console #1E1C18 bg, 1px Border, Cream text. Same convex/concave press behavior.
- Toggle: Pill-shaped. Off: Console bg, 1px border. On: Amber bg with a slider circle that moves left→right. The slider has a convex highlight.
- All buttons: 8px radius, 10px 20px padding, DM Sans 500.

## Cards
- Background: Console #1E1C18
- Border: 1px solid #2A2722
- Radius: 12px
- Shadow: 0 2px 4px rgba(0,0,0,0.2) (warm, dark shadow)
- Header: A slightly recessed bar at top (1px inset border effect) with title in DM Sans 500 and an Amber accent indicator dot
- Hover: border shifts to rgba(212,148,62,0.15), shadow deepens

## Data Visualization
- VU Meters: Horizontal segmented bars (like audio level meters). Segments go from Olive (low) → Gold (mid) → Rust (high). Active segments are filled, inactive are dark.
- Gauges: Semi-circular with a thin needle. Background segments colored in zones.
- Line charts: Amber line, Console grid lines at 5% opacity. No fill. Dot markers at data points.
- Sparklines: 1px Amber line inside stat cards.
- All charts: Cream labels, DM Mono font, no heavy gridlines.

## Layout
- Sidebar: 56px collapsed, 220px expanded. Dark Mahogany bg. Top: brand mark. Nav items: icon + label. Active: Amber left bar + dim bg. User at bottom.
- Content: Fluid, left-aligned. Stat cards top row, chart middle, table bottom.
- Tables: Console bg, thin borders, Amber text for key metrics. Sorted column indicated by Amber header text + arrow.
- Mobile: Bottom tab nav replacing sidebar. Stats stack 2x2. Tables scroll.

## Rules
- Warm shadows only. Never use blue/cool-tinted shadows.
- Amber is the ONLY bright color in the interface. Everything else is warm neutral.
- VU meter bars should be used instead of standard progress bars wherever possible.
- The Libre Caslon Text italic is for section titles and dashboard names only — never for body or data.
- Every card should feel like a physical instrument panel. Headers are recessed. Buttons are convex.
- Loading: A warm amber pulse/sweep animation on skeleton screens.
```

---

## Template 8: Community Club (Membership Platform)

A private social club's welcome packet meets a vibrant marketplace. Warm, social, activity-driven. For communities, memberships, and groups where the people ARE the product.

```markdown
# DESIGN.md — [Your Community Name]

## Brand
- Name: [Your Community]
- Identity: The best dinner party you've ever been to — diverse, energized, welcoming, with substance behind the warmth.
- Personality: Inclusive, active, real, valuable
- Tone: We/us language. Supportive but direct. No hype.

## Colors
- Background: Warm Cloud #F7F5F0
- Surface: White #FFFFFF
- Surface accent: Deep Olive #1A2E1F (for featured/inverted sections)
- Text primary: Espresso #1C1816
- Text secondary: Slate Brown #6B635A
- Accent primary: Ember Red #D64045
- Accent hover: Ember Dark #C13538
- Accent dim: rgba(214,64,69,0.08)
- Success: Spring #3DA35D
- Progress: Honey #E8A838
- Info: River #3B82F6
- Border: #DCD6CC
- Avatar ring: Ember Red (for featured members)

## Typography
- Headings: Lexend 700, tracking -0.02em
- Display: DM Serif Display 400 italic (community name, hero headlines, event titles)
- Body: DM Sans 400, 15px, line-height 1.6
- Labels: DM Sans 500, 12px, uppercase, tracking 0.04em
- Member names: Lexend 600, 14px
- Stats: DM Mono 600, tabular-nums
- Badges: DM Sans 700, 11px

## Spacing
- Section padding: 64px vertical
- Card padding: 24px
- Feed item padding: 20px
- Avatar sizes: 36px (feed), 48px (comments), 64px (profiles), 96px (hero/featured)
- Grid gap: 20px
- Base unit: 8px

## Visual Texture
- Subtle linen: SVG crosshatch at 2% opacity on Warm Cloud sections
- Confetti: Small SVG shapes (circles, triangles, squares in Ember, Spring, Honey) scattered at 4% opacity behind celebration/milestone sections

## Custom SVG Language
Social and celebratory:
- Stroke width: 2px
- Color: Ember Red #D64045 (primary), Spring #3DA35D (success), Honey #E8A838 (reward)
- Style: Rounded, friendly, slightly playful but not childish

Required SVG elements:
- Brand mark: A table viewed from above with chairs (representing community gathering)
- Member badges: Achievement badges — flame (streak), star (top contributor), crown (founding member), trophy (challenge winner)
- Activity icons: Chat bubble, calendar event, video camera, document, handshake — rounded 2px stroke
- Celebration: Party popper, confetti burst, firework — used when members hit milestones
- Streak flames: 1-flame through 5-flame indicators for engagement streaks, filled in Honey

## Buttons
Community buttons are inviting and satisfying to click:

- Primary (join/CTA): Ember Red #D64045 bg, White text. Slightly raised: inner-top 1px highlight rgba(255,255,255,0.15), bottom 2px shadow #A83033 (darker ember). On hover: warm glow box-shadow 0 0 16px rgba(214,64,69,0.2), scale 1.02. On click: drops and flattens. Transition: 200ms spring.
- Secondary: White bg, 1px DCD6CC border, Espresso text. On hover: border shifts to Ember at 30%, background tints with Ember at 3%.
- Upvote/Like: Transparent, 1px border. On click: fills with Ember bg, a small heart SVG scales up and fades (like Instagram's heart animation). Feels rewarding.
- Follow: Pill-shaped. Before: 1px Ember border, Ember text. After click: Ember bg, White text, text changes to "Following ✓".
- All buttons: 10px radius, 12px 24px padding, DM Sans 600.

## Cards
- Post cards: White bg, 1px #DCD6CC border, 14px radius. Author row: avatar + name (Lexend 600) + time (DM Sans 400 muted). Content below. Reaction bar at bottom (like, comment, share icons).
- Event cards: White bg with a Deep Olive top banner (8px radius top corners). Event title in DM Serif Display, date/time prominent, member count with overlapping avatar row.
- Member cards: White bg, avatar centered top (overlapping the card edge by 50%), name, role, join date, contribution count. Ember border-top (3px) for featured members.
- Achievement cards: Warm Cloud bg, badge SVG centered, achievement name, date earned. Subtle Honey border-left (3px).

## Community-Specific Components
- Avatar stack: Overlapping circular avatars (3-5 showing) with a "+12 more" counter. Avatars have 2px White border between them.
- Activity feed: Single column, max 720px. Each post chronological. Sticky date dividers.
- Leaderboard: Numbered list. Position (DM Mono), avatar, name, points, streak badge SVG. Top 3 get: gold/silver/bronze left-border accents.
- Progress bar: Rounded pill, Ember fill on Warm Cloud bg, percentage label at end. Used for course progress, challenges, goals.
- Engagement heatmap: 7-column grid (S-S) showing daily activity. Cells shade from Warm Cloud (inactive) to Ember (highly active).

## Layout
- Landing page: Hero (headline + member count + CTA + avatar stack), value props (3 cards), community preview (feed mockup), testimonials, pricing, FAQ.
- Feed: Single column max 720px, centered. Sidebar (right, optional): leaderboard, upcoming events, pinned resources.
- Profile: Cover photo (full width, 200px height), avatar overlapping (96px, centered), stats row (posts, streak, points), activity feed below.
- Mobile: Sidebar moves below content. Avatar stack shows 3 instead of 5. Feed takes full width.

## Gamification
- Points: Displayed in DM Mono, Honey color, with a small coin SVG icon
- Streaks: Flame SVGs (1-5 flames) showing consecutive engagement days
- Levels: Named tiers (Newcomer → Regular → Contributor → Leader → Legend) with associated badge SVGs
- Challenges: Card with progress bar, challenge description, reward badge preview
- All gamification is visible but never overwhelming. Points and badges should be in corners and side panels, not center stage.

## Rules
- Always show member count ("Join 430+ operators") — real numbers build trust
- Real member quotes with first name, role, and specific results — not generic "Great community!" testimonials
- Activity indicators: green dot = online (visible on avatars), relative timestamps on posts
- The "Join" CTA should appear at least 3 times on the landing page (hero, after preview, after pricing)
- Ember Red is for primary actions and featured items ONLY. Don't use it for decoration.
- Deep Olive accent sections should appear 1-2 times per page for visual contrast
- Prices are simple and clear. No hidden fees. No confusing tier names. "$29/month" not "Starting from..."
```

---

## Customizing Templates

### Quick Personalization Checklist

1. **Replace all `[Your Brand]` markers** with your actual brand name
2. **Swap hex codes** to match your brand colors (maintain the same role assignments)
3. **Pick your fonts** from Google Fonts and update the font names (keep the weight/size/tracking rules)
4. **Update SVG descriptions** to match your industry (the SVG style rules should stay, the subject changes)
5. **Adjust button behavior** to match your brand energy (keep the depth/physical feel, change the specifics)
6. **Add your own rules** at the bottom for brand-specific constraints

### How to Choose Your Template

| If your brand feels like... | Use Template |
|----|---|
| A research lab that's also beautiful | 1 — Organic Tech |
| A private control room with gold trim | 2 — Midnight Command |
| A print magazine or craft studio | 3 — Warm Atelier |
| A protest poster or design manifesto | 4 — Signal System |
| A sci-fi interface from 2040 | 5 — Neon Lab |
| A handmade flyer for something awesome | 6 — Street Corner |
| A recording studio with warm instruments | 7 — Warm Console |
| A dinner party that changed your life | 8 — Community Club |

---

*From The Operator Vault. theoperatorvault.io*
