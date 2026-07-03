import test from 'node:test';
import assert from 'node:assert/strict';
import { Registry, createContext, evaluateJson } from './engine.js';
import { RNG } from './rng.js';

const ctxFor = (data, opts = {}) => {
  const registry = new Registry();
  registry.load(data);
  return createContext({ registry, rng: new RNG(opts.seed ?? 1), ...opts });
};

test('a lone numeric expansion becomes a raw number', () => {
  const out = evaluateJson({ hp: '{3d6}', level: '{2-12}' }, ctxFor({}));
  assert.equal(typeof out.hp, 'number');
  assert.ok(out.hp >= 3 && out.hp <= 18);
  assert.equal(typeof out.level, 'number');
});

test('surrounding text keeps it a string', () => {
  const out = evaluateJson({ desc: '{3d6} gold' }, ctxFor({}));
  assert.equal(typeof out.desc, 'string');
  assert.match(out.desc, /^\d+ gold$/);
});

test('numeric captures pass through as numbers and agree', () => {
  const out = evaluateJson({ hp: '{3d6@hp}', check: '{@hp}' }, ctxFor({}));
  assert.equal(typeof out.hp, 'number');
  assert.equal(out.hp, out.check);
});

test('plain JSON values and nested structures are walked', () => {
  const ctx = ctxFor({ metal: ['iron'] });
  const out = evaluateJson(
    { keep: true, n: 7, none: null, deep: { list: ['{metal}', 42] } },
    ctx,
  );
  assert.deepEqual(out, { keep: true, n: 7, none: null, deep: { list: ['iron', 42] } });
});

test('string repetition joins to a string, $repeat makes an array', () => {
  const ctx = ctxFor({ gem: ['ruby'] });
  const out = evaluateJson(
    { joined: '{3x gem}', arr: { $repeat: 3, of: '{gem}' } },
    ctx,
  );
  assert.equal(out.joined, 'ruby, ruby, ruby');
  assert.deepEqual(out.arr, ['ruby', 'ruby', 'ruby']);
});

test('$repeat count accepts dice strings and stays in bounds', () => {
  for (let s = 0; s < 100; s++) {
    const out = evaluateJson({ $repeat: '1d4', of: '{gem}' }, ctxFor({ gem: ['ruby'] }, { seed: s }));
    assert.ok(Array.isArray(out) && out.length >= 1 && out.length <= 4);
  }
});

test('$repeat unique dedupes results', () => {
  const data = { gem: ['ruby', 'pearl', 'opal'] };
  for (let s = 0; s < 30; s++) {
    const out = evaluateJson({ $repeat: 3, of: '{gem}', unique: true }, ctxFor(data, { seed: s }));
    assert.deepEqual([...out].sort(), ['opal', 'pearl', 'ruby']);
  }
});

test('$repeat unique fails specifically when impossible', () => {
  const ctx = ctxFor({ gem: ['ruby'] });
  assert.throws(
    () => evaluateJson({ $repeat: 2, of: '{gem}', unique: true }, ctx),
    /\$repeat: could not produce 2 unique values/,
  );
});

test('$maybe includes at p=1, omits the property entirely at p=0', () => {
  const ctx = ctxFor({ quirk: ['hums'] });
  const out = evaluateJson(
    { always: { $maybe: 1, value: '{quirk}' }, never: { $maybe: 0, value: '{quirk}' } },
    ctx,
  );
  assert.equal(out.always, 'hums');
  assert.ok(!('never' in out));
});

test('$maybe validates its probability', () => {
  assert.throws(() => evaluateJson({ $maybe: 'often', value: 1 }, ctxFor({})), /\$maybe/);
});

test('$or picks a raw JSON branch and strips $weight', () => {
  const template = { $or: [{ type: 'tavern' }, { type: 'hovel', $weight: 3 }] };
  const seen = new Set();
  for (let s = 0; s < 200; s++) {
    const out = evaluateJson(template, ctxFor({}, { seed: s }));
    assert.ok(['tavern', 'hovel'].includes(out.type));
    assert.ok(!('$weight' in out));
    seen.add(out.type);
  }
  assert.equal(seen.size, 2);
});

test('$or branches may be primitives (real booleans)', () => {
  const out = evaluateJson({ flag: { $or: [true, false] } }, ctxFor({}));
  assert.equal(typeof out.flag, 'boolean');
});

test('$or branch weights skew the draw', () => {
  let hovel = 0;
  for (let s = 0; s < 800; s++) {
    const out = evaluateJson(
      { $or: [{ type: 'tavern' }, { type: 'hovel', $weight: 3 }] },
      ctxFor({}, { seed: s }),
    );
    if (out.type === 'hovel') hovel++;
  }
  assert.ok(hovel > 500 && hovel < 700, `expected ~600 hovels, got ${hovel}`);
});

test('captures flow through a whole JSON template', () => {
  const ctx = ctxFor({ noun: ['wolf', 'sword', 'idol'] });
  const out = evaluateJson({ pet: '{noun@beast}', again: '{@beast}' }, ctx);
  assert.equal(out.pet, out.again);
});
