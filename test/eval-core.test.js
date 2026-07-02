import test from 'node:test';
import assert from 'node:assert/strict';
import { Registry, createContext, evaluateText, GenError } from '../gen/engine.js';
import { RNG } from '../gen/rng.js';

const ctxFor = (data, opts = {}) => {
  const registry = new Registry();
  registry.load(data);
  return createContext({ registry, rng: new RNG(opts.seed ?? 1), ...opts });
};

test('single-entry tables expand deterministically, including nesting', () => {
  const ctx = ctxFor({ metal: ['iron'], idol: ['{metal} idol'] });
  assert.equal(evaluateText('{idol}', ctx), 'iron idol');
});

test('literal text and escapes pass through', () => {
  const ctx = ctxFor({ metal: ['iron'] });
  assert.equal(evaluateText('use {{braces}} and {metal}', ctx), 'use {braces} and iron');
});

test('same seed gives identical output, weighted picks stay in-table', () => {
  const data = { noun: [{ text: 'wolf', weight: 2 }, 'sword', 'idol'] };
  for (let s = 0; s < 50; s++) {
    const a = evaluateText('{noun}', ctxFor(data, { seed: s }));
    const b = evaluateText('{noun}', ctxFor(data, { seed: s }));
    assert.equal(a, b);
    assert.ok(['wolf', 'sword', 'idol'].includes(a));
  }
});

test('variant resolves before transform in a chain', () => {
  const ctx = ctxFor({ noun: [{ text: 'wolf', plural: 'wolves' }] });
  assert.equal(evaluateText('{noun.plural}', ctx), 'wolves');
  const ctx2 = ctxFor({ noun: [{ text: 'wolf', plural: 'wolves' }] });
  assert.equal(evaluateText('{noun.plural.capitalize}', ctx2), 'Wolves');
});

test('variant text is itself expanded', () => {
  const ctx = ctxFor({ metal: ['iron'], noun: [{ text: 'idol', plural: '{metal} idols' }] });
  assert.equal(evaluateText('{noun.plural}', ctx), 'iron idols');
});

test('missing variant falls back to transform; neither is an error', () => {
  const ctx = ctxFor({ noun: ['wolf'] });
  assert.equal(evaluateText('{noun.upper}', ctx), 'WOLF');
  const ctx2 = ctxFor({ noun: ['wolf'] });
  assert.throws(() => evaluateText('{noun.past}', ctx2), /unknown transform `past`/);
});

test('unknown transform suggests a near miss', () => {
  const ctx = ctxFor({ noun: ['wolf'] });
  assert.throws(
    () => evaluateText('{noun.capitalise}', ctx),
    /unknown transform `capitalise` — did you mean `capitalize`\?/,
  );
});

test('unknown table errors in strict, placeholders in lenient', () => {
  const strict = ctxFor({ noun: ['wolf'] });
  assert.throws(() => evaluateText('{nuon}', strict), (err) => {
    assert.ok(err instanceof GenError);
    assert.match(err.message, /unknown table `nuon` — did you mean `noun`\?/);
    return true;
  });
  const warnings = [];
  const lenient = ctxFor({ noun: ['wolf'] }, { mode: 'lenient', warnings });
  assert.equal(evaluateText('{missing}', lenient), '⟦missing?⟧');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /unknown table `missing`/);
});

test('empty filter result names the table and filter', () => {
  const ctx = ctxFor({ noun: [{ text: 'wolf', tags: ['animal'] }] });
  assert.throws(
    () => evaluateText('{noun#animal#flying}', ctx),
    /no entries in `noun` match #animal#flying/,
  );
});

test('tag filters restrict picks', () => {
  const data = {
    noun: [{ text: 'wolf', tags: ['animal'] }, { text: 'zombie', tags: ['animal', 'undead'] }],
  };
  for (let s = 0; s < 30; s++) {
    assert.equal(evaluateText('{noun#animal#!undead}', ctxFor(data, { seed: s })), 'wolf');
  }
});

test('recursion cycle is caught and named', () => {
  const ctx = ctxFor({ a_t: ['{b_t}'], b_t: ['{a_t}'] });
  assert.throws(() => evaluateText('{a_t}', ctx), (err) => {
    assert.match(err.message, /recursion limit \(50\) exceeded/);
    assert.match(err.message, /a_t → b_t/);
    return true;
  });
  const warnings = [];
  const lenient = ctxFor({ a_t: ['{b_t}'], b_t: ['{a_t}'] }, { mode: 'lenient', warnings });
  assert.equal(typeof evaluateText('{a_t}', lenient), 'string'); // must not hang
  assert.ok(warnings.some((w) => /recursion limit/.test(w)));
});

test('parse errors inside entries surface as ParseError even mid-run', () => {
  const ctx = ctxFor({ broken: ['{unclosed'] });
  assert.throws(() => evaluateText('{broken}', ctx), /unclosed '\{'/);
});
