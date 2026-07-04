/** Game Timer chess-clock state machine. Pure and immutable: every function
 *  returns a NEW state, never mutating its input, and every timing function
 *  takes an explicit `now` (epoch ms) rather than reading the real clock. The
 *  app supplies ids and `Date.now()` and persists the returned state. Remaining
 *  time is COMPUTED from timestamps, never stored as a decrementing number, so
 *  the clock survives tab-switching and reloads.
 *  See docs/superpowers/specs/2026-07-04-game-timer-design.md */

/** Thrown for invalid input (blank name, bad budget). Mirrors EncounterError. */
export class TimerError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TimerError';
  }
}

const DEFAULT_PER_TURN_MS = 60000;

/** A fresh, paused game in round 1. */
export function createGame({ players = [], perTurnMs = DEFAULT_PER_TURN_MS } = {}) {
  return {
    round: 1,
    activeIndex: 0,
    perTurnMs,
    running: false,
    turnStartedAt: null,
    turnElapsedBeforePause: 0,
    players: players.map((p) => ({ id: p.id, name: p.name, totalMs: p.totalMs ?? 0 })),
  };
}

/** @returns {string|null} the id of the active player, or null when empty. */
function activeId(state) {
  return state.players[state.activeIndex]?.id ?? null;
}

/** Clone `players`, apply `fn`, and locate the previously-active player in the
 *  result. Returns the new list plus `found`, the index of the active player or
 *  -1 if it's gone (removed, or there was none — e.g. the first add). Callers
 *  that keep the active player alive clamp `found`; removePlayer uses -1 to
 *  detect that the active player itself went away. */
function reindex(state, fn) {
  const keepId = activeId(state);
  const players = fn(state.players.slice());
  return { players, found: players.findIndex((p) => p.id === keepId) };
}

/** Clamp a possibly-missing active index into range (0 when empty). */
function clampIndex(found, fallback, length) {
  if (found >= 0) return found;
  return length ? Math.min(fallback, length - 1) : 0;
}

/** Trim and require a name. @returns {string} */
function cleanName(name) {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) throw new TimerError('name cannot be blank');
  return trimmed;
}

export function addPlayer(state, { id, name }) {
  const player = { id, name: cleanName(name), totalMs: 0 };
  const { players, found } = reindex(state, (list) => [...list, player]);
  return { ...state, players, activeIndex: clampIndex(found, state.activeIndex, players.length) };
}

export function renamePlayer(state, id, name) {
  const clean = cleanName(name);
  return {
    ...state,
    players: state.players.map((p) => (p.id === id ? { ...p, name: clean } : p)),
  };
}

/** Move a player by ±1 (swap with its neighbour). No-op at the ends. */
export function movePlayer(state, id, delta) {
  const { players, found } = reindex(state, (list) => {
    const i = list.findIndex((p) => p.id === id);
    const j = i + Math.sign(delta);
    if (i < 0 || j < 0 || j >= list.length) return list;
    [list[i], list[j]] = [list[j], list[i]];
    return list;
  });
  return { ...state, players, activeIndex: clampIndex(found, state.activeIndex, players.length) };
}

/** Remove a player. Removing a non-active player leaves the running clock and
 *  the active player untouched; removing the active player clamps the index and
 *  resets the current turn to a fresh, paused clock. */
export function removePlayer(state, id) {
  const { players, found } = reindex(state, (list) => list.filter((p) => p.id !== id));
  if (found >= 0) {
    return { ...state, players, activeIndex: found }; // active player survived
  }
  // The active player was removed: clamp and start a fresh paused turn.
  return {
    ...state,
    players,
    activeIndex: clampIndex(found, state.activeIndex, players.length),
    running: false,
    turnStartedAt: null,
    turnElapsedBeforePause: 0,
  };
}

/** Set the per-turn budget from a seconds value. Positive → ms; 0/blank/null →
 *  untimed (null); negative or non-finite throws. */
export function setPerTurn(state, seconds) {
  if (seconds === null || seconds === undefined || String(seconds).trim() === '') {
    return { ...state, perTurnMs: null };
  }
  const n = Number(seconds);
  if (!Number.isFinite(n) || n < 0) {
    throw new TimerError('time per turn must be zero or a positive number of seconds');
  }
  return { ...state, perTurnMs: n === 0 ? null : Math.round(n * 1000) };
}

