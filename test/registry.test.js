import test from 'node:test';
import assert from 'node:assert/strict';
import { Registry, GenError } from '../gen/engine.js';

const make = (data) => {
  const r = new Registry();
  r.load(data);
  return r;
};

test('plain strings normalize to full entries', () => {
  const r = make({ noun: ['sword'] });
  assert.deepEqual(r.getTable('noun'), [
    { text: 'sword', tags: [], weight: 1, variants: {} },
  ]);
});

test('object entries keep tags/weight and collect variants', () => {
  const r = make({
    noun: [{ text: 'wolf', plural: 'wolves', tags: ['animal'], weight: 2 }],
  });
  assert.deepEqual(r.getTable('noun'), [
    { text: 'wolf', tags: ['animal'], weight: 2, variants: { plural: 'wolves' } },
  ]);
});

test('object (non-array) values are JSON templates', () => {
  const r = make({ npc: { name: '{noun}' } });
  assert.deepEqual(r.getTemplate('npc'), { name: '{noun}' });
  assert.equal(r.getTable('npc'), null);
  assert.deepEqual(r.templateNames(), ['npc']);
});

test('unknown names return null', () => {
  const r = make({ noun: ['sword'] });
  assert.equal(r.getTable('nope'), null);
  assert.equal(r.getTemplate('nope'), null);
  assert.equal(r.entriesFor('nope'), null);
});

test('entriesFor filters by all positive tags and excludes negative tags', () => {
  const r = make({
    noun: [
      { text: 'wolf', tags: ['animal', 'concrete'] },
      { text: 'ghost wolf', tags: ['animal', 'undead'] },
      { text: 'idol', tags: ['concrete', 'treasure'] },
      'sword',
    ],
  });
  assert.deepEqual(r.entriesFor('noun', ['animal', 'concrete']).map((e) => e.text), ['wolf']);
  assert.deepEqual(r.entriesFor('noun', ['animal'], ['undead']).map((e) => e.text), ['wolf']);
  assert.deepEqual(r.entriesFor('noun', [], ['animal']).map((e) => e.text), ['idol', 'sword']);
  assert.equal(r.entriesFor('noun').length, 4);
});

test('repeated filter calls hit the cache (same array identity)', () => {
  const r = make({ noun: [{ text: 'wolf', tags: ['animal'] }] });
  assert.equal(r.entriesFor('noun', ['animal']), r.entriesFor('noun', ['animal']));
});

test('load merges multiple data objects', () => {
  const r = new Registry();
  r.load({ noun: ['sword'] });
  r.load({ metal: ['iron'] });
  assert.deepEqual(r.tableNames().sort(), ['metal', 'noun']);
});

test('validation errors are specific', () => {
  assert.throws(() => make({ noun: [{ tags: ['x'] }] }), /missing "text"/);
  assert.throws(() => make({ noun: [{ text: 'x', weight: 0 }] }), /weight must be a number > 0/);
  assert.throws(() => make({ noun: [{ text: 'x', weight: -1 }] }), /weight must be a number > 0/);
  assert.throws(() => make({ noun: [{ text: 'x', tags: 'animal' }] }), /tags must be an array of strings/);
  assert.throws(() => make({ noun: [{ text: 'x', plural: 7 }] }), /variant `plural` must be a string/);
  assert.throws(() => make({ noun: 'not a table' }), /must be a table/);
  assert.throws(() => make({ '9bad': ['x'] }), /invalid table name/);
  assert.throws(() => make({ a: ['x'] }), /reserved/);
  assert.ok(GenError.prototype instanceof Error);
});

test('decimal weights are allowed', () => {
  const r = make({ noun: [{ text: 'x', weight: 0.5 }] });
  assert.equal(r.getTable('noun')[0].weight, 0.5);
});
