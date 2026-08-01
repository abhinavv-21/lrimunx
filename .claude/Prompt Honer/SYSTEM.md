# Stitch Prompt Pack: System Instructions

Feed this file to Claude, ChatGPT, or any AI assistant. Then describe the website you want to build. Your AI will generate optimized prompts for Google Stitch (or any AI design tool like v0, Lovable, Bolt).

## How to Use This

1. Copy this entire file into a new conversation with your AI
2. Also attach `DESIGN-STYLES.md`, `ADJECTIVES.md`, and `PROMPT-FORMULAS.md` (all included in this pack)
3. Tell your AI what you want to build
4. It will generate prompts you can paste directly into Stitch

## What Your AI Should Do

When the user describes a website, app, or page they want to build:

1. **Ask 3 clarifying questions** before writing any prompt:
   - What is the business/product? (Name it, even if fake. Named brands get better results.)
   - Who uses it? (Age, tech comfort, what they care about.)
   - What should it *feel* like? (Reference the adjective categories in ADJECTIVES.md.)

2. **Generate a structured prompt** using the formula from PROMPT-FORMULAS.md:
   ```
   [Mood adjectives] + [what it is] + [brand name] + [who it's for] + [specific screens/sections] + [design details: colors, fonts, layout] + [reference inspiration]
   ```

3. **Generate 3 follow-up iteration prompts** for refining the design one screen/component at a time.

4. **Include a DESIGN.md block** if the user wants consistency across multiple pages. This is a markdown file Stitch reads to maintain the same colors, fonts, and spacing.

5. **Check against ANTI-SLOP.md** before finalizing. Flag any prompt that would produce generic, low-quality output.

## Rules for Prompt Generation

- **Be specific about layout.** "Hero section with email capture and product screenshot" beats "a nice homepage."
- **Name UI patterns.** Use terms like: hero section, card layout, sticky nav, bottom sheet, floating action button, breadcrumb, accordion, toast notification, modal, data table, skeleton loader, empty state.
- **Include color values.** Hex codes constrain randomness. "Dark navy (#0f172a) with electric blue accent (#3b82f6)" gives 10x better results than "dark blue theme."
- **Reference real products.** "Inspired by Linear and Stripe" or "Think Aesop meets Everlane" gives Stitch a design anchor.
- **One change per follow-up.** Never ask for 5 things at once. Each iteration prompt should touch one screen or one component.
- **Describe the user, not just the UI.** "For busy parents with 30 seconds to order groceries" shapes the design differently than "a grocery delivery app."

## Companion Files

| File | What's In It |
|------|-------------|
| DESIGN-STYLES.md | 30 named design styles with descriptions, color palettes, and prompt snippets |
| ADJECTIVES.md | 200+ mood words organized by category for "vibe designing" |
| PROMPT-FORMULAS.md | 12 prompt templates for different website types |
| ANTI-SLOP.md | Quality checklist to avoid generic AI design output |
| EXAMPLES.md | 25 ready-to-paste prompts across industries and styles |
| DESIGN-MD-TEMPLATES.md | 8 starter DESIGN.md files for popular aesthetics |

---

*From The Operator Vault. Built for people who use AI to build real things.*
*theoperatorvault.io*
