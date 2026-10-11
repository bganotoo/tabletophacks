# Trust & Data Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a GM get their work out of this site and back into it, and never lose a save silently.

**Architecture:** One new pure module (`tools/shared/backup.js`) owns an export envelope format at two scopes — per-tool snapshot and whole-origin backup — validating imports through the shape guards the tools already have. `tools/shared/store.js` grows an `onError` reporting channel so the three tools that ignore `set()`'s return value start surfacing failures without auditing their call sites. `tools/shared/notices.js` gates a one-time "this lives in your browser only" warning. Each tool's `app.js` gets buttons and wiring only.

**Tech Stack:** Plain ES2022 modules, no dependencies. `node:test` + `node:assert/strict` for tests. No build step.

**Spec:** [`docs/superpowers/specs/2026-10-10-data-safety-design.md`](../specs/2026-10-10-data-safety-design.md)

## Global Constraints

- **No npm dependencies, no build step.** `package.json` exists only for the `test` script.
- **All logic worth testing lives in `tools/shared/`.** Each `app.js` is thin, untested DOM wiring. If a step tempts you to put a branch in `app.js`, move it to a shared module.
- **Never touch `localStorage` directly.** Everything goes through `store.js`. The one new escape hatch, `setRaw`, lives *inside* `store.js` and rejects keys outside the `th:` namespace.
- **localStorage keys are `th:<name>:v1`.** `store.js` owns that shape; `VERSION` is `'v1'`.
- **Any user or generated text interpolated into HTML goes through `esc()`** from `tools/shared/render.js`. Prefer `el()` with text children, which uses `textContent` and needs no escaping.
- **Envelope version is `1`.** The literal `SNAPSHOT_VERSION = 1` in `backup.js`; a file with a higher version is rejected, a lower or equal one accepted.
- **Envelope discriminator field is `tabletophacks`.** Its value is a kind name (`'encounter'`, `'score'`, `'timer'`) or the literal `'backup'`.
- **Store names in play:** `encounter` (Initiative), `score` (Score), `timer` + `timer-sound` (Timer), `packs` + `library` + `settings` (Generator/Workshop), `dice-history` (Dice), `notices` (new).
- **Run the full suite with `npm test`** after every task. 460+ tests must stay green.

---

### Task 1: `store.js` — write failures that announce themselves

**Files:**
- Modify: `tools/shared/store.js` (whole file)
- Test: `tools/shared/store.test.js` (append)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `describeWriteError(err) → { reason: 'quota'|'unavailable'|'unknown', message: string }`
  - `createStore(backing?, { onError }?) → { get, set, remove, setRaw, persistent, keyFor }`
  - `store.setRaw(fullKey: string, value: string) → boolean` — rejects (returns `false`, calls `onError`) any key not starting with `th:`
  - `store.persistent: boolean`
  - `store.keyFor(name) → string` — the `th:<name>:v1` key, so other modules never rebuild it
  - `onError` callback receives `{ name, reason, message }`

- [ ] **Step 1: Write the failing tests**

Append to `tools/shared/store.test.js`:

```js
import { createStore, describeWriteError } from './store.js';

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
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `node --test tools/shared/store.test.js`
Expected: FAIL — `describeWriteError` is not exported, `keyFor`/`setRaw`/`persistent` are undefined.

- [ ] **Step 3: Rewrite `tools/shared/store.js`**

```js
/** Versioned localStorage wrapper. Corrupt or missing values fall back safely,
 *  and failed writes are reported rather than swallowed. */

const VERSION = 'v1';

/** The only namespace this module will write. */
export const KEY_PREFIX = 'th:';

const QUOTA_NAMES = new Set(['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED']);
const QUOTA_CODES = new Set([22, 1014]);

const MESSAGES = {
  quota:
    'Browser storage is full, so that change was not saved. Export your work ' +
    'to a file, then delete something you no longer need.',
  unavailable:
    'This browser is blocking storage, so nothing can be saved. Your work will ' +
    'be lost when you close the tab — export it first.',
  unknown: 'That change could not be saved. Export your work to a file so it is not lost.',
};

/**
 * Classify a thrown storage error into a reason and a message worth showing.
 * Pure, so every branch is testable with a synthetic error.
 * @param {unknown} err
 * @returns {{ reason: 'quota'|'unavailable'|'unknown', message: string }}
 */
export function describeWriteError(err) {
  const name = err && typeof err === 'object' ? err.name : undefined;
  const code = err && typeof err === 'object' ? err.code : undefined;
  const reason = QUOTA_NAMES.has(name) || QUOTA_CODES.has(code)
    ? 'quota'
    : name === 'SecurityError'
      ? 'unavailable'
      : 'unknown';
  return { reason, message: MESSAGES[reason] };
}

/** Map-backed stand-in used when localStorage is unreachable, so a tool still
 *  works for the session instead of white-screening. */
function memoryBacking() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

/** Reading `globalThis.localStorage` itself throws when a browser blocks site
 *  data, so even the property access has to be guarded. */
function resolveBacking() {
  try {
    const store = globalThis.localStorage;
    if (store) {
      store.getItem(`${KEY_PREFIX}probe`);
      return { backing: store, persistent: true };
    }
  } catch {
    // fall through to memory
  }
  return { backing: memoryBacking(), persistent: false };
}

/**
 * @param {{ getItem(k: string): string|null, setItem(k: string, v: string): void,
 *           removeItem(k: string): void }} [backing] defaults to localStorage,
 *   falling back to in-memory storage when the browser blocks it
 * @param {{ onError?: (info: { name: string, reason: string, message: string }) => void }} [options]
 */
