import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MY_OVERRIDES_ID,
  MY_OVERRIDES_NAME,
  overriddenNames,
  saveOverride,
  removeOverride,
} from './overrides.js';

const OTHER_PACK = { id: 'abc123', name: 'Other', source: '{"mood":["calm"]}' };

function packWith(data) {
  return {
    id: MY_OVERRIDES_ID,
    name: MY_OVERRIDES_NAME,
    description: '',
    source: JSON.stringify(data),
    updatedAt: new Date().toISOString(),
  };
}

// ── overriddenNames ───────────────────────────────────────────────────────────

test('overriddenNames returns [] with no packs', () => {
  assert.deepEqual(overriddenNames([]), []);
});

test('overriddenNames returns [] when the reserved pack is absent', () => {
  assert.deepEqual(overriddenNames([OTHER_PACK]), []);
});

test('overriddenNames lists the keys of the reserved pack', () => {
  const packs = [packWith({ 'npc-quirk': ['hums'], loot: ['{noun}'] })];
  assert.deepEqual(overriddenNames(packs).sort(), ['loot', 'npc-quirk']);
});

test('overriddenNames tolerates a corrupt reserved pack', () => {
  assert.deepEqual(overriddenNames([{ ...packWith({}), source: '{oops' }]), []);
});

// ── saveOverride ──────────────────────────────────────────────────────────────

test('saveOverride creates the reserved pack on first override', () => {
  const result = saveOverride([OTHER_PACK], 'npc-quirk', ['hums a tune']);
  assert.equal(result.ok, true);
  const pack = result.packs.find((p) => p.id === MY_OVERRIDES_ID);
  assert.equal(pack.name, MY_OVERRIDES_NAME);
  assert.ok(pack.updatedAt);
  assert.deepEqual(JSON.parse(pack.source), { 'npc-quirk': ['hums a tune'] });
});

test('saveOverride stores object (JSON template) definitions', () => {
  const value = { omen: '{noun} falls', severity: '{1d6}' };
  const result = saveOverride([], 'portent', value);
  assert.equal(result.ok, true);
  assert.deepEqual(overriddenNames(result.packs), ['portent']);
  assert.deepEqual(JSON.parse(result.packs[0].source).portent, value);
});

test('saveOverride overwrites an existing override in place', () => {
  const first = saveOverride([], 'loot', ['{noun}']);
  const second = saveOverride(first.packs, 'loot', ['{adjective} {noun}']);
  assert.deepEqual(JSON.parse(second.packs[0].source).loot, ['{adjective} {noun}']);
  assert.equal(overriddenNames(second.packs).length, 1);
});

test('saveOverride rejects a definition that fails engine validation', () => {
  const result = saveOverride([], 'loot', [{ tags: ['x'] }]); // entry missing "text"
  assert.equal(result.ok, false);
  assert.match(result.error, /text/);
});

test('saveOverride rejects reserved and malformed names', () => {
  for (const name of ['a', 'an', '2fast', 'has space']) {
    assert.equal(saveOverride([], name, ['x']).ok, false);
  }
});

test('saveOverride does not mutate its input', () => {
  const packs = [packWith({ loot: ['{noun}'] })];
  const snapshot = JSON.stringify(packs);
  saveOverride(packs, 'omen', ['{noun}']);
  assert.equal(JSON.stringify(packs), snapshot);
});

// ── removeOverride ────────────────────────────────────────────────────────────

test('removeOverride removes one entry', () => {
  let { packs } = saveOverride([], 'loot', ['{noun}']);
  ({ packs } = saveOverride(packs, 'omen', ['{noun}']));
  const after = removeOverride(packs, 'loot');
  assert.deepEqual(overriddenNames(after), ['omen']);
});

test('removeOverride drops the reserved pack when it empties', () => {
  const { packs } = saveOverride([OTHER_PACK], 'loot', ['{noun}']);
  assert.deepEqual(removeOverride(packs, 'loot'), [OTHER_PACK]);
});

test('removeOverride is a no-op for unknown names', () => {
  const { packs } = saveOverride([], 'loot', ['{noun}']);
  assert.deepEqual(removeOverride(packs, 'nope'), packs);
});

test('removeOverride does not mutate its input', () => {
  const { packs } = saveOverride([], 'loot', ['{noun}']);
  const snapshot = JSON.stringify(packs);
  removeOverride(packs, 'loot');
  assert.equal(JSON.stringify(packs), snapshot);
});
