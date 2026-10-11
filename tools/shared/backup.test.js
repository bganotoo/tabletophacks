import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SNAPSHOT_VERSION,
  SNAPSHOT_KINDS,
  buildSnapshot,
  parseSnapshot,
  snapshotFilename,
  buildBackup,
  parseBackup,
  restorePlan,
  backupFilename,
} from './backup.js';
import { createEncounter } from './encounter.js';
import { createBook } from './scoresheet.js';
import { createGame } from './timer.js';

const NOW = new Date('2026-10-10T18:30:00.000Z');

const SAMPLES = {
  encounter: createEncounter(),
  score: createBook(),
  timer: createGame(),
};

test('every kind in the registry has a key, label, article, tool, and guard', () => {
  for (const [kind, entry] of Object.entries(SNAPSHOT_KINDS)) {
    assert.equal(typeof entry.key, 'string', `${kind} key`);
    assert.equal(typeof entry.label, 'string', `${kind} label`);
    assert.equal(typeof entry.article, 'string', `${kind} article`);
    assert.equal(typeof entry.tool, 'string', `${kind} tool`);
    assert.equal(typeof entry.isValid, 'function', `${kind} guard`);
  }
});

test('the registry covers every tool with exportable state', () => {
  assert.deepEqual(Object.keys(SNAPSHOT_KINDS).sort(), ['encounter', 'score', 'timer']);
});

test('buildSnapshot wraps data in a versioned envelope', () => {
  const env = buildSnapshot('encounter', SAMPLES.encounter, NOW);
  assert.equal(env.tabletophacks, 'encounter');
  assert.equal(env.version, SNAPSHOT_VERSION);
  assert.equal(env.exportedAt, '2026-10-10T18:30:00.000Z');
  assert.deepEqual(env.data, SAMPLES.encounter);
});

test('buildSnapshot rejects an unknown kind', () => {
  assert.throws(() => buildSnapshot('nope', {}, NOW), /unknown snapshot kind/i);
});

test('every kind round-trips through build and parse', () => {
  for (const [kind, data] of Object.entries(SAMPLES)) {
    const source = JSON.stringify(buildSnapshot(kind, data, NOW));
    const result = parseSnapshot(source, kind);
    assert.equal(result.ok, true, `${kind}: ${result.error}`);
    assert.equal(result.kind, kind);
    assert.deepEqual(result.data, data);
    assert.equal(result.exportedAt, '2026-10-10T18:30:00.000Z');
  }
});

test('parseSnapshot rejects text that is not JSON', () => {
  const result = parseSnapshot('{not json', 'encounter');
  assert.equal(result.ok, false);
  assert.match(result.error, /not valid JSON/);
});

test('parseSnapshot rejects JSON that is not an export file', () => {
  for (const source of ['[]', '42', 'null', '{"round":1}']) {
    const result = parseSnapshot(source, 'encounter');
    assert.equal(result.ok, false, source);
    assert.match(result.error, /not a Tabletop Hacks export/);
  }
});

test('parseSnapshot rejects an unrecognised kind and names it', () => {
  const result = parseSnapshot('{"tabletophacks":"spaceships","version":1,"data":{}}', 'encounter');
  assert.equal(result.ok, false);
  assert.match(result.error, /unrecognised kind/);
  assert.match(result.error, /spaceships/);
});

test('parseSnapshot sends a mismatched export to the tool that owns it', () => {
  const source = JSON.stringify(buildSnapshot('score', SAMPLES.score, NOW));
  const result = parseSnapshot(source, 'encounter');
  assert.equal(result.ok, false);
  assert.match(result.error, /score sheets/);
  assert.match(result.error, /Score Tracker/);
});

test('the mismatch message reads with the right article for every kind', () => {
  for (const [kind, entry] of Object.entries(SNAPSHOT_KINDS)) {
    const other = kind === 'encounter' ? 'score' : 'encounter';
    const source = JSON.stringify(buildSnapshot(kind, SAMPLES[kind], NOW));
    const result = parseSnapshot(source, other);
    assert.equal(result.ok, false);
    assert.match(result.error, new RegExp(`this is ${entry.article} ${entry.label} export`));
  }
});

test('parseSnapshot rejects a newer envelope version', () => {
  const env = buildSnapshot('encounter', SAMPLES.encounter, NOW);
  env.version = SNAPSHOT_VERSION + 1;
  const result = parseSnapshot(JSON.stringify(env), 'encounter');
  assert.equal(result.ok, false);
  assert.match(result.error, /newer version of the site/);
});

test('parseSnapshot rejects data that fails the shape guard', () => {
  const env = buildSnapshot('encounter', SAMPLES.encounter, NOW);
  env.data = { round: 'three', turnIndex: 0, combatants: [] };
  const result = parseSnapshot(JSON.stringify(env), 'encounter');
  assert.equal(result.ok, false);
  assert.match(result.error, /incomplete or damaged/);
});

test('parseSnapshot rejects a missing data field', () => {
  const result = parseSnapshot('{"tabletophacks":"encounter","version":1}', 'encounter');
  assert.equal(result.ok, false);
  assert.match(result.error, /incomplete or damaged/);
});

test('parseSnapshot rejects an unknown expectedKind outright', () => {
  const result = parseSnapshot('{}', 'nope');
  assert.equal(result.ok, false);
});

