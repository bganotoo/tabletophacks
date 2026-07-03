import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTemplate, ParseError } from './parser.js';

const one = (tpl) => {
  const nodes = parseTemplate(tpl);
  assert.equal(nodes.length, 1, `expected one node from ${tpl}`);
  return nodes[0];
};

test('modifier chain parses in order', () => {
  assert.deepEqual(one('{noun.plural.capitalize}').mods, [
    { name: 'plural' }, { name: 'capitalize' },
  ]);
});

test('modifier with quoted argument', () => {
  assert.deepEqual(one('{loot.join(" and ")}').mods, [{ name: 'join', arg: ' and ' }]);
});

test('positive tag filters', () => {
  const n = one('{noun#animal#concrete}');
  assert.deepEqual(n.tags, ['animal', 'concrete']);
  assert.deepEqual(n.notTags, []);
});

test('negative tag filter combines with positive', () => {
  const n = one('{noun#animal#!undead}');
  assert.deepEqual(n.tags, ['animal']);
  assert.deepEqual(n.notTags, ['undead']);
});

test('capture sigil', () => {
  const n = one('{noun#animal@beast}');
  assert.equal(n.capture, 'beast');
  assert.deepEqual(n.tags, ['animal']);
});

test('whitespace between sigils is ignored', () => {
  const n = one('{ noun #animal @beast .plural }');
  assert.deepEqual(
    { table: n.table, tags: n.tags, capture: n.capture, mods: n.mods },
    { table: 'noun', tags: ['animal'], capture: 'beast', mods: [{ name: 'plural' }] },
  );
});

test('capture reference with modifiers', () => {
  assert.deepEqual(one('{@beast.plural}'), {
    type: 'ref', name: 'beast', mods: [{ name: 'plural' }],
  });
});

test('bare capture reference', () => {
  assert.deepEqual(one('{@beast}'), { type: 'ref', name: 'beast', mods: [] });
});

test('refs cannot be filtered or re-captured', () => {
  assert.throws(() => parseTemplate('{@beast#animal}'), /unexpected '#'/);
  assert.throws(() => parseTemplate('{@beast@again}'), /unexpected '@'/);
});

test('error cases report useful messages', () => {
  assert.throws(() => parseTemplate('{noun.}'), /expected modifier name/);
  assert.throws(() => parseTemplate('{noun#}'), /expected tag name/);
  assert.throws(() => parseTemplate('{noun@}'), /expected capture name/);
  assert.throws(() => parseTemplate('{noun$}'), /unexpected '\$'/);
  assert.throws(() => parseTemplate('{loot.join(and)}'), /expected quoted string/);
  assert.throws(() => parseTemplate('{loot.join("and"}'), ParseError);
});
