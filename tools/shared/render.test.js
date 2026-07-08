import test from 'node:test';
import assert from 'node:assert/strict';
import { esc, renderResult, resultToText, renderResults, resultsToText } from './render.js';

test('esc escapes HTML metacharacters', () => {
  assert.equal(esc(`<a href="x" title='y'>&</a>`),
    '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  assert.equal(esc('plain'), 'plain');
});

test('string results render as escaped flowing text', () => {
  const html = renderResult('a <cursed> sword');
  assert.match(html, /^<p class="gen-text">/);
  assert.ok(html.includes('a &lt;cursed&gt; sword'));
});

test('object results render as a card with keys and escaped values', () => {
  const html = renderResult({ name: 'Rusty <Wolf>', hp: 11 });
  assert.match(html, /<dl class="gen-card">/);
  assert.ok(html.includes('<dt>name</dt>'));
  assert.ok(html.includes('Rusty &lt;Wolf&gt;'));
  assert.ok(html.includes('<dt>hp</dt>'));
  assert.ok(html.includes('11'));
});

test('nested arrays render as list items', () => {
  const html = renderResult({ inventory: ['a map', 'gold'] });
  assert.ok(html.includes('<li>a map</li>'));
  assert.ok(html.includes('<li>gold</li>'));
});

test('nested objects render as nested cards', () => {
  const html = renderResult({ home: { type: 'tavern', name: 'The Owl' } });
  assert.equal((html.match(/<dl/g) || []).length, 2);
  assert.ok(html.includes('The Owl'));
});

test('top-level arrays, numbers, booleans, and null render', () => {
  assert.ok(renderResult(['one', 'two']).includes('<li>two</li>'));
  assert.ok(renderResult(7).includes('7'));
  assert.ok(renderResult(true).includes('true'));
  assert.ok(renderResult(null).includes('null'));
});

// ── renderResults (batch) ────────────────────────────────────────────────────

test('renderResults with a single value delegates to renderResult unchanged', () => {
  assert.equal(renderResults(['a sword']), renderResult('a sword'));
  const one = { name: 'Wolf' };
  assert.equal(renderResults([one]), renderResult(one));
});

test('renderResults with several values wraps each with an ordinal index', () => {
  const html = renderResults(['first', 'second', 'third']);
  assert.match(html, /<div class="gen-batch">/);
  assert.equal((html.match(/gen-batch-item/g) || []).length, 3);
  assert.ok(html.includes('>1<'));
  assert.ok(html.includes('>2<'));
  assert.ok(html.includes('>3<'));
  assert.ok(html.includes('first'));
  assert.ok(html.includes('third'));
});

test('renderResults escapes values in a batch', () => {
  const html = renderResults(['a <sword>', 'b <shield>']);
  assert.ok(html.includes('a &lt;sword&gt;'));
  assert.ok(!html.includes('<sword>'));
});

// ── resultsToText (batch) ─────────────────────────────────────────────────────

test('resultsToText with a single value delegates to resultToText', () => {
  assert.equal(resultsToText(['a <cursed> sword']), 'a <cursed> sword');
});

test('resultsToText numbers each item on its own header line', () => {
  const text = resultsToText(['one', 'two']);
  assert.equal(text, '#1\none\n\n#2\ntwo');
});

test('resultsToText numbers multi-line object results', () => {
  const text = resultsToText([{ name: 'Wolf' }, { name: 'Fox' }]);
  const lines = text.split('\n');
  assert.equal(lines[0], '#1');
  assert.equal(lines[1], 'name: Wolf');
  assert.equal(lines[2], '');
  assert.equal(lines[3], '#2');
  assert.equal(lines[4], 'name: Fox');
});

test('resultToText leaves strings verbatim', () => {
  assert.equal(resultToText('a <cursed> sword'), 'a <cursed> sword');
});

test('resultToText renders objects as indented key/value lines', () => {
  const text = resultToText({ name: 'Wolf', inventory: ['map', 'gold'], home: { type: 'hovel' } });
  const lines = text.split('\n');
  assert.equal(lines[0], 'name: Wolf');
  assert.equal(lines[1], 'inventory:');
  assert.equal(lines[2], '  - map');
  assert.equal(lines[3], '  - gold');
  assert.equal(lines[4], 'home:');
  assert.equal(lines[5], '  type: hovel');
});