export function createStore(backing, { onError } = {}) {
  let persistent = true;
  if (!backing) {
    const resolved = resolveBacking();
    backing = resolved.backing;
    persistent = resolved.persistent;
  }

  const keyFor = (name) => `${KEY_PREFIX}${name}:${VERSION}`;

  const fail = (name, err) => {
    const info = { name, ...describeWriteError(err) };
    try {
      onError?.(info);
    } catch {
      // a broken handler must not break the save path
    }
    return false;
  };

  const write = (name, fullKey, raw) => {
    try {
      backing.setItem(fullKey, raw);
      return true;
    } catch (err) {
      return fail(name, err);
    }
  };

  return {
    persistent,
    keyFor,

    get(name, fallback) {
      let raw;
      try {
        raw = backing.getItem(keyFor(name));
      } catch {
        return fallback;
      }
      if (raw === null || raw === undefined) return fallback;
      try {
        return JSON.parse(raw);
      } catch {
        return fallback;
      }
    },

    set(name, value) {
      return write(name, keyFor(name), JSON.stringify(value));
    },

    /** Write an already-namespaced key. Used only to restore a backup file;
     *  anything outside the `th:` namespace is refused. */
    setRaw(fullKey, value) {
      if (typeof fullKey !== 'string' || !fullKey.startsWith(KEY_PREFIX)) {
        return fail(fullKey, new Error(`refusing to write outside ${KEY_PREFIX}`));
      }
      return write(fullKey, fullKey, String(value));
    },

    remove(name) {
      try {
        backing.removeItem(keyFor(name));
      } catch {
        // nothing useful to do; the value is unreachable either way
      }
    },
  };
}
```

Note: the pre-existing test `'set reports success and never throws on quota errors'` passes an object literal as `backing`, which is truthy, so the new `if (!backing)` branch leaves it alone. That test keeps passing unchanged.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `node --test tools/shared/store.test.js` → PASS
Run: `npm test` → all green (store.js changes are additive).

- [ ] **Step 5: Commit**

```bash
git add tools/shared/store.js tools/shared/store.test.js
git commit -m "feat(store): report write failures instead of swallowing them"
```

---

### Task 2: `backup.js` — per-tool snapshots

**Files:**
- Create: `tools/shared/backup.js`
- Create: `tools/shared/backup.test.js`

**Interfaces:**
- Consumes: `isValidEncounter` from `encounter.js`, `isValidBook` from `scoresheet.js`, `isValidGame` from `timer.js`.
- Produces:
  - `SNAPSHOT_VERSION = 1`
  - `SNAPSHOT_KINDS` — `{ [kind]: { key, label, tool, isValid } }` for `encounter`, `score`, `timer`
  - `buildSnapshot(kind, data, now) → object`
  - `parseSnapshot(source, expectedKind) → { ok: true, kind, data, exportedAt } | { ok: false, error }`
  - `snapshotFilename(kind, now) → string`
  - `isoDay(now) → 'YYYY-MM-DD'`

- [ ] **Step 1: Write the failing tests**

Create `tools/shared/backup.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SNAPSHOT_VERSION,
  SNAPSHOT_KINDS,
  buildSnapshot,
  parseSnapshot,
  snapshotFilename,
} from './backup.js';
import { createEncounter } from './encounter.js';
import { createBook } from './scoresheet.js';
import { createGame } from './timer.js';

const NOW = new Date('2026-10-10T18:30:00.000Z');

const SAMPLES = {
  encounter: createEncounter(),
  score: createBook(),
  timer: createGame(),
};

test('every kind in the registry has a key, label, tool, and guard', () => {
  for (const [kind, entry] of Object.entries(SNAPSHOT_KINDS)) {
    assert.equal(typeof entry.key, 'string', `${kind} key`);
    assert.equal(typeof entry.label, 'string', `${kind} label`);
    assert.equal(typeof entry.tool, 'string', `${kind} tool`);
    assert.equal(typeof entry.isValid, 'function', `${kind} guard`);
  }
});

test('buildSnapshot wraps data in a versioned envelope', () => {
  const env = buildSnapshot('encounter', SAMPLES.encounter, NOW);
  assert.equal(env.tabletophacks, 'encounter');
  assert.equal(env.version, SNAPSHOT_VERSION);
  assert.equal(env.exportedAt, '2026-10-10T18:30:00.000Z');
  assert.deepEqual(env.data, SAMPLES.encounter);
});

test('buildSnapshot rejects an unknown kind', () => {
  assert.throws(() => buildSnapshot('nope', {}, NOW), /unknown snapshot kind/i);
});

test('every kind round-trips through build and parse', () => {
  for (const [kind, data] of Object.entries(SAMPLES)) {
    const source = JSON.stringify(buildSnapshot(kind, data, NOW));
    const result = parseSnapshot(source, kind);
    assert.equal(result.ok, true, `${kind}: ${result.error}`);
    assert.equal(result.kind, kind);
    assert.deepEqual(result.data, data);
    assert.equal(result.exportedAt, '2026-10-10T18:30:00.000Z');
  }
});

test('parseSnapshot rejects text that is not JSON', () => {
  const result = parseSnapshot('{not json', 'encounter');
  assert.equal(result.ok, false);
  assert.match(result.error, /not valid JSON/);
});

test('parseSnapshot rejects JSON that is not an export file', () => {
  for (const source of ['[]', '42', 'null', '{"round":1}']) {
    const result = parseSnapshot(source, 'encounter');
    assert.equal(result.ok, false, source);
    assert.match(result.error, /not a Tabletop Hacks export/);
  }
});

test('parseSnapshot rejects an unrecognised kind and names it', () => {
  const result = parseSnapshot('{"tabletophacks":"spaceships","version":1,"data":{}}', 'encounter');
  assert.equal(result.ok, false);
  assert.match(result.error, /unrecognised kind/);
  assert.match(result.error, /spaceships/);
});

test('parseSnapshot sends a mismatched export to the tool that owns it', () => {
  const source = JSON.stringify(buildSnapshot('score', SAMPLES.score, NOW));
  const result = parseSnapshot(source, 'encounter');
  assert.equal(result.ok, false);
  assert.match(result.error, /score sheets/);
  assert.match(result.error, /Score Tracker/);
});

test('parseSnapshot rejects a newer envelope version', () => {
  const env = buildSnapshot('encounter', SAMPLES.encounter, NOW);
  env.version = SNAPSHOT_VERSION + 1;
  const result = parseSnapshot(JSON.stringify(env), 'encounter');
  assert.equal(result.ok, false);
  assert.match(result.error, /newer version of the site/);
});

test('parseSnapshot rejects data that fails the shape guard', () => {
  const env = buildSnapshot('encounter', SAMPLES.encounter, NOW);
  env.data = { round: 'three', turnIndex: 0, combatants: [] };
  const result = parseSnapshot(JSON.stringify(env), 'encounter');
  assert.equal(result.ok, false);
  assert.match(result.error, /incomplete or damaged/);
});

test('parseSnapshot rejects a missing data field', () => {
  const result = parseSnapshot('{"tabletophacks":"encounter","version":1}', 'encounter');
  assert.equal(result.ok, false);
  assert.match(result.error, /incomplete or damaged/);
});

test('parseSnapshot rejects an unknown expectedKind outright', () => {
  const result = parseSnapshot('{}', 'nope');
  assert.equal(result.ok, false);
});

