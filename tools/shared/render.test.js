import test from 'node:test';
import assert from 'node:assert/strict';
import {
  esc,
  renderResult,
  resultToText,
  renderResults,
  resultsToText,
  resultToMarkdown,
  resultsToMarkdown,
} from './render.js';

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

// ── resultToMarkdown ──────────────────────────────────────────────────────────

test('resultToMarkdown leaves strings verbatim', () => {
  assert.equal(resultToMarkdown('a <cursed> *sword*'), 'a <cursed> *sword*');
});

test('resultToMarkdown renders objects as bold-key bullet lists', () => {
  const md = resultToMarkdown({ name: 'Wolf', hp: 11 });
  const lines = md.split('\n');
  assert.equal(lines[0], '- **name:** Wolf');
  assert.equal(lines[1], '- **hp:** 11');
});

test('resultToMarkdown nests arrays and objects with indentation', () => {
  const md = resultToMarkdown({ name: 'Wolf', inventory: ['map', 'gold'], home: { type: 'hovel' } });
  const lines = md.split('\n');
  assert.equal(lines[0], '- **name:** Wolf');
  assert.equal(lines[1], '- **inventory:**');
  assert.equal(lines[2], '  - map');
  assert.equal(lines[3], '  - gold');
  assert.equal(lines[4], '- **home:**');
  assert.equal(lines[5], '  - **type:** hovel');
});

test('resultToMarkdown renders a top-level array as a bullet list', () => {
  const md = resultToMarkdown(['one', 'two']);
  assert.equal(md, '- one\n- two');
});

test('resultToMarkdown renders objects inside arrays', () => {
  const md = resultToMarkdown([{ name: 'Wolf' }, { name: 'Fox' }]);
  const lines = md.split('\n');
  assert.equal(lines[0], '- **name:** Wolf');
  assert.equal(lines[1], '- **name:** Fox');
});

test('resultToMarkdown renders primitives via String()', () => {
  assert.equal(resultToMarkdown(7), '7');
  assert.equal(resultToMarkdown(true), 'true');
  assert.equal(resultToMarkdown(null), 'null');
});

// ── resultsToMarkdown (batch) ─────────────────────────────────────────────────

test('resultsToMarkdown with a single value delegates to resultToMarkdown', () => {
  assert.equal(resultsToMarkdown(['a *cursed* sword']), 'a *cursed* sword');
  assert.equal(resultsToMarkdown([{ name: 'Wolf' }]), '- **name:** Wolf');
});

test('resultsToMarkdown gives each item a numbered heading', () => {
  const md = resultsToMarkdown(['one', 'two']);
  assert.equal(md, '### 1\n\none\n\n### 2\n\ntwo');
});

test('resultsToMarkdown headings precede multi-line object results', () => {
  const md = resultsToMarkdown([{ name: 'Wolf' }, { name: 'Fox' }]);
  const lines = md.split('\n');
  assert.equal(lines[0], '### 1');
  assert.equal(lines[1], '');
  assert.equal(lines[2], '- **name:** Wolf');
  assert.equal(lines[3], '');
  assert.equal(lines[4], '### 2');
  assert.equal(lines[5], '');
  assert.equal(lines[6], '- **name:** Fox');
});

test('renderResult without a tree is byte-identical to the no-arg call', () => {
  const v = { name: 'Wolf', inventory: ['map', 'gold'] };
  assert.equal(renderResult(v), renderResult(v, null));
  assert.ok(!renderResult(v).includes('reroll-part'));
});

test('renderResult with a tree annotates each non-root row with its path', () => {
  const value = { home: { name: 'The Owl' } };
  const tree = {
    kind: 'object', source: {}, children: {
      home: {
        kind: 'object', source: {}, children: {
          name: { kind: 'leaf', source: '{tavern-name}' },
        },
      },
    },
  };
  const html = renderResult(value, tree);
  assert.ok(html.includes('data-reroll-path="[&quot;home&quot;]"'));
  assert.ok(html.includes('data-reroll-path="[&quot;home&quot;,&quot;name&quot;]"'));
});

test('the root node gets no reroll button', () => {
  const value = { name: 'Wolf' };
  const tree = { kind: 'object', source: {}, children: { name: { kind: 'leaf', source: '{n}' } } };
  const html = renderResult(value, tree);
  assert.equal((html.match(/reroll-part/g) || []).length, 1); // only `name`, none for root
});

test('array elements get indexed reroll paths', () => {
  const value = { inv: ['map', 'gold'] };
  const tree = {
    kind: 'object', source: {}, children: {
      inv: {
        kind: 'array', source: {}, children: [
          { kind: 'leaf', source: '{loot}' },
          { kind: 'leaf', source: '{loot}' },
        ],
      },
    },
  };
  const html = renderResult(value, tree);
  assert.ok(html.includes('data-reroll-path="[&quot;inv&quot;,0]"'));
  assert.ok(html.includes('data-reroll-path="[&quot;inv&quot;,1]"'));
});

test('renderResults threads one tree per result', () => {
  const values = [{ a: 'x' }, { a: 'y' }];
  const oneTree = () => ({ kind: 'object', source: {}, children: { a: { kind: 'leaf', source: '{n}' } } });
  const html = renderResults(values, [oneTree(), oneTree()]);
  assert.equal((html.match(/reroll-part/g) || []).length, 2);
});

test('renderResults without trees stays byte-identical', () => {
  const values = ['one', 'two'];
  assert.equal(renderResults(values), renderResults(values, null));
});
