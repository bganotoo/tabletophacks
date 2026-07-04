/** Game Timer: thin DOM wiring over tools/shared/timer.js. No logic worth
 *  testing lives here — the chess-clock state machine is tested in
 *  timer.test.js. The only clock reads are Date.now(); the pure module computes
 *  everything from those timestamps, so a repaint tick can never corrupt state. */

import {
  createGame,
  addPlayer,
  removePlayer,
  renamePlayer,
  movePlayer,
  setPerTurn,
  toggle,
  passTurn,
  resetTurn,
  turnElapsedMs,
  turnRemainingMs,
  isExpired,
  playerTotalMs,
  isValidGame,
  formatClock,
  formatCountdown,
  TimerError,
} from '../shared/timer.js';
import { el, clearNode, toast, uid } from '../shared/ui.js';
import { createStore } from '../shared/store.js';

const store = createStore();
const KEY = 'timer';
const SOUND_KEY = 'timer-sound';

const clock = document.getElementById('clock');
const roundNum = document.getElementById('round-num');
const activeName = document.getElementById('active-name');
const readout = document.getElementById('readout');
const readoutLabel = document.getElementById('readout-label');
const toggleBtn = document.getElementById('toggle-btn');
const perTurnInput = document.getElementById('per-turn');
const soundToggle = document.getElementById('sound-toggle');
const addForm = document.getElementById('add-form');
const nameInput = document.getElementById('add-name');
const list = document.getElementById('player-list');

let state = store.get(KEY, null);
if (!isValidGame(state)) state = createGame();

soundToggle.checked = store.get(SOUND_KEY, true) !== false;

/** Per-player live-total spans, rebuilt on each full render and updated by the
 *  repaint tick without touching the row structure (so name inputs keep focus). */
const totalEls = new Map();

/** Was the active turn already expired last tick? Guards the one-shot beep so we
 *  chime on the crossing, not on every frame after. Seed from current state so a
 *  reload into an already-expired turn doesn't beep. */
let wasExpired = isExpired(state, Date.now());

/** Apply a state transition, persist, and repaint. Wraps TimerError. */
function commit(fn) {
  try {
    state = fn(state);
  } catch (err) {
    if (err instanceof TimerError) return toast(err.message);
    throw err;
  }
  store.set(KEY, state);
  wasExpired = isExpired(state, Date.now());
  render();
}

/** Full structural render — rows and static fields. */
function render() {
  perTurnInput.value = state.perTurnMs === null ? '' : String(Math.round(state.perTurnMs / 1000));
  toggleBtn.textContent = state.running ? 'Pause' : 'Start';

  clearNode(list);
  totalEls.clear();
  if (!state.players.length) {
    list.append(el('li', { class: 'placeholder timer-empty' }, 'No players yet — add someone to start the clock.'));
  } else {
    state.players.forEach((p, i) => list.append(playerRow(p, i === state.activeIndex)));
  }
  paint();
}

/** One player row: editable name, live total, and controls. */
function playerRow(p, isActive) {
  const name = el('input', {
    type: 'text', class: 'timer-pname', value: p.name, 'aria-label': 'Player name',
    autocomplete: 'off', spellcheck: 'false',
  });
  name.addEventListener('change', () => commit((s) => renamePlayer(s, p.id, name.value)));
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') name.blur(); });

  const total = el('span', { class: 'timer-ptotal', title: 'Total time on turns' }, '0:00');
  totalEls.set(p.id, total);

  const controls = el('span', { class: 'timer-pcontrols' },
    el('button', { class: 'btn btn-small', title: 'Move up', onclick: () => commit((s) => movePlayer(s, p.id, -1)) }, '↑'),
    el('button', { class: 'btn btn-small', title: 'Move down', onclick: () => commit((s) => movePlayer(s, p.id, 1)) }, '↓'),
    el('button', { class: 'btn btn-small btn-danger', title: 'Remove player', onclick: () => commit((s) => removePlayer(s, p.id)) }, '✕'),
  );

  return el('li', { class: `timer-prow${isActive ? ' active' : ''}` }, name, total, controls);
}

/** Cheap repaint of everything time-derived. No state change, no persist — safe
 *  to run on a throttled/background interval. */
function paint() {
  const now = Date.now();
  roundNum.textContent = String(state.round);

  const active = state.players[state.activeIndex] ?? null;
  activeName.textContent = active ? active.name : '—';

  const remaining = turnRemainingMs(state, now);
  if (remaining === null) {
    readout.textContent = formatClock(turnElapsedMs(state, now));
    readoutLabel.textContent = 'elapsed';
  } else {
    readout.textContent = formatCountdown(remaining);
    readoutLabel.textContent = 'remaining';
  }

  const expired = isExpired(state, now);
  clock.classList.toggle('over', expired);
  if (expired && !wasExpired && state.running && soundToggle.checked) beep();
  wasExpired = expired;

  for (const [id, node] of totalEls) node.textContent = formatClock(playerTotalMs(state, id, now));
}

// --- alert sound (WebAudio, no external asset) -----------------------------

let audioCtx = null;
function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, audioCtx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.35);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.36);
  } catch {
    /* audio unavailable — the visual `over` state still fires */
  }
}

// --- wiring ----------------------------------------------------------------

document.getElementById('pass-btn').addEventListener('click', () => commit((s) => passTurn(s, Date.now())));
toggleBtn.addEventListener('click', () => commit((s) => toggle(s, Date.now())));
document.getElementById('reset-turn-btn').addEventListener('click', () => commit((s) => resetTurn(s, Date.now())));
document.getElementById('reset-btn').addEventListener('click', () => {
  if (state.players.length && !confirm('Clear the whole game?')) return;
  commit(() => createGame({ perTurnMs: state.perTurnMs }));
});

perTurnInput.addEventListener('change', () => commit((s) => setPerTurn(s, perTurnInput.value)));

soundToggle.addEventListener('change', () => store.set(SOUND_KEY, soundToggle.checked));

addForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!nameInput.value.trim()) return;
  commit((s) => addPlayer(s, { id: uid(), name: nameInput.value }));
  nameInput.value = '';
  nameInput.focus();
});

render();
setInterval(paint, 250);
