/**
 * The Generator tool's URL-hash router. The hash is a tiny route with four
 * shapes:
 *
 *   ''                     -> the empty route (fall back to remembered/first)
 *   'create'               -> the Create view
 *   'tables'               -> the Browse tables view
 *   '<name>[:s=<seed>]'    -> run generator <name>, optionally at <seed>
 *
 * `create`/`tables` are reserved route words. Generator names match
 * `/^[A-Za-z_][A-Za-z0-9_-]*$/`, so they never contain the `:s=` delimiter and
 * the split is unambiguous. A seed can be arbitrary user-pinned text, so it is
 * percent-encoded in the hash. Keeping all parsing here (pure, no DOM) means the
 * app reads the hash in exactly one tested place.
 */

const SEED_SEP = ':s=';

/**
 * Parse the hash body (already `#`-stripped) into a route.
 * @param {string|null|undefined} raw
 * @returns {{ route: 'empty' }
 *          | { route: 'create' }
 *          | { route: 'tables' }
 *          | { route: 'generate', name: string, seed: string | null }}
 */
export function parseHash(raw) {
  const s = String(raw ?? '');
  if (s === '') return { route: 'empty' };
  if (s === 'create') return { route: 'create' };
  if (s === 'tables') return { route: 'tables' };

  const i = s.indexOf(SEED_SEP);
  if (i === -1) return { route: 'generate', name: s, seed: null };

  const name = s.slice(0, i);
  const rawSeed = s.slice(i + SEED_SEP.length);
  if (rawSeed === '') return { route: 'generate', name, seed: null };

  let seed;
  try {
    seed = decodeURIComponent(rawSeed);
  } catch {
    seed = rawSeed; // malformed encoding: keep the literal text rather than throw
  }
  return { route: 'generate', name, seed };
}

/**
 * Build the hash body (no leading `#`) that reproduces a generator run.
 * A null/undefined/empty seed yields the bare name; otherwise the seed is
 * percent-encoded so it survives arbitrary user text.
 * @param {string} name
 * @param {string|null|undefined} seed
 * @returns {string}
 */
export function formatGeneratorHash(name, seed) {
  if (seed === null || seed === undefined || seed === '') return name;
  return `${name}${SEED_SEP}${encodeURIComponent(String(seed))}`;
}