test('snapshotFilename names the kind and the day', () => {
  assert.equal(snapshotFilename('encounter', NOW), 'tabletophacks-encounter-2026-10-10.json');
  assert.equal(snapshotFilename('score', NOW), 'tabletophacks-score-2026-10-10.json');
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `node --test tools/shared/backup.test.js`
Expected: FAIL — `Cannot find module './backup.js'`.

- [ ] **Step 3: Create `tools/shared/backup.js`**

```js
/**
 * Export/import envelopes for everything this site keeps in localStorage,
 * at two scopes: a single tool's state (`buildSnapshot`/`parseSnapshot`) and
 * the whole `th:` namespace (`buildBackup`/`parseBackup`/`restorePlan`).
 *
 * Pure: no DOM, no localStorage, no clock — callers pass `now`. Imports are
 * validated through the same shape guards the tools use when loading from
 * storage, so a parsed result is always safe to adopt as state.
 */

import { isValidEncounter } from './encounter.js';
import { isValidBook } from './scoresheet.js';
import { isValidGame } from './timer.js';
import { KEY_PREFIX } from './store.js';

/** Bump only for a breaking envelope change; a higher version is refused. */
export const SNAPSHOT_VERSION = 1;

/** The envelope's discriminator field. */
const FIELD = 'tabletophacks';

/** Value of `tabletophacks` for a whole-origin backup. */
export const BACKUP_KIND = 'backup';

/**
 * Every exportable tool state: its `store.js` name, a noun for messages, the
 * tool that owns it (so a mismatch can say where the file belongs), and the
 * guard that decides whether imported data is usable.
 */
export const SNAPSHOT_KINDS = {
  encounter: { key: 'encounter', label: 'encounter', tool: 'Initiative Tracker', isValid: isValidEncounter },
  score: { key: 'score', label: 'score sheets', tool: 'Score Tracker', isValid: isValidBook },
  timer: { key: 'timer', label: 'turn timer', tool: 'Turn Timer', isValid: isValidGame },
};

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** `YYYY-MM-DD` in UTC, for filenames. */
export function isoDay(now) {
  return new Date(now).toISOString().slice(0, 10);
}

// ── Per-tool snapshots ──────────────────────────────────────────────────────

/**
 * @param {string} kind a key of SNAPSHOT_KINDS
 * @param {unknown} data the tool's state, as stored
 * @param {Date|number|string} now
 */
export function buildSnapshot(kind, data, now) {
  if (!Object.hasOwn(SNAPSHOT_KINDS, kind)) {
    throw new Error(`unknown snapshot kind: ${kind}`);
  }
  return {
    [FIELD]: kind,
    version: SNAPSHOT_VERSION,
    exportedAt: new Date(now).toISOString(),
    data,
  };
}

export function snapshotFilename(kind, now) {
  return `tabletophacks-${kind}-${isoDay(now)}.json`;
}

/**
 * Shared early checks for both envelope scopes: parseable JSON, an object, and
 * a `tabletophacks` field.
 * @returns {{ ok: true, envelope: object } | { ok: false, error: string }}
 */
function openEnvelope(source) {
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch {
    return { ok: false, error: 'not valid JSON — the file may be truncated, or not an export at all' };
  }
  if (!isPlainObject(parsed) || typeof parsed[FIELD] !== 'string') {
    return { ok: false, error: 'this is not a Tabletop Hacks export file' };
  }
  return { ok: true, envelope: parsed };
}

/** A version newer than this build cannot be read safely. */
function versionError(envelope) {
  const version = envelope.version;
  if (typeof version === 'number' && version > SNAPSHOT_VERSION) {
    return 'this export was made by a newer version of the site';
  }
  return null;
}

/**
 * @param {string} source file contents
 * @param {string} expectedKind the kind the importing tool can accept
 * @returns {{ ok: true, kind: string, data: unknown, exportedAt: unknown }
 *          | { ok: false, error: string }}
 */
export function parseSnapshot(source, expectedKind) {
  const expected = SNAPSHOT_KINDS[expectedKind];
  if (!expected) return { ok: false, error: `unknown snapshot kind: ${expectedKind}` };

  const opened = openEnvelope(source);
  if (!opened.ok) return opened;
  const envelope = opened.envelope;

  const kind = envelope[FIELD];
  const found = SNAPSHOT_KINDS[kind];
  if (!found) {
    return { ok: false, error: `this export is of an unrecognised kind (${kind})` };
  }
  if (kind !== expectedKind) {
    return { ok: false, error: `this is ${found.label === 'score sheets' ? 'a' : 'an'} ${found.label} export — open it in the ${found.tool} instead` };
  }

  const stale = versionError(envelope);
  if (stale) return { ok: false, error: stale };

  if (!('data' in envelope) || !found.isValid(envelope.data)) {
    return { ok: false, error: `the ${found.label} data in this file is incomplete or damaged` };
  }

  return { ok: true, kind, data: envelope.data, exportedAt: envelope.exportedAt };
}
```

Note the article in the mismatch message: "an encounter export", "a score sheets export", "a turn timer export". The ternary above is wrong for `timer` — fix it in Step 4 rather than shipping it.

- [ ] **Step 4: Replace the article ternary with a data field**

An inline ternary over labels does not scale and reads badly. Add `article` to each registry entry and use it:

```js
export const SNAPSHOT_KINDS = {
  encounter: { key: 'encounter', label: 'encounter', article: 'an', tool: 'Initiative Tracker', isValid: isValidEncounter },
  score: { key: 'score', label: 'score sheets', article: 'a', tool: 'Score Tracker', isValid: isValidBook },
  timer: { key: 'timer', label: 'turn timer', article: 'a', tool: 'Turn Timer', isValid: isValidGame },
};
```

and in `parseSnapshot`:

```js
  if (kind !== expectedKind) {
    return {
      ok: false,
      error: `this is ${found.article} ${found.label} export — open it in the ${found.tool} instead`,
    };
  }
```

Also add `article` to the registry assertion in the test from Step 1:

```js
    assert.equal(typeof entry.article, 'string', `${kind} article`);
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `node --test tools/shared/backup.test.js` → PASS
Run: `npm test` → all green.

- [ ] **Step 6: Commit**

```bash
git add tools/shared/backup.js tools/shared/backup.test.js
git commit -m "feat(backup): per-tool export envelope with validated imports"
```

---

### Task 3: `backup.js` — whole-origin backup and restore planning

**Files:**
- Modify: `tools/shared/backup.js` (append)
- Modify: `tools/shared/backup.test.js` (append)

**Interfaces:**
- Consumes: `KEY_PREFIX`, `openEnvelope`, `versionError`, `isoDay`, `BACKUP_KIND`, `SNAPSHOT_VERSION` from Task 2.
- Produces:
  - `buildBackup(entries, now) → { tabletophacks: 'backup', version, exportedAt, keys }`
  - `parseBackup(source) → { ok: true, keys, exportedAt } | { ok: false, error }`
  - `restorePlan(existingEntries, incomingKeys) → { writes, replaced, added, unaffected }`
  - `backupFilename(now) → string`

- [ ] **Step 1: Write the failing tests**

Append to `tools/shared/backup.test.js` (extend the import list at the top of the file with `buildBackup, parseBackup, restorePlan, backupFilename`):

```js
const ENTRIES = [
  ['th:packs:v1', '[{"id":"p1"}]'],
  ['th:encounter:v1', '{"round":2,"turnIndex":0,"combatants":[]}'],
  ['unrelated-key', 'someone else\'s data'],
];

test('buildBackup keeps only th: keys, as raw strings', () => {
  const env = buildBackup(ENTRIES, NOW);
  assert.equal(env.tabletophacks, 'backup');
  assert.equal(env.version, SNAPSHOT_VERSION);
  assert.equal(env.exportedAt, '2026-10-10T18:30:00.000Z');
  assert.deepEqual(Object.keys(env.keys).sort(), ['th:encounter:v1', 'th:packs:v1']);
  assert.equal(env.keys['th:packs:v1'], '[{"id":"p1"}]');
});

test('buildBackup of an empty origin yields an empty keys object', () => {
  assert.deepEqual(buildBackup([], NOW).keys, {});
});

test('backup round-trips through build and parse', () => {
  const result = parseBackup(JSON.stringify(buildBackup(ENTRIES, NOW)));
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(result.keys, {
    'th:packs:v1': '[{"id":"p1"}]',
    'th:encounter:v1': '{"round":2,"turnIndex":0,"combatants":[]}',
  });
  assert.equal(result.exportedAt, '2026-10-10T18:30:00.000Z');
});

test('parseBackup rejects a per-tool snapshot', () => {
  const source = JSON.stringify(buildSnapshot('encounter', SAMPLES.encounter, NOW));
  const result = parseBackup(source);
  assert.equal(result.ok, false);
  assert.match(result.error, /not a full backup/);
});

test('parseBackup rejects text that is not JSON or not an export', () => {
  assert.match(parseBackup('{nope').error, /not valid JSON/);
  assert.match(parseBackup('[]').error, /not a Tabletop Hacks export/);
});

test('parseBackup rejects a newer envelope version', () => {
  const env = buildBackup(ENTRIES, NOW);
  env.version = SNAPSHOT_VERSION + 1;
  assert.match(parseBackup(JSON.stringify(env)).error, /newer version of the site/);
});

test('parseBackup rejects a keys field that is not an object of strings', () => {
  for (const keys of ['[]', 'null', '{"th:packs:v1":42}', '{"th:packs:v1":{}}']) {
    const source = `{"tabletophacks":"backup","version":1,"keys":${keys}}`;
    const result = parseBackup(source);
    assert.equal(result.ok, false, keys);
    assert.match(result.error, /damaged|not a Tabletop Hacks/);
  }
});

test('parseBackup refuses a key outside the th: namespace and names it', () => {
  const source = '{"tabletophacks":"backup","version":1,"keys":{"evil":"x"}}';
  const result = parseBackup(source);
  assert.equal(result.ok, false);
  assert.match(result.error, /evil/);
  assert.match(result.error, /th:/);
});

test('restorePlan splits keys into replaced, added, and unaffected', () => {
  const existing = [
    ['th:packs:v1', 'old packs'],
    ['th:library:v1', 'untouched'],
    ['unrelated-key', 'not ours'],
  ];
  const incoming = { 'th:packs:v1': 'new packs', 'th:encounter:v1': 'fresh' };
  const plan = restorePlan(existing, incoming);
  assert.deepEqual(plan.replaced, ['th:packs:v1']);
  assert.deepEqual(plan.added, ['th:encounter:v1']);
  assert.deepEqual(plan.unaffected, ['th:library:v1']);
  assert.deepEqual(plan.writes, [
    ['th:packs:v1', 'new packs'],
    ['th:encounter:v1', 'fresh'],
  ]);
});

test('restorePlan reports nothing unaffected when the backup covers everything', () => {
  const plan = restorePlan([['th:packs:v1', 'old']], { 'th:packs:v1': 'new' });
  assert.deepEqual(plan.unaffected, []);
  assert.deepEqual(plan.added, []);
});

test('backupFilename names the day', () => {
  assert.equal(backupFilename(NOW), 'tabletophacks-backup-2026-10-10.json');
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `node --test tools/shared/backup.test.js`
Expected: FAIL — `buildBackup is not a function`.

- [ ] **Step 3: Append to `tools/shared/backup.js`**

```js
// ── Whole-origin backup ─────────────────────────────────────────────────────

export function backupFilename(now) {
  return `tabletophacks-${BACKUP_KIND}-${isoDay(now)}.json`;
}

/**
 * Every `th:` key in one envelope. Values stay **raw strings** rather than
 * parsed JSON: parsing would read better in an editor but makes restore
 * ambiguous (a stored string `"x"` and a corrupt raw `x` both come back as
 * `x`), and a value that is not JSON at all could not round-trip. A backup's
 * one job is to be lossless.
 * @param {Iterable<[string, string]>} entries from storageEntries()
 * @param {Date|number|string} now
 */
export function buildBackup(entries, now) {
  const keys = {};
  for (const [key, value] of entries) {
    if (typeof key === 'string' && key.startsWith(KEY_PREFIX)) {
      keys[key] = String(value);
    }
  }
  return {
    [FIELD]: BACKUP_KIND,
    version: SNAPSHOT_VERSION,
    exportedAt: new Date(now).toISOString(),
    keys,
  };
}

/**
 * @param {string} source file contents
 * @returns {{ ok: true, keys: Record<string, string>, exportedAt: unknown }
 *          | { ok: false, error: string }}
 */
export function parseBackup(source) {
  const opened = openEnvelope(source);
  if (!opened.ok) return opened;
  const envelope = opened.envelope;

  if (envelope[FIELD] !== BACKUP_KIND) {
    const kind = SNAPSHOT_KINDS[envelope[FIELD]];
    return {
      ok: false,
      error: kind
        ? `this is ${kind.article} ${kind.label} export, not a full backup — open it in the ${kind.tool} instead`
        : 'this is not a full backup file',
    };
  }

  const stale = versionError(envelope);
  if (stale) return { ok: false, error: stale };

  const keys = envelope.keys;
  if (!isPlainObject(keys)) {
    return { ok: false, error: 'this backup is damaged — it has no stored values' };
  }
  for (const [key, value] of Object.entries(keys)) {
    if (!key.startsWith(KEY_PREFIX)) {
      return { ok: false, error: `this backup contains a key outside this site's storage (${key}); expected every key to start with "${KEY_PREFIX}"` };
    }
    if (typeof value !== 'string') {
      return { ok: false, error: `this backup is damaged — the value for ${key} is not text` };
    }
  }

  return { ok: true, keys, exportedAt: envelope.exportedAt };
}

/**
 * What a restore would do, so the UI can say it before doing it. Keys in
 * storage but absent from the file are reported as `unaffected` and left
 * alone: a restore puts back what the backup covered, it does not wipe what
 * it did not.
 * @param {Iterable<[string, string]>} existingEntries
 * @param {Record<string, string>} incomingKeys
 * @returns {{ writes: [string, string][], replaced: string[], added: string[],
 *             unaffected: string[] }}
 */
export function restorePlan(existingEntries, incomingKeys) {
  const existing = new Set();
  for (const [key] of existingEntries) {
    if (typeof key === 'string' && key.startsWith(KEY_PREFIX)) existing.add(key);
  }
  const writes = [];
  const replaced = [];
  const added = [];
  for (const [key, value] of Object.entries(incomingKeys)) {
    writes.push([key, value]);
    (existing.has(key) ? replaced : added).push(key);
  }
  const incoming = new Set(Object.keys(incomingKeys));
  const unaffected = [...existing].filter((key) => !incoming.has(key));
  return { writes, replaced, added, unaffected };
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `node --test tools/shared/backup.test.js` → PASS
Run: `npm test` → all green.

- [ ] **Step 5: Commit**

```bash
git add tools/shared/backup.js tools/shared/backup.test.js
git commit -m "feat(backup): whole-origin backup, restore planning, namespace guard"
```

---

### Task 4: The one-time storage notice

**Files:**
- Create: `tools/shared/notices.js`
- Create: `tools/shared/notices.test.js`
- Modify: `tools/shared/ui.js` (append `noticeBar`)
- Modify: `tools/shared/tools.css` (after the `.toast` block)

**Interfaces:**
- Consumes: `store.get` / `store.set` from Task 1.
- Produces:
  - `STORAGE_NOTICE_ID = 'storage'`
  - `STORAGE_NOTICE` — the warning text
  - `NOTICES_KEY = 'notices'` — the `store.js` name holding the seen flags
  - `shouldShowNotice(seen, id) → boolean`
  - `markNoticeSeen(seen, id) → object`
  - `showStorageNoticeOnce(store) → void` (wired, untested)
  - `noticeBar(message, { actionText, onAction }) → HTMLElement` in `ui.js`

- [ ] **Step 1: Write the failing tests**

Create `tools/shared/notices.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STORAGE_NOTICE,
  STORAGE_NOTICE_ID,
  shouldShowNotice,
  markNoticeSeen,
} from './notices.js';

test('the storage notice names the risk and the remedy', () => {
  assert.match(STORAGE_NOTICE, /this browser/i);
  assert.match(STORAGE_NOTICE, /export/i);
});

test('shouldShowNotice is true until the notice is seen', () => {
  assert.equal(shouldShowNotice({}, STORAGE_NOTICE_ID), true);
  assert.equal(shouldShowNotice({ storage: true }, STORAGE_NOTICE_ID), false);
});

test('shouldShowNotice tolerates a missing or corrupt flag set', () => {
  for (const seen of [undefined, null, 'nonsense', 42, []]) {
    assert.equal(shouldShowNotice(seen, STORAGE_NOTICE_ID), true, String(seen));
  }
});

test('shouldShowNotice ignores a falsy flag', () => {
  assert.equal(shouldShowNotice({ storage: false }, STORAGE_NOTICE_ID), true);
});

test('markNoticeSeen returns a new object and never mutates its input', () => {
  const seen = {};
  const next = markNoticeSeen(seen, STORAGE_NOTICE_ID);
  assert.deepEqual(seen, {});
  assert.equal(next.storage, true);
  assert.notEqual(next, seen);
});

test('markNoticeSeen keeps other flags and is idempotent', () => {
  const once = markNoticeSeen({ other: true }, STORAGE_NOTICE_ID);
  assert.deepEqual(once, { other: true, storage: true });
  assert.deepEqual(markNoticeSeen(once, STORAGE_NOTICE_ID), once);
});

test('markNoticeSeen recovers from a corrupt flag set', () => {
  assert.deepEqual(markNoticeSeen('nonsense', STORAGE_NOTICE_ID), { storage: true });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `node --test tools/shared/notices.test.js`
Expected: FAIL — `Cannot find module './notices.js'`.

- [ ] **Step 3: Create `tools/shared/notices.js`**

```js
/**
 * One-time notices. The decision logic is pure and tested; the single wired
 * helper at the bottom is thin DOM glue, per repo convention.
 *
 * All flags share one store value (`th:notices:v1`, shaped `{ storage: true }`)
 * so later notices do not each add a key.
 */

import { noticeBar } from './ui.js';

/** The store.js name holding the seen flags. */
export const NOTICES_KEY = 'notices';

export const STORAGE_NOTICE_ID = 'storage';

export const STORAGE_NOTICE =
  'Your saved work lives in this browser only. Clearing your browsing data — ' +
  'or using private browsing — will erase it. Use Export to keep a copy.';

function flags(seen) {
  return seen !== null && typeof seen === 'object' && !Array.isArray(seen) ? seen : {};
}

/** @param {unknown} seen the stored flag set @param {string} id */
export function shouldShowNotice(seen, id) {
  return flags(seen)[id] !== true;
}

/** @returns {object} a new flag set; never mutates `seen`. */
export function markNoticeSeen(seen, id) {
  return { ...flags(seen), [id]: true };
}

/**
 * Show the storage warning the first time a tool saves, then never again.
 * Thin wiring: untested, like the app.js files that call it.
 * @param {{ get: Function, set: Function }} store
 */
export function showStorageNoticeOnce(store) {
  const seen = store.get(NOTICES_KEY, {});
  if (!shouldShowNotice(seen, STORAGE_NOTICE_ID)) return;
  // Mark first: if the write itself fails there is no storage to remember the
  // flag in, and nagging on every save would be worse than showing it once.
  store.set(NOTICES_KEY, markNoticeSeen(seen, STORAGE_NOTICE_ID));
  noticeBar(STORAGE_NOTICE);
}
```

- [ ] **Step 4: Append `noticeBar` to `tools/shared/ui.js`**

```js
/** Dismissible notice bar, bottom of the page. Unlike `toast`, it stays until
 *  the reader dismisses it — for things worth reading, not confirmations.
 *  @param {string} message
 *  @param {{ actionText?: string, onAction?: () => void }} [options] */
export function noticeBar(message, { actionText = 'Got it', onAction } = {}) {
  document.querySelector('.notice-bar')?.remove();
  const bar = el('div', { class: 'notice-bar', role: 'status' }, el('p', {}, message));
  bar.append(
    el('button', {
      class: 'btn btn-small',
      type: 'button',
      onclick: () => {
        bar.remove();
        onAction?.();
      },
    }, actionText),
  );
  document.body.append(bar);
  return bar;
}
```

`el()` sets children with `append`, which creates text nodes, so `message` is
never parsed as HTML — the `esc()` invariant is satisfied by construction.

- [ ] **Step 5: Add the CSS to `tools/shared/tools.css`**

Immediately after the `.toast.toast-visible` rule:

```css
/* ── Notice bar ─────────────────────────────── */
.notice-bar {
  position: fixed;
  bottom: 1rem;
  left: 50%;
  transform: translateX(-50%);
  width: min(42rem, calc(100vw - 2rem));
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  background: var(--card-hover);
  border: 1px solid var(--accent);
  border-radius: 8px;
  padding: 0.75rem 1rem;
  font-size: 0.8125rem;
  color: var(--text-primary);
  box-shadow: 0 4px 16px rgb(0 0 0 / 0.35);
  z-index: 11;
}

.notice-bar p { margin: 0; flex: 1 1 18rem; line-height: 1.5; }
```

`z-index: 11` sits one above `.toast`'s `10`, so a save toast cannot cover the
notice that the same save triggered.

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `node --test tools/shared/notices.test.js` → PASS
Run: `npm test` → all green.

- [ ] **Step 7: Commit**

```bash
git add tools/shared/notices.js tools/shared/notices.test.js tools/shared/ui.js tools/shared/tools.css
git commit -m "feat(notices): one-time warning that saved work lives in the browser"
```

---

### Task 5: Initiative Tracker — export, import, save failures, notice

**Files:**
- Modify: `tools/initiative/index.html` (the button row near line 77)
- Modify: `tools/initiative/app.js`

**Interfaces:**
- Consumes: `buildSnapshot`, `parseSnapshot`, `snapshotFilename` (Task 2); `createStore` with `onError` (Task 1); `showStorageNoticeOnce` (Task 4); `download` from `ui.js`.
- Produces: the pattern Tasks 6 and 7 repeat for `score` and `timer`.

- [ ] **Step 1: Add the buttons to `tools/initiative/index.html`**

Replace the existing reset button line:

```html
        <button class="btn btn-small init-reset" id="reset-btn">New encounter</button>
```

with:

```html
        <div class="init-datatools">
          <button class="btn btn-small" id="export-btn">Export</button>
          <button class="btn btn-small" id="import-btn">Import…</button>
          <input type="file" id="import-input" accept=".json,application/json" hidden />
          <button class="btn btn-small init-reset" id="reset-btn">New encounter</button>
        </div>
```

- [ ] **Step 2: Wire `tools/initiative/app.js`**

Extend the imports:

```js
import { el, clearNode, toast, uid, download } from '../shared/ui.js';
import { createStore } from '../shared/store.js';
import { buildSnapshot, parseSnapshot, snapshotFilename } from '../shared/backup.js';
import { showStorageNoticeOnce } from '../shared/notices.js';
```

Give the store an error channel:

```js
const store = createStore(undefined, { onError: (e) => toast(e.message) });
const KEY = 'encounter';
```

In `commit()`, after the successful `store.set`, surface the notice once:

```js
  if (store.set(KEY, state)) showStorageNoticeOnce(store);
  render();
```

Add the export/import handlers near the other listeners:

```js
function exportEncounter() {
  const now = new Date();
  download(snapshotFilename(KEY, now), JSON.stringify(buildSnapshot(KEY, state, now), null, 2));
  toast('Encounter exported');
}

function importEncounter(file) {
  const reader = new FileReader();
  reader.onerror = () => toast('Could not read that file');
  reader.onload = () => {
    const result = parseSnapshot(String(reader.result), KEY);
    if (!result.ok) return toast(`Import failed — ${result.error}`);
    if (state.combatants.length && !confirm('Replace the current encounter with the imported one?')) return;
    state = result.data;
    if (store.set(KEY, state)) showStorageNoticeOnce(store);
    render();
    toast(`Imported ${state.combatants.length} combatant${state.combatants.length === 1 ? '' : 's'}`);
  };
  reader.readAsText(file);
}
```

and the listeners:

```js
document.getElementById('export-btn').addEventListener('click', exportEncounter);
document.getElementById('import-btn').addEventListener('click', () => document.getElementById('import-input').click());
document.getElementById('import-input').addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (file) importEncounter(file);
  e.target.value = ''; // let the same file be re-imported
});
```

- [ ] **Step 3: Add the layout rule to `tools/shared/tools.css`**

In the Initiative Tracker section:

```css
.init-datatools { display: flex; flex-wrap: wrap; gap: 0.5rem; }
```

- [ ] **Step 4: Verify**

Run: `npm test` → all green (no shared-module change in this task).
Manual: serve locally, add two combatants, Export, "New encounter", Import the
file, confirm the roster and round return. Confirm the notice bar appears on the
first add and not on the second.

- [ ] **Step 5: Commit**

```bash
git add tools/initiative/index.html tools/initiative/app.js tools/shared/tools.css
git commit -m "feat(initiative): export and import an encounter"
```

---

### Task 6: Score Tracker — export, import, save failures, notice

**Files:**
- Modify: `tools/score/index.html` (the button row near line 77)
- Modify: `tools/score/app.js`

**Interfaces:**
- Consumes: the same four imports as Task 5, with `KIND = 'score'`.
- Produces: nothing new.

- [ ] **Step 1: Add the buttons to `tools/score/index.html`**

Replace:

```html
        <button class="btn" id="new-sheet">New sheet</button>
        <button class="btn btn-small btn-danger score-delete" id="delete-sheet">Delete sheet</button>
