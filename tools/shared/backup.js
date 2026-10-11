/**
 * Export/import envelopes for everything this site keeps in localStorage,
 * at two scopes: a single tool's state (`buildSnapshot`/`parseSnapshot`) and
 * the whole `th:` namespace (`buildBackup`/`parseBackup`/`restorePlan`).
 *
 * Pure: no DOM, no localStorage, no clock — callers pass `now`. Imports are
 * validated through the same shape guards the tools use when loading from
 * storage, so a parsed result is always safe to adopt as state.
 */

import { isValidEncounter } from './encounter.js';
import { isValidBook } from './scoresheet.js';
import { isValidGame } from './timer.js';
import { KEY_PREFIX } from './store.js';

/** Bump only for a breaking envelope change; a higher version is refused. */
export const SNAPSHOT_VERSION = 1;

/** The envelope's discriminator field. */
const FIELD = 'tabletophacks';

/** Value of `tabletophacks` for a whole-origin backup. */
export const BACKUP_KIND = 'backup';

/**
 * Every exportable tool state: its `store.js` name, a noun and article for
 * messages, the tool that owns it (so a mismatch can say where the file
 * belongs), and the guard that decides whether imported data is usable.
 */
export const SNAPSHOT_KINDS = {
  encounter: {
    key: 'encounter',
    label: 'encounter',
    article: 'an',
    tool: 'Initiative Tracker',
    isValid: isValidEncounter,
  },
  score: {
    key: 'score',
    label: 'score sheets',
    article: 'a',
    tool: 'Score Tracker',
    isValid: isValidBook,
  },
  timer: {
    key: 'timer',
    label: 'turn timer',
    article: 'a',
    tool: 'Turn Timer',
    isValid: isValidGame,
  },
};

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** `YYYY-MM-DD` in UTC, for filenames. */
export function isoDay(now) {
  return new Date(now).toISOString().slice(0, 10);
}

// ── Per-tool snapshots ──────────────────────────────────────────────────────

/**
 * @param {string} kind a key of SNAPSHOT_KINDS
 * @param {unknown} data the tool's state, as stored
 * @param {Date|number|string} now
 */
export function buildSnapshot(kind, data, now) {
  if (!Object.hasOwn(SNAPSHOT_KINDS, kind)) {
    throw new Error(`unknown snapshot kind: ${kind}`);
  }
  return {
    [FIELD]: kind,
    version: SNAPSHOT_VERSION,
    exportedAt: new Date(now).toISOString(),
    data,
  };
}

export function snapshotFilename(kind, now) {
  return `tabletophacks-${kind}-${isoDay(now)}.json`;
}

/**
 * Shared early checks for both envelope scopes: parseable JSON, an object, and
 * a `tabletophacks` field.
 * @returns {{ ok: true, envelope: object } | { ok: false, error: string }}
 */
function openEnvelope(source) {
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch {
    return { ok: false, error: 'not valid JSON — the file may be truncated, or not an export at all' };
  }
  if (!isPlainObject(parsed) || typeof parsed[FIELD] !== 'string') {
    return { ok: false, error: 'this is not a Tabletop Hacks export file' };
  }
  return { ok: true, envelope: parsed };
}

/** A version newer than this build cannot be read safely. */
function versionError(envelope) {
  const version = envelope.version;
  if (typeof version === 'number' && version > SNAPSHOT_VERSION) {
    return 'this export was made by a newer version of the site';
  }
  return null;
}

/**
 * @param {string} source file contents
 * @param {string} expectedKind the kind the importing tool can accept
 * @returns {{ ok: true, kind: string, data: unknown, exportedAt: unknown }
 *          | { ok: false, error: string }}
 */
