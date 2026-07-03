import test from 'node:test';
import assert from 'node:assert/strict';
import { Registry, createContext, evaluateText } from './engine.js';
import { RNG } from './rng.js';

const ctxFor = (data, opts = {}) => {
  const registry = new Registry();
  registry.load(data);
  return createContext({ registry, rng: new RNG(opts.seed ?? 1), ...opts });
};

test('dice stay in bounds across seeds', () => {
  for (let s = 0; s < 200; s++) {
    const n = Number(evaluateText('{3d6}', ctxFor({}, { seed: s })));
    assert.ok(Number.isInteger(n) && n >= 3 && n <= 18, `3d6 gave ${n}`);
    const m = Number(evaluateText('{2d4+1}', ctxFor({}, { seed: s })));
    assert.ok(m >= 3 && m <= 9, `2d4+1 gave ${m}`);
  }
});

test('ranges are inclusive and cover both ends', () => {
  const seen = new Set();
  for (let s = 0; s < 300; s++) seen.add(evaluateText('{2-4}', ctxFor({}, { seed: s })));
  assert.deepEqual([...seen].sort(), ['2', '3', '4']);
});

test('alternatives pick only listed options; weights skew the draw', () => {
  let azure = 0;
  for (let s = 0; s < 900; s++) {
    const v = evaluateText('{red|blue|azure*3}', ctxFor({}, { seed: s }));
    assert.ok(['red', 'blue', 'azure'].includes(v));
    if (v === 'azure') azure++;
  }
  assert.ok(azure > 430 && azure < 650, `expected ~540 azure, got ${azure}`);
});

test('capture re-emits the same value within a run', () => {
  const data = { noun: ['wolf', 'sword', 'idol', 'owlbear'] };
  for (let s = 0; s < 50; s++) {
    const out = evaluateText('{noun@beast} and {@beast}', ctxFor(data, { seed: s }));
    const [first, second] = out.split(' and ');
    assert.equal(first, second);
  }
});

test('capture refs accept variant and transform modifiers', () => {
  const ctx = ctxFor({ noun: [{ text: 'wolf', plural: 'wolves' }] });
  assert.equal(evaluateText('{noun@beast}: {@beast.plural.capitalize}', ctx), 'wolf: Wolves');
});

test('numeric captures re-emit the number', () => {
  const ctx = ctxFor({});
  const out = evaluateText('{3d6@hp}/{@hp}', ctx);
  const [a, b] = out.split('/');
  assert.equal(a, b);
});

test('unknown capture is an error in strict mode', () => {
  const ctx = ctxFor({});
  assert.throws(() => evaluateText('{@ghost}', ctx), /unknown capture `@ghost`/);
});

test('smart article: an before vowels, a before consonants', () => {
  assert.equal(evaluateText('{a} {beast}', ctxFor({ beast: ['owlbear'] })), 'an owlbear');
  assert.equal(evaluateText('{a} {beast}', ctxFor({ beast: ['sword'] })), 'a sword');
  assert.equal(evaluateText('{a} {beast}!', ctxFor({ beast: ['Idol'] })), 'an Idol!');
});

test('article with nothing after it defaults to "a"', () => {
  assert.equal(evaluateText('{a}', ctxFor({})), 'a');
});

test('repetition joins with ", " by default', () => {
  const ctx = ctxFor({ gem: ['ruby'] });
  assert.equal(evaluateText('{3x gem}', ctx), 'ruby, ruby, ruby');
});

test('repetition with custom join', () => {
  const ctx = ctxFor({ gem: ['ruby'] });
  assert.equal(evaluateText('{3x gem.join(" and ")}', ctx), 'ruby and ruby and ruby');
});

test('repetition count may be dice; result count stays in bounds', () => {
  for (let s = 0; s < 100; s++) {
    const out = evaluateText('{1d4x gem}', ctxFor({ gem: ['ruby'] }, { seed: s }));
    const n = out.split(', ').length;
    assert.ok(n >= 1 && n <= 4, `1d4x gave ${n} picks`);
  }
});

test('unique repetition never repeats an entry', () => {
  const data = { gem: ['ruby', 'pearl', 'opal'] };
  for (let s = 0; s < 50; s++) {
    const picks = evaluateText('{3x gem.unique}', ctxFor(data, { seed: s })).split(', ');
    assert.deepEqual([...picks].sort(), ['opal', 'pearl', 'ruby']);
  }
});

test('asking for more unique picks than entries fails specifically', () => {
  const ctx = ctxFor({ gem: ['ruby', 'pearl'] });
  assert.throws(
    () => evaluateText('{3x gem.unique}', ctx),
    /cannot pick 3 unique entries from `gem` \(only 2 match\)/,
  );
  const warnings = [];
  const lenient = ctxFor({ gem: ['ruby', 'pearl'] }, { mode: 'lenient', warnings });
  const picks = evaluateText('{3x gem.unique}', lenient).split(', ');
  assert.equal(picks.length, 2); // clamped
  assert.equal(warnings.length, 1);
});

test('per-pick mods apply inside repetition', () => {
  const ctx = ctxFor({ gem: ['ruby'] });
  assert.equal(evaluateText('{2x gem.capitalize}', ctx), 'Ruby, Ruby');
});
