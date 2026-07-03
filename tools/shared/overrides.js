/**
 * Per-user overrides of built-in generators, backed by one reserved custom
 * pack that loads LAST so its definitions win (the pack load-order invariant).
 * Each entry maps an overridden name to its edited definition value (an array
 * for a table, an object for a JSON template). All functions are pure: they
 * take and return packs arrays.
 */

import { parsePack } from './packs.js';

/** Fixed pack id — ordinary Workshop packs get random uids. */
export const MY_OVERRIDES_ID = 'my-overrides';
export const MY_OVERRIDES_NAME = 'My Overrides';

function reservedPack(packs) {
  return packs.find((p) => p.id === MY_OVERRIDES_ID) ?? null;
}

function packData(pack) {
  if (!pack) return {};
  try {
    const data = JSON.parse(pack.source);
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

/**
 * Names the user has overridden.
 * @param {{ id: string, source: string }[]} packs
 * @returns {string[]}
 */
export function overriddenNames(packs) {
  return Object.keys(packData(reservedPack(packs)));
}

function withPackData(packs, data) {
  const existing = reservedPack(packs);
  const updated = {
    id: MY_OVERRIDES_ID,
    name: existing?.name ?? MY_OVERRIDES_NAME,
    description: existing?.description ?? 'Your edited copies of built-in generators.',
    source: JSON.stringify(data, null, 2),
    updatedAt: new Date().toISOString(),
  };
  return existing
    ? packs.map((p) => (p.id === MY_OVERRIDES_ID ? updated : p))
    : [...packs, updated];
}

/**
 * Save (or overwrite) one override, creating the reserved pack if needed.
 * Validates the whole `{ name: value }` shape through the engine so a broken
 * edit can never be persisted (this also rejects reserved and malformed names).
 * @param {object[]} packs
 * @param {string} name
 * @param {unknown} value  table array or JSON-template object
 * @returns {{ ok: true, packs: object[] } | { ok: false, error: string }}
 */
export function saveOverride(packs, name, value) {
  const trimmed = String(name).trim();
  const check = parsePack(JSON.stringify({ [trimmed]: value }));
  if (!check.ok) return { ok: false, error: check.error };
  const data = packData(reservedPack(packs));
  return { ok: true, packs: withPackData(packs, { ...data, [trimmed]: value }) };
}

/**
 * Remove one override; drops the reserved pack once empty.
 * @param {object[]} packs
 * @param {string} name
 * @returns {object[]}
 */
export function removeOverride(packs, name) {
  const data = packData(reservedPack(packs));
  if (!(name in data)) return packs;
  const { [name]: _removed, ...rest } = data;
  if (Object.keys(rest).length === 0) {
    return packs.filter((p) => p.id !== MY_OVERRIDES_ID);
  }
  return withPackData(packs, rest);
}
