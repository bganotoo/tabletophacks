/** Pack catalog: built-in manifest, custom-pack validation, Generator assembly. */

import { Generator } from '../../gen/index.js';

/**
 * Built-in packs shipped with the site. `files` are relative to the tool
 * pages (tools/<name>/index.html). `generators` are the curated, featured
 * entries shown in the picker; packs may define more tables than these.
 */
export const BUILTIN_PACKS = [
  {
    id: 'characters',
    title: 'Characters',
    description: 'NPCs with names, quirks, inventory, and homes.',
    files: ['../../data/npc.json'],
    generators: [
      { name: 'npc', title: 'NPC', kind: 'json' },
      { name: 'npc-quirk', title: 'NPC Quirk', kind: 'text' },
      { name: 'tavern-name', title: 'Tavern Name', kind: 'text' },
      { name: 'loot', title: 'Loot', kind: 'text' },
    ],
  },
  {
    id: 'encounters',
    title: 'Encounters',
    description: 'Creatures, activity, terrain, and complications.',
    files: ['../../data/encounter.json'],
    generators: [{ name: 'encounter', title: 'Encounter', kind: 'json' }],
  },
  {
    id: 'locations',
    title: 'Locations',
    description: 'Settlements and dungeons with features and rumors.',
    files: ['../../data/location.json'],
    generators: [
      { name: 'settlement', title: 'Settlement', kind: 'json' },
      { name: 'dungeon', title: 'Dungeon', kind: 'json' },
    ],
  },
  {
    id: 'quests',
    title: 'Quests',
    description: 'Plot hooks with patrons, goals, twists, and rewards.',
    files: ['../../data/quest.json'],
    generators: [{ name: 'quest', title: 'Quest', kind: 'json' }],
  },
  {
    id: 'common',
    title: 'Word Tables',
    description: 'Shared word tables every pack can build on.',
    files: ['../../data/common.json'],
    generators: [],
  },
];

/**
 * Parse and engine-validate one custom pack's JSON source.
 * @param {string} source
 * @returns {{ ok: true, data: object } | { ok: false, error: string }}
 */
export function parsePack(source) {
  let data;
  try {
    data = JSON.parse(source);
  } catch (err) {
    return { ok: false, error: `invalid JSON: ${err.message}` };
  }
  try {
    Generator.fromData(data); // Registry.load validates shapes, names, entries
  } catch (err) {
    return { ok: false, error: err.message };
  }
  return { ok: true, data };
}

/**
 * Assemble one Generator from built-in data plus custom packs. Later loads
 * win, so custom packs can override built-in tables. Invalid packs are
 * skipped and reported, never fatal.
 * @param {object[]} builtinData already-fetched data objects
 * @param {{ id: string, source: string }[]} customPacks
 * @returns {{ generator: Generator, invalid: { id: string, error: string }[] }}
 */
export function buildGenerator(builtinData, customPacks = []) {
  const generator = Generator.fromData(...builtinData);
  const invalid = [];
  for (const pack of customPacks) {
    const parsed = parsePack(pack.source);
    if (parsed.ok) generator.registry.load(parsed.data);
    else invalid.push({ id: pack.id, error: parsed.error });
  }
  return { generator, invalid };
}

/**
 * Flat, deduplicated picker list. Built-ins use their curated titles;
 * custom packs expose every table/template they define. Later entries win
 * on name collisions (so customs shadow built-ins, mirroring buildGenerator).
 * @param {typeof BUILTIN_PACKS} builtinPacks
 * @param {{ id: string, name: string, source: string }[]} customPacks
 * @returns {{ name: string, title: string, packTitle: string, custom: boolean }[]}
 */
export function listGenerators(builtinPacks, customPacks = []) {
  const byName = new Map();
  for (const pack of builtinPacks) {
    for (const gen of pack.generators) {
      byName.set(gen.name, {
        name: gen.name,
        title: gen.title,
        packTitle: pack.title,
        custom: false,
      });
    }
  }
  for (const pack of customPacks) {
    const parsed = parsePack(pack.source);
    if (!parsed.ok) continue;
    for (const name of Generator.fromData(parsed.data).names()) {
      byName.set(name, { name, title: name, packTitle: pack.name, custom: true });
    }
  }
  return [...byName.values()];
}
