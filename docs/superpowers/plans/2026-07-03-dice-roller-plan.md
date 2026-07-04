# Dice Roller — implementation plan

Spec: [../specs/2026-07-03-dice-roller-design.md](../specs/2026-07-03-dice-roller-design.md)

TDD for `dice.js`; the page (`app.js`, `index.html`) is thin wiring and follows
existing tools. Work on branch `feat/dice-roller`.

## Task 1 — `tools/shared/dice.js` + tests (TDD)

Write `tools/shared/dice.test.js` first, then implement until green.

1. `DiceError extends Error` (name `'DiceError'`).
2. `parse(expr)` → `{ terms }`. Tokenize on `+`/`-`; each term is
   `count?d(sides|%)keepdrop?` or an integer. Normalize case, strip whitespace.
   Validate: `count` 1..1000, `sides` >= 1, keep/drop `n` 1..count. Throw
   `DiceError` with specific messages otherwise.
3. `roll(expr, rng)` → `RollResult` (shape in spec). For each dice term roll
   `count` dice via `rng.int(1, sides)`; apply keep/drop by ranking a copy while
   preserving roll order in `dice[]`; `subtotal` = Σ kept; `total` = Σ sign·subtotal.
4. `rollToText(result)` → `"<expression> → <total>"`.

Test cases: parsing (`d20`, `d%`, multi-term signs, keep/drop, case/space),
errors (empty, garbage, out-of-range, keep>count, trailing op), rolling with a
stub RNG (fixed `.int` sequence) asserting per-die `kept` flags + `subtotal` +
signed `total` across kh/kl/dh/dl, and `rollToText`.

## Task 2 — `tools/dice/index.html`

Copy the header/nav/`tools.css` chrome from `tools/reference/index.html`.
Elements: `#dice-input`, `#roll-btn`, quick-die button row (`data-die`), adv/dis
buttons, `#result-panel`, history `<section>` with `#history-list` and
`#clear-history-btn`.

## Task 3 — `tools/dice/app.js`

Thin wiring. Import `roll, rollToText, DiceError` from `../shared/dice.js`,
`RNG` from `../../gen/rng.js`, `esc` from `../shared/render.js`, `el/clearNode/toast`
from `../shared/ui.js`, `createStore` from `../shared/store.js`.

- `doRoll(expr)`: try `roll(expr, new RNG())`, render breakdown, push to history
  (prepend, cap 50, persist under `dice-history`); on `DiceError` render an
  `error-card`.
- Wire Roll button + Enter, quick-die buttons (set input `1dX`, roll), adv/dis
  (`2d20kh1`/`2d20kl1`), history-item click (reload expression), Clear button.
- Repaint history from `store.get('dice-history', [])` on load.

## Task 4 — CSS

Add dice-specific classes to `tools/shared/tools.css`: die-button row, big total,
per-term breakdown, dropped-die strikethrough, history list. Reuse existing
`btn`, `error-card`, `tool-section` etc.

## Task 5 — Landing page + TODO

- `index.html`: Dice Roller `div.card` → `a.card.card-live` href `tools/dice/`
  with `badge badge-live`.
- Check the TODO item off with date + spec link.

## Verify

- `npm test` green (new dice tests + existing suite).
- Serve locally, roll `4d6kh3`, `2d20kh1`, `1d20+5`, `d%`, and a bad expression;
  confirm breakdown, history persistence across reload, and the error card.