export function parseSnapshot(source, expectedKind) {
  const expected = SNAPSHOT_KINDS[expectedKind];
  if (!expected) return { ok: false, error: `unknown snapshot kind: ${expectedKind}` };

  const opened = openEnvelope(source);
  if (!opened.ok) return opened;
  const envelope = opened.envelope;

  const kind = envelope[FIELD];
  const found = SNAPSHOT_KINDS[kind];
  if (!found) {
    return { ok: false, error: `this export is of an unrecognised kind (${kind})` };
  }
  if (kind !== expectedKind) {
    return {
      ok: false,
      error: `this is ${found.article} ${found.label} export — open it in the ${found.tool} instead`,
    };
  }

  const stale = versionError(envelope);
  if (stale) return { ok: false, error: stale };

  if (!('data' in envelope) || !found.isValid(envelope.data)) {
    return { ok: false, error: `the ${found.label} data in this file is incomplete or damaged` };
  }

  return { ok: true, kind, data: envelope.data, exportedAt: envelope.exportedAt };
}

// ── Whole-origin backup ─────────────────────────────────────────────────────

export function backupFilename(now) {
  return `tabletophacks-${BACKUP_KIND}-${isoDay(now)}.json`;
}

/**
 * Every `th:` key in one envelope. Values stay **raw strings** rather than
 * parsed JSON: parsing would read better in an editor but makes restore
 * ambiguous (a stored string `"x"` and a corrupt raw `x` both come back as
 * `x`), and a value that is not JSON at all could not round-trip. A backup's
 * one job is to be lossless.
 * @param {Iterable<[string, string]>} entries from storageEntries()
 * @param {Date|number|string} now
 */
export function buildBackup(entries, now) {
  const keys = {};
  for (const [key, value] of entries) {
    if (typeof key === 'string' && key.startsWith(KEY_PREFIX)) {
      keys[key] = String(value);
    }
  }
  return {
    [FIELD]: BACKUP_KIND,
    version: SNAPSHOT_VERSION,
    exportedAt: new Date(now).toISOString(),
    keys,
  };
}

/**
 * @param {string} source file contents
 * @returns {{ ok: true, keys: Record<string, string>, exportedAt: unknown }
 *          | { ok: false, error: string }}
 */
export function parseBackup(source) {
  const opened = openEnvelope(source);
  if (!opened.ok) return opened;
  const envelope = opened.envelope;

  if (envelope[FIELD] !== BACKUP_KIND) {
    const kind = SNAPSHOT_KINDS[envelope[FIELD]];
    return {
      ok: false,
      error: kind
        ? `this is ${kind.article} ${kind.label} export, not a full backup — ` +
          `open it in the ${kind.tool} instead`
        : 'this is not a full backup file',
    };
  }

  const stale = versionError(envelope);
  if (stale) return { ok: false, error: stale };

  const keys = envelope.keys;
  if (!isPlainObject(keys)) {
    return { ok: false, error: 'this backup is damaged — it has no stored values' };
  }
  for (const [key, value] of Object.entries(keys)) {
    if (!key.startsWith(KEY_PREFIX)) {
      return {
        ok: false,
        error: `this backup contains a key outside this site's storage (${key}); ` +
          `expected every key to start with "${KEY_PREFIX}"`,
      };
    }
    if (typeof value !== 'string') {
      return { ok: false, error: `this backup is damaged — the value for ${key} is not text` };
    }
  }

  return { ok: true, keys, exportedAt: envelope.exportedAt };
}

/**
 * What a restore would do, so the UI can say it before doing it. Keys in
 * storage but absent from the file are reported as `unaffected` and left
 * alone: a restore puts back what the backup covered, it does not wipe what
 * it did not.
 * @param {Iterable<[string, string]>} existingEntries
 * @param {Record<string, string>} incomingKeys
 * @returns {{ writes: [string, string][], replaced: string[], added: string[],
 *             unaffected: string[] }}
 */
export function restorePlan(existingEntries, incomingKeys) {
  const existing = new Set();
  for (const [key] of existingEntries) {
    if (typeof key === 'string' && key.startsWith(KEY_PREFIX)) existing.add(key);
  }
  const writes = [];
  const replaced = [];
  const added = [];
  for (const [key, value] of Object.entries(incomingKeys)) {
    writes.push([key, value]);
    (existing.has(key) ? replaced : added).push(key);
  }
  const incoming = new Set(Object.keys(incomingKeys));
  const unaffected = [...existing].filter((key) => !incoming.has(key));
  return { writes, replaced, added, unaffected };
}
