/** Initiative Tracker: thin DOM wiring over tools/shared/encounter.js. No logic
 *  worth testing lives here — the encounter state machine is tested in
 *  encounter.test.js. */

import {
  createEncounter,
  addCombatant,
  updateCombatant,
  removeCombatant,
  moveCombatant,
  sortByInitiative,
  nextTurn,
  prevTurn,
  addCondition,
  removeCondition,
  isValidEncounter,
  EncounterError,
} from '../shared/encounter.js';
import { el, clearNode, toast, uid, download } from '../shared/ui.js';
import { createStore } from '../shared/store.js';
import { buildSnapshot, parseSnapshot, snapshotFilename } from '../shared/backup.js';
import { showStorageNoticeOnce } from '../shared/notices.js';

const store = createStore(undefined, { onError: (e) => toast(e.message) });
const KEY = 'encounter';

const list = document.getElementById('init-list');
const roundNum = document.getElementById('round-num');
const addForm = document.getElementById('add-form');
const nameInput = document.getElementById('add-name');
const initInput = document.getElementById('add-init');

let state = store.get(KEY, null);
if (!isValidEncounter(state)) state = createEncounter();

/** Apply a state transition, persist, and repaint. Wraps EncounterError. */
function commit(fn) {
  try {
    state = fn(state);
  } catch (err) {
    if (err instanceof EncounterError) return toast(err.message);
    throw err;
  }
  if (store.set(KEY, state)) showStorageNoticeOnce(store);
  render();
}

function render() {
  roundNum.textContent = String(state.round);
  clearNode(list);
  if (!state.combatants.length) {
    list.append(el('li', { class: 'placeholder init-empty' }, 'No combatants yet — add someone to start the fight.'));
    return;
  }
  state.combatants.forEach((c, i) => list.append(combatantRow(c, i === state.turnIndex)));
}

/** One combatant row: initiative, name, condition chips, and controls. */
function combatantRow(c, isCurrent) {
  const init = el('span', { class: 'init-badge', title: 'Initiative' },
    c.initiative === null ? '—' : String(c.initiative));

  const name = el('span', { class: 'init-cname' }, c.name);

  const chips = el('span', { class: 'init-chips' });
  c.conditions.forEach((cond, idx) => chips.append(conditionChip(c.id, cond, idx)));

  const controls = el('span', { class: 'init-controls' },
    el('button', { class: 'btn btn-small', title: 'Move up', onclick: () => commit((s) => moveCombatant(s, c.id, -1)) }, '↑'),
    el('button', { class: 'btn btn-small', title: 'Move down', onclick: () => commit((s) => moveCombatant(s, c.id, 1)) }, '↓'),
    el('button', { class: 'btn btn-small', title: 'Add condition', onclick: (e) => toggleCondForm(e.currentTarget) }, '+ Cond'),
    el('button', { class: 'btn btn-small btn-danger', title: 'Remove combatant', onclick: () => commit((s) => removeCombatant(s, c.id)) }, '✕'),
  );

  const main = el('div', { class: 'init-row-main' }, init, name, chips, controls);
  const row = el('li', { class: `init-row${isCurrent ? ' current' : ''}` }, main, conditionForm(c.id));
  return row;
}

/** A condition tag: "Name" or "Name (n)", with a remove ✕. */
function conditionChip(combatantId, cond, index) {
  const label = cond.rounds === null ? cond.name : `${cond.name} (${cond.rounds})`;
  return el('span', { class: 'init-chip' },
    label,
    el('button', {
      class: 'init-chip-x', title: 'Remove condition',
      onclick: () => commit((s) => removeCondition(s, combatantId, index)),
    }, '×'),
  );
}

/** Hidden-by-default inline form to add a condition to a combatant. */
function conditionForm(combatantId) {
  const cname = el('input', {
    type: 'text', class: 'init-cond-name', placeholder: 'Condition', 'aria-label': 'Condition name',
    autocomplete: 'off', spellcheck: 'false',
  });
  const crounds = el('input', {
    type: 'number', class: 'init-cond-rounds', placeholder: 'Rds', 'aria-label': 'Duration in rounds',
    min: '1', inputmode: 'numeric',
  });
  const submit = () => {
    commit((s) => addCondition(s, combatantId, { name: cname.value, rounds: crounds.value }));
    // render() replaces the DOM, so no need to clear these inputs.
  };
  const form = el('div', { class: 'init-cond-form' },
    cname, crounds,
    el('button', { class: 'btn btn-small', onclick: submit }, 'Add'),
  );
  cname.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
  crounds.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
  return form;
}

/** Reveal the condition form for the row the "+ Cond" button lives in. */
function toggleCondForm(btn) {
  const form = btn.closest('.init-row').querySelector('.init-cond-form');
  const open = form.classList.toggle('open');
  if (open) form.querySelector('.init-cond-name').focus();
}

// --- export / import -------------------------------------------------------

function exportEncounter() {
  const now = new Date();
  download(snapshotFilename(KEY, now), JSON.stringify(buildSnapshot(KEY, state, now), null, 2));
  toast('Encounter exported');
}

function importEncounter(file) {
  const reader = new FileReader();
  reader.onerror = () => toast('Could not read that file');
  reader.onload = () => {
    const result = parseSnapshot(String(reader.result), KEY);
    if (!result.ok) return toast(`Import failed — ${result.error}`);
    if (state.combatants.length && !confirm('Replace the current encounter with the imported one?')) return;
    // parseSnapshot ran isValidEncounter, so this is safe to adopt as state.
    state = result.data;
    if (store.set(KEY, state)) showStorageNoticeOnce(store);
    render();
    const n = state.combatants.length;
    toast(`Imported ${n} combatant${n === 1 ? '' : 's'}`);
  };
  reader.readAsText(file);
}

// --- wiring ----------------------------------------------------------------

addForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!nameInput.value.trim()) return;
  commit((s) => addCombatant(s, { id: uid(), name: nameInput.value, initiative: initInput.value }));
  nameInput.value = '';
  initInput.value = '';
  nameInput.focus();
});

document.getElementById('sort-btn').addEventListener('click', () => commit(sortByInitiative));
document.getElementById('next-btn').addEventListener('click', () => commit(nextTurn));
document.getElementById('prev-btn').addEventListener('click', () => commit(prevTurn));
document.getElementById('reset-btn').addEventListener('click', () => {
  if (state.combatants.length && !confirm('Clear the whole encounter?')) return;
  commit(() => createEncounter());
});

document.getElementById('export-btn').addEventListener('click', exportEncounter);
document.getElementById('import-btn').addEventListener('click', () =>
  document.getElementById('import-input').click());
document.getElementById('import-input').addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (file) importEncounter(file);
  e.target.value = ''; // let the same file be re-imported
});

render();
nameInput.focus();
