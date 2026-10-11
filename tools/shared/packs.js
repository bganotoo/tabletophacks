/** Pack catalog: built-in manifest, custom-pack validation, Generator assembly. */

import { Generator } from '../../gen/index.js';
import { MY_OVERRIDES_ID } from './overrides.js';
import { readPackMeta } from './packmeta.js';

/** Custom packs in load order: overrides always last so they win. */
function orderedCustomPacks(customPacks) {
  const overrides = customPacks.filter((p) => p.id === MY_OVERRIDES_ID);
  const rest = customPacks.filter((p) => p.id !== MY_OVERRIDES_ID);
  return [...rest, ...overrides];
}

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
    id: 'treasures',
    title: 'Treasures',
    description: 'Magic items, trinkets, and potions for any hoard.',
    files: ['../../data/treasure.json'],
    generators: [
      { name: 'magic-item', title: 'Magic Item', kind: 'json' },
      { name: 'trinket', title: 'Trinket', kind: 'text' },
      { name: 'potion', title: 'Potion', kind: 'text' },
    ],
  },
  {
    id: 'travel',
    title: 'Weather & Travel',
    description: 'A day on the road: weather, going, sights, events, and camp.',
    files: ['../../data/travel.json'],
    generators: [
      { name: 'travel-day', title: 'Travel Day', kind: 'json' },
      { name: 'travel-event', title: 'Road Event', kind: 'text' },
      { name: 'forecast', title: 'Weather', kind: 'text' },
    ],
  },
  {
    id: 'hazards',
    title: 'Traps & Hazards',
    description: 'Traps with a trigger, a tell, and a way past; natural dangers.',
    files: ['../../data/hazard.json'],
    generators: [
      { name: 'trap', title: 'Trap', kind: 'json' },
      { name: 'hazard', title: 'Natural Hazard', kind: 'text' },
    ],
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
 * Parse and engine-validate one custom pack's JSON source, including its
 * optional `$pack` metadata block.
 * @param {string} source
 * @returns {{ ok: true, data: object, meta: object } | { ok: false, error: string }}
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
  const meta = readPackMeta(data);
  if (!meta.ok) return { ok: false, error: meta.error };
  return { ok: true, data, meta: meta.meta };
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
  for (const pack of orderedCustomPacks(customPacks)) {
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
 * @returns {{ name: string, title: string, packTitle: string, packId: string,
 *             packVersion: string|null, custom: boolean }[]}
 */
export function listGenerators(builtinPacks, customPacks = []) {
  const byName = new Map();
  for (const pack of builtinPacks) {
    for (const gen of pack.generators) {
      byName.set(gen.name, {
        name: gen.name,
        title: gen.title,
        packTitle: pack.title,
        packId: pack.id,
        packVersion: null,
        custom: false,
      });
    }
  }
  for (const pack of customPacks) {
    if (pack.id === MY_OVERRIDES_ID) continue; // overrides reshape existing names only
    const parsed = parsePack(pack.source);
    if (!parsed.ok) continue;
    for (const name of Generator.fromData(parsed.data).names()) {
      byName.set(name, {
        name,
        title: name,
        packTitle: pack.name,
        packId: pack.id,
        packVersion: parsed.meta.version ?? null,
        custom: true,
      });
    }
  }
  return [...byName.values()];
}

/**
 * The raw definition value the assembled generator resolves for `name`:
 * a table array or a JSON-template object. Scans built-in data, then custom
 * packs, then the override pack last — later wins. Invalid packs are skipped.
 * @param {object[]} builtinData
 * @param {{ id: string, source: string }[]} customPacks
 * @param {string} name
 * @returns {unknown | null}
 */
export function effectiveDefinition(builtinData, customPacks = [], name) {
  let found = null;
  for (const data of builtinData) {
    if (data && Object.prototype.hasOwnProperty.call(data, name)) found = data[name];
  }
  for (const pack of orderedCustomPacks(customPacks)) {
    const parsed = parsePack(pack.source);
    if (parsed.ok && Object.prototype.hasOwnProperty.call(parsed.data, name)) {
      found = parsed.data[name];
    }
  }
  return found;
}
