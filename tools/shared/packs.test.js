import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILTIN_PACKS,
  parsePack,
  buildGenerator,
  listGenerators,
  effectiveDefinition,
} from './packs.js';
import { MY_OVERRIDES_ID } from './overrides.js';

const overridePack = (data) => ({
  id: MY_OVERRIDES_ID,
  name: 'My Overrides',
  source: JSON.stringify(data),
});

const VALID_SOURCE = JSON.stringify({
  color: ['red', 'blue'],
  gem: { name: '{color} stone', value: '{2d6}' },
});

test('parsePack accepts a valid pack', () => {
  const result = parsePack(VALID_SOURCE);
  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result.data), ['color', 'gem']);
});

test('parsePack returns the pack metadata, or an empty object', () => {
  assert.deepEqual(parsePack(VALID_SOURCE).meta, {});
  const withMeta = parsePack(JSON.stringify({ $pack: { title: 'Coast', version: '1.0' }, x: ['y'] }));
  assert.equal(withMeta.ok, true);
  assert.deepEqual(withMeta.meta, { title: 'Coast', version: '1.0' });
});

test('parsePack rejects a malformed $pack block', () => {
  const result = parsePack(JSON.stringify({ $pack: { version: 2 }, x: ['y'] }));
  assert.equal(result.ok, false);
  assert.match(result.error, /version/);
});

test('parsePack rejects malformed JSON with an error message', () => {
  const result = parsePack('{oops');
  assert.equal(result.ok, false);
  assert.equal(typeof result.error, 'string');
  assert.ok(result.error.length > 0);
});

test('parsePack rejects engine-invalid data', () => {
  const result = parsePack(JSON.stringify({ bad: [{ tags: ['x'] }] }));
  assert.equal(result.ok, false);
  assert.match(result.error, /missing "text"/);
});

test('parsePack rejects non-object roots', () => {
  assert.equal(parsePack('["a", "b"]').ok, false);
  assert.equal(parsePack('"hello"').ok, false);
});

test('buildGenerator merges built-in data with custom packs', () => {
  const { generator, invalid } = buildGenerator(
    [{ color: ['red'] }],
    [{ id: 'p1', source: JSON.stringify({ mood: ['gloomy'] }) }],
  );
  assert.deepEqual(invalid, []);
  assert.equal(generator.text('{color} and {mood}', { seed: 1 }), 'red and gloomy');
});

test('custom packs override built-in tables of the same name', () => {
  const { generator } = buildGenerator(
    [{ color: ['red'] }],
    [{ id: 'p1', source: JSON.stringify({ color: ['ultraviolet'] }) }],
  );
  assert.equal(generator.text('{color}', { seed: 1 }), 'ultraviolet');
});

test('invalid custom packs are skipped and reported', () => {
  const { generator, invalid } = buildGenerator(
    [{ color: ['red'] }],
    [
      { id: 'broken', source: '{nope' },
      { id: 'fine', source: JSON.stringify({ mood: ['calm'] }) },
    ],
  );
  assert.equal(invalid.length, 1);
  assert.equal(invalid[0].id, 'broken');
  assert.ok(invalid[0].error);
  assert.equal(generator.text('{mood}', { seed: 1 }), 'calm');
});

test('listGenerators labels built-in and custom generators', () => {
  const builtins = [
    {
      id: 'core',
      title: 'Core',
      description: '',
      files: [],
      generators: [{ name: 'npc', title: 'NPC', kind: 'json' }],
    },
  ];
  const customs = [{ id: 'p1', name: 'My Pack', source: VALID_SOURCE }];
  const list = listGenerators(builtins, customs);
  const npc = list.find((g) => g.name === 'npc');
  assert.deepEqual(npc, {
    name: 'npc',
    title: 'NPC',
    packTitle: 'Core',
    packId: 'core',
    packVersion: null,
    custom: false,
  });
  const gem = list.find((g) => g.name === 'gem');
  assert.deepEqual(gem, {
    name: 'gem',
    title: 'gem',
    packTitle: 'My Pack',
    packId: 'p1',
    packVersion: null,
    custom: true,
  });
  // tables in custom packs are runnable too
  assert.ok(list.some((g) => g.name === 'color'));
});

