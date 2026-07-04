/** Syntax reference: render every documented example, running each one live. */

import { Generator } from '../../gen/index.js';
import { SYNTAX_REFERENCE, SYNTAX_REFERENCE_TABLES } from '../shared/syntax-reference.js';
import { esc } from '../shared/render.js';
import { el, clearNode } from '../shared/ui.js';

const generator = Generator.fromData(SYNTAX_REFERENCE_TABLES);

function randomSeed() {
  return Math.random().toString(36).slice(2, 10);
}

/** Run one example template; fill `into` with the sample or an error card. */
function renderSample(into, template, seed) {
  clearNode(into);
  try {
    const text = generator.text(template, { seed, mode: 'strict' });
    into.append(el('span', { class: 'ref-sample-text' }, text));
  } catch (err) {
    into.append(el('span', { class: 'error-card ref-sample-error' }, String(err.message ?? err)));
  }
}

function exampleRow(example) {
  const sample = el('span', { class: 'ref-sample' });
  const reroll = el(
    'button',
    {
      class: 'btn btn-small ref-reroll',
      title: 'Run again with a fresh random seed',
      onclick: () => renderSample(sample, example.template, randomSeed()),
    },
    '↻',
  );
  // Deterministic first paint, per the design: derive the seed from the template.
  renderSample(sample, example.template, `ref:${example.template}`);
  return el(
    'div',
    { class: 'ref-example' },
    el('code', { class: 'ref-template' }, example.template),
    el('div', { class: 'ref-run' }, sample, reroll),
    el('p', { class: 'ref-note' }, example.note),
  );
}

function renderSection(section) {
  return el(
    'section',
    { class: 'tool-section ref-section' },
    el('h2', {}, section.title),
    el('p', { class: 'ref-summary' }, section.summary),
    ...section.examples.map(exampleRow),
  );
}

function main() {
  const root = document.getElementById('reference');
  root.append(...SYNTAX_REFERENCE.map(renderSection));
}

main();
