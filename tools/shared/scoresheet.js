/** Score Tracker state machine. Pure and immutable: every function takes a
 *  state and returns a NEW state, never mutating its input. No DOM, no storage,
 *  no id generation — the app supplies ids and persists the returned state.
 *
 *  Two layers live here. BOOK-level functions manage the collection of sheets
 *  and which one is open (`activeId`); they take explicit sheet ids. SHEET-level
 *  functions edit THE ACTIVE SHEET implicitly (the app only ever edits the sheet
 *  the user is looking at) and no-op when there is no active sheet.
 *
 *  A sheet is a grid of players (rows) x columns, with a sparse `scores` map
 *  (playerId -> columnId -> number); absent cells read as 0.
 *  See docs/superpowers/specs/2026-07-04-score-tracker-design.md */

/** Thrown for invalid input (blank name, non-numeric score). Mirrors TimerError. */
export class ScoreError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ScoreError';
  }
}

/** A fresh, empty book with no sheets and nothing active. */
export function createBook() {
  return { activeId: null, sheets: [] };
}

/** Trim and require a name. @returns {string} */
function cleanName(name, what = 'name') {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) throw new ScoreError(`${what} cannot be blank`);
  return trimmed;
}

/** Trim a name, falling back to `fallback` when blank/absent (no throw). */
function nameOr(name, fallback) {
  const trimmed = String(name ?? '').trim();
  return trimmed || fallback;
}

// --- book level ------------------------------------------------------------

/** Append a fresh empty sheet and make it active. Blank name → "Sheet N". */
export function createSheet(state, { id, name }) {
  const sheet = {
    id,
    name: nameOr(name, `Sheet ${state.sheets.length + 1}`),
    players: [],
    columns: [],
    scores: {},
  };
  return { activeId: id, sheets: [...state.sheets, sheet] };
}

export function renameSheet(state, id, name) {
  const clean = cleanName(name);
  return { ...state, sheets: state.sheets.map((sh) => (sh.id === id ? { ...sh, name: clean } : sh)) };
}

/** Drop a sheet. If it was active, activeId moves to the neighbor at the
 *  clamped index, or null when none remain. */
export function removeSheet(state, id) {
  const sheets = state.sheets.filter((sh) => sh.id !== id);
  if (state.activeId !== id) return { ...state, sheets };
  const removedAt = state.sheets.findIndex((sh) => sh.id === id);
  const next = sheets[Math.min(removedAt, sheets.length - 1)];
  return { activeId: next ? next.id : null, sheets };
}

/** Set the open sheet to `id` if it exists; otherwise unchanged. */
export function selectSheet(state, id) {
  if (!state.sheets.some((sh) => sh.id === id)) return state;
  return { ...state, activeId: id };
}

/** @returns {object|null} the open sheet, or null when none is active. */
export function activeSheet(state) {
  return state.sheets.find((sh) => sh.id === state.activeId) ?? null;
}

// --- sheet level (operate on the active sheet; no-op when none) -------------

/** Replace the active sheet with `fn(sheet)`. No-op when nothing is active. */
function withActive(state, fn) {
  const active = activeSheet(state);
  if (!active) return state;
  return { ...state, sheets: state.sheets.map((sh) => (sh.id === active.id ? fn(sh) : sh)) };
}

export function addPlayer(state, { id, name }) {
  const player = { id, name: cleanName(name) };
  return withActive(state, (sh) => ({ ...sh, players: [...sh.players, player] }));
}

export function renamePlayer(state, id, name) {
  const clean = cleanName(name);
  return withActive(state, (sh) => ({
    ...sh,
    players: sh.players.map((p) => (p.id === id ? { ...p, name: clean } : p)),
  }));
}

/** Move a player by ±1 (swap with its neighbor). No-op at the ends. */
export function movePlayer(state, id, delta) {
  return withActive(state, (sh) => ({ ...sh, players: swap(sh.players, id, delta) }));
}

/** Drop a player and prune its row from `scores`. */
export function removePlayer(state, id) {
  return withActive(state, (sh) => {
    const { [id]: _gone, ...scores } = sh.scores;
    return { ...sh, players: sh.players.filter((p) => p.id !== id), scores };
  });
}

