import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBook,
  createSheet,
  renameSheet,
  removeSheet,
  selectSheet,
  activeSheet,
  addPlayer,
  removePlayer,
  renamePlayer,
  movePlayer,
  addColumn,
  removeColumn,
  renameColumn,
  moveColumn,
  setScore,
  cellValue,
  playerTotal,
  leaderIds,
  isValidBook,
  ScoreError,
} from './scoresheet.js';

/** A book with one active sheet carrying the given players and columns. */
function sheetWith(players = [], columns = []) {
  let state = createSheet(createBook(), { id: 's1', name: 'Game' });
  for (const [id, name] of players) state = addPlayer(state, { id, name });
  for (const [id, name] of columns) state = addColumn(state, { id, name });
  return state;
}

const sheetNames = (s) => s.sheets.map((sh) => sh.name);
const playerNames = (s) => activeSheet(s).players.map((p) => p.name);
const columnNames = (s) => activeSheet(s).columns.map((c) => c.name);

// --- book construction / selection -----------------------------------------

test('createBook: empty with no active sheet', () => {
  assert.deepEqual(createBook(), { activeId: null, sheets: [] });
});

test('createSheet: appends, makes active, keeps a fresh empty sheet', () => {
  const s = createSheet(createBook(), { id: 's1', name: 'Catan' });
  assert.equal(s.activeId, 's1');
  assert.deepEqual(activeSheet(s), { id: 's1', name: 'Catan', players: [], columns: [], scores: {} });
});

test('createSheet: blank/absent name becomes "Sheet N"', () => {
  let s = createSheet(createBook(), { id: 's1' });
  assert.equal(activeSheet(s).name, 'Sheet 1');
  s = createSheet(s, { id: 's2', name: '   ' });
  assert.equal(activeSheet(s).name, 'Sheet 2');
});

test('createSheet: trims a provided name', () => {
  const s = createSheet(createBook(), { id: 's1', name: '  Uno  ' });
  assert.equal(activeSheet(s).name, 'Uno');
});

test('activeSheet: null when there is no active sheet', () => {
  assert.equal(activeSheet(createBook()), null);
});

test('selectSheet: switches only to an existing id', () => {
  let s = createSheet(createBook(), { id: 's1', name: 'A' });
  s = createSheet(s, { id: 's2', name: 'B' });
  assert.equal(s.activeId, 's2');
  s = selectSheet(s, 's1');
  assert.equal(s.activeId, 's1');
  s = selectSheet(s, 'nope');
  assert.equal(s.activeId, 's1'); // unchanged
});

test('renameSheet: trims and rejects blank', () => {
  let s = createSheet(createBook(), { id: 's1', name: 'A' });
  s = renameSheet(s, 's1', '  Poker  ');
  assert.equal(activeSheet(s).name, 'Poker');
  assert.throws(() => renameSheet(s, 's1', '   '), ScoreError);
});

test('removeSheet: drops it and moves activeId to a neighbor', () => {
  let s = createSheet(createBook(), { id: 's1', name: 'A' });
  s = createSheet(s, { id: 's2', name: 'B' });
  s = createSheet(s, { id: 's3', name: 'C' }); // active s3
  s = removeSheet(s, 's3');
  assert.deepEqual(sheetNames(s), ['A', 'B']);
  assert.equal(s.activeId, 's2'); // clamped to last remaining
});

test('removeSheet: removing the last sheet clears activeId', () => {
  let s = createSheet(createBook(), { id: 's1', name: 'A' });
  s = removeSheet(s, 's1');
  assert.deepEqual(s.sheets, []);
  assert.equal(s.activeId, null);
});

test('removeSheet: removing a non-active sheet keeps the active one', () => {
  let s = createSheet(createBook(), { id: 's1', name: 'A' });
  s = createSheet(s, { id: 's2', name: 'B' }); // active s2
  s = removeSheet(s, 's1');
  assert.deepEqual(sheetNames(s), ['B']);
  assert.equal(s.activeId, 's2');
});

// --- players ---------------------------------------------------------------

