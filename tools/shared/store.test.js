import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from './store.js';

/** Map-backed stand-in for window.localStorage. */
function fakeBacking(map = new Map()) {
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

test('set/get round-trips objects and arrays', () => {
  const store = createStore(fakeBacking());
  store.set('packs', [{ id: 'p1', name: 'My Pack' }]);
  assert.deepEqual(store.get('packs', []), [{ id: 'p1', name: 'My Pack' }]);
  store.set('settings', { lastGenerator: 'npc' });
  assert.deepEqual(store.get('settings', {}), { lastGenerator: 'npc' });
});

test('get returns fallback for a missing key', () => {
  const store = createStore(fakeBacking());
  assert.deepEqual(store.get('library', []), []);
  assert.equal(store.get('settings', null), null);
});

test('get returns fallback for corrupt JSON', () => {
  const backing = fakeBacking();
  backing.map.set('th:packs:v1', '{not json');
  const store = createStore(backing);
  assert.deepEqual(store.get('packs', []), []);
});

test('remove deletes the value', () => {
  const store = createStore(fakeBacking());
  store.set('settings', { a: 1 });
  store.remove('settings');
  assert.equal(store.get('settings', 'gone'), 'gone');
});

test('keys are namespaced and versioned', () => {
  const backing = fakeBacking();
  const store = createStore(backing);
  store.set('packs', []);
  assert.ok(backing.map.has('th:packs:v1'));
});

test('set reports success and never throws on quota errors', () => {
  const store = createStore(fakeBacking());
  assert.equal(store.set('packs', []), true);
  const full = createStore({
    getItem: () => null,
    setItem: () => { throw new Error('QuotaExceededError'); },
    removeItem: () => {},
  });
  assert.equal(full.set('packs', ['x']), false);
});
