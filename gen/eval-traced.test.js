import test from 'node:test';
import assert from 'node:assert/strict';
import { Registry, createContext, evaluateJson, evaluateJsonTraced, rerollNode } from './engine.js';
import { RNG } from './rng.js';

const ctxFor = (data, opts = {}) => {
  const registry = new Registry();
  registry.load(data);
  return createContext({ registry, rng: new RNG(opts.seed ?? 1), ...opts });
};

test('traces a leaf string to its source template', () => {
  const { value, tree } = evaluateJsonTraced({ name: '{noun}' }, ctxFor({ noun: ['wolf'] }));
  assert.equal(value.name, 'wolf');
  assert.equal(tree.kind, 'object');
  assert.equal(tree.children.name.kind, 'leaf');
  assert.equal(tree.children.name.source, '{noun}');
});

test('plain arrays trace each element by index', () => {
  const { tree } = evaluateJsonTraced({ list: ['{noun}', 42] }, ctxFor({ noun: ['wolf'] }));
  assert.equal(tree.children.list.kind, 'array');
  assert.equal(tree.children.list.children[0].source, '{noun}');
  assert.equal(tree.children.list.children[1].source, 42);
});

test('$maybe present traces to the inner value template, not the wrapper', () => {
  const { value, tree } = evaluateJsonTraced(
    { q: { $maybe: 1, value: '{noun}' } }, ctxFor({ noun: ['wolf'] }));
  assert.equal(value.q, 'wolf');
  assert.equal(tree.children.q.source, '{noun}');
});

test('$maybe absent produces no value and no node', () => {
  const { value, tree } = evaluateJsonTraced(
    { q: { $maybe: 0, value: '{noun}' } }, ctxFor({ noun: ['wolf'] }));
  assert.ok(!('q' in value));
  assert.ok(!('q' in tree.children));
});

test('$or traces the chosen branch but keeps the whole $or as source', () => {
  const tpl = { home: { $or: [{ type: 'tavern', name: '{noun}' }] } };
  const { value, tree } = evaluateJsonTraced(tpl, ctxFor({ noun: ['wolf'] }));
  assert.equal(value.home.type, 'tavern');
  assert.equal(tree.children.home.source, tpl.home);           // whole $or object
  assert.equal(tree.children.home.kind, 'object');
  assert.equal(tree.children.home.children.name.source, '{noun}'); // part of a part
});

test('$repeat traces the whole directive and each element to `of`', () => {
  const tpl = { inv: { $repeat: 2, of: '{noun}' } };
  const { value, tree } = evaluateJsonTraced(tpl, ctxFor({ noun: ['wolf'] }));
  assert.deepEqual(value.inv, ['wolf', 'wolf']);
  assert.equal(tree.children.inv.source, tpl.inv);               // whole $repeat
  assert.equal(tree.children.inv.children[0].source, '{noun}');  // the `of`
});

test('evaluateJson value equals the traced value under the same seed', () => {
  const data = { noun: ['wolf', 'fox', 'owl'] };
  const tpl = { a: '{noun}', b: { $repeat: 2, of: '{noun}' }, c: { $maybe: 0.5, value: '{noun}' } };
  assert.deepEqual(
    evaluateJson(tpl, ctxFor(data, { seed: 4 })),
    evaluateJsonTraced(tpl, ctxFor(data, { seed: 4 })).value,
  );
});

test('rerolling a leaf leaves its sibling byte-identical', () => {
  const data = { noun: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] };
  const { value, tree } = evaluateJsonTraced({ a: '{noun}', b: '{noun}' }, ctxFor(data, { seed: 1 }));
  const b0 = value.b;
  const r = rerollNode(tree, ['a'], ctxFor(data, { seed: 5 }));
  // caller splices:
  value.a = r.value;
  tree.children.a = r.node;
  assert.equal(typeof value.a, 'string');
  assert.equal(value.b, b0); // sibling never re-evaluated
});

test('rerollNode is deterministic under a fixed seed', () => {
  const data = { noun: ['a', 'b', 'c', 'd', 'e', 'f'] };
  const { tree } = evaluateJsonTraced({ a: '{noun}' }, ctxFor(data, { seed: 1 }));
  const r1 = rerollNode(tree, ['a'], ctxFor(data, { seed: 42 }));
  const r2 = rerollNode(tree, ['a'], ctxFor(data, { seed: 42 }));
  assert.equal(r1.value, r2.value);
});

test('rerolling a $maybe-present field keeps it present with a fresh value', () => {
  const data = { noun: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] };
  const { value, tree } = evaluateJsonTraced(
    { q: { $maybe: 1, value: '{noun}' } }, ctxFor(data, { seed: 1 }));
  assert.ok('q' in value);
  let changed = false;
  for (let s = 0; s < 30 && !changed; s++) {
    const r = rerollNode(tree, ['q'], ctxFor(data, { seed: s }));
    assert.equal(typeof r.value, 'string'); // never OMIT — stays present
    if (r.value !== value.q) changed = true;
  }
  assert.ok(changed, 'reroll should be able to produce a different value');
});

test('rerolling a $or container can switch the branch', () => {
  const tpl = { home: { $or: [{ type: 'tavern' }, { type: 'hovel' }] } };
  const { value, tree } = evaluateJsonTraced(tpl, ctxFor({}, { seed: 1 }));
  const seen = new Set([value.home.type]);
  for (let s = 0; s < 50; s++) seen.add(rerollNode(tree, ['home'], ctxFor({}, { seed: s })).value.type);
  assert.deepEqual([...seen].sort(), ['hovel', 'tavern']);
});

test('rerolling one $repeat element changes only that item, not the count', () => {
  const data = { noun: ['a', 'b', 'c', 'd', 'e', 'f'] };
  const { value, tree } = evaluateJsonTraced({ inv: { $repeat: 3, of: '{noun}' } }, ctxFor(data, { seed: 2 }));
  const before = [...value.inv];
  const r = rerollNode(tree, ['inv', 1], ctxFor(data, { seed: 7 }));
  value.inv[1] = r.value;
  tree.children.inv.children[1] = r.node;
  assert.equal(value.inv.length, 3);      // count unchanged
  assert.equal(value.inv[0], before[0]);  // siblings unchanged
  assert.equal(value.inv[2], before[2]);
});

test('rerollNode throws on an unknown path', () => {
  const { tree } = evaluateJsonTraced({ a: '{noun}' }, ctxFor({ noun: ['x'] }));
  assert.throws(() => rerollNode(tree, ['zzz'], ctxFor({ noun: ['x'] })), /reroll node/);
});
