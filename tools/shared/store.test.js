import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, describeWriteError } from './store.js';

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

// ── Write-failure reporting ─────────────────────────────────────────────────

/** Backing whose setItem always throws the given error. */
function throwingBacking(err) {
  return {
    getItem: () => null,
    setItem: () => { throw err; },
    removeItem: () => {},
  };
}

function domError(name, code) {
  const err = new Error(name);
  err.name = name;
  if (code !== undefined) err.code = code;
  return err;
}

test('describeWriteError classifies a quota error by name', () => {
  for (const name of ['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED']) {
    const { reason, message } = describeWriteError(domError(name));
    assert.equal(reason, 'quota');
    assert.match(message, /full/i);
  }
});

test('describeWriteError classifies a quota error by legacy code', () => {
  for (const code of [22, 1014]) {
    assert.equal(describeWriteError(domError('Error', code)).reason, 'quota');
  }
});

test('describeWriteError classifies a blocked store as unavailable', () => {
  const { reason, message } = describeWriteError(domError('SecurityError'));
  assert.equal(reason, 'unavailable');
  assert.match(message, /blocking storage/i);
});

test('describeWriteError falls back to unknown', () => {
  const { reason, message } = describeWriteError(new Error('boom'));
  assert.equal(reason, 'unknown');
  assert.match(message, /could not be saved/i);
});

test('describeWriteError tolerates a non-error', () => {
  assert.equal(describeWriteError(undefined).reason, 'unknown');
});

test('set reports failures through onError with the store name', () => {
  const seen = [];
  const store = createStore(throwingBacking(domError('QuotaExceededError')), {
    onError: (e) => seen.push(e),
  });
  assert.equal(store.set('encounter', { round: 1 }), false);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].name, 'encounter');
  assert.equal(seen[0].reason, 'quota');
  assert.match(seen[0].message, /full/i);
});

test('set works without an onError handler', () => {
  const store = createStore(throwingBacking(new Error('boom')));
  assert.equal(store.set('encounter', {}), false);
});

test('a throwing onError handler does not break the save path', () => {
  const store = createStore(throwingBacking(new Error('boom')), {
    onError: () => { throw new Error('handler exploded'); },
  });
  assert.equal(store.set('encounter', {}), false);
});

test('get returns the fallback when the backing throws', () => {
  const store = createStore({
    getItem: () => { throw domError('SecurityError'); },
    setItem: () => {},
    removeItem: () => {},
  });
  assert.deepEqual(store.get('packs', []), []);
});

test('remove never throws when the backing does', () => {
  const store = createStore({
    getItem: () => null,
    setItem: () => {},
    removeItem: () => { throw domError('SecurityError'); },
  });
  assert.doesNotThrow(() => store.remove('packs'));
});

test('a real backing reports persistent true', () => {
  assert.equal(createStore(fakeBacking()).persistent, true);
});

test('keyFor builds the namespaced versioned key', () => {
  assert.equal(createStore(fakeBacking()).keyFor('packs'), 'th:packs:v1');
});

test('setRaw writes a th: key verbatim', () => {
  const backing = fakeBacking();
  const store = createStore(backing);
  assert.equal(store.setRaw('th:encounter:v1', '{"round":2}'), true);
  assert.equal(backing.map.get('th:encounter:v1'), '{"round":2}');
  assert.deepEqual(store.get('encounter', null), { round: 2 });
});

test('setRaw refuses keys outside the th: namespace', () => {
  const backing = fakeBacking();
  const seen = [];
  const store = createStore(backing, { onError: (e) => seen.push(e) });
  assert.equal(store.setRaw('evil', 'x'), false);
  assert.equal(store.setRaw('localStorage', 'x'), false);
  assert.equal(backing.map.size, 0);
  assert.equal(seen[0].reason, 'unknown');
});
