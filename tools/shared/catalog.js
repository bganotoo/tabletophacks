/**
 * Browsable catalog of the tables an assembled generator knows. Powers the
 * Generator tool's "Browse tables" view: writers need to know a table name and
 * its tags before they can write `{table#tag}`. Only tables appear here — JSON
 * templates (`npc`, `quest`) are not referenceable from a `{...}` lookup.
 * All functions read only the engine's public surface, so they stay testable
 * and engine-agnostic.
 */

/**
 * Every table the generator knows, name-sorted, with its entry count and the
 * sorted union of tags its entries carry. A table whose name is not in
 * `builtinNames` is flagged `custom` (when `builtinNames` is omitted, nothing
 * is flagged).
 * @param {import('../../gen/index.js').Generator} generator
 * @param {{ builtinNames?: string[] }} [opts]
 * @returns {{ name: string, count: number, tags: string[], custom: boolean }[]}
 */
export function buildCatalog(generator, { builtinNames } = {}) {
  const builtin = builtinNames ? new Set(builtinNames) : null;
  const { registry } = generator;
  return registry
    .tableNames()
    .map((name) => {
      const entries = registry.getTable(name) ?? [];
      const tags = new Set();
      for (const entry of entries) for (const tag of entry.tags) tags.add(tag);
      return {
        name,
        count: entries.length,
        tags: [...tags].sort(),
        custom: builtin ? !builtin.has(name) : false,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Filter a catalog by a free-text query, matching table names and tags
 * (case-insensitive substring). An empty query returns the whole catalog.
 * @param {ReturnType<typeof buildCatalog>} catalog
 * @param {string} query
 * @returns {ReturnType<typeof buildCatalog>}
 */
export function filterCatalog(catalog, query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return catalog;
  return catalog.filter(
    (t) => t.name.toLowerCase().includes(q) || t.tags.some((tag) => tag.toLowerCase().includes(q)),
  );
}

/**
 * A deterministic, fully-expanded sample of one table. Runs in lenient mode so
 * a table whose entries reference a missing name still yields text (with the
 * engine's visible placeholder) instead of throwing.
 * @param {import('../../gen/index.js').Generator} generator
 * @param {string} name
 * @param {number|string} seed
 * @returns {string}
 */
export function sampleTable(generator, name, seed) {
  return generator.text(`{${name}}`, { seed, mode: 'lenient' });
}
