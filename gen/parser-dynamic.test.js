import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTemplate, ParseError } from './parser.js';

const one = (tpl) => {
  const nodes = parseTemplate(tpl);
  assert.equal(nodes.length, 1, `expected one node from ${tpl}`);
  return nodes[0];
};

test('#@n.field parses as a dynamic tag from a capture', () => {
  const n = one('{pronouns#@n.gender@p}');
  assert.deepEqual(n.dynTags, [{ negated: false, capture: 'n', field: 'gender' }]);
  assert.deepEqual(n.tags, []);
  assert.equal(n.capture, 'p');
});

test('#$var parses as a dynamic tag from a run variable', () => {
  assert.deepEqual(one('{given#$gender}').dynTags, [{ negated: false, variable: 'gender' }]);
});

test('dynamic tags negate, mix with static tags, and tolerate whitespace', () => {
  const n = one('{ noun #animal #! @n.x #!$v }');
  assert.deepEqual(n.tags, ['animal']);
  assert.deepEqual(n.dynTags, [
    { negated: true, capture: 'n', field: 'x' },
    { negated: true, variable: 'v' },
  ]);
});

test('plain lookups carry no dynTags or silent key', () => {
  const n = one('{noun#animal}');
  assert.equal('dynTags' in n, false);
  assert.equal('silent' in n, false);
});

test('#@n without a field is an error', () => {
  assert.throws(() => parseTemplate('{noun#@n}'), ParseError);
});

test('{?table} parses as a silent lookup keeping its sigils', () => {
  const n = one('{?pronouns#f@p}');
  assert.equal(n.silent, true);
  assert.equal(n.table, 'pronouns');
  assert.deepEqual(n.tags, ['f']);
  assert.equal(n.capture, 'p');
});

test('? is rejected on @ references and on repetition', () => {
  assert.throws(() => parseTemplate('{?@n}'), ParseError);
  assert.throws(() => parseTemplate('{2x ?noun}'), ParseError);
});
