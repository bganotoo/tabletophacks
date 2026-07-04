import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHash, formatGeneratorHash } from './genhash.js';

// ── parseHash ────────────────────────────────────────────────────────────────

test('parseHash treats empty/null/undefined as the empty route', () => {
  assert.deepEqual(parseHash(''), { route: 'empty' });
  assert.deepEqual(parseHash(null), { route: 'empty' });
  assert.deepEqual(parseHash(undefined), { route: 'empty' });
});

test('parseHash recognises the reserved create/tables routes', () => {
  assert.deepEqual(parseHash('create'), { route: 'create' });
  assert.deepEqual(parseHash('tables'), { route: 'tables' });
});

test('parseHash reads a bare generator name with a null seed', () => {
  assert.deepEqual(parseHash('npc'), { route: 'generate', name: 'npc', seed: null });
});

test('parseHash keeps hyphens and underscores in names', () => {
  assert.deepEqual(parseHash('npc-quirk'), { route: 'generate', name: 'npc-quirk', seed: null });
  assert.deepEqual(parseHash('my_table'), { route: 'generate', name: 'my_table', seed: null });
});

test('parseHash splits name and seed on :s=', () => {
  assert.deepEqual(parseHash('npc:s=abc123'), { route: 'generate', name: 'npc', seed: 'abc123' });
});

test('parseHash decodes a percent-encoded seed', () => {
  assert.deepEqual(parseHash('npc:s=a%20b%3Ac'), {
    route: 'generate',
    name: 'npc',
    seed: 'a b:c',
  });
});

test('parseHash normalises an empty seed to null', () => {
  assert.deepEqual(parseHash('npc:s='), { route: 'generate', name: 'npc', seed: null });
});

test('parseHash falls back to raw text on a malformed percent sequence', () => {
  // decodeURIComponent throws on a lone %; we keep the raw seed rather than crash.
  assert.deepEqual(parseHash('npc:s=%zz'), { route: 'generate', name: 'npc', seed: '%zz' });
});

test('parseHash splits on the first :s= only, keeping the rest in the seed', () => {
  assert.deepEqual(parseHash('npc:s=x:s=y'), { route: 'generate', name: 'npc', seed: 'x:s=y' });
});

// ── formatGeneratorHash ──────────────────────────────────────────────────────

test('formatGeneratorHash returns a bare name when there is no seed', () => {
  assert.equal(formatGeneratorHash('npc', null), 'npc');
  assert.equal(formatGeneratorHash('npc', undefined), 'npc');
  assert.equal(formatGeneratorHash('npc', ''), 'npc');
});

test('formatGeneratorHash appends an encoded seed', () => {
  assert.equal(formatGeneratorHash('npc', 'abc123'), 'npc:s=abc123');
});

test('formatGeneratorHash percent-encodes special characters in the seed', () => {
  assert.equal(formatGeneratorHash('npc', 'a b:c'), 'npc:s=a%20b%3Ac');
});

// ── round-trip ───────────────────────────────────────────────────────────────

test('parseHash inverts formatGeneratorHash for plain and special seeds', () => {
  for (const [name, seed] of [
    ['npc', 'abc123'],
    ['npc-quirk', 'a b:c'],
    ['quest', 'x:s=y'],
    ['loot', '100%'],
  ]) {
    assert.deepEqual(parseHash(formatGeneratorHash(name, seed)), {
      route: 'generate',
      name,
      seed,
    });
  }
});
