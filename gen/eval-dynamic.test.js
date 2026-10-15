import test from 'node:test';
import assert from 'node:assert/strict';
import { Generator, GenError } from './index.js';

const data = {
  given: [
    { text: 'Mara', tags: ['f'], gender: 'f' },
    { text: 'Tomas', tags: ['m'], gender: 'm' },
    { text: 'Quill', tags: ['n'], gender: 'n' },
  ],
  pronouns: [
    { text: 'she/her', tags: ['f'], gender: 'f', they: 'she', their: 'her', is: 'is' },
    { text: 'he/him', tags: ['m'], gender: 'm', they: 'he', their: 'his', is: 'is' },
    { text: 'they/them', tags: ['n'], gender: 'n', they: 'they', their: 'their', is: 'are' },
  ],
  bare: ['Nobody'],
  tagged: [
    { text: 'alpha', tags: ['x'] },
    { text: 'beta', tags: ['y'] },
  ],
};
const gen = Generator.fromData(data);
const seeds = Array.from({ length: 40 }, (_, i) => i);

test('?lookup captures without rendering; @ref still reads it', () => {
  for (const seed of seeds) {
    const out = gen.text('[{?pronouns@p}]{@p} {@p.they}', { seed });
    assert.match(out, /^\[\](she\/her|he\/him|they\/them) (she|he|they)$/);
  }
});

test('a silent lookup does not disturb the smart article', () => {
  assert.equal(gen.text('{a}{?bare@x} apple'), 'an apple');
});

test('#@n.field filters by the capture\'s variant so pronouns follow the name', () => {
  const byName = { Mara: 'she', Tomas: 'he', Quill: 'they' };
  const seen = new Set();
  for (const seed of seeds) {
    const out = gen.text('{given@n}{?pronouns#@n.gender@p} {@p.they}', { seed });
    const [name, pronoun] = out.split(' ');
    assert.equal(pronoun, byName[name], `${out} (seed ${seed})`);
    seen.add(name);
  }
  assert.equal(seen.size, 3, 'all three names should appear across seeds');
});

test('negated dynamic capture tag excludes the match', () => {
  for (const seed of seeds) {
    const out = gen.text('{given@n}|{pronouns#!@n.gender}', { seed });
    const [name, text] = out.split('|');
    const own = { Mara: 'she/her', Tomas: 'he/him', Quill: 'they/them' }[name];
    assert.notEqual(text, own);
  }
});

test('an unset capture adds no constraint, like an unset variable', () => {
  const seen = new Set(seeds.map((seed) => gen.text('{pronouns#@nope.gender}', { seed })));
  assert.deepEqual([...seen].sort(), ['he/him', 'she/her', 'they/them']);
});

test('a set capture missing the field is a strict error', () => {
  assert.throws(
    () => gen.text('{bare@n}{pronouns#@n.gender}', { seed: 1 }),
    /capture `@n` has no `gender` property/,
  );
});

test('lenient mode warns on a bad dynamic filter and keeps going', () => {
  const warnings = [];
  const out = gen.text('{bare@n}{pronouns#@n.gender}', { seed: 1, mode: 'lenient', warnings });
  assert.equal(out, 'Nobody⟦pronouns?⟧');
  assert.equal(warnings.length, 1);
});

test('@?x picks and captures when x is unset', () => {
  for (const seed of seeds) {
    assert.equal(gen.text('{pronouns#n@?p.they} / {@p}', { seed }), 'they / they');
  }
});

test('@?x reuses an existing x instead of drawing, applying its own mods', () => {
  for (const seed of seeds) {
    const out = gen.text('{?pronouns#f@p}{pronouns#n@?p.their} {pronouns#n@?p.they.capitalize}', { seed });
    assert.equal(out, 'her She');
  }
});

test('? and @? combine: silent either way', () => {
  assert.equal(gen.text('[{?pronouns#n@?p}][{?pronouns#f@?p}]{@p.they}', { seed: 1 }), '[][]they');
});

