import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { Generator } from '../gen/index.js';

const dataDir = new URL('../data/', import.meta.url);
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
