# Anti-Slop Design Checklist

AI design tools will give you something that looks fine at first glance. The problem is "fine" doesn't convert, doesn't build trust, and doesn't stand out. This checklist catches the patterns that separate throwaway prototypes from designs people actually want to use.

---

## What "Slop" Looks Like in AI Design

Slop is AI-generated design that technically works but feels generic, unfinished, or like every other AI-generated site. You've seen it: the same gradient hero, the same 3-column feature grid, the same "Get Started" button with no personality.

### The 12 Slop Patterns

| # | Pattern | What It Looks Like | The Fix |
|---|---------|-------------------|---------|
| 1 | **Gradient blob hero** | Purple-to-blue gradient background with white text and a "Get Started" button | Use a specific brand color or a real product screenshot as the hero |
| 2 | **3-card feature grid** | Three identical cards with icon, title, 2-line description | Vary the card layouts. Mix stat blocks, images, and different card sizes |
| 3 | **Generic CTA text** | "Get Started", "Learn More", "Sign Up" | Write specific CTAs: "Start your free invoice", "See the dashboard", "Book a 15-min call" |
| 4 | **Stock photo energy** | Smiling diverse team around a laptop | Use product screenshots, illustrations, or no images over stock photos |
| 5 | **Same spacing everywhere** | Equal padding on every section | Vary section padding. Hero gets more space. Dense sections get less |
| 6 | **No visual hierarchy** | Everything is the same size and weight | One thing per section should be 2-3x larger than everything else |
| 7 | **Blue accent default** | Every button and link is the same medium blue | Pick a distinctive accent color that matches the brand personality |
| 8 | **Rounded corners on everything** | Every element has the same 8px radius | Mix sharp corners (images, dividers) with rounded (buttons, cards) |
| 9 | **No social proof** | No logos, reviews, or numbers | Add real numbers: "430+ members", "rated 4.8/5", "used by NASA" |
| 10 | **Placeholder copy** | "Lorem ipsum" or "Your Company Name Here" | Name the brand. Write real headlines. Even fake content beats placeholder |
| 11 | **Missing empty states** | App screens only show the "full" version | Design what happens when there's no data, no results, first-time use |
| 12 | **No personality** | Could belong to any company in any industry | Add one unique visual element: a hand-drawn accent, a bold color, a custom illustration |

---

## The Quality Checklist

Run every design through this before you ship it. Score each dimension 1-5.

### Visual Hierarchy (Does the eye know where to go?)

- [ ] **One dominant element per section.** Is there a clear focal point?
- [ ] **Size contrast.** Does the most important thing look at least 2x bigger?
- [ ] **Color contrast.** Is the CTA the highest-contrast element?
- [ ] **Reading order.** If you squint, does the layout guide top-to-bottom, left-to-right?
- [ ] **Breathing room.** Do important elements have more space around them?

### Typography (Does the text feel intentional?)

- [ ] **Max 2 fonts.** One for headings, one for body. Three is almost always wrong.
- [ ] **Clear size scale.** At least 3 distinct sizes: heading, subheading, body.
- [ ] **Line height.** Body text at 1.5-1.7 line height. Headings at 1.1-1.2.
- [ ] **Line length.** Body text stays under 75 characters per line. Use max-width.
- [ ] **Weight contrast.** Bold headings (700-800), regular body (400-500).

### Color (Does it feel intentional, not random?)

- [ ] **One accent color dominates.** Not three competing accents.
- [ ] **Background isn't pure white.** Off-white (#f8f8f8, #fafafa, #f5f5f5) feels warmer.
- [ ] **Text isn't pure black.** Dark gray (#1a1a1a, #111827) is easier on the eyes.
- [ ] **Accent used sparingly.** CTAs, links, and key indicators only.
- [ ] **Color means something.** Green = success, red = error, blue = info. Consistent everywhere.

### Spacing (Does it feel organized or crammed?)

- [ ] **Consistent spacing unit.** Pick 4px, 8px, or a similar base unit. Multiply from there.
- [ ] **Section padding varies.** Hero and closing sections get the most padding.
- [ ] **Cards have inner breathing room.** At least 20-28px padding inside cards.
- [ ] **Elements are grouped logically.** Related things are close. Unrelated things have gaps.
- [ ] **No touching.** No element touches another without intentional spacing.

### Interaction & Polish

- [ ] **Hover states exist.** Buttons, cards, and links change on hover.
- [ ] **Focus states visible.** Keyboard users can see where they are.
- [ ] **Loading states designed.** Skeleton screens, spinners, or progress bars.
- [ ] **Error states designed.** What happens when something goes wrong?
- [ ] **Mobile considered.** Does this work on a phone without horizontal scrolling?

### Trust & Credibility

- [ ] **Real numbers.** Specific metrics beat vague claims.
- [ ] **Social proof present.** Logos, testimonials, star ratings, user counts.
- [ ] **Professional footer.** Links, legal text, social icons. Not just "© 2026."
- [ ] **Consistent branding.** Same colors, fonts, and tone across every page.
- [ ] **No broken layouts.** Every section has balanced, intentional alignment.

---

## Anti-Vibe-Code Principles

"Vibe coding" means you describe what you want and AI builds it. The danger: you accept the first result because it looks "good enough." These principles prevent that.

### 1. First output is a draft, not a design

Never screenshot the first result and call it done. The first output is a starting point. Plan 3-5 iteration prompts before you even begin.

### 2. Name the style before you prompt

Pick a design style from the DESIGN-STYLES.md file before writing your prompt. "I want Stripe Minimal" is a design decision. "Make me a landing page" is a coin flip.

### 3. Specify what you hate

"No gradient backgrounds, no stock photos, no rounded corners over 8px" is as valuable as describing what you want. Constraints produce better designs than open-ended prompts.

### 4. Test with real content

Replace every placeholder with real text. "Join 430+ operators building AI automation" hits different than "Sign up for our newsletter." Real content exposes layout problems that placeholders hide.

### 5. Check on mobile first

AI design tools optimize for desktop. Always generate a mobile version and check it. Most of your users are on phones.

### 6. Ask "would I screenshot this?"

If you wouldn't pause to screenshot a section, it's not good enough. Every section above the fold should pass this test.

### 7. One hero, one action

The top of every page should have ONE clear thing to do. If there are 3 buttons above the fold, you have zero buttons above the fold.

### 8. Steal the DESIGN.md

Before building anything, extract a DESIGN.md from a site you admire. This gives your AI constraints that match professional quality. Building without a design system is how you get slop.

---

## Quick Audit: 5-Second Test

Show your design to someone for 5 seconds, then hide it. Ask:

1. What does this company/product do?
2. What were you supposed to click?
3. What color was the main button?

If they can't answer all three, your hierarchy needs work.

---

*From The Operator Vault. theoperatorvault.io*
