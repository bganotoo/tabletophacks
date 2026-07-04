# Game Timer — design

**Date:** 2026-07-04
**Status:** approved (autonomous — self-reviewed per TODO workflow)
**TODO item:** "New tools → Game Timer"

## Purpose

A standalone tool at `tools/timer/` for keeping play moving: a chess-clock-style
countdown that gives each player a configurable amount of time per turn, a
tap-to-pass hand-off, and an alert (visual + audible) when a turn runs out.
Ships the "Game Timer" card on the landing page from "Coming Soon" (a `div`) to
"Live" (an anchor), matching the Generator, Workshop, Dice, and Initiative tools.

The value is a fair, unattended shot clock for the table — no phone stopwatch
juggling, no arguments about "how long have I been thinking," and (crucially) a
clock that stays correct across tab switches and full page reloads.

## The one hard requirement: timestamp truth, not tick truth

The TODO calls it out: **"Timers must survive tab-switching (compute from
timestamps, not `setInterval` ticks)."** Background tabs throttle `setInterval`
to roughly once per second or slower, so a clock that *subtracts* on each tick
drifts badly while backgrounded and resets to garbage on reload.

So the state never stores a decrementing "remaining" number. It stores **when
the active turn's clock last resumed** (`turnStartedAt`, an absolute epoch
timestamp), how much of the current turn had already elapsed before the last
pause (`turnElapsedBeforePause`), and whether the clock is `running`. Elapsed
and remaining are **computed** from a `now` argument every time they're read:

```
elapsed(now) = turnElapsedBeforePause + (running ? now - turnStartedAt : 0)
remaining(now) = perTurnMs - elapsed(now)      // may be negative (overtime)
```

Consequences that fall out for free:

- A backgrounded tab is always correct on its next repaint — the repaint just
  reads `Date.now()`.
- A full reload while running keeps counting: `turnStartedAt` is an absolute
  timestamp persisted in `localStorage`, so elapsed picks up where it was.
- `setInterval` in `app.js` drives *only the repaint*, never the truth. Its
  rate is a display choice, not a correctness concern.

This is exactly why the core logic is a pure module with `now` injected: the
tests set `now` to whatever they like and assert on computed elapsed/remaining
without any real clock.

## Scope