export function addColumn(state, { id, name }) {
  return withActive(state, (sh) => ({
    ...sh,
    columns: [...sh.columns, { id, name: nameOr(name, `Round ${sh.columns.length + 1}`) }],
  }));
}

export function renameColumn(state, id, name) {
  const clean = cleanName(name);
  return withActive(state, (sh) => ({
    ...sh,
    columns: sh.columns.map((c) => (c.id === id ? { ...c, name: clean } : c)),
  }));
}

/** Move a column by ±1 (swap with its neighbor). No-op at the ends. */
export function moveColumn(state, id, delta) {
  return withActive(state, (sh) => ({ ...sh, columns: swap(sh.columns, id, delta) }));
}

/** Drop a column and prune it from every player's row in `scores`. */
export function removeColumn(state, id) {
  return withActive(state, (sh) => {
    const scores = {};
    for (const [pid, row] of Object.entries(sh.scores)) {
      const { [id]: _gone, ...rest } = row;
      scores[pid] = rest;
    }
    return { ...sh, columns: sh.columns.filter((c) => c.id !== id), scores };
  });
}

/** Set one cell on the active sheet. Blank/null/undefined clears it (removed
 *  from the map). Otherwise coerced with Number; non-finite throws ScoreError.
 *  Negatives and fractions are allowed. No-op for an unknown player/column. */
export function setScore(state, playerId, columnId, value) {
  const clear = value === null || value === undefined || String(value).trim() === '';
  let n = null;
  if (!clear) {
    n = Number(value);
    if (!Number.isFinite(n)) throw new ScoreError('score must be a number');
  }
  return withActive(state, (sh) => {
    const knownPlayer = sh.players.some((p) => p.id === playerId);
    const knownColumn = sh.columns.some((c) => c.id === columnId);
    if (!knownPlayer || !knownColumn) return sh;
    const row = { ...(sh.scores[playerId] ?? {}) };
    if (clear) delete row[columnId];
    else row[columnId] = n;
    return { ...sh, scores: { ...sh.scores, [playerId]: row } };
  });
}

// --- pure reads (take a SHEET, not the book) -------------------------------

/** A cell's value, or 0 when absent. */
export function cellValue(sheet, playerId, columnId) {
  return sheet.scores[playerId]?.[columnId] ?? 0;
}

/** Sum of a player's row across all columns (absent cells count as 0). */
export function playerTotal(sheet, playerId) {
  return sheet.columns.reduce((sum, c) => sum + cellValue(sheet, playerId, c.id), 0);
}

/** The player id(s) tied for the highest total. Empty when there are no players.
 *  A fresh (all-zero) sheet returns every player, tied at 0 — the app only
 *  styles a leader once some score is non-zero. */
export function leaderIds(sheet) {
  if (!sheet.players.length) return [];
  const totals = sheet.players.map((p) => ({ id: p.id, total: playerTotal(sheet, p.id) }));
  const max = Math.max(...totals.map((t) => t.total));
  return totals.filter((t) => t.total === max).map((t) => t.id);
}

/** Swap the item with id `id` with its ±1 neighbor. Returns a new array;
 *  returns a copy unchanged when at the corresponding end. */
function swap(list, id, delta) {
  const copy = list.slice();
  const i = copy.findIndex((x) => x.id === id);
  const j = i + Math.sign(delta);
  if (i < 0 || j < 0 || j >= copy.length) return copy;
  [copy[i], copy[j]] = [copy[j], copy[i]];
  return copy;
}

// --- guard -----------------------------------------------------------------

/** Shape guard for loading possibly-stale/corrupt data from storage. */
export function isValidBook(value) {
  if (!value || typeof value !== 'object') return false;
  if (!('activeId' in value) || (value.activeId !== null && typeof value.activeId !== 'string')) return false;
  if (!Array.isArray(value.sheets)) return false;
  return value.sheets.every(
    (sh) =>
      sh &&
      typeof sh === 'object' &&
      typeof sh.id === 'string' &&
      typeof sh.name === 'string' &&
      Array.isArray(sh.players) &&
      sh.players.every((p) => p && typeof p.id === 'string' && typeof p.name === 'string') &&
      Array.isArray(sh.columns) &&
      sh.columns.every((c) => c && typeof c.id === 'string' && typeof c.name === 'string') &&
      sh.scores !== null &&
      typeof sh.scores === 'object' &&
      !Array.isArray(sh.scores),
  );
}
