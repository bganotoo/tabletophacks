import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { Generator } from '../gen/index.js';

const dataDir = new URL('./', import.meta.url);
const files = (await readdir(dataDir)).filter((f) => f.endsWith('.json'));

test('there is at least one data file', () => {
  assert.ok(files.length > 0, 'expected JSON files in data/');
});

test('every generator strict-runs clean across seeds', async () => {
  const gen = await Generator.load(files.map((f) => new URL(f, dataDir)));
  assert.ok(gen.names().length > 0);
  for (const name of gen.names()) {
    for (let s = 1; s <= 25; s++) {
      // strict mode: any unknown table/transform, bad filter, or cycle throws
      gen.run(name, { seed: `validate-${s}` });
    }
  }
});

test('the npc generator has the expected shape', async () => {
  const gen = await Generator.load(files.map((f) => new URL(f, dataDir)));
  const npc = gen.run('npc', { seed: 'a7k2' });
  assert.equal(typeof npc.name, 'string');
  assert.ok(npc.name.length > 0);
  assert.equal(typeof npc.hp, 'number');
  assert.ok(Array.isArray(npc.inventory) && npc.inventory.length >= 1 && npc.inventory.length <= 4);
  assert.ok(['tavern', 'hovel'].includes(npc.home.type));
  assert.deepEqual(gen.run('npc', { seed: 'a7k2' }), npc); // reproducible
});

test('the encounter generator has the expected shape', async () => {
  const gen = await Generator.load(files.map((f) => new URL(f, dataDir)));
  const enc = gen.run('encounter', { seed: 'e1' });
  assert.ok(enc.creatures.length > 0);
  assert.equal(typeof enc.activity, 'string');
  assert.equal(typeof enc.terrain, 'string');
  assert.deepEqual(gen.run('encounter', { seed: 'e1' }), enc);
});

test('the settlement generator has the expected shape', async () => {
  const gen = await Generator.load(files.map((f) => new URL(f, dataDir)));
  const town = gen.run('settlement', { seed: 's1' });
  assert.ok(town.name.length > 0);
  assert.equal(typeof town.size, 'string');
  assert.equal(typeof town.feature, 'string');
  assert.equal(typeof town.rumor, 'string');
});

test('the dungeon generator has the expected shape', async () => {
  const gen = await Generator.load(files.map((f) => new URL(f, dataDir)));
  const dungeon = gen.run('dungeon', { seed: 'd1' });
  assert.ok(dungeon.name.length > 0);
  assert.equal(typeof dungeon.theme, 'string');
  assert.ok(Array.isArray(dungeon.rooms) && dungeon.rooms.length >= 2);
});

test('the quest generator has the expected shape', async () => {
  const gen = await Generator.load(files.map((f) => new URL(f, dataDir)));
  const quest = gen.run('quest', { seed: 'q1' });
  assert.equal(typeof quest.hook, 'string');
  assert.ok(quest.patron.name.length > 0);
  assert.equal(typeof quest.goal, 'string');
  assert.equal(typeof quest.reward, 'string');
});

test('the magic-item generator has the expected shape', async () => {
  const gen = await Generator.load(files.map((f) => new URL(f, dataDir)));
  const item = gen.run('magic-item', { seed: 'm1' });
  assert.ok(item.name.length > 0);
  assert.equal(typeof item.form, 'string');
  assert.equal(typeof item.rarity, 'string');
  assert.equal(typeof item.property, 'string');
  assert.deepEqual(gen.run('magic-item', { seed: 'm1' }), item); // reproducible
});
