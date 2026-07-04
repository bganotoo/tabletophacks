# Initiative Tracker — design

**Date:** 2026-07-04
**Status:** approved (autonomous — self-reviewed per TODO workflow)
**TODO item:** "New tools → Initiative Tracker"

## Purpose

A standalone tool at `tools/initiative/` for running combat turn order at the
table: add combatants, sort by initiative, step through turns, count rounds, and
tag combatants with conditions that count down each round. Ships the "Initiative
Tracker" card on the landing page from "Coming Soon" (a `div`) to "Live" (an
anchor), matching the Generator, Workshop, and Dice tools.

The value is a live, reload-proof combat board: the GM stops juggling a scrap of
paper for "whose turn, what round, how many rounds of *Bless* are left."

## Scope

In scope (this is exactly the TODO line: "turn order and conditions in combat"):

- **Add / remove combatants** — each has a name and an initiative number.
- **Reorder** — sort all combatants by initiative (descending), and manual
  up/down nudges for ties or house rules.
- **Turn pointer** — a highlighted "current turn" combatant; Next/Previous
  advance it. Advancing past the last combatant wraps to the first and
  increments the round.
- **Round counter** — starts at 1, increments on each wrap, shown prominently.
- **Conditions** — per-combatant tags, each with an optional duration in rounds.
  Durations tick down by one at each round boundary; a condition that reaches 0
  is removed. Conditions with no duration are indefinite and never expire on
  their own.
- **Persistence** — the whole encounter lives in `store.js` under one key, saved
  after every mutation, so a mid-combat reload restores turn, round, and
  conditions exactly.
- **Reset** — a "New encounter" action clears the board (with a confirm).

Out of scope (YAGNI — deliberately not built now):

- **Hit points / damage / death saves.** The TODO scopes this tool to "turn
  order and conditions." HP is a whole sub-feature (max/current, healing,
  temp HP, death saves) and a natural *future* addition; leaving it out keeps
  the state module tight. Noted under Future work.
