/** Score Tracker: thin DOM wiring over tools/shared/scoresheet.js. No logic
 *  worth testing lives here — the score-book state machine is tested in
 *  scoresheet.test.js. Structural changes trigger a full render(); a single cell
 *  edit only repaints totals + leader highlights, so tabbing across the grid is
 *  never interrupted by a table rebuild (mirrors the timer's render/paint split). */

import {
  createBook,
  createSheet,
  renameSheet,
  removeSheet,
  selectSheet,
  activeSheet,
  addPlayer,
  removePlayer,
  renamePlayer,
  movePlayer,
  addColumn,
  removeColumn,
  renameColumn,
  moveColumn,
  setScore,
  playerTotal,
  leaderIds,
  isValidBook,
  ScoreError,
} from '../shared/scoresheet.js';
import { el, clearNode, toast, uid } from '../shared/ui.js';
import { createStore } from '../shared/store.js';

const store = createStore();
const KEY = 'score';

const sheetSelect = document.getElementById('sheet-select');
const sheetName = document.getElementById('sheet-name');
const gridWrap = document.getElementById('grid-wrap');
const controls = document.getElementById('controls');
const addForm = document.getElementById('add-form');
const addName = document.getElementById('add-name');

let state = store.get(KEY, null);
if (!isValidBook(state)) state = createBook();
// First run (or an emptied book): land on a ready-to-use sheet.
if (!state.sheets.length) state = createSheet(state, { id: uid(), name: '' });

/** Per-player total cells + row nodes, rebuilt on each full render so a cell
 *  edit can refresh totals/leader classes without rebuilding the table. */
const totalCells = new Map();
const playerRows = new Map();

/** Apply a state transition, persist, and repaint. Wraps ScoreError. When
 *  `structural` is false, only totals/leader highlights are repainted. */
function commit(fn, { structural = true } = {}) {
  try {
    state = fn(state);
  } catch (err) {
    if (err instanceof ScoreError) return toast(err.message);
    throw err;
  }
  store.set(KEY, state);
  structural ? render() : repaintTotals();
}

