import test from 'node:test';
import assert from 'node:assert/strict';
import { Generator, GenError, registerTransform } from './index.js';

const data = {
  noun: [
    'sword',
    { text: 'wolf', plural: 'wolves', tags: ['animal'], weight: 2 },
    { text: 'owlbear', tags: ['animal'] },
  ],
  adjective: ['rusty'],
  npc: { name: '{adjective.capitalize} {noun#animal.capitalize}', hp: '{3d6}' },
};

test('text() expands a one-off template', () => {
  const gen = Generator.fromData(data);
  assert.equal(gen.text('{adjective} steel'), 'rusty steel');
});

test('run() on a table name returns expanded text', () => {
  const gen = Generator.fromData(data);
  const out = gen.run('adjective', { seed: 'x' });
  assert.equal(out, 'rusty');
});

test('run() on a JSON template returns a JSON value', () => {
  const gen = Generator.fromData(data);
  const npc = gen.run('npc', { seed: 'a7k2' });
  assert.equal(typeof npc.name, 'string');
  assert.equal(typeof npc.hp, 'number');
});

test('same seed + same tables => identical output', () => {
  const gen = Generator.fromData(data);
  assert.deepEqual(gen.run('npc', { seed: 'a7k2' }), gen.run('npc', { seed: 'a7k2' }));
  assert.equal(gen.text('{noun}', { seed: 42 }), gen.text('{noun}', { seed: 42 }));
});

test('unknown generator name throws GenError', () => {
  const gen = Generator.fromData(data);
  assert.throws(() => gen.run('nope'), GenError);
});

test('names() lists tables and templates', () => {
  const gen = Generator.fromData(data);
  assert.deepEqual(gen.names().sort(), ['adjective', 'noun', 'npc']);
});

test('lenient mode fills the provided warnings array', () => {
  const gen = Generator.fromData(data);
  const warnings = [];
  assert.equal(gen.text('{missing}', { mode: 'lenient', warnings }), '⟦missing?⟧');
  assert.equal(warnings.length, 1);
});

test('custom transforms are usable from templates', () => {
  registerTransform('shout', (s) => `${s}!`);
  const gen = Generator.fromData(data);
  assert.equal(gen.text('{adjective.shout}'), 'rusty!');
});

test('load() reads JSON files (Node path)', async () => {
  const gen = await Generator.load([new URL('./fixtures/mini.json', import.meta.url)]);
  assert.equal(gen.text('{greeting}'), 'hello iron');
});

test('fromData merges multiple datasets', () => {
  const gen = Generator.fromData({ metal: ['iron'] }, { gem: ['ruby'] });
  assert.deepEqual(gen.names().sort(), ['gem', 'metal']);
});