test('listGenerators carries a custom pack version and never lists $pack', () => {
  const source = JSON.stringify({ $pack: { title: 'Coast', version: '1.2.0' }, wreck: ['a hull'] });
  const list = listGenerators([], [{ id: 'p2', name: 'Coast', source }]);
  assert.deepEqual(list.map((g) => g.name), ['wreck']);
  assert.equal(list[0].packVersion, '1.2.0');
});

test('listGenerators dedupes by name with custom winning', () => {
  const builtins = [
    {
      id: 'core',
      title: 'Core',
      description: '',
      files: [],
      generators: [{ name: 'gem', title: 'Gem (builtin)', kind: 'json' }],
    },
  ];
  const customs = [{ id: 'p1', name: 'My Pack', source: VALID_SOURCE }];
  const list = listGenerators(builtins, customs);
  const gems = list.filter((g) => g.name === 'gem');
  assert.equal(gems.length, 1);
  assert.equal(gems[0].custom, true);
  assert.equal(gems[0].packId, 'p1');
});

test('listGenerators skips invalid custom packs', () => {
  const list = listGenerators([], [{ id: 'p1', name: 'Broken', source: '{' }]);
  assert.deepEqual(list, []);
});

test('buildGenerator loads the override pack last so it wins', () => {
  const { generator } = buildGenerator(
    [{ color: ['red'] }],
    [
      overridePack({ color: ['from-override'] }),
      { id: 'p1', source: JSON.stringify({ color: ['from-custom'] }) },
    ],
  );
  assert.equal(generator.text('{color}', { seed: 1 }), 'from-override');
});

test('listGenerators excludes the override pack', () => {
  const builtins = [
    {
      id: 'core', title: 'Core', description: '', files: [],
      generators: [{ name: 'loot', title: 'Loot', kind: 'text' }],
    },
  ];
  const customs = [overridePack({ loot: ['{noun}'] })];
  const list = listGenerators(builtins, customs);
  assert.equal(list.filter((g) => g.packId === MY_OVERRIDES_ID).length, 0);
  // the built-in entry still appears
  assert.ok(list.some((g) => g.name === 'loot' && g.custom === false));
});

test('effectiveDefinition resolves built-in, custom, then override', () => {
  const builtinData = [{ loot: ['built-in'] }];
  assert.deepEqual(effectiveDefinition(builtinData, [], 'loot'), ['built-in']);
  const withCustom = [{ id: 'p1', source: JSON.stringify({ loot: ['custom'] }) }];
  assert.deepEqual(effectiveDefinition(builtinData, withCustom, 'loot'), ['custom']);
  const withOverride = [...withCustom, overridePack({ loot: ['override'] })];
  assert.deepEqual(effectiveDefinition(builtinData, withOverride, 'loot'), ['override']);
});

test('effectiveDefinition returns object definitions and null for unknown', () => {
  const builtinData = [{ gem: { name: '{color}' } }];
  assert.deepEqual(effectiveDefinition(builtinData, [], 'gem'), { name: '{color}' });
  assert.equal(effectiveDefinition(builtinData, [], 'nope'), null);
});

test('effectiveDefinition ignores invalid custom packs', () => {
  const builtinData = [{ loot: ['built-in'] }];
  const customs = [{ id: 'broken', source: '{nope' }];
  assert.deepEqual(effectiveDefinition(builtinData, customs, 'loot'), ['built-in']);
});

test('every data pack is in the manifest, and every manifest file exists', async () => {
  const { readdir } = await import('node:fs/promises');
  const onDisk = (await readdir(new URL('../../data/', import.meta.url)))
    .filter((f) => f.endsWith('.json'))
    .map((f) => `../../data/${f}`)
    .sort();
  const listed = [...new Set(BUILTIN_PACKS.flatMap((p) => p.files))].sort();
  assert.deepEqual(listed, onDisk, 'a pack missing from BUILTIN_PACKS never reaches the tools');
});

test('BUILTIN_PACKS manifest is well-formed', () => {
  assert.ok(Array.isArray(BUILTIN_PACKS) && BUILTIN_PACKS.length > 0);
  for (const pack of BUILTIN_PACKS) {
    assert.ok(pack.id && pack.title && Array.isArray(pack.files));
    for (const gen of pack.generators) {
      assert.ok(gen.name && gen.title && ['json', 'text'].includes(gen.kind));
    }
  }
});