```

with:

```html
        <button class="btn" id="new-sheet">New sheet</button>
        <button class="btn btn-small" id="export-btn">Export</button>
        <button class="btn btn-small" id="import-btn">Import…</button>
        <input type="file" id="import-input" accept=".json,application/json" hidden />
        <button class="btn btn-small btn-danger score-delete" id="delete-sheet">Delete sheet</button>
```

- [ ] **Step 2: Wire `tools/score/app.js`**

Extend the imports and the store exactly as in Task 5 (`download` added to the
`ui.js` import; `buildSnapshot`, `parseSnapshot`, `snapshotFilename` from
`backup.js`; `showStorageNoticeOnce` from `notices.js`):

```js
const store = createStore(undefined, { onError: (e) => toast(e.message) });
const KEY = 'score';
```

In the save function (around line 60), gate the notice on success:

```js
  if (store.set(KEY, state)) showStorageNoticeOnce(store);
```

Handlers — note this replaces the **whole book**, not a merge of sheets by id.
Merging is defensible but replace is what the other two tools do and what
"restore my lost sheet" means:

```js
function exportBook() {
  const now = new Date();
  download(snapshotFilename(KEY, now), JSON.stringify(buildSnapshot(KEY, state, now), null, 2));
  toast('Score sheets exported');
}

