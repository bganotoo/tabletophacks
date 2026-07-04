/** Dice Roller: thin DOM wiring over tools/shared/dice.js. No logic worth
 *  testing lives here — the parser/roller is tested in dice.test.js. */

import { roll, rollToText, DiceError } from '../shared/dice.js';
import { RNG } from '../../gen/rng.js';
import { el, clearNode, toast } from '../shared/ui.js';
import { createStore } from '../shared/store.js';

const store = createStore();
const HISTORY_KEY = 'dice-history';
const HISTORY_MAX = 50;

const input = document.getElementById('dice-input');
const resultPanel = document.getElementById('result-panel');
const copyBtn = document.getElementById('copy-btn');
const historyList = document.getElementById('history-list');

/** @type {import('../shared/dice.js').RollResult | null} */
let current = null;
let history = store.get(HISTORY_KEY, []);
if (!Array.isArray(history)) history = [];

/**
 * Parse + roll `expr` (fresh RNG), then render the result or an error card.
 * `persist` writes the expression back into the input so the next Roll repeats
 * it; adv/dis pass `persist: false` so they stay one-off adjustments and don't
 * hijack the straight roll you had typed.
 */
function doRoll(expr, { persist = true } = {}) {
  const text = String(expr ?? '').trim();
  if (!text) return;
  if (persist) input.value = text;
  try {
    current = roll(text, new RNG());
    renderResult(current);
    copyBtn.disabled = false;
    pushHistory(current);
  } catch (err) {
    current = null;
    copyBtn.disabled = true;
    renderError(err instanceof DiceError ? err.message : String(err?.message ?? err));
  }
}

/** Render a successful roll: big total, echoed expression, per-die breakdown. */
function renderResult(result) {
  clearNode(resultPanel);
  const breakdown = el('div', { class: 'dice-breakdown' });
  result.terms.forEach((term, idx) => breakdown.append(termRow(term, idx)));
  resultPanel.append(
    el('div', { class: 'dice-total' }, String(result.total)),
    el('div', { class: 'dice-expr' }, result.expression),
    breakdown,
  );
}

/** One breakdown row: a signed label, the rolled dice (dropped struck through). */
function termRow(term, idx) {
  const sign = idx === 0 && term.sign > 0 ? '' : term.sign < 0 ? '−' : '+';
  const children = [el('span', { class: 'dice-term-sign' }, sign)];
  if (term.kind === 'dice') {
    children.push(el('span', { class: 'dice-term-label' }, term.notation));
    const dice = el('span', { class: 'dice-dice' });
    for (const d of term.dice) {
      dice.append(el('span', { class: `die ${d.kept ? 'kept' : 'dropped'}` }, String(d.value)));
    }
    children.push(dice);
    children.push(el('span', { class: 'dice-term-subtotal' }, `= ${term.subtotal}`));
  } else {
    children.push(el('span', { class: 'dice-term-label' }, String(term.value)));
  }
  return el('div', { class: 'dice-term' }, ...children);
}

/** @param {string} message */
function renderError(message) {
  clearNode(resultPanel);
  resultPanel.append(el('div', { class: 'error-card' }, message));
}

/** Prepend a roll to the history, cap it, persist, and repaint. */
function pushHistory(result) {
  history.unshift({ expr: result.expression, total: result.total });
  if (history.length > HISTORY_MAX) history.length = HISTORY_MAX;
  store.set(HISTORY_KEY, history);
  renderHistory();
}

function renderHistory() {
  clearNode(historyList);
  for (const entry of history) {
    const name = el(
      'button',
      { class: 'lib-name', title: 'Roll this again', onclick: () => doRoll(entry.expr) },
      entry.expr,
    );
    historyList.append(
      el('li', { class: 'library-item' }, name, el('span', { class: 'lib-meta' }, `→ ${entry.total}`)),
    );
  }
}

function copyResult() {
  if (!current) return;
  if (!navigator.clipboard) {
    toast('Copy not available');
    return;
  }
  navigator.clipboard.writeText(rollToText(current)).then(
    () => toast('Copied'),
    () => toast('Copy failed'),
  );
}

// --- wiring ----------------------------------------------------------------

document.getElementById('roll-btn').addEventListener('click', () => doRoll(input.value));
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doRoll(input.value);
});
copyBtn.addEventListener('click', copyResult);

document.getElementById('dice-quick').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.dataset.expr) doRoll(btn.dataset.expr, { persist: false });
  else if (btn.dataset.die) doRoll(`1d${btn.dataset.die}`);
});

document.getElementById('clear-history-btn').addEventListener('click', () => {
  history = [];
  store.set(HISTORY_KEY, history);
  renderHistory();
});

renderHistory();
input.focus();
