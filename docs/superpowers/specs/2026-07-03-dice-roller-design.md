# Dice Roller — design

**Date:** 2026-07-03
**Status:** approved (autonomous — self-reviewed per TODO workflow)
**TODO item:** "New tools → Dice Roller"

## Purpose

A standalone tool at `tools/dice/` for rolling any combination of polyhedral
dice with modifiers. Ships the "Dice Roller" card on the landing page from
"Coming Soon" (a `div`) to "Live" (an anchor), matching the Generator and
Workshop tools.

The value over rolling dice in the Generator's Quick template is dice-native
output: a **per-die breakdown** (not just a total), **keep/drop** and
**advantage/disadvantage**, and a **roll history** that survives reload.

## Scope

In scope:

- Standard dice notation: multiple additive/subtractive terms, each a constant
  or an `NdM` dice term, with optional keep/drop suffixes.
- Keep/drop: `kh`/`kl` (keep highest/lowest N), `dh`/`dl` (drop highest/lowest N).
- Advantage / disadvantage: quick buttons that roll `2d20kh1` / `2d20kl1`.
- Quick-roll buttons for the standard polyhedral set (d4, d6, d8, d10, d12,
  d20, d100).
- Per-die breakdown in the result, with dropped dice visibly struck through.
- Roll history (last 50), persisted in `store.js`, with a clear button.
- Copy the current result as text.

Out of scope (YAGNI):

- No seed input. A dice roller wants fresh randomness; reproducibility is a
  Generator concern. The dice module still takes an injected RNG so tests are
  deterministic, but the page always rolls with a fresh random RNG.
- No exploding dice, rerolls (`r`), success-counting pools, or custom die
  faces. These are notation extensions that can come later if asked for.
- No fudge/Fate dice (`dF`).

## Why a dedicated dice module (not the engine's dice parser)

The engine (`gen/`) already parses and rolls `{3d6+2}`, and the TODO says to
build on it. We do — but only on `gen/rng.js`, the seedable RNG. The engine's
dice *evaluator* (`engine.js`, `case 'dice'`) returns just the summed total; it
exposes neither the individual die values a breakdown needs nor keep/drop. So
the tool gets its own small notation parser + roller in `tools/shared/dice.js`,
reusing `RNG` for the actual randomness. This keeps the engine focused on
template expansion and keeps dice-tool concerns out of it.

## Architecture

Follows the established three-part shape: testable logic in `tools/shared/`, a
thin untested `app.js` for DOM wiring, an `index.html` using `tools.css`.

### `tools/shared/dice.js` (pure, tested)

The whole notation-and-rolling brain. No DOM, no storage. Public surface:

- `class DiceError extends Error` — thrown for invalid notation, with a
  human-readable message (mirrors `GenError` / `ParseError` style).
- `parse(expr) -> { terms }` — parse a notation string to an AST. Throws
  `DiceError`.
