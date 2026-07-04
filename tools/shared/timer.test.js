import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  addPlayer,
  removePlayer,
  renamePlayer,
  movePlayer,
  setPerTurn,
  start,
  pause,
  toggle,
  passTurn,
  resetTurn,
  turnElapsedMs,
  turnRemainingMs,
  isExpired,
  playerTotalMs,
  isValidGame,
  TimerError,
} from './timer.js';

/** Build a game from a compact list of [id, name], with an optional budget. */
function gameOf(perTurnMs, ...rows) {
  let state = createGame({ perTurnMs });
  for (const [id, name] of rows) state = addPlayer(state, { id, name });
  return state;
}

const names = (s) => s.players.map((p) => p.name);
const activeId = (s) => s.players[s.activeIndex]?.id ?? null;
const T0 = 1_000_000; // an arbitrary epoch-ms base for tests

// --- construction ----------------------------------------------------------

test('createGame: paused, round 1, default 60s budget, no players', () => {
  assert.deepEqual(createGame(), {
    round: 1,
    activeIndex: 0,
    perTurnMs: 60000,
    running: false,
    turnStartedAt: null,
    turnElapsedBeforePause: 0,
    players: [],
  });
});

test('createGame: honours custom perTurnMs and seeded players', () => {
  const s = createGame({ perTurnMs: 30000, players: [{ id: 'a', name: 'Al', totalMs: 0 }] });
  assert.equal(s.perTurnMs, 30000);
  assert.deepEqual(names(s), ['Al']);
});

// --- roster ----------------------------------------------------------------

test('addPlayer: appends, trims name, rejects blank', () => {
  const s = gameOf(60000, ['a', '  Alice  '], ['b', 'Bob']);
  assert.deepEqual(names(s), ['Alice', 'Bob']);
  assert.equal(s.players[0].totalMs, 0);
  assert.throws(() => addPlayer(s, { id: 'c', name: '   ' }), TimerError);
});

test('renamePlayer: updates name with trim + blank guard', () => {
  let s = gameOf(60000, ['a', 'Alice']);
  s = renamePlayer(s, 'a', '  Alicia ');
  assert.deepEqual(names(s), ['Alicia']);
  assert.throws(() => renamePlayer(s, 'a', ''), TimerError);
});

test('movePlayer: swaps neighbours and no-ops at the ends', () => {
  const s = gameOf(60000, ['a', 'A'], ['b', 'B'], ['c', 'C']);
  assert.deepEqual(names(movePlayer(s, 'a', 1)), ['B', 'A', 'C']);
  assert.deepEqual(names(movePlayer(s, 'a', -1)), ['A', 'B', 'C']); // no-op at top
  assert.deepEqual(names(movePlayer(s, 'c', 1)), ['A', 'B', 'C']); // no-op at bottom
});

test('removePlayer: dropping a non-active player keeps active + running clock', () => {
  let s = gameOf(60000, ['a', 'A'], ['b', 'B'], ['c', 'C']);
  s = passTurn(s, T0); // active is now B (index 1)
  s = start(s, T0);
  const before = { ...s };
  s = removePlayer(s, 'a'); // remove someone before the active player
  assert.equal(activeId(s), 'b');
  assert.equal(s.running, true);
  assert.equal(s.turnStartedAt, before.turnStartedAt);
});

test('removePlayer: dropping the active player clamps index and pauses a fresh turn', () => {
  let s = gameOf(60000, ['a', 'A'], ['b', 'B']);
  s = start(s, T0);
  s = removePlayer(s, 'a'); // remove the active player
  assert.equal(activeId(s), 'b');
  assert.equal(s.running, false);
  assert.equal(s.turnStartedAt, null);
  assert.equal(s.turnElapsedBeforePause, 0);
});

test('removePlayer: emptying the roster resets to index 0, paused', () => {
  let s = gameOf(60000, ['a', 'A']);
  s = start(s, T0);
  s = removePlayer(s, 'a');
  assert.deepEqual(names(s), []);
  assert.equal(s.activeIndex, 0);
  assert.equal(s.running, false);
});

// --- budget ----------------------------------------------------------------

test('setPerTurn: positive seconds → ms; 0/blank → untimed; negative throws', () => {
  let s = gameOf(60000, ['a', 'A']);
  assert.equal(setPerTurn(s, 90).perTurnMs, 90000);
  assert.equal(setPerTurn(s, 0).perTurnMs, null);
  assert.equal(setPerTurn(s, '').perTurnMs, null);
  assert.equal(setPerTurn(s, null).perTurnMs, null);
  assert.throws(() => setPerTurn(s, -5), TimerError);
  assert.throws(() => setPerTurn(s, 'nope'), TimerError);
});

// --- clock math (the core) -------------------------------------------------

test('elapsed is 0 while paused, regardless of now', () => {
  const s = gameOf(60000, ['a', 'A']);
  assert.equal(turnElapsedMs(s, T0), 0);
  assert.equal(turnElapsedMs(s, T0 + 99999), 0);
});

test('start then read later reflects wall-clock elapsed', () => {
  let s = gameOf(60000, ['a', 'A']);
  s = start(s, T0);
  assert.equal(turnElapsedMs(s, T0 + 5000), 5000);
  assert.equal(turnRemainingMs(s, T0 + 5000), 55000);
});

test('pause freezes elapsed; later now does not advance it', () => {
  let s = gameOf(60000, ['a', 'A']);
  s = start(s, T0);
  s = pause(s, T0 + 5000);
  assert.equal(turnElapsedMs(s, T0 + 999999), 5000);
});

