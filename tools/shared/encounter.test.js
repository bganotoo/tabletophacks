import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEncounter,
  addCombatant,
  updateCombatant,
  removeCombatant,
  moveCombatant,
  sortByInitiative,
  nextTurn,
  prevTurn,
  addCondition,
  removeCondition,
  tickConditions,
  isValidEncounter,
  EncounterError,
} from './encounter.js';

/** Build an encounter from a compact list of [id, name, initiative]. */
function encounterOf(...rows) {
  let state = createEncounter();
  for (const [id, name, initiative] of rows) {
    state = addCombatant(state, { id, name, initiative });
  }
  return state;
}

const names = (s) => s.combatants.map((c) => c.name);
const currentId = (s) => s.combatants[s.turnIndex]?.id ?? null;

// --- construction ----------------------------------------------------------

test('createEncounter: fresh empty board in round 1', () => {
  assert.deepEqual(createEncounter(), { round: 1, turnIndex: 0, combatants: [] });
});

// --- add / update / remove -------------------------------------------------

test('addCombatant: appends in order with defaults', () => {
  const s = encounterOf(['a', 'Goblin', 15], ['b', 'Rogue', 18]);
  assert.deepEqual(names(s), ['Goblin', 'Rogue']);
  assert.equal(s.combatants[0].initiative, 15);
  assert.deepEqual(s.combatants[0].conditions, []);
});

test('addCombatant: trims the name and requires it', () => {
  const s = addCombatant(createEncounter(), { id: 'a', name: '  Orc  ', initiative: 9 });
  assert.equal(s.combatants[0].name, 'Orc');
  assert.throws(() => addCombatant(createEncounter(), { id: 'x', name: '   ', initiative: 1 }), EncounterError);
});

test('addCombatant: coerces initiative to a number or null', () => {
  const s = addCombatant(createEncounter(), { id: 'a', name: 'A', initiative: '12' });
  assert.equal(s.combatants[0].initiative, 12);
  const s2 = addCombatant(createEncounter(), { id: 'b', name: 'B', initiative: '' });
  assert.equal(s2.combatants[0].initiative, null);
  const s3 = addCombatant(createEncounter(), { id: 'c', name: 'C', initiative: null });
  assert.equal(s3.combatants[0].initiative, null);
});

test('updateCombatant: merges name and initiative', () => {
  let s = encounterOf(['a', 'Goblin', 15]);
  s = updateCombatant(s, 'a', { name: 'Hobgoblin', initiative: 17 });
  assert.equal(s.combatants[0].name, 'Hobgoblin');
  assert.equal(s.combatants[0].initiative, 17);
  assert.throws(() => updateCombatant(s, 'a', { name: '  ' }), EncounterError);
});

test('removeCombatant: keeps the same combatant current', () => {
  let s = encounterOf(['a', 'A', 3], ['b', 'B', 2], ['c', 'C', 1]);
  s = nextTurn(s); // current = B
  assert.equal(currentId(s), 'b');
  s = removeCombatant(s, 'a'); // remove someone before current
  assert.equal(currentId(s), 'b'); // still B's turn
  assert.deepEqual(names(s), ['B', 'C']);
});

test('removeCombatant: removing the current one clamps the pointer', () => {
  let s = encounterOf(['a', 'A', 3], ['b', 'B', 2]);
  s = nextTurn(s); // current = B (last)
  s = removeCombatant(s, 'b');
  assert.equal(currentId(s), 'a'); // clamped back into range
  assert.equal(s.turnIndex, 0);
});

test('removeCombatant: emptying the board resets the pointer', () => {
  let s = encounterOf(['a', 'A', 3]);
  s = removeCombatant(s, 'a');
  assert.deepEqual(s.combatants, []);
  assert.equal(s.turnIndex, 0);
});

// --- reorder ---------------------------------------------------------------

test('moveCombatant: swaps with a neighbor and no-ops at the ends', () => {
  let s = encounterOf(['a', 'A', 1], ['b', 'B', 2], ['c', 'C', 3]);
  s = moveCombatant(s, 'b', -1);
  assert.deepEqual(names(s), ['B', 'A', 'C']);
  s = encounterOf(['a', 'A', 1], ['b', 'B', 2]);
  assert.deepEqual(names(moveCombatant(s, 'a', -1)), ['A', 'B']); // already first
  assert.deepEqual(names(moveCombatant(s, 'b', 1)), ['A', 'B']); // already last
});

test('moveCombatant: keeps the current combatant current', () => {
  let s = encounterOf(['a', 'A', 1], ['b', 'B', 2], ['c', 'C', 3]);
  s = nextTurn(s); // current = B
  s = moveCombatant(s, 'c', -1); // swap C above B: [A, C, B]
  assert.deepEqual(names(s), ['A', 'C', 'B']);
  assert.equal(currentId(s), 'b');
});

test('sortByInitiative: descending, nulls last, stable on ties', () => {
  let s = encounterOf(
    ['a', 'A', 10],
    ['b', 'B', null],
    ['c', 'C', 20],
    ['d', 'D', 10], // tie with A, added later
  );
  s = sortByInitiative(s);
  assert.deepEqual(names(s), ['C', 'A', 'D', 'B']); // A before D (stable), B (null) last
});

test('sortByInitiative: keeps the current combatant current', () => {
  let s = encounterOf(['a', 'A', 5], ['b', 'B', 20], ['c', 'C', 12]);
  s = nextTurn(s); // current = B (index 1)
  s = sortByInitiative(s); // -> [B(20), C(12), A(5)]
  assert.equal(currentId(s), 'b');
  assert.equal(s.turnIndex, 0);
});