function importBook(file) {
  const reader = new FileReader();
  reader.onerror = () => toast('Could not read that file');
  reader.onload = () => {
    const result = parseSnapshot(String(reader.result), KEY);
    if (!result.ok) return toast(`Import failed — ${result.error}`);
    const count = state.sheets.length;
    if (count && !confirm(`Replace your ${count} saved sheet${count === 1 ? '' : 's'} with the imported ones?`)) return;
    state = result.data;
    if (store.set(KEY, state)) showStorageNoticeOnce(store);
    render();
    toast(`Imported ${state.sheets.length} sheet${state.sheets.length === 1 ? '' : 's'}`);
  };
  reader.readAsText(file);
}

document.getElementById('export-btn').addEventListener('click', exportBook);
document.getElementById('import-btn').addEventListener('click', () => document.getElementById('import-input').click());
document.getElementById('import-input').addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (file) importBook(file);
  e.target.value = '';
});
```

Check the actual name of the repaint function in this file before wiring
`render()` — use whatever the existing save path calls.

- [ ] **Step 3: Verify**

Run: `npm test` → all green.
Manual: create a sheet with players and scores, Export, Delete the sheet,
Import, confirm it returns. Then import the *encounter* file from Task 5 and
read the message: it should name "an encounter export" and the Initiative
Tracker.

- [ ] **Step 4: Commit**

```bash
git add tools/score/index.html tools/score/app.js
git commit -m "feat(score): export and import score sheets"
```

---

### Task 7: Turn Timer — export, import, save failures, notice

**Files:**
- Modify: `tools/timer/index.html`
- Modify: `tools/timer/app.js`

**Interfaces:**
- Consumes: the same imports, with `KEY = 'timer'`.
- Produces: nothing new.

- [ ] **Step 1: Add the buttons to `tools/timer/index.html`**

Add to the existing control row, matching the markup pattern of Tasks 5 and 6:

```html
        <button class="btn btn-small" id="export-btn">Export</button>
        <button class="btn btn-small" id="import-btn">Import…</button>
        <input type="file" id="import-input" accept=".json,application/json" hidden />
