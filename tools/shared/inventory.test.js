import test from 'node:test';
import assert from 'node:assert/strict';
import { inventory } from './inventory.js';

const json = (value) => JSON.stringify(value);

test('an empty or foreign-only storage has nothing to list', () => {
  assert.deepEqual(inventory([]), []);
  assert.deepEqual(inventory([['other-site', 'x'], ['thx:packs:v1', '[]']]), []);
});

test('known keys come back in a fixed order, whatever order storage holds them', () => {
  const rows = inventory([
    ['th:notices:v1', json({ storage: true })],
    ['th:score:v1', json({ activeId: null, sheets: [] })],
    ['th:packs:v1', json([])],
  ]);
  assert.deepEqual(rows.map((r) => r.name), ['packs', 'score', 'notices']);
});

test('each row names its tool, links it, and measures its size', () => {
  const [row] = inventory([['th:packs:v1', '[]']]);
  assert.equal(row.key, 'th:packs:v1');
  assert.equal(row.known, true);
  assert.equal(row.tool, 'Workshop');
  assert.equal(row.href, '/tools/workshop/');
  assert.equal(row.label, 'Custom packs');
  // 'th:packs:v1' (11) + '[]' (2) = 13 UTF-16 code units
  assert.equal(row.bytes, 26);
});

test('unknown th: keys follow the known ones, without a tool', () => {
  const rows = inventory([
    ['th:mystery:v1', '1'],
    ['th:library:v1', '[]'],
    ['th:not-versioned', '2'],
  ]);
  assert.deepEqual(rows.map((r) => r.key), ['th:library:v1', 'th:mystery:v1', 'th:not-versioned']);
  assert.equal(rows[1].known, false);
  assert.equal(rows[1].tool, null);
  assert.equal(rows[1].href, null);
  assert.equal(rows[1].label, 'Other saved data');
  assert.equal(rows[1].detail, '');
});

test('details count what each tool keeps, singular and plural', () => {
  const detail = (key, value) => inventory([[`th:${key}:v1`, json(value)]])[0].detail;
  assert.equal(detail('packs', [{}]), '1 pack');
  assert.equal(detail('packs', [{}, {}]), '2 packs');
  assert.equal(detail('library', [{}, {}, {}]), '3 saved results');
  assert.equal(detail('library', [{}]), '1 saved result');
  assert.equal(detail('encounter', { combatants: [{}, {}], round: 4 }), '2 combatants, round 4');
  assert.equal(detail('encounter', { combatants: [{}], round: 1 }), '1 combatant, round 1');
  assert.equal(detail('score', { sheets: [{}] }), '1 score sheet');
  assert.equal(detail('score', { sheets: [{}, {}] }), '2 score sheets');
  assert.equal(detail('timer', { players: [{}, {}, {}] }), '3 players');
  assert.equal(detail('timer-sound', true), 'Sound on');
  assert.equal(detail('timer-sound', false), 'Sound off');
  assert.equal(detail('dice-history', [{}, {}]), '2 recent rolls');
  assert.equal(detail('settings', { lastGenerator: 'npc' }), '');
  assert.equal(detail('notices', { storage: true }), '');
});

test('a corrupt or oddly shaped value never throws, it just has no detail', () => {
  for (const name of ['packs', 'library', 'encounter', 'score', 'timer', 'dice-history']) {
    for (const raw of ['{not json', 'null', '"text"', '{}', '7']) {
      const [row] = inventory([[`th:${name}:v1`, raw]]);
      assert.equal(row.detail, '', `${name} = ${raw}`);
    }
  }
});
