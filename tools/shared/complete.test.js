import test from 'node:test';
import assert from 'node:assert/strict';
import { completionContext, completions, applyCompletion } from './complete.js';

const at = (text) => completionContext(text, text.length);

test('no context outside braces, or with nothing typed yet', () => {
  assert.equal(at(''), null);
  assert.equal(at('a plain sentence'), null);
  assert.equal(at('{'), null, 'an empty name would pop up on every brace, including JSON');
  assert.equal(at('{noun} and'), null, 'the brace is closed');
  assert.equal(at('{"key'), null, 'JSON, not a lookup');
  assert.equal(at('{{nou'), null, '{{ is an escaped literal brace');
});

test('a partial table name right after the brace', () => {
  assert.deepEqual(at('a {nou'), { kind: 'table', start: 3, prefix: 'nou' });
  assert.deepEqual(at('{ adj'), { kind: 'table', start: 2, prefix: 'adj' });
});

test('a table name after the silent-lookup ? sigil', () => {
  assert.deepEqual(at('{?pro'), { kind: 'table', start: 2, prefix: 'pro' });
  assert.deepEqual(at('{?pronouns#f'), { kind: 'tag', table: 'pronouns', start: 11, prefix: 'f', used: [] });
});

test('a table name after a repetition count', () => {
  assert.deepEqual(at('{2x lo'), { kind: 'table', start: 4, prefix: 'lo' });
  assert.deepEqual(at('{1d4 x tr'), { kind: 'table', start: 7, prefix: 'tr' });
  assert.deepEqual(at('{2-3x np'), { kind: 'table', start: 6, prefix: 'np' });
});

test('dice, ranges, captures, and transforms are not table names', () => {
  assert.equal(at('{3d'), null);
  assert.equal(at('{2-'), null);
  assert.equal(at('{@hp'), null);
  assert.equal(at('{noun.plu'), null);
});

test('a tag after # or #!, including an empty one', () => {
  assert.deepEqual(at('{noun#an'), { kind: 'tag', table: 'noun', start: 6, prefix: 'an', used: [] });
  assert.deepEqual(at('{noun#'), { kind: 'tag', table: 'noun', start: 6, prefix: '', used: [] });
  assert.deepEqual(at('{noun#!mon'), { kind: 'tag', table: 'noun', start: 7, prefix: 'mon', used: [] });
  assert.deepEqual(at('{2x noun#animal#'), { kind: 'tag', table: 'noun', start: 16, prefix: '', used: ['animal'] });
});

test('the cursor need not be at the end of the text', () => {
  const text = 'a {nou} sat';
  assert.deepEqual(completionContext(text, 6), { kind: 'table', start: 3, prefix: 'nou' });
});

const CATALOG = [
  { name: 'adjective', count: 178, tags: ['age', 'color', 'mood'] },
  { name: 'noun', count: 156, tags: ['animal', 'monster', 'weapon'] },
  { name: 'npc-quirk', count: 50, tags: [] },
  { name: 'pronoun', count: 4, tags: [] },
];

test('table names: prefix matches first, then substring matches', () => {
  const list = completions({ kind: 'table', start: 1, prefix: 'no' }, CATALOG);
  assert.deepEqual(list.map((c) => c.value), ['noun', 'pronoun']);
  assert.equal(list[0].detail, '156 entries');
});

test('matching ignores case and respects the limit', () => {
  assert.deepEqual(completions({ kind: 'table', start: 1, prefix: 'N' }, CATALOG, 1).map((c) => c.value), ['noun']);
});

test('a name typed out in full offers nothing more', () => {
  assert.deepEqual(completions({ kind: 'table', start: 1, prefix: 'pronoun' }, CATALOG), []);
});

test('tags come from the named table, minus ones already used', () => {
  const ctx = { kind: 'tag', table: 'noun', start: 6, prefix: '', used: ['animal'] };
  assert.deepEqual(completions(ctx, CATALOG).map((c) => c.value), ['monster', 'weapon']);
  assert.deepEqual(
    completions({ kind: 'tag', table: 'noun', start: 6, prefix: 'mo', used: [] }, CATALOG).map((c) => c.value),
    ['monster'],
  );
  assert.deepEqual(completions({ kind: 'tag', table: 'nope', start: 6, prefix: '', used: [] }, CATALOG), []);
});

test('applying a completion replaces the partial word and places the cursor after it', () => {
  const text = 'a {nou} sat';
  const ctx = completionContext(text, 6);
  assert.deepEqual(applyCompletion(text, 6, ctx, 'noun'), { text: 'a {noun} sat', cursor: 7 });
  const tagText = '{noun#an';
  assert.deepEqual(applyCompletion(tagText, 8, at(tagText), 'animal'), { text: '{noun#animal', cursor: 12 });
});
