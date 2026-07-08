/**
 * The Generator tool's URL-hash router. The hash is a tiny route with four
 * shapes:
 *
 *   ''                     -> the empty route (fall back to remembered/first)
 *   'create'               -> the Create view
 *   'tables'               -> the Browse tables view
 *   '<name>[:s=<seed>][:n=<count>]'
 *                          -> run generator <name>, optionally at <seed>,
 *                             optionally producing a batch of <count>
 *
 * `create`/`tables` are reserved route words. Generator names match
 * `/^[A-Za-z_][A-Za-z0-9_-]*$/`, so they never contain the `:s=` delimiter and
 * the split is unambiguous. A seed can be arbitrary user-pinned text, so it is
 * percent-encoded in the hash — and so an encoded seed never contains a literal
 * `:`, which lets a trailing `:n=<digits>` be split off before the `:s=` split.
 * Keeping all parsing here (pure, no DOM) means the app reads the hash in
 * exactly one tested place.
 */

const SEED_SEP = ':s=';
const COUNT_SEP = ':n=';

/**
 * Parse the hash body (already `#`-stripped) into a route.
 * @param {string|null|undefined} raw
 * @returns {{ route: 'empty' }
 *          | { route: 'create' }
 *          | { route: 'tables' }
 *          | { route: 'generate', name: string, seed: string | null,
 *              count: number | null }}
 */
export function parseHash(raw) {
  let s = String(raw ?? '');
  if (s === '') return { route: 'empty' };
  if (s === 'create') return { route: 'create' };
  if (s === 'tables') return { route: 'tables' };

  // Split off a trailing `:n=<digits>` batch count first. The encoded seed can
  // never contain a `:`, so a trailing `:n=<digits>` is unambiguously the count.
  // A count of 1 is the single-run default, so it collapses to null.
  let count = null;
  const cm = s.match(/:n=(\d+)$/);
  if (cm) {
    const n = Number(cm[1]);
    if (n > 1) count = n;
    s = s.slice(0, cm.index);
  }

  const i = s.indexOf(SEED_SEP);
  if (i === -1) return { route: 'generate', name: s, seed: null, count };

  const name = s.slice(0, i);
  const rawSeed = s.slice(i + SEED_SEP.length);
  if (rawSeed === '') return { route: 'generate', name, seed: null, count };

  let seed;
  try {
    seed = decodeURIComponent(rawSeed);
  } catch {
    seed = rawSeed; // malformed encoding: keep the literal text rather than throw
  }
  return { route: 'generate', name, seed, count };
}

/**
 * Build the hash body (no leading `#`) that reproduces a generator run.
 * A null/undefined/empty seed yields the bare name; otherwise the seed is
 * percent-encoded so it survives arbitrary user text. A `count` greater than 1
 * appends a `:n=<count>` batch suffix; 1/null/undefined omits it.
 * @param {string} name
 * @param {string|null|undefined} seed
 * @param {number|null|undefined} [count]
 * @returns {string}
 */
export function formatGeneratorHash(name, seed, count) {
  let body = name;
  if (seed !== null && seed !== undefined && seed !== '') {
    body += `${SEED_SEP}${encodeURIComponent(String(seed))}`;
  }
  if (count !== null && count !== undefined && count > 1) {
    body += `${COUNT_SEP}${count}`;
  }
  return body;
}
