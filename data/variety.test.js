import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { Generator } from '../gen/index.js';
import { parseTemplate } from '../gen/parser.js';

// How often the same sentence comes back. A table's "frames" are its distinct
// sentence shapes: the wording you would recognize on a second roll even with
// different names slotted in. Lookups into a table's own sub-tables (those
// named after it, like quest-hook-asker under quest-hook, or terrain-moment
// under terrain) are part of the sentence, so their frames multiply in;
// so are a few shared sentence tables (loot, coming-event). Lookups into
// shared vocabulary (person-name, metal, creature) are not.
//
// effectiveFrames = 1 / P(two rolls land on the same frame). With F effective
// frames, a ten-roll session repeats a frame with probability ~1 - e^(-45/F).
//
// The floors below are the point of the dispatcher design: each headline
// field picks a family first, then a line, so adding lines to one family
// never makes that family come up more often. A floor failing usually means
// a heavy weight or a collapsed dispatcher, not too few lines.

const dataDir = new URL('./', import.meta.url);
const files = (await readdir(dataDir)).filter((f) => f.endsWith('.json'));
const gen = await Generator.load(files.map((f) => new URL(f, dataDir)));
const registry = gen.registry;

/** Tables outside a root's own family whose frames still count as sentence. */
const SHARED_SENTENCES = ['loot', 'coming-event'];

/** Whether a lookup of `table` from inside `root` adds to the sentence. */
const isPart = (root, table) =>
  [root, ...SHARED_SENTENCES].some((r) => table === r || table.startsWith(`${r}-`));

/** P(two independent rolls of `root` share a frame). */
function collision(root, name = root, tags = [], notTags = []) {
  const entries = registry.entriesFor(name, tags, notTags);
  const total = entries.reduce((sum, e) => sum + e.weight, 0);
  let c = 0;
  for (const entry of entries) {
    const p = entry.weight / total;
    let sub = 1;
    for (const node of parseTemplate(entry.text)) {
      if (node.type === 'lookup' && node.table !== name && isPart(root, node.table)) {
        sub *= collision(root, node.table, node.tags, node.notTags);
      }
    }
    c += p * p * sub;
  }
  return c;
}

const effectiveFrames = (name) => 1 / collision(name);

const FLOORS = {
  'quest-hook': 150,
  'quest-goal': 150,
  'quest-twist': 150,
  'quest-complication': 120,
  'quest-reward': 70,
  'npc-voice': 200,
  'npc-demeanor': 120,
  'npc-appearance': 150,
  'npc-motivation': 150,
  'npc-secret': 150,
  'npc-quirk': 90,
  'settlement-rumor': 100,
  'settlement-problem': 120,
  'settlement-feature': 150,
  'dungeon-theme': 120,
  'dungeon-room': 150,
  'terrain': 150,
  'travel-event': 120,
  'travel-sight': 100,
  'trap-trigger': 80,
  'item-origin': 100,
};

for (const [name, floor] of Object.entries(FLOORS)) {
  test(`${name} has at least ${floor} effective frames`, () => {
    const eff = effectiveFrames(name);
    assert.ok(eff >= floor, `${name}: ${eff.toFixed(0)} effective frames`);
  });
}
