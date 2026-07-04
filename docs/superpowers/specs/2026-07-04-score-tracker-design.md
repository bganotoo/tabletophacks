# Score Tracker — design

**Date:** 2026-07-04
**Status:** approved (autonomous — self-reviewed per TODO workflow)
**TODO item:** "New tools → Score Tracker"

## Purpose

A standalone tool at `tools/score/` for keeping score at the table: a
multi-player score sheet with per-round (or per-category) entry, live running
totals per player, and a leader highlight. Multiple named sheets can be saved
and switched between, so the same tool serves "tonight's Catan game" and "our
ongoing cribbage tally" without one clobbering the other.

Ships the "Score Tracker" card on the landing page from "Coming Soon" (a `div`)
to "Live" (an anchor), matching the Generator, Workshop, Dice, Initiative, and
Timer tools.

The value is the thing everyone reaches for a scrap of paper for: a shared,
persistent tally that adds itself up, survives a reload mid-game, and remembers
last week's sheet.

## The unifying idea: it's a grid of columns

The TODO asks for two things that sound separate — "per-round score entry" and
"optional score categories (multiple scoring tracks)" — but they're the same
shape: a **grid** of players (rows) × **columns**, where each cell holds a
number and a player's total is the sum across their row.

- A **round-based** game (Yahtzee, trick-taking, cribbage) adds a column per
  round. The "Add round" button auto-names them `Round 1`, `Round 2`, …
- A **category-based** game (Catan endgame, Wingspan, Terraforming Mars) uses a
  few named columns. The same columns, renamed to `Eggs`, `Bonus`, `Longest
  road`, …

So there is **one** concept — a renameable column — not two. This deliberately
avoids a 3-D player × round × category grid, which is more structure than a
tabletop score sheet ever needs (YAGNI). A game that truly wants both can make a
column per round *or* per category, whichever it scores by; nobody scores both
ways at once on paper.

Consequences:

- The core state is small and obvious: players, columns, and a sparse cell map.
- Blank cells are simply absent from the map and read as `0`, so an empty grid
  costs nothing and totals are always well-defined.

## Scope