test('$with binds captures before the fields and is left out of the result', () => {
  const g = Generator.fromData(data, {
    person: {
      $with: '{?pronouns#$who@p}',
      name: '{given#@p.gender}',
      line: '{@p.they.capitalize} {@p.is} here.',
    },
  });
  assert.deepEqual(g.run('person', { seed: 1, vars: { who: 'f' } }), { name: 'Mara', line: 'She is here.' });
  assert.deepEqual(g.run('person', { seed: 1, vars: { who: 'n' } }), { name: 'Quill', line: 'They are here.' });
});

test('$with inside $repeat binds afresh for each element', () => {
  const g = Generator.fromData(data, {
    crowd: { people: { $repeat: 30, of: { $with: '{?pronouns@p}', name: '{given#@p.gender}', they: '{@p.they}' } } },
  });
  const { people } = g.run('crowd', { seed: 3 });
  const byName = { Mara: 'she', Tomas: 'he', Quill: 'they' };
  for (const p of people) assert.equal(p.they, byName[p.name]);
  assert.ok(new Set(people.map((p) => p.name)).size > 1);
});

test('a reroll sees the run\'s captures, so a rerolled field keeps the same person', () => {
  const g = Generator.fromData(data, {
    person: {
      $with: '{?pronouns@p}',
      name: '{given#@p.gender}',
      line: '{@p.they} {tagged}',
    },
  });
  const byName = { Mara: 'she', Tomas: 'he', Quill: 'they' };
  for (const seed of seeds) {
    const { value, tree } = g.runTraced('person', { seed });
    for (let k = 0; k < 5; k++) {
      const line = g.rerollPath(tree, ['line'], { seed: `${seed}-${k}` }).value;
      assert.equal(line.split(' ')[0], byName[value.name]);
      const name = g.rerollPath(tree, ['name'], { seed: `${seed}-n${k}` }).value;
      assert.equal(byName[name], byName[value.name], 'a rerolled name keeps the pronouns');
    }
  }
});

test('captures made during a reroll replace the old ones for later rerolls', () => {
  const g = Generator.fromData(data, { card: { a: '{given@n}', b: '{@n}' } });
  const { tree } = g.runTraced('card', { seed: 1 });
  const a = g.rerollPath(tree, ['a'], { seed: 'x' }).value;
  assert.equal(g.rerollPath(tree, ['b'], { seed: 'y' }).value, a);
});

test('#$var filters by a caller-supplied variable', () => {
  for (const seed of seeds) {
    assert.equal(gen.text('{tagged#$kind}', { seed, vars: { kind: 'y' } }), 'beta');
    assert.equal(gen.text('{given#$gender}', { seed, vars: { gender: 'm' } }), 'Tomas');
  }
});

test('an unset #$var adds no constraint', () => {
  const seen = new Set(seeds.map((seed) => gen.text('{tagged#$kind}', { seed })));
  assert.deepEqual([...seen].sort(), ['alpha', 'beta']);
});

test('#!$var excludes the variable\'s tag', () => {
  for (const seed of seeds) {
    assert.equal(gen.text('{tagged#!$kind}', { seed, vars: { kind: 'x' } }), 'beta');
  }
});

test('a variable no entry matches reports the resolved filter', () => {
  assert.throws(
    () => gen.text('{tagged#$kind}', { seed: 1, vars: { kind: 'zzz' } }),
    /no entries in `tagged` match #zzz/,
  );
});

test('vars reach nested tables and JSON templates', () => {
  const g = Generator.fromData(data, {
    line: ['{given#$gender} arrives'],
    card: { who: '{line}' },
  });
  for (const seed of seeds) {
    assert.equal(g.text('{line}', { seed, vars: { gender: 'f' } }), 'Mara arrives');
    assert.deepEqual(g.run('card', { seed, vars: { gender: 'n' } }), { who: 'Quill arrives' });
  }
});

test('#$var works with unique repetition', () => {
  assert.equal(gen.text('{1x tagged#$kind.unique}', { seed: 1, vars: { kind: 'x' } }), 'alpha');
});

test('invalid vars are rejected', () => {
  assert.throws(() => gen.text('x', { vars: { gender: 3 } }), GenError);
  assert.throws(() => gen.text('x', { vars: { 'bad name': 'f' } }), GenError);
  assert.throws(() => gen.text('x', { vars: [] }), GenError);
});