```

- [ ] **Step 2: Wire `tools/timer/app.js`**

Same import additions and store construction. In the save function (around
line 66): `if (store.set(KEY, state)) showStorageNoticeOnce(store);`

```js
function exportGame() {
  const now = new Date();
  download(snapshotFilename(KEY, now), JSON.stringify(buildSnapshot(KEY, state, now), null, 2));
  toast('Timer exported');
}

function importGame(file) {
  const reader = new FileReader();
  reader.onerror = () => toast('Could not read that file');
  reader.onload = () => {
    const result = parseSnapshot(String(reader.result), KEY);
    if (!result.ok) return toast(`Import failed — ${result.error}`);
    if (state.players.length && !confirm('Replace the current timer with the imported one?')) return;
    state = result.data;
    if (store.set(KEY, state)) showStorageNoticeOnce(store);
    render();
    toast(`Imported ${state.players.length} player${state.players.length === 1 ? '' : 's'}`);
  };
  reader.readAsText(file);
}
```

plus the same three listeners as Task 5.

**A running clock needs care.** The timer ticks on an interval and `state` may
carry `running: true` with a `turnStartedAt` from another device. Before
adopting imported state, stop the local tick and clear `running`, so an import
never leaves a clock counting from a stale timestamp:

```js
    state = { ...result.data, running: false, turnStartedAt: null };