/** Resume the active clock. No-op if already running or the roster is empty. */
export function start(state, now) {
  if (state.running || !state.players.length) return state;
  return { ...state, running: true, turnStartedAt: now };
}

/** Pause the active clock, folding the live interval into elapsed-before-pause.
 *  No-op if already paused. */
export function pause(state, now) {
  if (!state.running) return state;
  return {
    ...state,
    running: false,
    turnStartedAt: null,
    turnElapsedBeforePause: turnElapsedMs(state, now),
  };
}

/** Pause when running, else start. */
export function toggle(state, now) {
  return state.running ? pause(state, now) : start(state, now);
}

/** Elapsed time on the current turn, computed from timestamps. */
export function turnElapsedMs(state, now) {
  const live = state.running && state.turnStartedAt !== null ? now - state.turnStartedAt : 0;
  return state.turnElapsedBeforePause + live;
}

/** Remaining time on the current turn (may be negative), or null when untimed. */
export function turnRemainingMs(state, now) {
  if (state.perTurnMs === null) return null;
  return state.perTurnMs - turnElapsedMs(state, now);
}

/** True when the turn is timed and its time is up (remaining <= 0). */
export function isExpired(state, now) {
  const remaining = turnRemainingMs(state, now);
  return remaining !== null && remaining <= 0;
}

/** Start a fresh per-turn clock, preserving the current running state. */
function freshTurn(state, now) {
  return {
    turnElapsedBeforePause: 0,
    turnStartedAt: state.running ? now : null,
  };
}

/** Hand off to the next player: bank the current turn onto the active player,
 *  advance (wrapping increments the round), and start a fresh clock. No-op on
 *  an empty roster. */
export function passTurn(state, now) {
  if (!state.players.length) return state;
  const elapsed = turnElapsedMs(state, now);
  const players = state.players.map((p, i) =>
    i === state.activeIndex ? { ...p, totalMs: p.totalMs + elapsed } : p,
  );
  const nextIndex = state.activeIndex + 1;
  const wrapped = nextIndex >= players.length;
  return {
    ...state,
    players,
    activeIndex: wrapped ? 0 : nextIndex,
    round: wrapped ? state.round + 1 : state.round,
    ...freshTurn(state, now),
  };
}

/** Restart the active player's per-turn clock, discarding (not banking) the
 *  current turn's elapsed. Keeps the running state. No-op on an empty roster. */
export function resetTurn(state, now) {
  if (!state.players.length) return state;
  return { ...state, ...freshTurn(state, now) };
}

/** A player's banked total, plus their live current turn if they're active. */
export function playerTotalMs(state, id, now) {
  const player = state.players.find((p) => p.id === id);
  if (!player) return 0;
  const live = player.id === activeId(state) ? turnElapsedMs(state, now) : 0;
  return player.totalMs + live;
}

/** Format signed milliseconds as "M:SS" (with a leading "-" below zero). */
function mmss(ms, secs) {
  return `${ms < 0 ? '-' : ''}${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

/** Count-UP display (elapsed, player totals): floor to whole seconds, so a
 *  fresh second reads as its lower bound for that second's full duration. */
export function formatClock(ms) {
  return mmss(ms, Math.floor(Math.abs(ms) / 1000));
}

/** Count-DOWN display (time remaining): ceil the positive part so the top of
 *  the budget stays on screen for the whole first second and "0:00" appears
 *  only at exact expiry — otherwise a full turn flashes to 0:59 instantly. At
 *  and below zero, overtime counts up (floor) with a minus sign. */
export function formatCountdown(ms) {
  if (ms <= 0) return formatClock(ms);
  return mmss(ms, Math.ceil(ms / 1000));
}

/** Shape guard for loading possibly-stale/corrupt data from storage. */
export function isValidGame(value) {
  if (!value || typeof value !== 'object') return false;
  if (typeof value.round !== 'number' || typeof value.activeIndex !== 'number') return false;
  if (value.perTurnMs !== null && typeof value.perTurnMs !== 'number') return false;
  if (typeof value.running !== 'boolean') return false;
  if (value.turnStartedAt !== null && typeof value.turnStartedAt !== 'number') return false;
  if (typeof value.turnElapsedBeforePause !== 'number') return false;
  if (!Array.isArray(value.players)) return false;
  return value.players.every(
    (p) =>
      p &&
      typeof p === 'object' &&
      typeof p.id === 'string' &&
      typeof p.name === 'string' &&
      typeof p.totalMs === 'number',
  );
}
