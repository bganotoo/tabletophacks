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

test('runTraced returns a populated tree for JSON templates', () => {
  const g = Generator.fromData({ npc: { name: '{n}' }, n: ['wolf'] });
  const { value, tree } = g.runTraced('npc', { seed: 1 });
  assert.equal(value.name, 'wolf');
  assert.equal(tree.kind, 'object');
  assert.equal(tree.children.name.source, '{n}');
});

test('runTraced returns a null tree for flat tables', () => {
  const g = Generator.fromData({ n: ['wolf'] });
  const { value, tree } = g.runTraced('n', { seed: 1 });
  assert.equal(value, 'wolf');
  assert.equal(tree, null);
});

test('runTraced value matches run() under the same seed', () => {
  const g = Generator.fromData({ npc: { a: '{n}', b: { $repeat: 2, of: '{n}' } }, n: ['wolf', 'fox'] });
  assert.deepEqual(g.runTraced('npc', { seed: 3 }).value, g.run('npc', { seed: 3 }));
});

test('runTraced throws on an unknown generator', () => {
  const g = Generator.fromData({ n: ['wolf'] });
  assert.throws(() => g.runTraced('nope'), /unknown generator/);
});

test('rerollPath re-rolls one field without touching siblings', () => {
  const g = Generator.fromData({ npc: { a: '{n}', b: '{n}' }, n: ['w', 'x', 'y', 'z', 'p', 'q'] });
  const { value, tree } = g.runTraced('npc', { seed: 1 });
  const b0 = value.b;
  const r = g.rerollPath(tree, ['a'], { seed: 5 });
  assert.equal(typeof r.value, 'string');
  assert.equal(value.b, b0); // rerollPath does not mutate; sibling intact
});
