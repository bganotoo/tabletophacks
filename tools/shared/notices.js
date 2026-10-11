/**
 * One-time notices. The decision logic is pure and tested; the single wired
 * helper at the bottom is thin DOM glue, per repo convention.
 *
 * All flags share one store value (`th:notices:v1`, shaped `{ storage: true }`)
 * so later notices do not each add a key.
 */

import { noticeBar } from './ui.js';

/** The store.js name holding the seen flags. */
export const NOTICES_KEY = 'notices';

export const STORAGE_NOTICE_ID = 'storage';

export const STORAGE_NOTICE =
  'Your saved work lives in this browser only. Clearing your browsing data — ' +
  'or using private browsing — will erase it. Use Export to keep a copy.';

function flags(seen) {
  return seen !== null && typeof seen === 'object' && !Array.isArray(seen) ? seen : {};
}

/**
 * @param {unknown} seen the stored flag set, which may be missing or corrupt
 * @param {string} id
 */
export function shouldShowNotice(seen, id) {
  return flags(seen)[id] !== true;
}

/** @returns {object} a new flag set; never mutates `seen`. */
export function markNoticeSeen(seen, id) {
  return { ...flags(seen), [id]: true };
}

/**
 * Show the storage warning the first time a tool saves, then never again.
 * Thin wiring: untested, like the app.js files that call it.
 * @param {{ get: Function, set: Function }} store
 */
export function showStorageNoticeOnce(store) {
  const seen = store.get(NOTICES_KEY, {});
  if (!shouldShowNotice(seen, STORAGE_NOTICE_ID)) return;
  // Mark first: if this write itself fails there is no storage to remember the
  // flag in, and nagging on every save would be worse than showing it once.
  store.set(NOTICES_KEY, markNoticeSeen(seen, STORAGE_NOTICE_ID));
  noticeBar(STORAGE_NOTICE);
}