// --- turns & rounds --------------------------------------------------------

test('nextTurn: advances the pointer without changing the round', () => {
  let s = encounterOf(['a', 'A', 3], ['b', 'B', 2]);
  assert.equal(s.turnIndex, 0);
  s = nextTurn(s);
  assert.equal(s.turnIndex, 1);
  assert.equal(s.round, 1);
});

test('nextTurn: wrapping past the end starts a new round', () => {
  let s = encounterOf(['a', 'A', 3], ['b', 'B', 2]);
  s = nextTurn(s); // index 1
  s = nextTurn(s); // wrap
  assert.equal(s.turnIndex, 0);
  assert.equal(s.round, 2);
});

test('nextTurn: wrapping ticks conditions down', () => {
  let s = encounterOf(['a', 'A', 3], ['b', 'B', 2]);
  s = addCondition(s, 'a', { name: 'Blessed', rounds: 1 });
  s = addCondition(s, 'b', { name: 'Poisoned', rounds: 3 });
  s = nextTurn(s); // no wrap yet
  assert.equal(s.combatants[0].conditions.length, 1);
  s = nextTurn(s); // wrap -> round 2, tick
  assert.deepEqual(s.combatants[0].conditions, []); // Blessed(1) expired
  assert.equal(s.combatants[1].conditions[0].rounds, 2); // Poisoned 3 -> 2
});

test('nextTurn: no-op on an empty encounter', () => {
  const s = createEncounter();
  assert.deepEqual(nextTurn(s), s);
});

test('prevTurn: steps back and un-wraps the round, floored at 1', () => {
  let s = encounterOf(['a', 'A', 3], ['b', 'B', 2]);
  s = nextTurn(s);
  s = nextTurn(s); // round 2, index 0
  assert.equal(s.round, 2);
  s = prevTurn(s); // back to round 1, last index
  assert.equal(s.round, 1);
  assert.equal(s.turnIndex, 1);
  s = prevTurn(s); // index 0, round 1
  s = prevTurn(s); // would go before start; round floored at 1
  assert.equal(s.round, 1);
  assert.equal(s.turnIndex, 1);
});

test('prevTurn: no-op on an empty encounter', () => {
  const s = createEncounter();
  assert.deepEqual(prevTurn(s), s);
});

// --- conditions ------------------------------------------------------------

test('addCondition: with and without a duration', () => {
  let s = encounterOf(['a', 'A', 3]);
  s = addCondition(s, 'a', { name: '  Prone ', rounds: null });
  s = addCondition(s, 'a', { name: 'Stunned', rounds: 2 });
  assert.deepEqual(s.combatants[0].conditions, [
    { name: 'Prone', rounds: null },
    { name: 'Stunned', rounds: 2 },
  ]);
});

test('addCondition: coerces a numeric-string duration', () => {
  let s = encounterOf(['a', 'A', 3]);
  s = addCondition(s, 'a', { name: 'Burning', rounds: '3' });
  assert.equal(s.combatants[0].conditions[0].rounds, 3);
});

test('addCondition: rejects a blank name or a non-positive/non-integer duration', () => {
  const s = encounterOf(['a', 'A', 3]);
  assert.throws(() => addCondition(s, 'a', { name: '  ', rounds: 2 }), EncounterError);
  assert.throws(() => addCondition(s, 'a', { name: 'X', rounds: 0 }), EncounterError);
  assert.throws(() => addCondition(s, 'a', { name: 'X', rounds: -1 }), EncounterError);
  assert.throws(() => addCondition(s, 'a', { name: 'X', rounds: 1.5 }), EncounterError);
});

test('removeCondition: drops one by index', () => {
  let s = encounterOf(['a', 'A', 3]);
  s = addCondition(s, 'a', { name: 'Prone', rounds: null });
  s = addCondition(s, 'a', { name: 'Stunned', rounds: 2 });
  s = removeCondition(s, 'a', 0);
  assert.deepEqual(s.combatants[0].conditions.map((c) => c.name), ['Stunned']);
});

test('tickConditions: decrements finite durations and drops expired ones', () => {
  let s = encounterOf(['a', 'A', 3]);
  s = addCondition(s, 'a', { name: 'Indefinite', rounds: null });
  s = addCondition(s, 'a', { name: 'Two', rounds: 2 });
  s = addCondition(s, 'a', { name: 'One', rounds: 1 });
  s = tickConditions(s);
  assert.deepEqual(s.combatants[0].conditions, [
    { name: 'Indefinite', rounds: null }, // untouched
    { name: 'Two', rounds: 1 },
  ]);
});

// --- immutability & validation ---------------------------------------------

test('operations do not mutate their input', () => {
  const s = encounterOf(['a', 'A', 3]);
  const snapshot = JSON.parse(JSON.stringify(s));
  addCombatant(s, { id: 'b', name: 'B', initiative: 1 });
  nextTurn(s);
  addCondition(s, 'a', { name: 'X', rounds: 1 });
  assert.deepEqual(s, snapshot);
});

test('isValidEncounter: accepts a real state, rejects junk', () => {
  assert.equal(isValidEncounter(createEncounter()), true);
  assert.equal(isValidEncounter(encounterOf(['a', 'A', 3])), true);
  assert.equal(isValidEncounter(null), false);
  assert.equal(isValidEncounter(42), false);
  assert.equal(isValidEncounter({}), false);
  assert.equal(isValidEncounter({ round: 1, turnIndex: 0, combatants: 'nope' }), false);
  assert.equal(isValidEncounter({ round: 1, turnIndex: 0, combatants: [{ name: 'x' }] }), false);
});
