import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { Generator } from '../gen/index.js';
import { parseTemplate } from '../gen/parser.js';

// Templates about one person (npc, quest's patron) draw a pronoun set into @p
// with `$with`, pick a name to match, and write their lines with the helper
// tables ({they} never explain{s}). These checks hold each pronoun set to
// agreeing English, and the name to agreeing with the pronouns.

const dataDir = new URL('./', import.meta.url);
const files = (await readdir(dataDir)).filter((f) => f.endsWith('.json'));
const gen = await Generator.load(files.map((f) => new URL(f, dataDir)));
const registry = gen.registry;
const words = (table) => registry.getTable(table).map((e) => e.text);

const SETS = registry.getTable('pronoun').map((e) => e.tags[0]);
const SEEDS = Array.from({ length: 150 }, (_, i) => `pronoun-${i}`);

/** Pronoun words that must not appear for the person under each set. */
const FOREIGN = {
  she: /\b(?:he|him|his|himself)\b/i,
  he: /\b(?:she|her|hers|herself)\b/i,
  they: /\b(?:she|he|her|him|his|hers|herself|himself)\b/i,
};

/** Lines whose gendered pronoun is about someone else, not the person. */
const ABOUT_OTHERS = [/killed a man in .+? and took his name/];

/** Agreement slips: a singular pronoun with a plural verb, or the reverse. */
const SLIPS = [
  /\b(?:she|he) (?:are|were|have|do|haven't|don't)\b/i,
  /\bthey (?:is|was|has|does|hasn't|doesn't)\b/i,
  // the verbs the lines conjugate with {s}/{es}: a bare one after she/he means a missing {s}
  /\b(?:she|he) (?:never |plainly |always )?(?:explain|keep|hold|smile|touch|know|let|say|hide|light|claim|appear|take|want|think|own|meet|work|insist|die)\b/i,
];

/** Names and titles that belong to the other gender. */
const OTHER = {
  she: new Set([...words('first-name-m'), ...words('honorific-m')]),
  he: new Set([...words('first-name-f'), ...words('honorific-f')]),
  they: new Set(),
};

/** The person-describing parts of a result, as one string. */
const about = {
  npc: (r) => [r.appearance, r.demeanor, r.voice, r.motivation, r.quirk, r.secret, r.home?.detail],
  quest: (r) => [r.patron.role, r.patron.motivation, r.patron.quirk, r.twist, r.complication, r.deadline],
};

for (const [name, parts] of Object.entries(about)) {
  for (const set of SETS) {
    test(`${name}: ${set} pronouns agree with the name and the verbs`, () => {
      const problems = new Set();
      for (const seed of SEEDS) {
        const result = gen.run(name, { seed, vars: { pronouns: set } });
        let text = parts(result).filter(Boolean).join(' / ');
        for (const re of ABOUT_OTHERS) text = text.replace(re, '');
        const person = name === 'npc' ? result.name : result.patron.name;
        const m = FOREIGN[set].exec(text);
        if (m) problems.add(`"${m[0]}" in: ${text}`);
        for (const re of SLIPS) {
          const slip = re.exec(text);
          if (slip) problems.add(`"${slip[0]}" in: ${text}`);
        }
        for (const word of person.split(' ')) {
          if (OTHER[set].has(word)) problems.add(`${set} person named ${person}`);
        }
      }
      assert.deepEqual([...problems], []);
    });
  }
}

test('without a chosen set, every pronoun set comes up', () => {
  const seen = new Set();
  for (const seed of SEEDS) seen.add(gen.text('{pronoun@p}', { seed }));
  assert.deepEqual([...seen].sort(), ['he/him', 'she/her', 'they/them']);
});

test('a person table run on its own falls back to they/them', () => {
  for (const seed of SEEDS.slice(0, 60)) {
    for (const table of ['npc-quirk', 'npc-motivation', 'npc-secret', 'quest-twist-patron']) {
      const out = gen.run(table, { seed });
      assert.doesNotMatch(out, FOREIGN.they, `${table}: ${out}`);
    }
  }
});

test('every pronoun set carries every form the helper tables use', () => {
  const forms = [];
  for (const table of registry.tableNames()) {
    for (const entry of registry.getTable(table)) {
      for (const node of parseTemplate(entry.text)) {
        if (node.type === 'lookup' && node.table === 'pronoun') forms.push(...node.mods.map((m) => m.name));
        for (const dyn of node.dynTags ?? []) if (dyn.capture === 'p') forms.push(dyn.field);
      }
    }
  }
  assert.ok(forms.includes('avoid') && forms.includes('they'));
  for (const entry of registry.getTable('pronoun')) {
    for (const form of new Set(forms)) {
      assert.equal(typeof entry.variants[form], 'string', `${entry.text} lacks "${form}"`);
    }
  }
});

test('rerolling a field keeps the person; rerolling the name keeps the pronouns', () => {
  const she = new Set([...words('first-name-m'), ...words('honorific-m')]);
  for (const seed of SEEDS.slice(0, 30)) {
    const { value, tree } = gen.runTraced('npc', { seed, vars: { pronouns: 'she' } });
    for (let k = 0; k < 4; k++) {
      const motivation = gen.rerollPath(tree, ['motivation'], { seed: `${seed}-m${k}` }).value;
      assert.doesNotMatch(motivation, FOREIGN.she, `${value.name}: ${motivation}`);
      const name = gen.rerollPath(tree, ['name'], { seed: `${seed}-n${k}` }).value;
      for (const word of name.split(' ')) assert.ok(!she.has(word), `rerolled name ${name}`);
    }
  }
});
