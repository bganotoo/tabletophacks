import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTemplate, parseCount, ParseError } from '../gen/parser.js';

const one = (tpl) => {
  const nodes = parseTemplate(tpl);
  assert.equal(nodes.length, 1, `expected one node from ${tpl}`);
  return nodes[0];
};

test('integer range, inclusive', () => {
  assert.deepEqual(one('{2-12}'), { type: 'range', min: 2, max: 12, capture: null });
});

test('range tolerates whitespace and takes a capture', () => {
  assert.deepEqual(one('{ 2 - 12 @level }'), { type: 'range', min: 2, max: 12, capture: 'level' });
});

test('range with min > max is a parse error', () => {
  assert.throws(() => parseTemplate('{12-2}'), /min > max/);
});

test('dice notation', () => {
  assert.deepEqual(one('{3d6}'), { type: 'dice', count: 3, sides: 6, plus: 0, capture: null });
});

test('dice with additive modifier and capture', () => {
  assert.deepEqual(one('{2d4+1}'), { type: 'dice', count: 2, sides: 4, plus: 1, capture: null });
  assert.deepEqual(one('{2d4-1@hp}'), { type: 'dice', count: 2, sides: 4, plus: -1, capture: 'hp' });
});

test('zero-sided or zero-count dice are parse errors', () => {
  assert.throws(() => parseTemplate('{0d6}'), /dice/);
  assert.throws(() => parseTemplate('{3d0}'), /dice/);
});

test('inline alternatives with weight suffix', () => {
  assert.deepEqual(one('{red|blue|azure*3}'), {
    type: 'alt',
    options: [
      { text: 'red', weight: 1 },
      { text: 'blue', weight: 1 },
      { text: 'azure', weight: 3 },
    ],
  });
});

test('alternative weights may be decimal; empty options are errors', () => {
  assert.deepEqual(one('{x*0.5|y}').options, [
    { text: 'x', weight: 0.5 }, { text: 'y', weight: 1 },
  ]);
  assert.throws(() => parseTemplate('{red||blue}'), /empty alternative/);
});

test('a pipe inside a join argument is not an alternative', () => {
  assert.deepEqual(one('{3x loot.join("|")}').join, '|');
});

test('smart article', () => {
  assert.deepEqual(one('{a}'), { type: 'article' });
  assert.deepEqual(one('{ a }'), { type: 'article' });
});

test('repetition with integer count and defaults', () => {
  assert.deepEqual(one('{3x loot}'), {
    type: 'repeat',
    count: { type: 'int', value: 3 },
    inner: { type: 'lookup', table: 'loot', tags: [], notTags: [], capture: null, mods: [] },
    unique: false,
    join: ', ',
  });
});

test('repetition count may be a range or dice', () => {
  assert.deepEqual(one('{2-4x loot}').count, { type: 'range', min: 2, max: 4, capture: null });
  assert.deepEqual(one('{1d4x loot}').count, { type: 'dice', count: 1, sides: 4, plus: 0, capture: null });
});

test('unique and join mods are lifted off the inner lookup', () => {
  const n = one('{3x loot.unique}');
  assert.equal(n.unique, true);
  assert.deepEqual(n.inner.mods, []);
  const j = one('{3x loot.join(" and ")}');
  assert.equal(j.join, ' and ');
  assert.deepEqual(j.inner.mods, []);
});

test('repetition keeps filters and other mods on the inner lookup', () => {
  const n = one('{2x noun#animal.capitalize}');
  assert.deepEqual(n.inner.tags, ['animal']);
  assert.deepEqual(n.inner.mods, [{ name: 'capitalize' }]);
});

test('repetition target must be a table lookup', () => {
  assert.throws(() => parseTemplate('{3x @beast}'), /repetition target/);
});

test('parseCount handles all three count forms', () => {
  assert.deepEqual(parseCount('3'), { type: 'int', value: 3 });
  assert.deepEqual(parseCount('2-4'), { type: 'range', min: 2, max: 4, capture: null });
  assert.deepEqual(parseCount('1d4'), { type: 'dice', count: 1, sides: 4, plus: 0, capture: null });
  assert.throws(() => parseCount('banana'), /invalid count/);
});
