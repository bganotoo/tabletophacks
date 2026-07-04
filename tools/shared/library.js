/**
 * Import/merge helpers for the Generator's saved-result library. The library
 * is an array of entries `{ id, name, generator, seed, data, savedAt }`
 * (see the Generator app). These functions are pure: they validate an exported
 * file and merge it into an existing library without touching storage.
 */

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Parse and validate an exported-library JSON string. Strict: the whole file is
 * rejected if any entry is malformed, so failures are clear rather than silent.
 * Valid entries pass through unchanged (the export shape is trusted).
 * @param {string} source
 * @returns {{ ok: true, entries: object[] } | { ok: false, error: string }}
 */
export function parseLibrary(source) {
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch {
    return { ok: false, error: 'not valid JSON' };
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, error: 'expected a library export — a JSON array of entries' };
  }
  for (let i = 0; i < parsed.length; i++) {
    const entry = parsed[i];
    if (!isPlainObject(entry)) {
      return { ok: false, error: `entry ${i} is not an object` };
    }
    if (typeof entry.id !== 'string' || entry.id === '') {
      return { ok: false, error: `entry ${i} is missing a string id` };
    }
    if (!('data' in entry)) {
      return { ok: false, error: `entry ${i} is missing its data` };
    }
  }
  return { ok: true, entries: parsed };
}

/**
 * Merge imported entries into an existing library, de-duplicating by id.
 * Existing entries are kept as-is (immutable result snapshots — a collision
 * means "already have it"); new ids are appended in file order. Idempotent.
 * @param {object[]} existing
 * @param {object[]} incoming
 * @returns {{ merged: object[], added: number, skipped: number }}
 */
export function mergeLibrary(existing, incoming) {
  const seen = new Set(existing.map((e) => e.id));
  const merged = [...existing];
  let added = 0;
  let skipped = 0;
  for (const entry of incoming) {
    if (seen.has(entry.id)) {
      skipped++;
      continue;
    }
    seen.add(entry.id);
    merged.push(entry);
    added++;
  }
  return { merged, added, skipped };
}