- `roll(expr, rng) -> RollResult` — parse then roll, using an injected RNG
  (an instance of `gen/rng.js`'s `RNG`, or anything with `.int(min,max)`).
  Throws `DiceError` on bad notation.
- `rollToText(result) -> string` — one-line plain-text summary for copy and
  history, e.g. `4d6kh3+2 → 15`.

Grammar:

```
expression := ['+'|'-'] term ( ('+'|'-') term )*
term       := dice | integer
dice       := count? 'd' sides keepdrop?
count      := integer          # omitted ⇒ 1  (so `d20` == `1d20`)
sides      := integer | '%'    # '%' ⇒ 100    (so `d%` == `d100`)
keepdrop   := ('kh'|'kl'|'dh'|'dl') integer
```

Whitespace is ignored. Case-insensitive (`D20` == `d20`). Limits, each raising
a `DiceError` with a specific message: `count` in 1..1000, `sides` >= 1,
keep/drop N in 1..count (keeping/dropping more dice than were rolled is an
error, not a silent clamp — it almost always means a typo).

`RollResult` shape:

```js
{
  expression: '4d6kh3+2',            // normalized echo of the input
  terms: [
    {
      kind: 'dice',
      notation: '4d6kh3',
      sign: 1,                        // +1 or -1
      count: 4, sides: 6,
      keepDrop: { op: 'kh', n: 3 } | null,
      dice: [                         // one per die rolled, input order
        { value: 5, kept: true },
        { value: 2, kept: false },    // dropped by kh3
        { value: 6, kept: true },
        { value: 4, kept: true },
      ],
      subtotal: 15,                   // sum of kept dice, unsigned
    },
    { kind: 'const', sign: 1, value: 2, subtotal: 2 },
  ],
  total: 17,                          // Σ sign * subtotal
}
```

Keep/drop semantics: rank the term's dice by value, mark the selected ones
kept/dropped, but preserve original roll order in `dice[]` so the breakdown
reads left-to-right as rolled. `subtotal` sums only `kept` dice.

### `tools/dice/index.html`

Same header/nav chrome as the other tools. A single main panel:

- Expression input (`text`) + **Roll** button (Enter also rolls).
- A row of quick-die buttons (d4…d100): each sets the input to `1dX` and rolls
  immediately. **Advantage** / **Disadvantage** buttons set the input to
  `2d20kh1` / `2d20kl1` and roll.
- Result panel: the total large, the parsed expression, and the per-die
  breakdown grouped by term (dropped dice struck through). Invalid notation
  renders an `error-card`, never throws.
- History section: last 50 rolls (newest first) as `expression → total`, each
  clickable to reload that expression into the input; a **Clear** button.

### `tools/dice/app.js` (thin, untested)

DOM wiring only. Holds a single `RNG()` (fresh random) used for every roll;
constructs a new `RNG()` per roll so successive rolls differ. Reads/writes
history through `store.js` under `dice-history`. Renders results and history,
escaping all interpolated text via `esc()`. Catches `DiceError` and renders the
error card.

## Data flow

1. User types/クリック → `app.js` gets an expression string.
2. `roll(expr, new RNG())` → `RollResult` (or `DiceError`).
3. `app.js` renders the result, prepends `{ expression, total, text }` to the
   history array, trims to 50, `store.set('dice-history', …)`.
4. On load, `store.get('dice-history', [])` repaints the history list.

## Error handling

- All notation errors are `DiceError` with a message naming the problem
  (`unknown token`, `count must be 1–1000`, `cannot keep 3 of 2 dice`, …).
- `app.js` wraps every `roll` in try/catch and shows the message in an
  `error-card`. Nothing user-typed reaches the DOM without `esc()`.

## Testing

`tools/shared/dice.test.js` (node:test, like the other shared modules):

- **Parsing:** `d20`→`1d20`; `d%`→sides 100; multi-term signs; keep/drop
  parsing; whitespace and case-insensitivity.
- **Errors:** empty input, garbage tokens, `count`/`sides` out of range,
  keep/drop N exceeding count, trailing operator.
- **Rolling (deterministic):** inject a stub RNG (fixed `.int` sequence) and
  assert per-die values, `kept` flags for each keep/drop op, `subtotal`,
  signed `total`.
- **`rollToText`:** shape of the one-line summary.

The tool page itself (`app.js`) stays untested, per repo convention; all logic
worth testing lives in `dice.js`.

## Landing page + navigation

- `index.html`: change the Dice Roller `div.card` to
  `a.card.card-live` → `tools/dice/` with a `badge badge-live`.
- Cross-link nav: add a "Dice →" (or similar) link in the other tools' headers
  is optional; at minimum the Dice page links back home and to the Generator.

## Files

New:

- `tools/shared/dice.js`
- `tools/shared/dice.test.js`
- `tools/dice/index.html`
- `tools/dice/app.js`

Modified:

- `index.html` (card → Live)
- `tools/shared/tools.css` (a few dice-specific classes)
- `TODO.md` (check the item off)