In scope (this is the TODO line: "chess-clock style countdown for turns and
rounds; per-player clocks, tap-to-pass, configurable time per turn,
audible/visual alert at zero; survive tab-switching"):

- **Players** — an ordered roster; each player has a name and a running total of
  time they've spent across completed turns (a stat, shown per player).
- **Per-turn budget** — one configurable "seconds per turn" for the whole game.
  `0`/blank means **untimed** (count up with no limit and no alert), which is a
  useful "just track how long everyone takes" mode.
- **Active player + tap-to-pass** — one player's clock runs at a time. "Pass"
  banks the current turn's elapsed time onto the active player, advances to the
  next player, and starts a fresh per-turn clock. Passing past the last player
  wraps to the first and increments the round.
- **Start / pause** — a single toggle. Pausing folds the running interval into
  `turnElapsedBeforePause`; resuming stamps a new `turnStartedAt`.
- **Reset turn** — restart just the active player's per-turn clock (discards the
  current turn's elapsed without banking it).
- **Round counter** — starts at 1, increments each time the pass wraps.
- **Expiry alert** — when a *timed* turn crosses zero, the active player's card
  goes into an `over` visual state and `app.js` plays a short beep (WebAudio
  oscillator — no external asset, matching the no-dependency rule). The clock
  keeps counting into the negative so the display can show how far over.
- **Persistence** — the whole game lives in `store.js` under one key, saved
  after every mutation, so a reload restores roster, round, active player,
  per-turn budget, and the live clock.
- **Reset game** — a "New game" action clears everything (with a confirm).

Out of scope (YAGNI — deliberately not built now, noted under Future work):

- **Total time bank per game** (tournament chess: one budget for the whole game
  that only runs on your turn). The TODO frames this as *time per turn*; the
  per-player cumulative total we track already gives a sense of who's slow
  without a second timing model to reason about.
- **Per-player different budgets, increments/Fischer delay, Bronstein timing.**
  One shared per-turn budget covers the tabletop use case; the rest is
  chess-app territory.
- **Previous-turn / undo.** Unwinding banked time and restoring a prior turn's
  running clock is fiddly and low value for a shot clock; "Reset turn" covers
  the common misclick. Noted as future.
- **Sound choice / volume / mute persistence beyond a simple on/off**, custom
  alarms. One short beep, toggleable.

## Architecture

Follows the established three-part shape: pure tested logic in `tools/shared/`,
a thin untested `app.js` for DOM wiring, an `index.html` using `tools.css`.

### `tools/shared/timer.js` (pure, tested)

The chess-clock state machine. No DOM, no storage, no id generation, and **no
reading of the real clock** — every function that touches timing takes an
explicit `now` (epoch ms) argument, and every function returns a **new** state,
never mutating its input. Player ids are supplied by the caller (the app passes
`uid()`; tests pass fixed strings), keeping the module deterministic.

State shape:

```js
{
  round: 1,               // 1-based
  activeIndex: 0,         // index into players[] whose clock runs (0 when empty)
  perTurnMs: 60000,       // positive = timed budget per turn; null = untimed
  running: false,         // is the active clock ticking?
  turnStartedAt: null,    // epoch ms the active turn last resumed, or null when paused
  turnElapsedBeforePause: 0, // ms elapsed on the current turn before the last pause
  players: [
    { id: 'p1', name: 'Alice', totalMs: 0 }, // totalMs: banked time over completed turns
  ],
}
```

The active player is `players[activeIndex]`. Roster operations that reorder the
array **preserve the identity of the active player** by capturing its id before
the change and recomputing `activeIndex` afterward — except when the active
player itself is removed, which resets the current turn (see below).

Public surface:

- `createGame({ players?, perTurnMs? } = {}) -> State` — a paused game in round
  1. `perTurnMs` defaults to 60000; `players` defaults to `[]`.
- `addPlayer(state, { id, name }) -> State` — append. `name` trimmed and
  required (throws `TimerError` on blank). Keeps the active player active.
- `removePlayer(state, id) -> State` — drop it. If a *non-active* player is
  removed, the active player stays active and the running clock is untouched. If
  the *active* player is removed, `activeIndex` clamps into range and the
  current turn resets to a fresh, **paused** clock (`running: false`,
  `turnStartedAt: null`, `turnElapsedBeforePause: 0`) — no `now` needed, and the
  table taps Start when ready. Emptying the roster resets to index 0, paused.
- `renamePlayer(state, id, name) -> State` — same name validation as add.
- `movePlayer(state, id, delta) -> State` — manual reorder by ±1 (swap with
  neighbor); no-op at the ends. Active player stays active.
- `setPerTurn(state, seconds) -> State` — set the budget. A positive number of
  seconds → `perTurnMs`; `0`/blank/`null` → untimed (`perTurnMs: null`);
  negative or non-finite throws `TimerError`. Does not touch the running clock —
  remaining is simply recomputed against the new budget.
- `start(state, now) -> State` — resume: `running: true`,
  `turnStartedAt: now`. No-op if already running or the roster is empty.
- `pause(state, now) -> State` — fold the live interval into
  `turnElapsedBeforePause`, `running: false`, `turnStartedAt: null`. No-op if
  already paused.
- `toggle(state, now) -> State` — `pause` when running, else `start`.
- `passTurn(state, now) -> State` — bank the current turn's elapsed time onto the
  active player's `totalMs`, advance `activeIndex` (wrap → `activeIndex: 0`,
  `round + 1`), and reset the per-turn clock (`turnElapsedBeforePause: 0`;
  `turnStartedAt` = `now` if `running`, else `null` — i.e. passing keeps the
  clock running for the next player if it was running). No-op on an empty
  roster.
- `resetTurn(state, now) -> State` — restart the active player's per-turn clock,
  discarding the current turn's elapsed (not banked). Keeps `running` as-is
  (re-stamps `turnStartedAt` to `now` when running). No-op on empty.
- `turnElapsedMs(state, now) -> number` — computed elapsed on the current turn.
- `turnRemainingMs(state, now) -> number | null` — `perTurnMs - elapsed`, or
  `null` when untimed. May be negative (overtime).
- `isExpired(state, now) -> boolean` — timed and `remaining <= 0`.
- `playerTotalMs(state, id, now) -> number` — a player's banked `totalMs`, plus
  the live current-turn elapsed if they're the active player (so the roster's
  per-player total ticks up live during their turn).
- `isValidGame(value) -> boolean` — shape guard for loading possibly-stale or
  corrupt data; the app falls back to `createGame()` when it returns false.
- `class TimerError extends Error` — thrown for invalid input (blank name, bad
  budget), mirroring `EncounterError` / `DiceError`. The app catches it and
  shows a toast; it never reaches the DOM unescaped.

Banking rationale: `passTurn` and `resetTurn` compute the just-finished turn's
elapsed from `now` and either add it to `totalMs` (pass) or drop it (reset),
then re-stamp the clock. Because everything derives from timestamps, the sum of
banked totals plus the live turn always reflects real elapsed wall-clock time
spent on turns, regardless of pauses or reloads in between.

### `tools/timer/index.html`

Same header/nav chrome as the other tools. One main panel:

- **Clock face:** the active player's name, a large `M:SS` (or `-M:SS` in
  overtime) remaining readout that goes to the `over` state at/under zero, and
  the round number. Untimed mode shows a count-up elapsed instead of a
  remaining.
