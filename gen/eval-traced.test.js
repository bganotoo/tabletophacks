import test from 'node:test';
import assert from 'node:assert/strict';
import { Registry, createContext, evaluateJson, evaluateJsonTraced } from './engine.js';
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