In scope (the TODO line: "multi-player score sheet; named players, per-round
score entry, running totals, optional score categories; persist sheets in
`store.js`; allow multiple saved sheets like the generator library"):

- **Sheets** — a saved collection of named score sheets, one open ("active") at
  a time, mirroring the generator library's multiple-saved-things UX. Create,
  rename, delete, and switch between sheets. Each sheet is fully independent
  (its own players, columns, and scores).
- **Players** — an ordered roster on the active sheet; each has a name. Add,
  rename, reorder (±1), and remove. Removing a player prunes their scores.
- **Columns** — an ordered list on the active sheet; each has a name. "Add
  round" appends an auto-named `Round N`; any column can be renamed to serve as
  a category. Reorder (±1) and remove; removing a column prunes its scores.
- **Score entry** — one number per (player, column) cell. Blank clears the cell
  (reads as 0). Values may be negative or fractional (some games subtract or use
  halves); non-numeric input is rejected with a toast, leaving state unchanged.
- **Running totals** — each player's total is the live sum across their row,
  recomputed on render. The current leader(s) — the player id(s) with the
  maximum total — are highlighted, so "who's winning" is visible at a glance.
- **Persistence** — the whole book (all sheets + which is active) lives in
  `store.js` under one key, saved after every mutation, so a reload restores
  every sheet, the open one, and every score.
- **Delete / reset** — deleting the active sheet selects a neighbor (or leaves
  no active sheet when it was the last). Deletions of a non-empty sheet confirm.

Out of scope (YAGNI — noted under Future work):

- **3-D grids** (rounds *and* categories at once) — see above.
- **Column totals / per-round winners.** A column's sum isn't meaningful for
  most games; the per-player grand total is what matters. Easy to add later.
- **Target score / win condition / auto-declare winner.** The leader highlight
  already answers "who's ahead"; a configurable target and end-of-game banner is
  a nice future extension, not core.
- **Import/export of sheets.** The generator library has export; sheets could
  gain the same later. Not required by the TODO and adds a serialization surface
  to maintain.
- **Undo.** No turn/clock state to unwind here; a mis-typed cell is fixed by
  retyping it.

## Architecture

Follows the established three-part shape: pure tested logic in `tools/shared/`,
a thin untested `app.js` for DOM wiring, an `index.html` using `tools.css`.

### `tools/shared/scoresheet.js` (pure, tested)

The score-book state machine. No DOM, no storage, no id generation — every
function takes a state and returns a **new** state, never mutating its input.
Ids are supplied by the caller (the app passes `uid()`; tests pass fixed
strings), keeping the module deterministic.

Two layers of function live here, and the split is the design's backbone:

- **Book-level** functions manage the *collection* of sheets and which one is
  open (`activeId`). They take explicit sheet ids.
- **Sheet-level** functions edit *the active sheet* implicitly. The app only
  ever edits the sheet the user is looking at, so these take no sheet id; they
  no-op when there is no active sheet. This keeps the app's call sites thin and
  the module cohesive (all sheet edits go through the active sheet).

State shape:

```js
{
  activeId: 's1',        // id of the open sheet, or null when there are none
  sheets: [
    {
      id: 's1',
      name: 'Catan',
      players: [ { id: 'p1', name: 'Alice' }, /* ordered */ ],
      columns: [ { id: 'c1', name: 'Round 1' }, /* ordered */ ],
      scores: { p1: { c1: 5, c2: 3 } },   // sparse: playerId -> columnId -> number
    },
  ],
}
```

Public surface:

Book-level:

- `createBook() -> State` — `{ activeId: null, sheets: [] }`.
- `createSheet(state, { id, name? }) -> State` — append a fresh sheet (no
  players/columns/scores) and make it active. A blank/absent `name` becomes
  `Sheet N` (N = sheets.length + 1) so a bare "New sheet" button needs no
  prompt.
- `renameSheet(state, id, name) -> State` — trim + require (throws `ScoreError`
  on blank).
- `removeSheet(state, id) -> State` — drop it. If it was active, `activeId`
  moves to the neighbor at the clamped index, or `null` when none remain.
- `selectSheet(state, id) -> State` — set `activeId` to `id` if that sheet
  exists; otherwise unchanged.
- `activeSheet(state) -> Sheet | null` — the open sheet, or null.

Sheet-level (operate on the active sheet; no-op when `activeId` is null):

- `addPlayer(state, { id, name }) -> State` — append. Name trimmed + required.
- `removePlayer(state, id) -> State` — drop the player and prune its row from
  `scores`.
- `renamePlayer(state, id, name) -> State` — same validation as add.
- `movePlayer(state, id, delta) -> State` — swap with the ±1 neighbor; no-op at
  the ends.
- `addColumn(state, { id, name? }) -> State` — append. Blank/absent `name`
  becomes `Round N` (N = columns.length + 1).
- `removeColumn(state, id) -> State` — drop the column and prune it from every
  player's row in `scores`.
- `renameColumn(state, id, name) -> State` — same validation as add.
- `moveColumn(state, id, delta) -> State` — swap with the ±1 neighbor; no-op at
  the ends.
- `setScore(state, playerId, columnId, value) -> State` — set one cell. Blank/
  `null`/`undefined` clears it (removed from the map). Otherwise coerce with
  `Number`; a non-finite result throws `ScoreError`. Negatives and fractions are
  allowed. No-op if the player or column id is unknown on the active sheet.

Getters (take a **sheet**, not the book — pure reads for rendering):

- `cellValue(sheet, playerId, columnId) -> number` — the cell, or `0` when
  absent.
- `playerTotal(sheet, playerId) -> number` — sum of the player's row across all
  columns.
- `leaderIds(sheet) -> string[]` — the player id(s) tied for the highest total.
  Empty when the sheet has no players. (All-zero is still a valid max, so a
  fresh sheet's players all lead — the app only styles a leader once any score
  is non-zero; see below.)

Guard:

- `isValidBook(value) -> boolean` — shape guard for loading possibly-stale or
  corrupt data; the app falls back to `createBook()` when it returns false.

Error:

- `class ScoreError extends Error` — thrown for invalid input (blank name,
  non-numeric score), mirroring `EncounterError` / `TimerError` / `DiceError`.
  The app catches it and shows a `toast()`; it never reaches the DOM unescaped.

Pruning rationale: keeping `scores` sparse (absent = 0) means add/remove of a
player or column only touches the map when data actually existed there, and
totals never depend on structural bookkeeping — they just sum whatever cells are
present for the current columns.

### `tools/score/index.html`

Same header/nav chrome as the other tools. One main panel:

- **Sheet bar:** a `<select>` listing saved sheets (switch = `selectSheet`), the
  active sheet's **name as an editable input** (rename on change), a **New
  sheet** button, and a **Delete sheet** button (confirms when the sheet has any
  players/scores).
- **Score grid:** an HTML `<table>` in an `overflow-x:auto` wrapper (games can
  accumulate many round columns). Header row: a "Player" corner cell, one header
  per column showing an editable column-name input with reorder/remove controls,
  and a trailing **Total** header. Body: one row per player — an editable name,
  one `number` input per cell, the live row total, and reorder/remove controls.
  The leader row(s) get a `.leader` highlight once any score is non-zero.
- **Add controls:** an **Add player** form (name input + button, Enter adds) and
  an **Add round** button (appends `Round N`).
- **Empty states:** no sheets → prompt to create one; a sheet with no players →
  prompt to add players; players but no columns → prompt to add a round.

### `tools/score/app.js` (thin, untested)

DOM wiring only. Holds the book in a module variable, loaded via
`store.get('score', null)` and validated with `isValidBook` (fall back to
`createBook()`). Every user action calls the matching `scoresheet.js` function,
replaces the state with the return value, `store.set('score', …)`, and
re-renders. A `commit(fn)` helper wraps each transition and catches `ScoreError`
into a `toast()`, leaving state unchanged on bad input (mirroring the timer's
`commit`). All interpolated text goes through `textContent` (inherently safe) or
`esc()`. Ids come from `uid()`. There is no clock and no `setInterval` — totals
are recomputed synchronously on each render, so no repaint loop is needed.

To keep cell-input focus stable during typing, score cells commit on `change`
(blur/Enter), not on every keystroke, and a full re-render after a cell edit is
acceptable because it only fires when a value is committed.

## Data flow

1. Load: `store.get('score', null)` → `isValidBook` → render (or a fresh book).
2. Action (e.g. type a cell, tab out): `state = setScore(state, pid, cid, val)`
   → `store.set('score', state)` → `render()`.
3. Render reads `activeSheet(state)` and, per row, `playerTotal` / `leaderIds`
   to fill totals and the leader highlight. No hidden state, so a reload rebuilds
   the identical sheet.

## Error handling

- Bad input (blank name, non-numeric score) raises `ScoreError`; the app catches
  it and shows the message via `toast()`, leaving state unchanged.
- Corrupt/stale stored state fails `isValidBook` and falls back to a fresh book
  rather than throwing on load.
- No engine (`gen/`) involvement, so no `GenError` path here.

## Testing

`tools/shared/scoresheet.test.js` (node:test, like the other shared modules).
`npm test`'s `**/*.test.js` glob picks it up automatically. Coverage:

- **Book construction / selection:** `createBook()` is empty with no active
  sheet; `createSheet` appends, makes active, and auto-names blank as `Sheet N`;
  `selectSheet` switches only to an existing id; `removeSheet` drops and moves
  `activeId` to a neighbor, to `null` when the last is removed; `renameSheet`
  trims + rejects blank; `activeSheet` returns the open sheet or null.
- **Players:** add appends + trims + rejects blank; rename; `movePlayer` swaps
  and no-ops at the ends; remove drops the player and prunes its scores; all
  no-op when there is no active sheet.
- **Columns:** `addColumn` appends and auto-names blank as `Round N`; rename;
  `moveColumn` swaps + no-ops at ends; remove drops the column and prunes it
  from every player's row.
- **Scores:** `setScore` sets a cell; blank/null clears it; negatives and
  fractions accepted; non-numeric throws `ScoreError`; unknown player/column is
  a no-op; `cellValue` reads a cell or 0 when absent.
- **Totals / leader:** `playerTotal` sums a row across columns (absent = 0);
  `leaderIds` returns the single top id, ties, and is empty with no players.
- **Immutability:** a representative operation does not mutate its input state
  (including nested `scores`).
- **`isValidBook`:** accepts a real book, rejects `null`, non-objects, and
  shape-wrong values (bad `sheets`, missing `scores`, non-string ids).

`app.js` stays untested, per repo convention.

## Landing page + navigation

- `index.html`: change the Score Tracker `div.card` to `a.card.card-live` →
  `tools/score/`, badge `badge-live` "Live", description kept.
- The tool header nav cross-links to the sibling tools, matching their headers,
  and the sibling tools gain a "Score →" link for symmetry.

## Files

New:

- `tools/shared/scoresheet.js`
- `tools/shared/scoresheet.test.js`
- `tools/score/index.html`
- `tools/score/app.js`
- `docs/superpowers/specs/2026-07-04-score-tracker-design.md` (this file)

Modified:

- `index.html` (card → Live)
- `tools/shared/tools.css` (score-specific classes)
- `tools/*/index.html` (add a "Score →" nav link to sibling tools)
- `TODO.md` (check the item off)

## Future work (not this change)

- Target score / win condition with an end-of-game banner.
- Column totals or per-round winner highlight.
- Import/export of sheets, matching the generator library's export.
- Score history / per-cell notes.