test('snapshotFilename names the kind and the day', () => {
  assert.equal(snapshotFilename('encounter', NOW), 'tabletophacks-encounter-2026-10-10.json');
  assert.equal(snapshotFilename('score', NOW), 'tabletophacks-score-2026-10-10.json');
});

// ── Whole-origin backup ─────────────────────────────────────────────────────

const ENTRIES = [
  ['th:packs:v1', '[{"id":"p1"}]'],
  ['th:encounter:v1', '{"round":2,"turnIndex":0,"combatants":[]}'],
  ['unrelated-key', "someone else's data"],
];

test('buildBackup keeps only th: keys, as raw strings', () => {
  const env = buildBackup(ENTRIES, NOW);
  assert.equal(env.tabletophacks, 'backup');
  assert.equal(env.version, SNAPSHOT_VERSION);
  assert.equal(env.exportedAt, '2026-10-10T18:30:00.000Z');
  assert.deepEqual(Object.keys(env.keys).sort(), ['th:encounter:v1', 'th:packs:v1']);
  assert.equal(env.keys['th:packs:v1'], '[{"id":"p1"}]');
});

test('buildBackup of an empty origin yields an empty keys object', () => {
  assert.deepEqual(buildBackup([], NOW).keys, {});
});

test('backup round-trips through build and parse', () => {
  const result = parseBackup(JSON.stringify(buildBackup(ENTRIES, NOW)));
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(result.keys, {
    'th:packs:v1': '[{"id":"p1"}]',
    'th:encounter:v1': '{"round":2,"turnIndex":0,"combatants":[]}',
  });
  assert.equal(result.exportedAt, '2026-10-10T18:30:00.000Z');
});

test('parseBackup sends a per-tool snapshot to the tool that owns it', () => {
  const source = JSON.stringify(buildSnapshot('encounter', SAMPLES.encounter, NOW));
  const result = parseBackup(source);
  assert.equal(result.ok, false);
  assert.match(result.error, /not a full backup/);
  assert.match(result.error, /Initiative Tracker/);
});

test('parseBackup rejects an unrecognised envelope kind', () => {
  const result = parseBackup('{"tabletophacks":"spaceships","version":1}');
  assert.equal(result.ok, false);
  assert.match(result.error, /not a full backup/);
});

test('parseBackup rejects text that is not JSON or not an export', () => {
  assert.match(parseBackup('{nope').error, /not valid JSON/);
  assert.match(parseBackup('[]').error, /not a Tabletop Hacks export/);
});

test('parseBackup rejects a newer envelope version', () => {
  const env = buildBackup(ENTRIES, NOW);
  env.version = SNAPSHOT_VERSION + 1;
  assert.match(parseBackup(JSON.stringify(env)).error, /newer version of the site/);
});

test('parseBackup rejects a keys field that is not an object', () => {
  for (const keys of ['[]', 'null', '42']) {
    const result = parseBackup('{"tabletophacks":"backup","version":1,"keys":' + keys + '}');
    assert.equal(result.ok, false, keys);
    assert.match(result.error, /no stored values/);
  }
});

test('parseBackup rejects a stored value that is not text', () => {
  for (const value of ['42', '{}', 'null']) {
    const result = parseBackup(
      '{"tabletophacks":"backup","version":1,"keys":{"th:packs:v1":' + value + '}}',
    );
    assert.equal(result.ok, false, value);
    assert.match(result.error, /is not text/);
  }
});

test('parseBackup refuses a key outside the th: namespace and names it', () => {
  const result = parseBackup('{"tabletophacks":"backup","version":1,"keys":{"evil":"x"}}');
  assert.equal(result.ok, false);
  assert.match(result.error, /evil/);
  assert.match(result.error, /th:/);
});

test('restorePlan splits keys into replaced, added, and unaffected', () => {
  const existing = [
    ['th:packs:v1', 'old packs'],
    ['th:library:v1', 'untouched'],
    ['unrelated-key', 'not ours'],
  ];
  const incoming = { 'th:packs:v1': 'new packs', 'th:encounter:v1': 'fresh' };
  const plan = restorePlan(existing, incoming);
  assert.deepEqual(plan.replaced, ['th:packs:v1']);
  assert.deepEqual(plan.added, ['th:encounter:v1']);
  assert.deepEqual(plan.unaffected, ['th:library:v1']);
  assert.deepEqual(plan.writes, [
    ['th:packs:v1', 'new packs'],
    ['th:encounter:v1', 'fresh'],
  ]);
});

test('restorePlan reports nothing unaffected when the backup covers everything', () => {
  const plan = restorePlan([['th:packs:v1', 'old']], { 'th:packs:v1': 'new' });
  assert.deepEqual(plan.unaffected, []);
  assert.deepEqual(plan.added, []);
  assert.deepEqual(plan.replaced, ['th:packs:v1']);
});

test('restorePlan on an empty backup writes nothing and touches nothing', () => {
  const plan = restorePlan([['th:packs:v1', 'old']], {});
  assert.deepEqual(plan.writes, []);
  assert.deepEqual(plan.unaffected, ['th:packs:v1']);
});

test('backupFilename names the day', () => {
  assert.equal(backupFilename(NOW), 'tabletophacks-backup-2026-10-10.json');
});
