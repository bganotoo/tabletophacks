import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_BATCH, clampCount, deriveSeeds } from './batch.js';

// ── clampCount ───────────────────────────────────────────────────────────────

test('clampCount keeps counts within [1, MAX_BATCH]', () => {
  assert.equal(clampCount(1), 1);
  assert.equal(clampCount(5), 5);
  assert.equal(clampCount(MAX_BATCH), MAX_BATCH);
});

test('clampCount floors the cap at MAX_BATCH', () => {
  assert.equal(clampCount(MAX_BATCH + 1), MAX_BATCH);
  assert.equal(clampCount(1000), MAX_BATCH);
});

test('clampCount coerces non-numeric, zero, and negative input to 1', () => {
  assert.equal(clampCount(0), 1);
  assert.equal(clampCount(-3), 1);
  assert.equal(clampCount(''), 1);
  assert.equal(clampCount('abc'), 1);
  assert.equal(clampCount(NaN), 1);
  assert.equal(clampCount(undefined), 1);
});

test('clampCount reads numeric strings and floors fractions', () => {
  assert.equal(clampCount('5'), 5);
  assert.equal(clampCount(3.9), 3);
});

// ── deriveSeeds ──────────────────────────────────────────────────────────────

test('deriveSeeds with count 1 returns the base seed unchanged', () => {
  // Preserves today's single-run result and existing shared links.
  assert.deepEqual(deriveSeeds('abc123', 1), ['abc123']);
  assert.deepEqual(deriveSeeds(42, 1), ['42']);
});

test('deriveSeeds with count > 1 returns distinct indexed sub-seeds', () => {
  assert.deepEqual(deriveSeeds('abc', 3), ['abc#0', 'abc#1', 'abc#2']);
});

test('deriveSeeds is deterministic — same base and count, same seeds', () => {
  assert.deepEqual(deriveSeeds('seed', 5), deriveSeeds('seed', 5));
});

test('deriveSeeds clamps the count like clampCount', () => {
  assert.equal(deriveSeeds('x', 0).length, 1);
  assert.equal(deriveSeeds('x', MAX_BATCH + 4).length, MAX_BATCH);
});
