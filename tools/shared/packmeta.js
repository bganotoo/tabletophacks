/**
 * Pack metadata: the optional reserved `$pack` key at the top of a pack's
 * JSON. The engine skips it (see Registry.load); the tools read it here.
 * Pure, no imports, so packs.js can depend on it without a cycle.
 */

/** The reserved top-level key. `$` cannot start a table name. */
export const PACK_META_KEY = '$pack';

/** Fields the tools understand. Anything else in `$pack` is ignored, so a
 *  newer pack still loads in an older copy of the site. */
const FIELDS = ['title', 'version', 'author', 'license', 'support', 'url'];

const MAX_LENGTH = 200;

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * @param {object} data a parsed pack
 * @returns {{ ok: true, meta: Partial<Record<'title'|'version'|'author'|'license'|'support'|'url', string>> }
 *          | { ok: false, error: string }}
 */
export function readPackMeta(data) {
  if (!isPlainObject(data) || !Object.prototype.hasOwnProperty.call(data, PACK_META_KEY)) {
    return { ok: true, meta: {} };
  }
  const raw = data[PACK_META_KEY];
  if (!isPlainObject(raw)) return { ok: false, error: `${PACK_META_KEY} must be an object` };
  const meta = {};
  for (const field of FIELDS) {
    if (!(field in raw)) continue;
    const value = raw[field];
    const where = `${PACK_META_KEY}.${field}`;
    if (typeof value !== 'string') return { ok: false, error: `${where} must be text` };
    const trimmed = value.trim();
    if (!trimmed) return { ok: false, error: `${where} must not be empty` };
    if (trimmed.length > MAX_LENGTH) {
      return { ok: false, error: `${where} is longer than ${MAX_LENGTH} characters` };
    }
    meta[field] = trimmed;
  }
  return { ok: true, meta };
}

/** `1.1.0` → `v1.1.0`; an existing v/V prefix is kept; no version → ''. */
export function formatVersion(version) {
  if (!version) return '';
  return /^v/i.test(version) ? version : `v${version}`;
}
