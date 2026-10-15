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
    { text: 'she/her', tags: ['f'], they: 'she', their: 'her', is: 'is' },
    { text: 'he/him', tags: ['m'], they: 'he', their: 'his', is: 'is' },
    { text: 'they/them', tags: ['n'], they: 'they', their: 'their', is: 'are' },
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

test('missing capture or missing field is a strict error', () => {
  assert.throws(() => gen.text('{pronouns#@nope.gender}', { seed: 1 }), /unknown capture `@nope`/);
  assert.throws(
    () => gen.text('{bare@n}{pronouns#@n.gender}', { seed: 1 }),
    /capture `@n` has no `gender` property/,
  );
});

test('lenient mode warns on a bad dynamic filter and keeps going', () => {
  const warnings = [];
  const out = gen.text('{pronouns#@nope.gender}', { seed: 1, mode: 'lenient', warnings });
  assert.equal(out, '⟦pronouns?⟧');
  assert.equal(warnings.length, 1);
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
