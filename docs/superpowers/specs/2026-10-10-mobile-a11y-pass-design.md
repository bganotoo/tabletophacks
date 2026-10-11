# Mobile, touch, and accessibility pass

**Date:** 2026-10-10
**Roadmap items (Platform checks):** Mobile and touch pass; Accessibility pass.

## Method

Every page was loaded in headless Edge at 390×844 with mobile and touch
emulation (Chrome DevTools Protocol), screenshotted, and probed for:
horizontal overflow, interactive elements under 32px in either dimension,
buttons/links without an accessible name, and form controls without a label.
The same probe is re-run after the fixes.

## Findings

| # | Finding | Where |
|---|---------|-------|
| 1 | Header nav overflows; pages scroll sideways (up to 553px wide at 390px) | every tool page |
| 2 | Generator sidebar (~800px of names) stacks above the results on a phone | Generator |
| 3 | Per-part reroll buttons only appear on hover, so touch users never see them | Generator results |
| 4 | Number inputs are unstyled browser defaults (white box, 19px tall) | Generator count, Initiative, Timer |
| 5 | Most buttons are 28px tall; reroll buttons 18×11; footer and nav links ~27px | everywhere |
| 6 | No site-wide `:focus-visible` style; inputs remove the outline on focus | everywhere |
| 7 | The landing page animates (card stagger, chevron bounce) regardless of `prefers-reduced-motion` | landing page |

No unnamed buttons or unlabelled controls were found; the tools already use
`aria-label` where a visible label is missing.

## Fixes

1. **Header:** at ≤820px the header wraps; the nav takes its own row and
   scrolls horizontally instead of the page. Nav links never break inside
   ("Generator →" stays on one line).
2. **Collapsible sidebar (Generator):** at ≤820px the sidebar is hidden
   behind a full-width "Generators" toggle (`aria-expanded`,
   `aria-controls`). Choosing an item collapses it again. Desktop is
   unchanged — the toggle is not displayed there. Wired by a shared
   `wireSidebarToggle(toggle, sidebar)` in `ui.js`, so the Workshop can
   adopt it later; it does not today, because its sidebar holds its primary
   actions and is short.
3. **Reroll buttons on touch:** under `(hover: none)` they are always shown
   at reduced opacity.
4. **Number and search inputs** join the shared input style.
5. **Touch targets:** under `(pointer: coarse)`, `.btn` and inputs get a
   44px minimum height, `.btn-small` 36px, sidebar items, nav and footer
   links get padding to ~40px, and reroll buttons get a 32px hit area. Mouse
   users see no change.
6. **Focus:** one `:focus-visible` rule (2px accent outline, 2px offset) for
   buttons, links, summaries, and checkboxes, on both stylesheets. Text inputs
   keep their accent border.
7. **Reduced motion:** `prefers-reduced-motion: reduce` turns off the landing
   page's animations and transitions.

## Regression guard

`a11y.test.js` scans every HTML page (regex, like `seo.test.js`): `<html
lang>`, a `viewport` meta, every `<button>` has text or `aria-label`, every
`<input>`/`<select>`/`<textarea>` (except hidden and file inputs) has
`aria-label`, `aria-labelledby`, a `<label for>`, or a wrapping `<label>`.
Dynamic UI built in `app.js` is outside its reach — that is what the browser
probe covered.

## Not in scope

- **Safari/iOS check** stays open: it needs a real Safari, and headless
  Edge's mobile emulation is not one.
- A colour-contrast audit found no failures in the palette
  (`--text-muted` on `--background` is ~5.5:1, on `--card` ~5:1).
