/**
 * What this site has saved in the browser, one row per `th:` key, for the
 * Your data page. Pure: takes `storageEntries()` output, returns plain rows.
 */

import { KEY_PREFIX } from './store.js';
import { usageBytes } from './storage.js';

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const arrayCount = (one, many) => (value) =>
  Array.isArray(value) ? plural(value.length, one, many) : '';

/** Every key a tool writes, in the order the page lists them. A `detail`
 *  receives the parsed value and may assume nothing about its shape. */
const KNOWN = [
  {
    name: 'packs',
    tool: 'Workshop',
    href: '/tools/workshop/',
    label: 'Custom packs',
    detail: arrayCount('pack'),
  },
  {
    name: 'library',
    tool: 'Generator',
    href: '/tools/generator/',
    label: 'Saved results',
    detail: arrayCount('saved result'),
  },
  {
    name: 'settings',
    tool: 'Generator',
    href: '/tools/generator/',
    label: 'Last generator used',
  },
  {
    name: 'encounter',
    tool: 'Initiative Tracker',
    href: '/tools/initiative/',
    label: 'Current encounter',
    detail: (v) =>
      Array.isArray(v?.combatants) && typeof v.round === 'number'
        ? `${plural(v.combatants.length, 'combatant')}, round ${v.round}`
        : '',
  },
  {
    name: 'score',
    tool: 'Score Tracker',
    href: '/tools/score/',
    label: 'Score sheets',
    detail: (v) => (Array.isArray(v?.sheets) ? plural(v.sheets.length, 'score sheet') : ''),
  },
  {
    name: 'timer',
    tool: 'Game Timer',
    href: '/tools/timer/',
    label: 'Current game',
    detail: (v) => (Array.isArray(v?.players) ? plural(v.players.length, 'player') : ''),
  },
  {
    name: 'timer-sound',
    tool: 'Game Timer',
    href: '/tools/timer/',
    label: 'Sound setting',
    detail: (v) => (typeof v === 'boolean' ? (v ? 'Sound on' : 'Sound off') : ''),
  },
  {
    name: 'dice-history',
    tool: 'Dice Roller',
    href: '/tools/dice/',
    label: 'Roll history',
    detail: arrayCount('recent roll'),
  },
  {
    name: 'notices',
    tool: null,
    href: null,
    label: 'Notices you have dismissed',
  },
];

const ORDER = new Map(KNOWN.map((k, i) => [k.name, i]));
const KEY_RE = /^th:(.+):v\d+$/;

function describe(rawDetail, raw) {
  if (!rawDetail) return '';
  try {
    return rawDetail(JSON.parse(raw));
  } catch {
    return '';
  }
}

/**
 * @param {Iterable<[string, string]>} entries
 * @returns {{ key: string, known: boolean, name: string, tool: string|null, href: string|null,
 *             label: string, detail: string, bytes: number }[]}
 */
export function inventory(entries) {
  const rows = [];
  for (const [key, raw] of entries) {
    if (!key.startsWith(KEY_PREFIX)) continue;
    const name = key.match(KEY_RE)?.[1] ?? key.slice(KEY_PREFIX.length);
    const known = ORDER.has(name) && KEY_RE.test(key) ? KNOWN[ORDER.get(name)] : null;
    rows.push({
      key,
      known: Boolean(known),
      name,
      tool: known?.tool ?? null,
      href: known?.href ?? null,
      label: known?.label ?? 'Other saved data',
      detail: known ? describe(known.detail, raw) : '',
      bytes: usageBytes([[key, raw]]),
      rank: known ? ORDER.get(name) : KNOWN.length,
    });
  }
  // Array.prototype.sort is stable, so unknown keys keep storage order.
  return rows.sort((a, b) => a.rank - b.rank).map(({ rank, ...row }) => row);
}
