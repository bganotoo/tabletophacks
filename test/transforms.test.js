import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getTransform, registerTransform, transformNames, levenshtein, suggest,
} from '../gen/transforms.js';

test('built-in transforms work', () => {
  assert.equal(getTransform('capitalize')('owlbear'), 'Owlbear');
  assert.equal(getTransform('capitalize')(''), '');
  assert.equal(getTransform('upper')('gold'), 'GOLD');
  assert.equal(getTransform('lower')('GoLd'), 'gold');
});

test('unknown transform returns null', () => {
  assert.equal(getTransform('nope'), null);
});

test('registerTransform adds a custom transform', () => {
  registerTransform('shout', (s) => `${s}!`);
  assert.equal(getTransform('shout')('run'), 'run!');
  assert.ok(transformNames().includes('shout'));
});

test('registerTransform validates name and fn', () => {
  assert.throws(() => registerTransform('9bad', (s) => s), /invalid transform name/);
  assert.throws(() => registerTransform('ok', 'not a function'), /must be a function/);
});

test('levenshtein computes edit distance', () => {
  assert.equal(levenshtein('capitalise', 'capitalize'), 1);
  assert.equal(levenshtein('same', 'same'), 0);
  assert.equal(levenshtein('abc', 'xyz'), 3);
});

test('suggest finds a near miss, ignores far misses', () => {
  assert.equal(suggest('capitalise', ['capitalize', 'upper', 'lower']), 'capitalize');
  assert.equal(suggest('zzzzzz', ['capitalize', 'upper', 'lower']), null);
});