test('addPlayer: appends in order, trims, rejects blank', () => {
  let s = sheetWith([['a', 'Alice'], ['b', '  Bob  ']]);
  assert.deepEqual(playerNames(s), ['Alice', 'Bob']);
  assert.throws(() => addPlayer(s, { id: 'x', name: '  ' }), ScoreError);
});

test('addPlayer: no-op when there is no active sheet', () => {
  const s = addPlayer(createBook(), { id: 'a', name: 'Alice' });
  assert.deepEqual(s, createBook());
});

test('renamePlayer: renames, trims, rejects blank', () => {
  let s = sheetWith([['a', 'Alice']]);
  s = renamePlayer(s, 'a', '  Al  ');
  assert.equal(playerNames(s)[0], 'Al');
  assert.throws(() => renamePlayer(s, 'a', ''), ScoreError);
});

test('movePlayer: swaps with a neighbor and no-ops at the ends', () => {
  let s = sheetWith([['a', 'A'], ['b', 'B'], ['c', 'C']]);
  s = movePlayer(s, 'c', -1);
  assert.deepEqual(playerNames(s), ['A', 'C', 'B']);
  s = movePlayer(s, 'a', -1); // already first
  assert.deepEqual(playerNames(s), ['A', 'C', 'B']);
});

test('removePlayer: drops the player and prunes its scores', () => {
  let s = sheetWith([['a', 'A'], ['b', 'B']], [['c1', 'R1']]);
  s = setScore(s, 'a', 'c1', 5);
  s = removePlayer(s, 'a');
  assert.deepEqual(playerNames(s), ['B']);
  assert.equal('a' in activeSheet(s).scores, false);
});

// --- columns ---------------------------------------------------------------

test('addColumn: appends and auto-names blank as "Round N"', () => {
  let s = sheetWith([], []);
  s = addColumn(s, { id: 'c1' });
  s = addColumn(s, { id: 'c2', name: '   ' });
  s = addColumn(s, { id: 'c3', name: 'Bonus' });
  assert.deepEqual(columnNames(s), ['Round 1', 'Round 2', 'Bonus']);
});

test('renameColumn: renames, trims, rejects blank', () => {
  let s = sheetWith([], [['c1', 'Round 1']]);
  s = renameColumn(s, 'c1', '  Eggs  ');
  assert.equal(columnNames(s)[0], 'Eggs');
  assert.throws(() => renameColumn(s, 'c1', ''), ScoreError);
});

test('moveColumn: swaps with a neighbor and no-ops at the ends', () => {
  let s = sheetWith([], [['c1', 'A'], ['c2', 'B'], ['c3', 'C']]);
  s = moveColumn(s, 'c1', 1);
  assert.deepEqual(columnNames(s), ['B', 'A', 'C']);
  s = moveColumn(s, 'c3', 1); // already last
  assert.deepEqual(columnNames(s), ['B', 'A', 'C']);
});

test('removeColumn: drops the column and prunes it from every row', () => {
  let s = sheetWith([['a', 'A'], ['b', 'B']], [['c1', 'R1'], ['c2', 'R2']]);
  s = setScore(s, 'a', 'c1', 3);
  s = setScore(s, 'a', 'c2', 4);
  s = setScore(s, 'b', 'c1', 5);
  s = removeColumn(s, 'c1');
  assert.deepEqual(columnNames(s), ['R2']);
  assert.equal(cellValue(activeSheet(s), 'a', 'c1'), 0);
  assert.equal(cellValue(activeSheet(s), 'a', 'c2'), 4);
  assert.equal('c1' in activeSheet(s).scores.a, false);
});

// --- scores ----------------------------------------------------------------

test('setScore: sets a cell; cellValue reads it', () => {
  let s = sheetWith([['a', 'A']], [['c1', 'R1']]);
  s = setScore(s, 'a', 'c1', 7);
  assert.equal(cellValue(activeSheet(s), 'a', 'c1'), 7);
});

test('setScore: blank or null clears the cell', () => {
  let s = sheetWith([['a', 'A']], [['c1', 'R1']]);
  s = setScore(s, 'a', 'c1', 7);
  s = setScore(s, 'a', 'c1', '');
  assert.equal(cellValue(activeSheet(s), 'a', 'c1'), 0);
  assert.equal('c1' in (activeSheet(s).scores.a ?? {}), false);
  s = setScore(s, 'a', 'c1', 7);
  s = setScore(s, 'a', 'c1', null);
  assert.equal(cellValue(activeSheet(s), 'a', 'c1'), 0);
});

