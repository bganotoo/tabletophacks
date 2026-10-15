import test from 'node:test';
import assert from 'node:assert/strict';
import { Generator } from '../../gen/index.js';
import { SYNTAX_REFERENCE, SYNTAX_REFERENCE_TABLES } from './syntax-reference.js';

/** The features the TODO says the reference must document, one section each. */
const REQUIRED_SECTIONS = [
  'lookup',
  'tags',
  'transforms',
  'capture',
  'silent',
  'dynamic-tags',
  'dice',
  'range',
  'alternatives',
  'repetition',
  'article',
  'escaping',
];

const SEEDS = Array.from({ length: 20 }, (_, i) => `ref-${i}`);

test('the demo pack is a valid content pack', () => {
  assert.doesNotThrow(() => Generator.fromData(SYNTAX_REFERENCE_TABLES));
});

test('every example strict-runs on every seed without throwing', () => {
  const gen = Generator.fromData(SYNTAX_REFERENCE_TABLES);
  for (const section of SYNTAX_REFERENCE) {
    for (const example of section.examples) {
      for (const seed of SEEDS) {
        assert.doesNotThrow(
          () => gen.text(example.template, { seed, mode: 'strict' }),
          `${section.id}: ${example.template}`,
        );
      }
    }
  }
});

test('section ids are unique and non-empty', () => {
  const ids = SYNTAX_REFERENCE.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate section id');
  for (const id of ids) assert.ok(id && id.trim(), 'empty section id');
});

test('every section has a title, summary, and at least one example', () => {
  for (const section of SYNTAX_REFERENCE) {
    assert.ok(section.title && section.title.trim(), `${section.id} title`);
    assert.ok(section.summary && section.summary.trim(), `${section.id} summary`);
    assert.ok(
      Array.isArray(section.examples) && section.examples.length > 0,
      `${section.id} examples`,
    );
  }
});

test('every example carries a non-empty template and note', () => {
  for (const section of SYNTAX_REFERENCE) {
    for (const example of section.examples) {
      assert.ok(example.template && example.template.trim(), `${section.id} template`);
      assert.ok(example.note && example.note.trim(), `${section.id} note`);
    }
  }
});

test('all TODO-named features are covered by a section', () => {
  const ids = new Set(SYNTAX_REFERENCE.map((s) => s.id));
  for (const required of REQUIRED_SECTIONS) {
    assert.ok(ids.has(required), `missing section for \`${required}\``);
  }
});
