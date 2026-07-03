import test from 'node:test';
import assert from 'node:assert/strict';
import { RNG, hashSeed } from './rng.js';

test('same seed produces identical sequences', () => {
  const a = new RNG('a7k2');
  const b = new RNG('a7k2');
  for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next());
});

test('numeric and string seeds both work, different seeds diverge', () => {
  assert.equal(new RNG(42).next(), new RNG(42).next());
  assert.notEqual(new RNG('npc').next(), new RNG('npd').next());
});

test('hashSeed is deterministic and 32-bit unsigned', () => {
  assert.equal(hashSeed('npc'), hashSeed('npc'));
  const h = hashSeed('anything');
  assert.ok(Number.isInteger(h) && h >= 0 && h <= 0xffffffff);
});

test('next() stays in [0, 1)', () => {
  const r = new RNG(1);
  for (let i = 0; i < 1000; i++) {
    const v = r.next();
    assert.ok(v >= 0 && v < 1, `out of range: ${v}`);
  }
});

test('int() covers the inclusive range and nothing else', () => {
  const r = new RNG(2);
  const seen = new Set();
  for (let i = 0; i < 1000; i++) seen.add(r.int(2, 5));
  assert.deepEqual([...seen].sort(), [2, 3, 4, 5]);
});

test('pick() returns elements of the array', () => {
  const r = new RNG(3);
  const arr = ['x', 'y', 'z'];
  for (let i = 0; i < 100; i++) assert.ok(arr.includes(r.pick(arr)));
});

test('weighted() honors weights (~3:1 over 4000 draws)', () => {
  const r = new RNG(4);
  const items = [{ id: 'a', w: 3 }, { id: 'b', w: 1 }];
  let a = 0;
  for (let i = 0; i < 4000; i++) {
    if (r.weighted(items, (x) => x.w).id === 'a') a++;
  }
  assert.ok(a > 2700 && a < 3300, `expected ~3000 a-picks, got ${a}`);
});