test('setScore: accepts negatives and fractions, rejects non-numeric', () => {
  let s = sheetWith([['a', 'A']], [['c1', 'R1']]);
  s = setScore(s, 'a', 'c1', -3);
  assert.equal(cellValue(activeSheet(s), 'a', 'c1'), -3);
  s = setScore(s, 'a', 'c1', '2.5');
  assert.equal(cellValue(activeSheet(s), 'a', 'c1'), 2.5);
  assert.throws(() => setScore(s, 'a', 'c1', 'abc'), ScoreError);
});

test('setScore: no-op for an unknown player or column', () => {
  let s = sheetWith([['a', 'A']], [['c1', 'R1']]);
  const before = activeSheet(s).scores;
  s = setScore(s, 'ghost', 'c1', 5);
  s = setScore(s, 'a', 'ghost', 5);
  assert.deepEqual(activeSheet(s).scores, before);
});

test('cellValue: 0 when the cell is absent', () => {
  const s = sheetWith([['a', 'A']], [['c1', 'R1']]);
  assert.equal(cellValue(activeSheet(s), 'a', 'c1'), 0);
});

// --- totals / leader -------------------------------------------------------

test('playerTotal: sums a row across columns, absent = 0', () => {
  let s = sheetWith([['a', 'A']], [['c1', 'R1'], ['c2', 'R2'], ['c3', 'R3']]);
  s = setScore(s, 'a', 'c1', 3);
  s = setScore(s, 'a', 'c3', 4);
  assert.equal(playerTotal(activeSheet(s), 'a'), 7);
});

test('leaderIds: single leader, ties, and empty with no players', () => {
  let s = sheetWith([['a', 'A'], ['b', 'B'], ['c', 'C']], [['c1', 'R1']]);
  s = setScore(s, 'a', 'c1', 5);
  s = setScore(s, 'b', 'c1', 9);
  s = setScore(s, 'c', 'c1', 9);
  assert.deepEqual(leaderIds(activeSheet(s)).sort(), ['b', 'c']);
  s = setScore(s, 'b', 'c1', 10);
  assert.deepEqual(leaderIds(activeSheet(s)), ['b']);
  assert.deepEqual(leaderIds(activeSheet(sheetWith([], []))), []);
});

// --- immutability ----------------------------------------------------------

test('operations do not mutate their input (incl. nested scores)', () => {
  const s = sheetWith([['a', 'A']], [['c1', 'R1']]);
  const snapshot = JSON.stringify(s);
  setScore(s, 'a', 'c1', 5);
  addPlayer(s, { id: 'b', name: 'B' });
  removeColumn(s, 'c1');
  assert.equal(JSON.stringify(s), snapshot);
});

// --- isValidBook -----------------------------------------------------------

test('isValidBook: accepts a real book', () => {
  let s = sheetWith([['a', 'A']], [['c1', 'R1']]);
  s = setScore(s, 'a', 'c1', 5);
  assert.equal(isValidBook(s), true);
  assert.equal(isValidBook(createBook()), true);
});

test('isValidBook: rejects null, non-objects, and shape-wrong values', () => {
  assert.equal(isValidBook(null), false);
  assert.equal(isValidBook(42), false);
  assert.equal(isValidBook({ activeId: null }), false); // no sheets array
  assert.equal(isValidBook({ activeId: null, sheets: {} }), false);
  assert.equal(isValidBook({ activeId: null, sheets: [{ id: 's1', name: 'A' }] }), false); // sheet missing players/columns/scores
  assert.equal(
    isValidBook({ activeId: null, sheets: [{ id: 's1', name: 'A', players: [], columns: [], scores: 'x' }] }),
    false,
  );
  assert.equal(
    isValidBook({ activeId: null, sheets: [{ id: 1, name: 'A', players: [], columns: [], scores: {} }] }),
    false,
  );
});
