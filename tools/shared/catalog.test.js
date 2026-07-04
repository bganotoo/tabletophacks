import test from 'node:test';
import assert from 'node:assert/strict';
import { Generator } from '../../gen/index.js';
import { buildCatalog, filterCatalog, sampleTable } from './catalog.js';

const DATA = {
  // a table with tags and weights
  adjective: [
    { text: 'gilded', tags: ['magic', 'treasure'] },
    { text: 'rusty', tags: ['worn'] },
    { text: 'plain' },
  ],
  // a table whose entry references another table
  phrase: ['a {adjective} thing'],
  // a JSON template — must NOT appear in the catalog
  npc: { name: '{adjective} person' },
};

test('buildCatalog lists every table, sorted by name, with counts', () => {
  const gen = Generator.fromData(DATA);
  const catalog = buildCatalog(gen);
  assert.deepEqual(catalog.map((t) => t.name), ['adjective', 'phrase']);
  const adj = catalog.find((t) => t.name === 'adjective');
  assert.equal(adj.count, 3);
});

test('buildCatalog excludes JSON templates', () => {
  const gen = Generator.fromData(DATA);
  const catalog = buildCatalog(gen);
  assert.ok(!catalog.some((t) => t.name === 'npc'));
});

test('buildCatalog collects the sorted union of a table\'s tags', () => {
  const gen = Generator.fromData(DATA);
  const adj = buildCatalog(gen).find((t) => t.name === 'adjective');
  assert.deepEqual(adj.tags, ['magic', 'treasure', 'worn']);
});

test('buildCatalog reports an empty tag list for untagged tables', () => {
  const gen = Generator.fromData(DATA);
  const phrase = buildCatalog(gen).find((t) => t.name === 'phrase');
  assert.deepEqual(phrase.tags, []);
});

test('buildCatalog flags custom tables via builtinNames', () => {
  const gen = Generator.fromData(DATA);
  const catalog = buildCatalog(gen, { builtinNames: ['adjective', 'npc'] });
  assert.equal(catalog.find((t) => t.name === 'adjective').custom, false);
  assert.equal(catalog.find((t) => t.name === 'phrase').custom, true);
});

test('buildCatalog marks nothing custom when builtinNames is omitted', () => {
  const gen = Generator.fromData(DATA);
  assert.ok(buildCatalog(gen).every((t) => t.custom === false));
});

test('filterCatalog matches table names case-insensitively', () => {
  const gen = Generator.fromData(DATA);
  const catalog = buildCatalog(gen);
  assert.deepEqual(filterCatalog(catalog, 'ADJ').map((t) => t.name), ['adjective']);
});

test('filterCatalog matches tags', () => {
  const gen = Generator.fromData(DATA);
  const catalog = buildCatalog(gen);
  assert.deepEqual(filterCatalog(catalog, 'magic').map((t) => t.name), ['adjective']);
});

test('filterCatalog returns the whole catalog for an empty query', () => {
  const gen = Generator.fromData(DATA);
  const catalog = buildCatalog(gen);
  assert.equal(filterCatalog(catalog, '   ').length, catalog.length);
  assert.equal(filterCatalog(catalog, '').length, catalog.length);
});

test('filterCatalog returns nothing when nothing matches', () => {
  const gen = Generator.fromData(DATA);
  const catalog = buildCatalog(gen);
  assert.deepEqual(filterCatalog(catalog, 'zzz-no-such-thing'), []);
});

test('sampleTable produces a deterministic, expanded string', () => {
  const gen = Generator.fromData(DATA);
  const a = sampleTable(gen, 'phrase', 'seed-1');
  const b = sampleTable(gen, 'phrase', 'seed-1');
  assert.equal(typeof a, 'string');
  assert.equal(a, b); // same seed, same output
  assert.match(a, /^a .+ thing$/); // the referenced adjective expanded
});

test('sampleTable is lenient: a missing reference yields text, not a throw', () => {
  const gen = Generator.fromData({ broken: ['{no_such_table}'] });
  let out;
  assert.doesNotThrow(() => {
    out = sampleTable(gen, 'broken', 'seed');
  });
  assert.equal(typeof out, 'string');
});