- **Transport controls:** a primary **Start / Pause** toggle, a **Pass** button
  (the big tap target), a **Reset turn** button, and a **New game** reset.
- **Settings row:** a "seconds per turn" number input (blank/0 = untimed) and a
  sound on/off toggle.
- **Add-player form:** a name input + **Add** button (Enter adds).
- **Player list:** one row per player in turn order, the active row highlighted
  (`.active`), each showing the player's live running total (`M:SS`) and
  up/down/rename/remove controls. Empty state prompts adding players.

### `tools/timer/app.js` (thin, untested)

DOM wiring only. Holds the current game in a module variable, loaded via
`store.get('timer', null)` and validated with `isValidGame` (fall back to
`createGame()`). Every user action calls the matching `timer.js` function with
`Date.now()` where needed, replaces the state with the return value,
`store.set('timer', …)`, and re-renders. A single `setInterval` (~250 ms)
repaints the clock face and live totals while `running` — it reads state and
recomputes via the pure getters; it never mutates or persists on its own, so
throttled/background ticks can't corrupt anything. On each repaint it checks
`isExpired`; the first repaint that crosses into expiry plays one beep (a short
WebAudio oscillator, gated by the sound toggle) and adds the `over` class.
All interpolated text is set via `textContent` (inherently safe) or `esc()`.
Ids come from `uid()`. `TimerError` is caught and shown via `toast()`.

## Data flow

1. Load: `store.get('timer', null)` → validate → render; start the repaint
   interval.
2. Action (e.g. tap Pass): `state = passTurn(state, Date.now())` →
   `store.set('timer', state)` → `render()`.
3. Repaint tick: read current `state`, recompute `turnRemainingMs(state, Date.now())`
   and per-player totals, update the DOM text/classes. No state change, no
   persist.
4. There is no other source of truth, so a reload rebuilds the identical clock —
   including a mid-turn running clock, because `turnStartedAt` is absolute.

## Error handling

- Bad input (blank player name, negative per-turn budget) raises `TimerError`;
  the app catches it and shows the message via `toast()`, leaving state
  unchanged.
- Corrupt/stale stored state fails `isValidGame` and falls back to a fresh game
  rather than throwing on load. A `turnStartedAt` far in the past just yields a
  large (possibly negative) remaining — correct, and harmless.
- No engine (`gen/`) involvement, so no `GenError` path here.

## Testing

`tools/shared/timer.test.js` (node:test, like the other shared modules).
`npm test`'s `**/*.test.js` glob picks it up automatically. Coverage:

- **Construction:** `createGame()` defaults (round 1, paused, 60s budget, no
  players); custom `perTurnMs` and seeded players.
- **Roster:** add appends and trims + rejects blank names; rename; `movePlayer`
  swaps and no-ops at the ends; removing a non-active player keeps the active
  player active and the running clock untouched; removing the active player
  clamps the index and pauses a fresh turn; emptying resets.
- **Budget:** `setPerTurn` accepts positive seconds, treats 0/blank as untimed
  (`null`), and rejects negatives/non-finite.
- **Clock math (the core):** with `now` injected — elapsed is 0 while paused;
  `start` then reading at `now + 5s` gives 5s elapsed; `pause` at `now + 5s`
  freezes elapsed at 5s regardless of later `now`; resume then more time
  accumulates on top; `turnRemainingMs` = budget − elapsed and goes negative;
  `isExpired` flips at the boundary; untimed returns `null` remaining and never
  expires.
- **Pass / reset / round:** `passTurn` banks elapsed onto the right player,
  advances, resets the per-turn clock, and keeps `running` state; wrapping
  increments the round; `resetTurn` discards current elapsed without banking;
  both no-op on an empty roster; `passTurn` while running keeps the next
  player's clock running.
- **Player totals:** `playerTotalMs` includes the live current turn for the
  active player and only banked time for others.
- **Immutability:** a representative operation does not mutate its input state.
- **`isValidGame`:** accepts a real state, rejects `null`, non-objects, and
  shape-wrong values.

`app.js` stays untested, per repo convention.

## Landing page + navigation

- `index.html`: change the Game Timer `div.card` to `a.card.card-live` →
  `tools/timer/`, badge `badge-live` "Live", updated description.
- The tool header nav cross-links to the sibling tools, matching their headers.

## Files

New:

- `tools/shared/timer.js`
- `tools/shared/timer.test.js`
- `tools/timer/index.html`
- `tools/timer/app.js`

Modified:

- `index.html` (card → Live)
- `tools/shared/tools.css` (timer-specific classes)
- `TODO.md` (check the item off)

## Future work (not this change)

- Total time bank per game (tournament mode) alongside per-turn budget.
- Fischer/Bronstein increments and per-player budgets.
- Previous-turn / undo of a pass.
- Alarm sound choices and a persisted volume.
