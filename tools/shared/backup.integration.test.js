/**
 * End-to-end checks for the export/import and backup/restore paths, walked the
 * same way the app.js files walk them — real tool state in, a JSON file out,
 * and the file back into a store. The app.js wiring itself needs a DOM and is
 * untested by convention, so this covers everything up to the button.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSnapshot,
  parseSnapshot,
  buildBackup,
  parseBackup,
  restorePlan,
} from './backup.js';
import { createStore } from './store.js';
import { createEncounter, addCombatant, nextTurn } from './encounter.js';
import { createBook, createSheet, addPlayer as addScorePlayer, addColumn, setScore } from './scoresheet.js';
import { createGame, addPlayer, start, pause, turnElapsedMs, playerTotalMs } from './timer.js';

/** A fake DOM Storage, so `storageEntries`-shaped reads work in Node. */
function fakeStorage() {
  const map = new Map();
  return {
    map,
    get length() { return map.size; },
    key: (i) => [...map.keys()][i],
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

const entriesOf = (storage) => [...storage.map.entries()];

test('an encounter survives export, loss, and import', () => {
  let state = createEncounter();
  state = addCombatant(state, { id: 'a', name: 'Goblin', initiative: 14 });
  state = addCombatant(state, { id: 'b', name: 'Thistle', initiative: 19 });
  state = nextTurn(state);

  const file = JSON.stringify(buildSnapshot('encounter', state, new Date()), null, 2);
  const result = parseSnapshot(file, 'encounter');

  assert.equal(result.ok, true, result.error);
  assert.deepEqual(result.data, state);
  assert.equal(result.data.combatants.length, 2);
  assert.equal(result.data.turnIndex, state.turnIndex);
});

test('an encounter file opened in the Score Tracker is refused, by name', () => {
  const file = JSON.stringify(buildSnapshot('encounter', createEncounter(), new Date()));
  const result = parseSnapshot(file, 'score');
  assert.equal(result.ok, false);
  assert.match(result.error, /an encounter export/);
  assert.match(result.error, /Initiative Tracker/);
});

test('a score book survives export and import with its scores', () => {
  let state = createBook();
  state = createSheet(state, { id: 's1', name: 'Catan night' });
  state = addScorePlayer(state, { id: 'p1', name: 'Ada' });
  state = addColumn(state, { id: 'c1', name: 'Round 1' });
  state = setScore(state, 'p1', 'c1', 7);

  const result = parseSnapshot(JSON.stringify(buildSnapshot('score', state, new Date())), 'score');
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(result.data, state);
});

test('exporting a running timer does not stop the live clock', () => {
  const t0 = 1_000_000;
  let state = createGame({ perTurnMs: 60_000 });
  state = addPlayer(state, { id: 'p1', name: 'Ada' });
  state = start(state, t0);

  pause(state, t0 + 12_000); // what exportGame does, on a copy
  assert.equal(state.running, true);
});

test('a timer export keeps real elapsed time and lands paused', () => {
  const t0 = 1_000_000;
  let state = createGame({ perTurnMs: 60_000 });
  state = addPlayer(state, { id: 'p1', name: 'Ada' });
  state = addPlayer(state, { id: 'p2', name: 'Bo' });
  state = start(state, t0);

  const t1 = t0 + 12_000;
  assert.equal(turnElapsedMs(state, t1), 12_000);

  // exportGame: pause a copy so the file records elapsed, not a timestamp.
  const file = JSON.stringify(buildSnapshot('timer', pause(state, t1), new Date(t1)));
  const result = parseSnapshot(file, 'timer');
  assert.equal(result.ok, true, result.error);

  // importGame: adopt, forced paused.
  const adopted = { ...result.data, running: false, turnStartedAt: null };
  assert.equal(adopted.running, false);

  // Read much later, on a different clock: still 12 seconds.
  const muchLater = t1 + 9_000_000;
  assert.equal(turnElapsedMs(adopted, muchLater), 12_000);
  assert.equal(playerTotalMs(adopted, 'p1', muchLater), 12_000);
});

test('a stale turnStartedAt cannot inflate the clock on import', () => {
  let state = createGame({ perTurnMs: 60_000 });
  state = addPlayer(state, { id: 'p1', name: 'Ada' });
  state = pause(start(state, 1_000_000), 1_012_000);

  // A hand-edited file claiming to be mid-turn since the epoch.
  const file = JSON.stringify(
    buildSnapshot('timer', { ...state, running: true, turnStartedAt: 1 }, new Date()),
  );
  const result = parseSnapshot(file, 'timer');
  assert.equal(result.ok, true);

  const adopted = { ...result.data, running: false, turnStartedAt: null };
  assert.equal(turnElapsedMs(adopted, Date.now()), 12_000);
});

test('a backup reverts what it covered and leaves the rest alone', () => {
  const storage = fakeStorage();
  const store = createStore(storage);
  store.set('packs', [{ id: 'p1', name: 'My Pack', source: '{}' }]);
  store.set('encounter', addCombatant(createEncounter(), { id: 'a', name: 'Goblin', initiative: 11 }));
  store.set('library', [{ id: 'L1', data: 'kept' }]);
  storage.setItem('someone-elses-key', 'not ours');

  const file = JSON.stringify(buildBackup(entriesOf(storage), new Date()), null, 2);
  assert.ok(!file.includes('someone-elses-key'), 'a backup must not carry foreign keys');

  // Wreck things: edit the pack, clear the encounter, add a key the backup
  // never saw.
  store.set('packs', [{ id: 'p1', name: 'Ruined', source: 'broken' }]);
  store.set('encounter', createEncounter());
  store.set('score', createBook());

  const parsed = parseBackup(file);
  assert.equal(parsed.ok, true, parsed.error);
  const plan = restorePlan(entriesOf(storage), parsed.keys);
  assert.deepEqual(plan.replaced.sort(), ['th:encounter:v1', 'th:library:v1', 'th:packs:v1']);
  assert.deepEqual(plan.unaffected, ['th:score:v1']);

  for (const [key, value] of plan.writes) {
    assert.equal(store.setRaw(key, value), true);
  }

  assert.equal(store.get('packs', [])[0].name, 'My Pack');
  assert.equal(store.get('encounter', null).combatants[0].name, 'Goblin');
  assert.deepEqual(store.get('library', []), [{ id: 'L1', data: 'kept' }]);
  assert.notEqual(store.get('score', null), null, 'a key absent from the backup is untouched');
  assert.equal(storage.getItem('someone-elses-key'), 'not ours');
});

test('a backup naming a foreign key is refused at parse and at write', () => {
  const storage = fakeStorage();
  const store = createStore(storage);
  const hostile = '{"tabletophacks":"backup","version":1,"keys":{"authToken":"stolen"}}';

  assert.equal(parseBackup(hostile).ok, false);
  assert.equal(store.setRaw('authToken', 'stolen'), false);
  assert.equal(storage.getItem('authToken'), null);
});
