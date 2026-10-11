/**
 * What importing a pack file would do — add, update, or nothing — decided
 * before anything is written, so the Generator and the Workshop import the
 * same way. Pure: callers do the storage.
 */

import { parsePack } from './packs.js';
import { readPackMeta } from './packmeta.js';

/** Shown for every failed import. A failed paid-pack import is a refund
 *  request in waiting; the reader did nothing wrong, so the copy says so. */
export const IMPORT_FAILED_MESSAGE =
  'This pack file could not be loaded. The problem is in the file, not anything you did.';

const sameTitle = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();

/** The support contact, when the `$pack` block itself is readable — even if
 *  the tables after it are broken, that is exactly when the buyer needs it. */
function supportOf(source) {
  try {
    const meta = readPackMeta(JSON.parse(source));
    return meta.ok ? meta.meta.support ?? null : null;
  } catch {
    return null;
  }
}

/**
 * @param {{ id: string, name: string, source: string }[]} existingPacks
 * @param {string} source the file's contents
 * @param {string} [filename]
 * @returns {{ ok: false, message: string, detail: string, support: string|null }
 *          | { ok: true, action: 'add'|'update'|'unchanged', name: string,
 *              meta: object, existing: object|null, previous: object|null }}
 *   `previous` is the installed pack's metadata when this is an update.
 */
export function planImport(existingPacks, source, filename) {
  const parsed = parsePack(source);
  if (!parsed.ok) {
    return { ok: false, message: IMPORT_FAILED_MESSAGE, detail: parsed.error, support: supportOf(source) };
  }
  const { meta } = parsed;
  const name = meta.title || String(filename ?? '').replace(/\.json$/i, '') || 'Imported Pack';

  // Only a titled pack can be an update: an untitled one has nothing stable
  // to match on, and silently replacing someone's hand-made pack is worse
  // than a duplicate they can delete.
  let existing = null;
  let previous = null;
  if (meta.title) {
    for (const pack of existingPacks) {
      const theirs = parsePack(pack.source);
      if (theirs.ok && sameTitle(theirs.meta.title, meta.title)) {
        existing = pack;
        previous = theirs.meta;
        break;
      }
    }
  }

  const action = !existing ? 'add' : existing.source === source ? 'unchanged' : 'update';
  return { ok: true, action, name, meta, existing, previous };
}
