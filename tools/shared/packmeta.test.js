import test from 'node:test';
import assert from 'node:assert/strict';
import { PACK_META_KEY, readPackMeta, formatVersion } from './packmeta.js';
import { planImport, IMPORT_FAILED_MESSAGE } from './packimport.js';

const pack = (meta, tables = { wreck: ['a hull'] }) =>
  JSON.stringify(meta === undefined ? tables : { [PACK_META_KEY]: meta, ...tables });

test('the metadata key is $pack', () => {
  assert.equal(PACK_META_KEY, '$pack');
});

test('a pack without $pack has empty metadata', () => {
  assert.deepEqual(readPackMeta({ wreck: [] }), { ok: true, meta: {} });
});

test('known string fields are kept and unknown fields dropped', () => {
  const result = readPackMeta({
    $pack: {
      title: 'Haunted Coast',
      version: '1.1.0',
      author: 'Someone',
      license: 'Table use',
      support: 'help@example.com',
      url: 'https://example.com/coast',
      future: { anything: true },
    },
  });
  assert.deepEqual(result, {
    ok: true,
    meta: {
      title: 'Haunted Coast',
      version: '1.1.0',
      author: 'Someone',
      license: 'Table use',
      support: 'help@example.com',
      url: 'https://example.com/coast',
    },
  });
});

test('values are trimmed', () => {
  assert.deepEqual(readPackMeta({ $pack: { title: '  Coast  ' } }).meta, { title: 'Coast' });
});

test('$pack must be an object', () => {
  for (const bad of [null, 'Coast', ['Coast'], 3]) {
    const result = readPackMeta({ $pack: bad });
    assert.equal(result.ok, false);
    assert.match(result.error, /\$pack must be an object/);
  }
});

test('a known field must be a non-empty string of at most 200 characters', () => {
  assert.match(readPackMeta({ $pack: { version: 2 } }).error, /\$pack\.version must be text/);
  assert.match(readPackMeta({ $pack: { title: '   ' } }).error, /\$pack\.title must not be empty/);
  assert.match(
    readPackMeta({ $pack: { license: 'x'.repeat(201) } }).error,
    /\$pack\.license is longer than 200 characters/,
  );
});

test('formatVersion prefixes v once, and is empty without a version', () => {
  assert.equal(formatVersion('1.1.0'), 'v1.1.0');
  assert.equal(formatVersion('v2'), 'v2');
  assert.equal(formatVersion('V2'), 'V2');
  assert.equal(formatVersion(undefined), '');
  assert.equal(formatVersion(null), '');
  assert.equal(formatVersion(''), '');
});

// ── planImport ──────────────────────────────────────────────────────────────

test('a new pack is added under its $pack title', () => {
  const plan = planImport([], pack({ title: 'Haunted Coast', version: '1.0.0' }), 'coast-v1.json');
  assert.equal(plan.ok, true);
  assert.equal(plan.action, 'add');
  assert.equal(plan.name, 'Haunted Coast');
  assert.equal(plan.meta.version, '1.0.0');
  assert.equal(plan.existing, null);
  assert.equal(plan.previous, null);
});

test('without a title the filename names the pack, then a fallback', () => {
  assert.equal(planImport([], pack(undefined), 'my-tables.JSON').name, 'my-tables');
  assert.equal(planImport([], pack(undefined), '.json').name, 'Imported Pack');
  assert.equal(planImport([], pack(undefined), undefined).name, 'Imported Pack');
});

test('a pack whose title matches an installed one is an update', () => {
  const installed = { id: 'p1', name: 'Coast', source: pack({ title: 'Haunted Coast', version: '1.0.0' }) };
  const incoming = pack({ title: 'haunted coast', version: '1.1.0' }, { wreck: ['a hull', 'a mast'] });
  const plan = planImport([installed], incoming, 'coast.json');
  assert.equal(plan.action, 'update');
  assert.equal(plan.existing, installed);
  assert.equal(plan.previous.version, '1.0.0', 'the installed version, for "updated from"');
});

test('the identical file again is unchanged', () => {
  const source = pack({ title: 'Haunted Coast', version: '1.0.0' });
  const installed = { id: 'p1', name: 'Coast', source };
  const plan = planImport([installed], source, 'coast.json');
  assert.equal(plan.action, 'unchanged');
  assert.equal(plan.existing, installed);
});

test('untitled packs never match, so a hand-made pack is never replaced', () => {
  const installed = { id: 'p1', name: 'tables', source: pack(undefined) };
  const plan = planImport([installed], pack(undefined), 'tables.json');
  assert.equal(plan.action, 'add');
});

test('an installed pack that no longer parses is not matched', () => {
  const installed = { id: 'p1', name: 'Coast', source: '{broken' };
  const plan = planImport([installed], pack({ title: 'Coast' }), 'coast.json');
  assert.equal(plan.action, 'add');
});

test('invalid JSON fails without blaming the reader', () => {
  const plan = planImport([], '{oops', 'coast.json');
  assert.equal(plan.ok, false);
  assert.equal(plan.message, IMPORT_FAILED_MESSAGE);
  assert.match(plan.message, /not anything you did/);
  assert.match(plan.detail, /invalid JSON/);
  assert.equal(plan.support, null);
});

test('a pack with broken tables still surfaces its support contact', () => {
  const source = pack({ title: 'Coast', support: 'help@example.com' }, { wreck: 'not a table' });
  const plan = planImport([], source, 'coast.json');
  assert.equal(plan.ok, false);
  assert.match(plan.detail, /must be a table/);
  assert.equal(plan.support, 'help@example.com');
});

test('a malformed $pack block fails, with no support to offer', () => {
  const plan = planImport([], pack({ support: 42 }), 'coast.json');
  assert.equal(plan.ok, false);
  assert.match(plan.detail, /\$pack\.support must be text/);
  assert.equal(plan.support, null);
});
