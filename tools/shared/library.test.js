import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLibrary, mergeLibrary } from './library.js';

const entry = (id, over = {}) => ({
  id,
  name: `Result ${id}`,
  generator: 'npc',
  seed: 'abc',
  data: 'some text',
  savedAt: '2026-07-04T00:00:00.000Z',
  ...over,
});

// ── parseLibrary ──────────────────────────────────────────────────────────────

test('parseLibrary rejects invalid JSON', () => {
  const r = parseLibrary('{oops');
  assert.equal(r.ok, false);
  assert.match(r.error, /JSON/i);
});

test('parseLibrary rejects a non-array top level', () => {
  const r = parseLibrary(JSON.stringify({ id: '1', data: 'x' }));
  assert.equal(r.ok, false);
  assert.match(r.error, /array/i);
});

test('parseLibrary accepts an empty array', () => {
  const r = parseLibrary('[]');
  assert.deepEqual(r, { ok: true, entries: [] });
});

test('parseLibrary passes valid entries through unchanged', () => {
  const entries = [entry('1'), entry('2')];
  const r = parseLibrary(JSON.stringify(entries));
  assert.equal(r.ok, true);
  assert.deepEqual(r.entries, entries);
});

test('parseLibrary rejects an entry with no id, naming the index', () => {
  const bad = [entry('1'), { name: 'x', data: 'y' }];
  const r = parseLibrary(JSON.stringify(bad));
  assert.equal(r.ok, false);
  assert.match(r.error, /1/);
});

test('parseLibrary rejects a blank or non-string id', () => {
  assert.equal(parseLibrary(JSON.stringify([entry('1', { id: '' })])).ok, false);
  assert.equal(parseLibrary(JSON.stringify([entry('1', { id: 7 })])).ok, false);
});

test('parseLibrary rejects an entry missing data', () => {
  const { data: _drop, ...noData } = entry('1');
  const r = parseLibrary(JSON.stringify([noData]));
  assert.equal(r.ok, false);
  assert.match(r.error, /data/i);
});

test('parseLibrary accepts data that is an object (JSON generator result)', () => {
  const r = parseLibrary(JSON.stringify([entry('1', { data: { name: 'Bob' } })]));
  assert.equal(r.ok, true);
});

test('parseLibrary rejects a non-object element', () => {
  assert.equal(parseLibrary(JSON.stringify(['nope'])).ok, false);
  assert.equal(parseLibrary(JSON.stringify([null])).ok, false);
});

// ── mergeLibrary ──────────────────────────────────────────────────────────────

test('mergeLibrary appends new entries after existing ones', () => {
  const existing = [entry('1')];
  const incoming = [entry('2')];
  const r = mergeLibrary(existing, incoming);
  assert.deepEqual(r.merged.map((e) => e.id), ['1', '2']);
  assert.equal(r.added, 1);
  assert.equal(r.skipped, 0);
});

test('mergeLibrary skips entries whose id already exists, keeping the existing one', () => {
  const existing = [entry('1', { name: 'KEEP' })];
  const incoming = [entry('1', { name: 'DROP' })];
  const r = mergeLibrary(existing, incoming);
  assert.deepEqual(r.merged.map((e) => e.id), ['1']);
  assert.equal(r.merged[0].name, 'KEEP');
  assert.equal(r.added, 0);
  assert.equal(r.skipped, 1);
});

test('mergeLibrary handles a mix of new and duplicate', () => {
  const existing = [entry('1'), entry('2')];
  const incoming = [entry('2'), entry('3'), entry('4')];
  const r = mergeLibrary(existing, incoming);
  assert.deepEqual(r.merged.map((e) => e.id), ['1', '2', '3', '4']);
  assert.equal(r.added, 2);
  assert.equal(r.skipped, 1);
});

test('mergeLibrary into an empty library adds everything', () => {
  const r = mergeLibrary([], [entry('1'), entry('2')]);
  assert.equal(r.added, 2);
  assert.deepEqual(r.merged.map((e) => e.id), ['1', '2']);
});

test('mergeLibrary with empty incoming is a no-op copy', () => {
  const existing = [entry('1')];
  const r = mergeLibrary(existing, []);
  assert.deepEqual(r.merged, existing);
  assert.equal(r.added, 0);
});

test('mergeLibrary de-duplicates ids within the incoming set too', () => {
  const r = mergeLibrary([], [entry('1'), entry('1', { name: 'second' })]);
  assert.deepEqual(r.merged.map((e) => e.id), ['1']);
  assert.equal(r.added, 1);
  assert.equal(r.skipped, 1);
});

test('mergeLibrary does not mutate its arguments', () => {
  const existing = [entry('1')];
  const incoming = [entry('2')];
  mergeLibrary(existing, incoming);
  assert.equal(existing.length, 1);
  assert.equal(incoming.length, 1);
});
