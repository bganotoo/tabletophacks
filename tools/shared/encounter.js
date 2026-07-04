/** Initiative Tracker encounter state machine. Pure and immutable: every
 *  function takes a state and returns a NEW state, never mutating its input.
 *  No DOM, no storage, no id generation, no clock — the app supplies ids and
 *  persists the returned state. See docs/superpowers/specs/2026-07-04-initiative-tracker-design.md */

/** Thrown for invalid input (blank name, bad duration). Mirrors DiceError. */
export class EncounterError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EncounterError';
  }
}

/** A fresh, empty encounter, in round 1 with no combatants. */
export function createEncounter() {
  return { round: 1, turnIndex: 0, combatants: [] };
}

/** @returns {string|null} the id of whose turn it is, or null when empty. */
function currentId(state) {
  return state.combatants[state.turnIndex]?.id ?? null;
}

/** Clone `combatants`, apply `fn`, and recompute turnIndex so the same
 *  combatant stays current (clamped into range if it's gone / list empty). */
function withCombatants(state, fn) {
  const keepId = currentId(state);
  const combatants = fn(state.combatants.slice());
  let turnIndex = combatants.findIndex((c) => c.id === keepId);
  if (turnIndex < 0) {
    turnIndex = combatants.length ? Math.min(state.turnIndex, combatants.length - 1) : 0;
  }
  return { ...state, combatants, turnIndex };
}

/** Trim and require a name. @returns {string} */
function cleanName(name, what = 'name') {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) throw new EncounterError(`${what} cannot be blank`);
  return trimmed;
}

/** Coerce initiative to a finite number, or null when blank/absent. */
function cleanInitiative(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function addCombatant(state, { id, name, initiative }) {
  const combatant = { id, name: cleanName(name), initiative: cleanInitiative(initiative), conditions: [] };
  return withCombatants(state, (list) => [...list, combatant]);
}

export function updateCombatant(state, id, patch) {
  return withCombatants(state, (list) =>
    list.map((c) => {
      if (c.id !== id) return c;
      const next = { ...c };
      if ('name' in patch) next.name = cleanName(patch.name);
      if ('initiative' in patch) next.initiative = cleanInitiative(patch.initiative);
      return next;
    }),
  );
}

export function removeCombatant(state, id) {
  return withCombatants(state, (list) => list.filter((c) => c.id !== id));
}

/** Move a combatant by ±1 (swap with its neighbor). No-op at the ends. */
export function moveCombatant(state, id, delta) {
  return withCombatants(state, (list) => {
    const i = list.findIndex((c) => c.id === id);
    const j = i + Math.sign(delta);
    if (i < 0 || j < 0 || j >= list.length) return list;
    [list[i], list[j]] = [list[j], list[i]];
    return list;
  });
}

/** Stable sort by initiative descending; null (unset) sorts last. */
export function sortByInitiative(state) {
  return withCombatants(state, (list) =>
    list
      .map((c, i) => ({ c, i }))
      .sort((a, b) => {
        const av = a.c.initiative;
        const bv = b.c.initiative;
        if (av === bv) return a.i - b.i; // stable on ties (incl. null === null)
        if (av === null) return 1;
        if (bv === null) return -1;
        return bv - av;
      })
      .map((x) => x.c),
  );
}

/** Advance the turn pointer. Wrapping past the last combatant starts a new
 *  round and ticks every condition down. No-op on an empty encounter. */
export function nextTurn(state) {
  if (!state.combatants.length) return state;
  const nextIndex = state.turnIndex + 1;
  if (nextIndex < state.combatants.length) {
    return { ...state, turnIndex: nextIndex };
  }
  return tickConditions({ ...state, turnIndex: 0, round: state.round + 1 });
}

/** Step the turn pointer back, for correcting a misclick. Wrapping before the
 *  first combatant returns to the last and decrements the round (floored at 1).
 *  Does not restore conditions ticked down by a prior nextTurn. No-op empty. */
export function prevTurn(state) {
  if (!state.combatants.length) return state;
  if (state.turnIndex > 0) {
    return { ...state, turnIndex: state.turnIndex - 1 };
  }
  return { ...state, turnIndex: state.combatants.length - 1, round: Math.max(1, state.round - 1) };
}

/** Coerce a condition duration to a positive integer, or null (indefinite). */
function cleanRounds(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new EncounterError('duration must be a positive whole number of rounds');
  }
  return n;
}

export function addCondition(state, id, { name, rounds }) {
  const condition = { name: cleanName(name, 'condition name'), rounds: cleanRounds(rounds) };
  return mapCombatant(state, id, (c) => ({ ...c, conditions: [...c.conditions, condition] }));
}

export function removeCondition(state, id, index) {
  return mapCombatant(state, id, (c) => ({
    ...c,
    conditions: c.conditions.filter((_, i) => i !== index),
  }));
}

/** Decrement every finite condition duration by 1, dropping any that reach 0.
 *  Indefinite (null) conditions are left untouched. */
export function tickConditions(state) {
  return {
    ...state,
    combatants: state.combatants.map((c) => ({
      ...c,
      conditions: c.conditions
        .map((cond) => (cond.rounds === null ? cond : { ...cond, rounds: cond.rounds - 1 }))
        .filter((cond) => cond.rounds === null || cond.rounds > 0),
    })),
  };
}

/** Replace one combatant by id, leaving turnIndex/round alone. */
function mapCombatant(state, id, fn) {
  return { ...state, combatants: state.combatants.map((c) => (c.id === id ? fn(c) : c)) };
}

/** Shape guard for loading possibly-stale/corrupt data from storage. */
export function isValidEncounter(value) {
  if (!value || typeof value !== 'object') return false;
  if (typeof value.round !== 'number' || typeof value.turnIndex !== 'number') return false;
  if (!Array.isArray(value.combatants)) return false;
  return value.combatants.every(
    (c) =>
      c &&
      typeof c === 'object' &&
      typeof c.id === 'string' &&
      typeof c.name === 'string' &&
      (c.initiative === null || typeof c.initiative === 'number') &&
      Array.isArray(c.conditions),
  );
}