test('resume accumulates on top of frozen elapsed', () => {
  let s = gameOf(60000, ['a', 'A']);
  s = start(s, T0);
  s = pause(s, T0 + 5000);
  s = start(s, T0 + 10000); // resume 5s later on the wall clock
  assert.equal(turnElapsedMs(s, T0 + 12000), 7000); // 5s banked + 2s live
});

test('toggle flips running/paused', () => {
  let s = gameOf(60000, ['a', 'A']);
  s = toggle(s, T0);
  assert.equal(s.running, true);
  s = toggle(s, T0 + 1000);
  assert.equal(s.running, false);
  assert.equal(turnElapsedMs(s, T0 + 5000), 1000);
});

test('start is a no-op when already running or roster empty', () => {
  let s = gameOf(60000, ['a', 'A']);
  s = start(s, T0);
  assert.equal(start(s, T0 + 5000).turnStartedAt, T0); // unchanged
  assert.equal(start(createGame(), T0).running, false); // empty stays paused
});

test('remaining goes negative in overtime; isExpired flips at the boundary', () => {
  let s = gameOf(10000, ['a', 'A']);
  s = start(s, T0);
  assert.equal(turnRemainingMs(s, T0 + 8000), 2000);
  assert.equal(isExpired(s, T0 + 8000), false);
  assert.equal(isExpired(s, T0 + 10000), true); // exactly at zero counts as expired
  assert.equal(turnRemainingMs(s, T0 + 13000), -3000);
  assert.equal(isExpired(s, T0 + 13000), true);
});

test('untimed budget: remaining is null and never expires', () => {
  let s = gameOf(null, ['a', 'A']);
  s = setPerTurn(s, 0);
  s = start(s, T0);
  assert.equal(turnRemainingMs(s, T0 + 99999), null);
  assert.equal(isExpired(s, T0 + 99999), false);
  assert.equal(turnElapsedMs(s, T0 + 4000), 4000); // still counts up
});

// --- pass / reset / round --------------------------------------------------

test('passTurn: banks elapsed onto the active player and advances', () => {
  let s = gameOf(60000, ['a', 'A'], ['b', 'B']);
  s = start(s, T0);
  s = passTurn(s, T0 + 7000);
  assert.equal(s.players[0].totalMs, 7000); // A banked 7s
  assert.equal(activeId(s), 'b');
  assert.equal(turnElapsedMs(s, T0 + 7000), 0); // fresh clock for B
});

test('passTurn: while running keeps the next player’s clock running', () => {
  let s = gameOf(60000, ['a', 'A'], ['b', 'B']);
  s = start(s, T0);
  s = passTurn(s, T0 + 7000);
  assert.equal(s.running, true);
  assert.equal(turnElapsedMs(s, T0 + 9000), 2000); // B has been running 2s
});

test('passTurn: while paused hands off a fresh paused clock', () => {
  let s = gameOf(60000, ['a', 'A'], ['b', 'B']);
  s = passTurn(s, T0); // paused game
  assert.equal(s.running, false);
  assert.equal(s.turnStartedAt, null);
  assert.equal(activeId(s), 'b');
});

test('passTurn: wrapping past the last player increments the round', () => {
  let s = gameOf(60000, ['a', 'A'], ['b', 'B']);
  s = passTurn(s, T0); // → B
  assert.equal(s.round, 1);
  s = passTurn(s, T0); // wrap → A, round 2
  assert.equal(activeId(s), 'a');
  assert.equal(s.round, 2);
});

test('resetTurn: discards current elapsed without banking it', () => {
  let s = gameOf(60000, ['a', 'A'], ['b', 'B']);
  s = start(s, T0);
  s = resetTurn(s, T0 + 5000);
  assert.equal(s.players[0].totalMs, 0); // nothing banked
  assert.equal(turnElapsedMs(s, T0 + 5000), 0); // clock restarted
  assert.equal(s.running, true); // keeps running
  assert.equal(turnElapsedMs(s, T0 + 8000), 3000);
});

test('passTurn / resetTurn: no-op on an empty roster', () => {
  const empty = createGame();
  assert.deepEqual(passTurn(empty, T0), empty);
  assert.deepEqual(resetTurn(empty, T0), empty);
});

// --- player totals ---------------------------------------------------------

test('playerTotalMs: includes the live current turn for the active player only', () => {
  let s = gameOf(60000, ['a', 'A'], ['b', 'B']);
  s = start(s, T0);
  s = passTurn(s, T0 + 4000); // A banks 4s, B now active + running
  assert.equal(playerTotalMs(s, 'a', T0 + 9000), 4000); // banked only
  assert.equal(playerTotalMs(s, 'b', T0 + 9000), 5000); // live 5s on B's turn
});

// --- immutability ----------------------------------------------------------

test('operations do not mutate their input state', () => {
  const s = gameOf(60000, ['a', 'A']);
  const snapshot = structuredClone(s);
  start(s, T0);
  addPlayer(s, { id: 'b', name: 'B' });
  passTurn(s, T0);
  assert.deepEqual(s, snapshot);
});

// --- validation ------------------------------------------------------------

test('isValidGame: accepts real state, rejects junk', () => {
  assert.equal(isValidGame(gameOf(60000, ['a', 'A'])), true);
  assert.equal(isValidGame(createGame()), true);
  assert.equal(isValidGame(null), false);
  assert.equal(isValidGame(42), false);
  assert.equal(isValidGame({ round: 1 }), false);
  assert.equal(isValidGame({ ...createGame(), players: [{ id: 'a' }] }), false);
});