- **Per-combatant condition timing** (e.g. 5e "until the end of your next
  turn"). We tick every condition once per *round* boundary, uniformly, which
  is what the TODO specifies ("tick down each round") and is far simpler to
  reason about than per-owner turn tracking.
- **Groups / minions, monster stat blocks, dice rolling for initiative.**
  Initiative is entered as a number; the Dice Roller already rolls dice.
- **Multiple saved encounters.** One active encounter, like a live combat.
  (The Score Tracker TODO item is where "multiple saved sheets" belongs.)

## Architecture

Follows the established three-part shape: pure tested logic in `tools/shared/`,
a thin untested `app.js` for DOM wiring, an `index.html` using `tools.css`.

### `tools/shared/encounter.js` (pure, tested)

The encounter state machine. No DOM, no storage, no id generation, no clock —
every function takes a state and returns a **new** state (never mutates its
input), so it is trivially testable and the app can persist the return value
directly. Combatant ids are supplied by the caller (the app passes `uid()` from
`ui.js`; tests pass fixed strings), keeping the module deterministic.

State shape:

```js
{
  round: 1,          // 1-based; a fresh encounter is "in round 1"
  turnIndex: 0,      // index into combatants[] whose turn it is (0 when empty)
  combatants: [
    {
      id: 'a1',
      name: 'Goblin',
      initiative: 15,           // number, or null if not yet set (sorts last)
      conditions: [
        { name: 'Poisoned', rounds: 3 },   // rounds: positive int, or null = indefinite
        { name: 'Prone', rounds: null },
      ],
    },
  ],
}
```

The "current combatant" is identified by `combatants[turnIndex]`. Every
operation that changes the array (add / remove / reorder / sort) **preserves the
identity of the current combatant** by capturing its id before the change and
recomputing `turnIndex` from that id afterward — so sorting or removing someone
else never silently changes whose turn it is.

Public surface:

- `createEncounter() -> State` — `{ round: 1, turnIndex: 0, combatants: [] }`.
- `addCombatant(state, { id, name, initiative }) -> State` — append. `name`
  trimmed and required; `initiative` coerced to a number or `null`. Throws
  `EncounterError` on a blank name. Keeps the current combatant current.
- `removeCombatant(state, id) -> State` — drop it; recompute `turnIndex` to keep
  the same current combatant (or clamp into range if the current one was
  removed; `0` when the list empties).
- `updateCombatant(state, id, patch) -> State` — merge `{ name?, initiative? }`;
  same name/initiative validation as add.
- `moveCombatant(state, id, delta) -> State` — manual reorder by ±1 (swap with
  neighbor); no-op at the ends. Current combatant stays current.
- `sortByInitiative(state) -> State` — stable sort by `initiative` descending,
  `null` last; ties keep their current relative order. Current combatant stays
  current.
- `nextTurn(state) -> State` — advance `turnIndex`; if it wraps past the end,
  set it to 0, `round + 1`, and tick every condition down (see below). No-op on
  an empty encounter.
- `prevTurn(state) -> State` — step back for correcting a misclick; if it wraps
  before the start, go to the last combatant and `round - 1` (floored at 1).
  Does **not** restore ticked-down conditions — documented as a known,
  acceptable limitation (undo of ticking is out of scope). No-op when empty.
- `addCondition(state, id, { name, rounds }) -> State` — append a condition.
  `name` trimmed and required (throws on blank); `rounds` a positive integer or
  `null` (indefinite). Non-positive or non-integer `rounds` throws.
- `removeCondition(state, id, index) -> State` — drop one condition by its index
  within that combatant.
- `tickConditions(state) -> State` — decrement every non-null `rounds` by 1 and
  drop conditions that reach 0. Exposed for direct testing; also called
  internally by `nextTurn` at a round boundary.
- `isValidEncounter(value) -> boolean` — shape guard for loading possibly-stale
  or corrupt data from storage; the app falls back to `createEncounter()` when
  this returns false.
- `class EncounterError extends Error` — thrown for invalid input (blank name,
  bad `rounds`), mirroring `DiceError` / `GenError` style. The app catches it
  and shows a toast; it never reaches the DOM unescaped.

Tick timing rationale: a condition added during round *N* with `rounds: 1`
survives round *N* and is removed at the start of round *N+1* — i.e. "1 round"
means "this round." This matches how a GM says "it's poisoned for 3 rounds."

### `tools/initiative/index.html`

Same header/nav chrome as the other tools. One main panel:

- **Round bar:** large "Round N", a primary **Next turn** button, a small
  **Previous** button, and a **New encounter** (reset) button.
- **Add-combatant form:** a name input, an initiative number input, an **Add**
  button (Enter in either field adds). A **Sort by initiative** button sits
  alongside.
- **Combatant list:** one row per combatant, in array order, the current-turn
  row highlighted (`.current`). Each row shows: initiative, name, its condition
  chips (each `Name` or `Name (n)` with a remove ✕), and row controls —
  up/down reorder, an inline "add condition" control (a condition-name input +
  optional rounds number + add button, revealed by a small button so the row
  isn't cluttered), and a remove-combatant button.
- Empty state: a placeholder line prompting the user to add combatants.

### `tools/initiative/app.js` (thin, untested)

DOM wiring only. Holds the current encounter in a module variable, loaded via
`store.get('encounter', createEncounter())` and validated with
`isValidEncounter`. Every user action calls the matching `encounter.js`
function, replaces the state with the return value, `store.set('encounter', …)`,
and re-renders. All interpolated text (names, condition names) goes through
`esc()` — or, since we build the DOM with `el()` and text nodes, through
`textContent`, which is inherently safe. Ids come from `uid()`. `EncounterError`
is caught and shown via `toast()`.

## Data flow

1. Load: `store.get('encounter', createEncounter())` → validate → render.
2. Action (e.g. click Next turn): `state = nextTurn(state)` →
   `store.set('encounter', state)` → `render(state)`.
3. Every mutation follows the same call → persist → render loop; there is no
   other source of truth, so a reload rebuilds the identical board.

## Error handling

- Bad input (blank combatant name, blank/zero condition duration) raises
  `EncounterError`; the app catches it and shows the message via `toast()`,
  leaving the board unchanged.
- Corrupt/stale stored state fails `isValidEncounter` and falls back to a fresh
  encounter rather than throwing on load.
- No engine (`gen/`) involvement, so no `GenError` path here.

## Testing

`tools/shared/encounter.test.js` (node:test, like the other shared modules).
`npm test`'s `**/*.test.js` glob picks it up automatically. Coverage:

- **Construction:** `createEncounter()` shape.
- **Add / update / remove:** append order; name trim + blank-name error;
  initiative coercion (`"12"` → 12, blank → null); removal keeps the same
  current combatant; removing the current one clamps; emptying resets index.
- **Reorder:** `moveCombatant` swaps and no-ops at the ends;
  `sortByInitiative` orders descending with `null` last and is stable on ties;
  both keep the current combatant current.
- **Turns & rounds:** `nextTurn` advances; wrapping increments the round and
  ticks conditions; `prevTurn` steps back and un-wraps the round (floored at 1);
  both no-op on an empty encounter.
- **Conditions:** add (with and without a duration); blank name and bad
  `rounds` throw; `removeCondition` by index; `tickConditions` decrements and
  drops expired ones while leaving indefinite (`null`) ones untouched.
- **Immutability:** a representative operation does not mutate its input state.
- **`isValidEncounter`:** accepts a real state, rejects `null`, non-objects,
  and shape-wrong values.

`app.js` stays untested, per repo convention.

## Landing page + navigation

- `index.html`: change the Initiative Tracker `div.card` to
  `a.card.card-live` → `tools/initiative/`, badge `badge-live` "Live".
- The tool header nav cross-links to the other tools (Generator / Workshop /
  Dice), matching their headers; those tools' navs can gain an "Initiative →"
  link but that is not required to ship.

## Files

New:

- `tools/shared/encounter.js`
- `tools/shared/encounter.test.js`
- `tools/initiative/index.html`
- `tools/initiative/app.js`

Modified:

- `index.html` (card → Live)
- `tools/shared/tools.css` (initiative-specific classes)
- `TODO.md` (check the item off)

## Future work (not this change)

- Hit points / damage tracking and death saves.
- Roll-initiative button (reuse the Dice Roller's `d20` + modifier).
- Per-combatant condition timing (start/end of a specific combatant's turn).
