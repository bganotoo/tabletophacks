import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_PACKS, parsePack, buildGenerator, listGenerators } from './packs.js';

const VALID_SOURCE = JSON.stringify({
  color: ['red', 'blue'],
  gem: { name: '{color} stone', value: '{2d6}' },
});

test('parsePack accepts a valid pack', () => {
  const result = parsePack(VALID_SOURCE);
  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result.data), ['color', 'gem']);
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
  assert.deepEqual(npc, { name: 'npc', title: 'NPC', packTitle: 'Core', custom: false });
  const gem = list.find((g) => g.name === 'gem');
  assert.deepEqual(gem, { name: 'gem', title: 'gem', packTitle: 'My Pack', custom: true });
  // tables in custom packs are runnable too
  assert.ok(list.some((g) => g.name === 'color'));
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
});

test('listGenerators skips invalid custom packs', () => {
  const list = listGenerators([], [{ id: 'p1', name: 'Broken', source: '{' }]);
  assert.deepEqual(list, []);
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
