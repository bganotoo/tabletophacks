import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { Generator } from '../gen/index.js';
import { parseTemplate } from '../gen/parser.js';
import { getTransform } from '../gen/transforms.js';

// data.test.js strict-runs every generator over 25 seeds, which can miss a
// rare entry. These checks cover every entry: statically, that each lookup
// can resolve whatever it picks; and by sampling, that slotted lines still
// read as English once filled in.

const dataDir = new URL('./', import.meta.url);
const files = (await readdir(dataDir)).filter((f) => f.endsWith('.json'));
const gen = await Generator.load(files.map((f) => new URL(f, dataDir)));
const registry = gen.registry;

/** Every template string in every built-in table, entry variant, and JSON template. */
function* templateStrings() {
  for (const name of registry.tableNames()) {
    for (const [i, entry] of registry.getTable(name).entries()) {
      yield { where: `${name}[${i}]`, text: entry.text };
      for (const [variant, text] of Object.entries(entry.variants)) yield { where: `${name}[${i}].${variant}`, text };
    }
  }
  function* walk(value, where) {
    if (typeof value === 'string') yield { where, text: value };
    else if (Array.isArray(value)) for (const [i, v] of value.entries()) yield* walk(v, `${where}[${i}]`);
    else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) if (k !== '$maybe' && k !== '$weight') yield* walk(v, `${where}.${k}`);
    }
  }
  for (const name of registry.templateNames()) yield* walk(registry.getTemplate(name), name);
}

/** Problems with one template string, for every entry each of its lookups could pick. */
function lookupProblems(text) {
  const problems = [];
  const captured = new Set();
  for (const node of parseTemplate(text)) {
    if (node.type === 'ref' && !captured.has(node.name)) problems.push(`@${node.name} is used before it is captured`);
    if ((node.type === 'dice' || node.type === 'range') && node.capture) captured.add(node.capture);
    const lookup = node.type === 'repeat' ? node.inner : node.type === 'lookup' ? node : null;
    if (!lookup) continue;
    if (lookup.capture) captured.add(lookup.capture);
    const entries = registry.entriesFor(lookup.table, lookup.tags, lookup.notTags);
    if (entries === null) { problems.push(`unknown table ${lookup.table}`); continue; }
    if (entries.length === 0) { problems.push(`no ${lookup.table} entry matches its tag filter`); continue; }
    for (const entry of entries) {
      let m = 0; // variants apply first, then transforms — as in the engine
      while (m < lookup.mods.length && entry.variants[lookup.mods[m].name] !== undefined) m++;
      for (const mod of lookup.mods.slice(m)) {
        if (!getTransform(mod.name)) problems.push(`{${lookup.table}} entry "${entry.text}" has no .${mod.name}`);
      }
    }
  }
  return problems;
}

test('every lookup can resolve every entry it could pick', () => {
  const problems = [];
  for (const { where, text } of templateStrings()) {
    for (const p of lookupProblems(text)) problems.push(`${where}: ${p}`);
  }
  assert.deepEqual(problems, []);
});

// Sampled output must not show the slips that slotting makes easy. The
// article rules mirror the engine's: a/an by sound, not by letter.
const SLIPS = [
  [/\ban (?!hour|honest|heir|honou|[FHLMNRSX]\b)[b-df-hj-np-tv-z]\w*/i, 'an before a consonant'],
  [/\ba (?!use|usu|uni|ure|uri|one\b|one-|once|eu|ewe)[aeiou]\w*/i, 'a before a vowel'],
  [/\ba (?:hour|honest|heir|honou)\w*/i, 'a before a silent h'],
  [/\b(\w+) \1\b/i, 'doubled word'],
  [/(?<![\d,.])1 (?:[a-z-]+ )?[a-z-]+s\b/, 'one with a plural'],
  [/ {2}| ,|,,|\.\./, 'stray spacing or punctuation'],
  [/⟦/, 'unresolved placeholder'],
];
const ALLOWED = [/\bhad had\b/i, /\bthat that\b/i];

test('sampled output reads cleanly', () => {
  const slips = new Map();
  for (const name of gen.names()) {
    for (let s = 0; s < 100; s++) {
      const out = gen.run(name, { seed: `grammar-${s}` });
      const text = typeof out === 'string' ? out : JSON.stringify(out);
      for (const [re, label] of SLIPS) {
        const m = re.exec(text);
        if (m && !ALLOWED.some((a) => a.test(m[0])) && !slips.has(label + m[0])) {
          slips.set(label + m[0], `${name}: ${label} ("${m[0]}") in: ${text.slice(0, 140)}`);
        }
      }
    }
  }
  assert.deepEqual([...slips.values()], []);
});
