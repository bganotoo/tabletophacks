import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTemplate, ParseError } from '../gen/parser.js';

const lookup = (table, extra = {}) => ({
  type: 'lookup', table, tags: [], notTags: [], capture: null, mods: [], ...extra,
});

test('plain text parses to a single text node', () => {
  assert.deepEqual(parseTemplate('hello world'), [{ type: 'text', value: 'hello world' }]);
});

test('empty string parses to no nodes', () => {
  assert.deepEqual(parseTemplate(''), []);
});

test('simple lookup', () => {
  assert.deepEqual(parseTemplate('{noun}'), [lookup('noun')]);
});

test('lookup mixed with text', () => {
  assert.deepEqual(parseTemplate('a {noun} walks'), [
    { type: 'text', value: 'a ' },
    lookup('noun'),
    { type: 'text', value: ' walks' },
  ]);
});

test('names may contain digits, underscore, hyphen', () => {
  assert.deepEqual(parseTemplate('{tavern-name}'), [lookup('tavern-name')]);
});

test('{{ and }} are literal braces', () => {
  assert.deepEqual(parseTemplate('{{x}}'), [{ type: 'text', value: '{x}' }]);
});

test('whitespace inside braces is ignored', () => {
  assert.deepEqual(parseTemplate('{  noun  }'), [lookup('noun')]);
});

test('unclosed brace reports position', () => {
  assert.throws(() => parseTemplate('ab {noun'), (err) => {
    assert.ok(err instanceof ParseError);
    assert.match(err.message, /unclosed '\{'/);
    assert.equal(err.position, 3);
    return true;
  });
});

test('stray closing brace reports position', () => {
  assert.throws(() => parseTemplate('oops }'), (err) => {
    assert.ok(err instanceof ParseError);
    assert.match(err.message, /unexpected '\}'/);
    assert.equal(err.position, 5);
    return true;
  });
});

test('empty expansion is an error', () => {
  assert.throws(() => parseTemplate('{}'), /expected table name/);
});