```

Check the actual pause/stop helper in this file and call it before reassigning
`state`, so any `setInterval` handle is cleared.

- [ ] **Step 3: Verify**

Run: `npm test` → all green.
Manual: add players, run the clock a few seconds, pause, Export; reset; Import;
confirm elapsed totals return and the clock is **paused**, not running.

- [ ] **Step 4: Commit**

```bash
git add tools/timer/index.html tools/timer/app.js
git commit -m "feat(timer): export and import a turn timer"
```

---

### Task 8: Workshop — back up everything, restore, notice

**Files:**
- Modify: `tools/workshop/index.html` (the Storage `side-group`, near line 73)
- Modify: `tools/workshop/app.js`

**Interfaces:**
- Consumes: `buildBackup`, `parseBackup`, `restorePlan`, `backupFilename` (Task 3); `store.setRaw` (Task 1); `showStorageNoticeOnce` (Task 4); `storageEntries` from `storage.js`.
- Produces: nothing new.

- [ ] **Step 1: Add the controls to `tools/workshop/index.html`**

Replace the Storage group:

```html
        <div class="side-group">
          <h2>Storage</h2>
          <div id="storage-meter"></div>
        </div>
```

with:

```html
        <div class="side-group">
          <h2>Storage</h2>
          <div id="storage-meter"></div>
          <div class="side-actions">
            <button class="btn btn-small" id="backup-btn">Back up everything</button>
            <button class="btn btn-small" id="restore-btn">Restore…</button>
            <input type="file" id="restore-input" accept=".json,application/json" hidden />
          </div>
          <p class="hint">A backup is one JSON file covering every tool on this
            site — packs, library, encounters, score sheets, and timers.</p>
        </div>
```

- [ ] **Step 2: Wire `tools/workshop/app.js`**

```js
import { buildBackup, parseBackup, restorePlan, backupFilename } from '../shared/backup.js';
import { showStorageNoticeOnce } from '../shared/notices.js';
```

and the store:

```js
const store = createStore(undefined, { onError: (e) => toast(e.message) });
```

In `persist()`, the existing success branch gains the notice:

```js
function persist() {
  const ok = store.set('packs', state.packs);
  if (!ok) toast('Could not save — browser storage is full');
  else showStorageNoticeOnce(store);
  refreshStorageMeter();
  return ok;
}
```

(The `onError` toast now carries the detailed reason; the local message stays
because it names *what* failed.)

```js
function backupEverything() {
  const now = new Date();
  download(backupFilename(now), JSON.stringify(buildBackup(storageEntries(), now), null, 2));
  toast('Backup downloaded');
}

function restoreEverything(file) {
  const reader = new FileReader();
  reader.onerror = () => toast('Could not read that file');
  reader.onload = () => {
    const parsed = parseBackup(String(reader.result));
    if (!parsed.ok) return toast(`Restore failed — ${parsed.error}`);
    const plan = restorePlan(storageEntries(), parsed.keys);
    if (!plan.writes.length) return toast('That backup is empty — nothing to restore');
    const summary =
      `Restore this backup?\n\n` +
      `Replaces ${plan.replaced.length} saved item${plan.replaced.length === 1 ? '' : 's'}, ` +
      `adds ${plan.added.length}.\n` +
      `${plan.unaffected.length} item${plan.unaffected.length === 1 ? '' : 's'} not in the backup will be left alone.\n\n` +
      `The page will reload so every tool reads the restored data.`;
    if (!confirm(summary)) return;
    for (const [key, value] of plan.writes) {
      if (!store.setRaw(key, value)) return; // onError already explained why
    }
    location.reload();
  };
  reader.readAsText(file);
}