/** Format a total: integers plain, fractions to at most 2 places. */
function fmtTotal(n) {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

/** Full structural render — sheet bar, grid table, and controls. */
function render() {
  const sheet = activeSheet(state);

  // Sheet bar always reflects the book.
  clearNode(sheetSelect);
  for (const sh of state.sheets) {
    sheetSelect.append(el('option', { value: sh.id, selected: sh.id === state.activeId }, sh.name));
  }
  sheetName.value = sheet ? sheet.name : '';
  sheetName.disabled = !sheet;

  clearNode(gridWrap);
  totalCells.clear();
  playerRows.clear();

  if (!sheet) {
    controls.hidden = true;
    gridWrap.append(el('p', { class: 'placeholder score-empty' }, 'No sheet yet — create one to start scoring.'));
    return;
  }
  controls.hidden = false;

  if (!sheet.players.length) {
    gridWrap.append(el('p', { class: 'placeholder score-empty' }, 'No players yet — add someone below to start scoring.'));
    return;
  }

  gridWrap.append(buildTable(sheet));
  repaintTotals();
}

/** The score grid: a header row of columns and one body row per player. */
function buildTable(sheet) {
  // Header: corner + one cell per column + Total.
  const headRow = el('tr', {}, el('th', { class: 'score-corner' }, 'Player'));
  sheet.columns.forEach((c, i) => headRow.append(columnHead(c, i, sheet.columns.length)));
  headRow.append(el('th', { class: 'score-total-head' }, 'Total'));

  const body = el('tbody', {});
  sheet.players.forEach((p, i) => body.append(playerRow(sheet, p, i)));

  return el('table', { class: 'score-table' }, el('thead', {}, headRow), body);
}

/** A column header: editable name + reorder/remove controls. */
function columnHead(c, i, count) {
  const name = el('input', {
    type: 'text', class: 'score-cname', value: c.name, 'aria-label': 'Column name',
    autocomplete: 'off', spellcheck: 'false',
  });
  name.addEventListener('change', () => commit((s) => renameColumn(s, c.id, name.value)));
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') name.blur(); });

  const ctrls = el('span', { class: 'score-chead-ctrls' },
    el('button', { class: 'btn btn-small', title: 'Move left', disabled: i === 0, onclick: () => commit((s) => moveColumn(s, c.id, -1)) }, '‹'),
    el('button', { class: 'btn btn-small', title: 'Move right', disabled: i === count - 1, onclick: () => commit((s) => moveColumn(s, c.id, 1)) }, '›'),
    el('button', { class: 'btn btn-small btn-danger', title: 'Remove column', onclick: () => commit((s) => removeColumn(s, c.id)) }, '✕'),
  );
  return el('th', { class: 'score-chead' }, name, ctrls);
}

/** A player row: editable name, one cell per column, live total, controls. */
function playerRow(sheet, p, i) {
  const name = el('input', {
    type: 'text', class: 'score-pname', value: p.name, 'aria-label': 'Player name',
    autocomplete: 'off', spellcheck: 'false',
  });
  name.addEventListener('change', () => commit((s) => renamePlayer(s, p.id, name.value)));
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') name.blur(); });

  const nameCell = el('th', { class: 'score-pname-cell', scope: 'row' },
    name,
    el('span', { class: 'score-pctrls' },
      el('button', { class: 'btn btn-small', title: 'Move up', disabled: i === 0, onclick: () => commit((s) => movePlayer(s, p.id, -1)) }, '↑'),
      el('button', { class: 'btn btn-small', title: 'Move down', disabled: i === sheet.players.length - 1, onclick: () => commit((s) => movePlayer(s, p.id, 1)) }, '↓'),
      el('button', { class: 'btn btn-small btn-danger', title: 'Remove player', onclick: () => commit((s) => removePlayer(s, p.id)) }, '✕'),
    ),
  );

  const row = el('tr', { class: 'score-prow' }, nameCell);
  for (const c of sheet.columns) {
    const raw = sheet.scores[p.id]?.[c.id];
    const cell = el('input', {
      type: 'number', class: 'score-cell', step: 'any', 'aria-label': `${p.name} — ${c.name}`,
      value: raw === undefined ? '' : String(raw),
    });
    // Commit on blur/Enter; only totals repaint, so tab-to-next-cell survives.
    cell.addEventListener('change', () => commit((s) => setScore(s, p.id, c.id, cell.value), { structural: false }));
    row.append(el('td', { class: 'score-cell-td' }, cell));
  }

  const total = el('td', { class: 'score-total' }, '0');
  totalCells.set(p.id, total);
  playerRows.set(p.id, row);
  row.append(total);
  return row;
}

/** Recompute per-player totals and leader highlights without rebuilding the
 *  table (safe to run mid-edit — preserves focus and tab order). */
function repaintTotals() {
  const sheet = activeSheet(state);
  if (!sheet) return;
  const leaders = new Set(leaderIds(sheet));
  const anyScore = sheet.players.some((p) => playerTotal(sheet, p.id) !== 0);
  for (const p of sheet.players) {
    const t = playerTotal(sheet, p.id);
    totalCells.get(p.id).textContent = fmtTotal(t);
    playerRows.get(p.id)?.classList.toggle('leader', anyScore && leaders.has(p.id));
  }
}

// --- wiring ----------------------------------------------------------------

sheetSelect.addEventListener('change', () => commit((s) => selectSheet(s, sheetSelect.value)));
sheetName.addEventListener('change', () => commit((s) => renameSheet(s, state.activeId, sheetName.value)));
sheetName.addEventListener('keydown', (e) => { if (e.key === 'Enter') sheetName.blur(); });

document.getElementById('new-sheet').addEventListener('click', () => {
  commit((s) => createSheet(s, { id: uid(), name: '' }));
  sheetName.focus();
  sheetName.select();
});

document.getElementById('delete-sheet').addEventListener('click', () => {
  const sheet = activeSheet(state);
  if (!sheet) return;
  const hasData = sheet.players.length || sheet.columns.length;
  if (hasData && !confirm(`Delete “${sheet.name}” and its scores?`)) return;
  commit((s) => removeSheet(s, s.activeId));
});

document.getElementById('add-round').addEventListener('click', () => commit((s) => addColumn(s, { id: uid() })));

addForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!addName.value.trim()) return;
  commit((s) => addPlayer(s, { id: uid(), name: addName.value }));
  addName.value = '';
  addName.focus();
});

render();
