/**
 * Generate-N-at-once helpers. A batch of N runs uses N sub-seeds *derived* from
 * one base seed, so a single base seed (plus the count) reproduces the whole
 * batch. Count 1 returns the base seed unchanged, keeping single-run results —
 * and existing shared links — byte-for-byte what they are today.
 */

/** The most results one Generate can produce, bounding DOM and localStorage. */
export const MAX_BATCH = 12;

/**
 * Coerce arbitrary input to an integer count in `[1, MAX_BATCH]`.
 * Non-numeric, zero, and negative values fall back to 1.
 * @param {unknown} n @returns {number}
 */
export function clampCount(n) {
  const x = Math.floor(Number(n));
  if (!Number.isFinite(x) || x < 1) return 1;
  return Math.min(x, MAX_BATCH);
}

/**
 * The seeds for a batch run. Count 1 → `[base]` (direct seed); count N → N
 * distinct `"${base}#${i}"` sub-seeds. Deterministic in `(base, count)`.
 * @param {string|number} base @param {unknown} count @returns {string[]}
 */
export function deriveSeeds(base, count) {
  const n = clampCount(count);
  if (n === 1) return [String(base)];
  return Array.from({ length: n }, (_, i) => `${base}#${i}`);
}