$('backup-btn').addEventListener('click', backupEverything);
$('restore-btn').addEventListener('click', () => $('restore-input').click());
$('restore-input').addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (file) restoreEverything(file);
  e.target.value = '';
});
```

Wire these inside the existing `main()` listener block, alongside
`new-btn`/`import-btn`, so they run after the DOM is ready.

The confirm summary uses only computed counts, and `location.reload()` replaces
any need to repaint from a file — no file-derived text reaches the DOM, so the
`esc()` invariant is not in play here.

- [ ] **Step 3: Add the CSS to `tools/shared/tools.css`**

Next to the `.side-group` rules:

```css
.side-actions { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.5rem; }
```

- [ ] **Step 4: Verify**

Run: `npm test` → all green.
Manual: in the Workshop, "Back up everything"; edit and save a pack; add a
combatant in Initiative; return to the Workshop and Restore the file; confirm
the pack reverts *and* the Initiative roster reverts. Then try restoring a
per-tool encounter export and read the message — it should say it is an
encounter export and name the Initiative Tracker.

- [ ] **Step 5: Commit**

```bash
git add tools/workshop/index.html tools/workshop/app.js tools/shared/tools.css
git commit -m "feat(workshop): back up and restore every tool's data in one file"
```

---

### Task 9: Generator — save failures and the notice

**Files:**
- Modify: `tools/generator/app.js`

**Interfaces:**
- Consumes: `createStore` with `onError` (Task 1); `showStorageNoticeOnce` (Task 4).
- Produces: nothing new.

The Generator already exports and imports its library, so it needs no new
buttons — only the error channel and the notice, so a GM who saves to the
library learns the same thing a GM who saves an encounter does.

- [ ] **Step 1: Wire the store and the notice**

```js
import { showStorageNoticeOnce } from '../shared/notices.js';

const store = createStore(undefined, { onError: (e) => toast(e.message) });
```

At the two deliberate-keep save sites — saving a result to the library
(around line 639) and merging an imported library (around line 607) — add the
notice to the success path:

```js
  if (!store.set('library', [entry, ...library()])) return;
  showStorageNoticeOnce(store);
```

Leave `store.set('settings', …)` alone: remembering the last generator is not
work a user would mourn, and firing the notice there would show it on a plain
page visit.

- [ ] **Step 2: Verify**

Run: `npm test` → all green.
Manual: generate a result, Save to library, confirm the notice appears once.
Reload, save another, confirm it does not reappear.

- [ ] **Step 3: Commit**

```bash
git add tools/generator/app.js
git commit -m "feat(generator): surface save failures and the storage notice"
```

---

### Task 10: Check the band off the roadmap

**Files:**
- Modify: `ROADMAP.md` (Trust & data safety section, and the "Start here" list)

- [ ] **Step 1: Check the four boxes with a date and a spec link**

Rewrite the Trust & data safety section:

```markdown
### Trust & data safety

**Done 2026-10-10** — see
[the design spec](docs/superpowers/specs/2026-10-10-data-safety-design.md).
Initiative, Score, and Timer can each export and import their state; the
Workshop can back up and restore every `th:*` key in one file; a dismissible
notice explains on first save that saved work lives in the browser only; and
`store.js` now reports *why* a write failed instead of returning a bare
`false` that three tools ignored.

- [x] **Export/import for Initiative and Score** *(and Timer, which has the
  same validator and the same risk.)*
- [x] **"Back up everything" button** — one JSON file across all `th:*` keys,
  next to the storage indicator in the Workshop.
- [x] **A plain warning that clearing browser data erases saved work**, shown
  on first save.
- [x] **Graceful `QuotaExceededError` handling.**

Left open deliberately:

- [ ] **A discoverable home for backup/restore.** It lives in the Workshop,
  which is the author-facing tool — a GM who only uses Initiative never sees
  it. A footer "Your data" page would fix that, and it pairs naturally with
  the About/Privacy/Terms footer links already on this list.
- [ ] **Merging imported score sheets by id** instead of replacing the book.
  Replace is what "restore my lost sheet" means; merge is a real feature if
  anyone asks to move one sheet between devices.
```

- [ ] **Step 2: Note what is now unblocked in "Start here"**

The band is no longer a blocker, so nothing in "Start here" changes rank — but
add one line after item 3 recording that the data-safety work is done, to keep
the ordered list honest:

```markdown
5. ~~**Trust & data safety**~~ — *done 2026-10-10.* Export, import, whole-site
   backup, and honest save failures. Not originally ranked here; it moved first
   because it was the only band that was pure code with no outside dependency
   (no mailing-list account, no hosting decision, no judgment call on table
   text).
```

- [ ] **Step 3: Run the full suite one last time**

Run: `npm test`
Expected: every test passing, including the new `backup.test.js` and
`notices.test.js` and the extended `store.test.js`.

- [ ] **Step 4: Commit**

```bash
git add ROADMAP.md
git commit -m "docs: check off the Trust & data safety band"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| 1. `store.js` graceful write failure (`describeWriteError`, `resolveBacking`, `persistent`, `onError`, `get` guard, `setRaw`) | Task 1 |
| 2. `backup.js` kind registry + per-tool snapshot | Task 2 |
| 2. `backup.js` whole-origin backup + `restorePlan` + `th:` guard | Task 3 |
| 3. `notices.js` + `ui.js` `noticeBar` + CSS | Task 4 |
| 4. Initiative / Score / Timer wiring | Tasks 5, 6, 7 |
| 4. Workshop backup + restore | Task 8 |
| 3. Notice in Generator and Workshop save paths | Tasks 8, 9 |
| Testing (`backup.test.js`, extended `store.test.js`, `notices.test.js`) | Tasks 1–4 |
| Roadmap check-off | Task 10 |

**Placeholder scan:** no TBDs. The two places a step says "check the actual
name in this file" (Score's repaint function in Task 6, Timer's pause helper in
Task 7) are deliberate — those names were not read during planning, and
guessing an identifier would be worse than naming the lookup.

**Type consistency:** `KEY_PREFIX` is defined in Task 1 and consumed in Tasks 2
and 3. `SNAPSHOT_KINDS` entries carry `key`, `label`, `article`, `tool`,
`isValid` after Task 2 Step 4, and `parseBackup` in Task 3 uses `article`,
`label`, and `tool` — consistent. `store.setRaw(fullKey, value)` in Task 1
matches its only caller in Task 8. `showStorageNoticeOnce(store)` takes the
store in Task 4 and is called that way in Tasks 5–9. Store names used
(`encounter`, `score`, `timer`, `packs`, `library`, `notices`) match the Global
Constraints list.

**One spec deviation, deliberate:** the spec described `noticeBar(message, {
actionText, onAction })` as firing "the dismiss callback"; Task 4 implements
`onAction` as exactly that and defaults `actionText` to "Got it". No behavioural
difference, but the parameter is named for the button, not the dismissal.
