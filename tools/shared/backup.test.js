import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SNAPSHOT_VERSION,
  SNAPSHOT_KINDS,
  buildSnapshot,
  parseSnapshot,
  snapshotFilename,
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
