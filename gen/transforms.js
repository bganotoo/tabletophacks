/** Built-in string transforms plus a registration point for custom ones. */

/** @type {Map<string, (text: string, arg?: string) => string>} */
const transforms = new Map(Object.entries({
  capitalize: (s) => (s ? s[0].toUpperCase() + s.slice(1) : s),
  upper: (s) => s.toUpperCase(),
  lower: (s) => s.toLowerCase(),
}));

/**
 * Register a custom transform, e.g. registerTransform('shout', s => s + '!').
 * @param {string} name @param {(text: string, arg?: string) => string} fn
 */
export function registerTransform(name, fn) {
  if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(name)) {
    throw new Error(`invalid transform name \`${name}\``);
  }
  if (typeof fn !== 'function') throw new Error('transform must be a function');
  transforms.set(name, fn);
}

/** @param {string} name @returns {((text: string, arg?: string) => string) | null} */
export function getTransform(name) {
  return transforms.get(name) ?? null;
}

/** @returns {string[]} */
export function transformNames() {
  return [...transforms.keys()];
}

/**
 * Levenshtein edit distance, for "did you mean" suggestions.
 * @param {string} a @param {string} b @returns {number}
 */
export function levenshtein(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => {
    const row = new Array(b.length + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return d[a.length][b.length];
}

/**
 * Nearest candidate within edit distance 2 (case-insensitive), or null.
 * @param {string} name @param {string[]} candidates @returns {string | null}
 */
export function suggest(name, candidates) {
  let best = null;
  let bestDist = 3;
  for (const c of candidates) {
    const dist = levenshtein(name.toLowerCase(), c.toLowerCase());
    if (dist < bestDist) {
      best = c;
      bestDist = dist;
    }
  }
  return best;
}
