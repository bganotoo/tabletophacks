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
  assert.deepEqual(parseHash('npc'), { route: 'generate', name: 'npc', seed: null, count: null });
});

test('parseHash keeps hyphens and underscores in names', () => {
  assert.deepEqual(parseHash('npc-quirk'), { route: 'generate', name: 'npc-quirk', seed: null, count: null });
  assert.deepEqual(parseHash('my_table'), { route: 'generate', name: 'my_table', seed: null, count: null });
});

test('parseHash splits name and seed on :s=', () => {
  assert.deepEqual(parseHash('npc:s=abc123'), { route: 'generate', name: 'npc', seed: 'abc123', count: null });
});

test('parseHash decodes a percent-encoded seed', () => {
  assert.deepEqual(parseHash('npc:s=a%20b%3Ac'), {
    route: 'generate',
    name: 'npc',
    seed: 'a b:c',
    count: null,
  });
});

test('parseHash normalises an empty seed to null', () => {
  assert.deepEqual(parseHash('npc:s='), { route: 'generate', name: 'npc', seed: null, count: null });
});

test('parseHash falls back to raw text on a malformed percent sequence', () => {
  // decodeURIComponent throws on a lone %; we keep the raw seed rather than crash.
  assert.deepEqual(parseHash('npc:s=%zz'), { route: 'generate', name: 'npc', seed: '%zz', count: null });
});

test('parseHash splits on the first :s= only, keeping the rest in the seed', () => {
  assert.deepEqual(parseHash('npc:s=x:s=y'), { route: 'generate', name: 'npc', seed: 'x:s=y', count: null });
});

test('parseHash reads a trailing :n= count alongside a seed', () => {
  assert.deepEqual(parseHash('npc:s=abc123:n=5'), {
    route: 'generate',
    name: 'npc',
    seed: 'abc123',
    count: 5,
  });
});

test('parseHash reads a :n= count with no seed', () => {
  assert.deepEqual(parseHash('npc:n=3'), { route: 'generate', name: 'npc', seed: null, count: 3 });
});

test('parseHash ignores a :n= count of 1 (single is the default)', () => {
  assert.deepEqual(parseHash('npc:s=abc:n=1'), {
    route: 'generate',
    name: 'npc',
    seed: 'abc',
    count: null,
  });
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

test('formatGeneratorHash appends :n= only for a count greater than 1', () => {
  assert.equal(formatGeneratorHash('npc', 'abc', 5), 'npc:s=abc:n=5');
  assert.equal(formatGeneratorHash('npc', 'abc', 1), 'npc:s=abc');
  assert.equal(formatGeneratorHash('npc', 'abc', null), 'npc:s=abc');
  assert.equal(formatGeneratorHash('npc', 'abc', undefined), 'npc:s=abc');
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
      count: null,
    });
  }
});

test('parseHash inverts formatGeneratorHash when a batch count rides along', () => {
  for (const [name, seed, count] of [
    ['npc', 'abc123', 5],
    ['npc-quirk', 'a b:c', 2],
    ['quest', 'x:s=y', 12],
  ]) {
    assert.deepEqual(parseHash(formatGeneratorHash(name, seed, count)), {
      route: 'generate',
      name,
      seed,
      count,
    });
  }
});
