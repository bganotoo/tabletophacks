/** Registry of loaded tables + AST evaluator (evaluator added in Tasks 7-9). */

/** Runtime/validation error from the generation engine. */
export class GenError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'GenError';
  }
}

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/;

/**
 * @typedef {{ text: string, tags: string[], weight: number,
 *             variants: Record<string, string> }} NormalizedEntry
 */

/** Holds all loaded tables and JSON templates for one generator bundle. */
export class Registry {
  constructor() {
    /** @type {Map<string, NormalizedEntry[]>} */
    this.tables = new Map();
    /** @type {Map<string, unknown>} */
    this.templates = new Map();
    /** @type {Map<string, NormalizedEntry[]>} filter-result cache (tag index) */
    this.filterCache = new Map();
  }

  /**
   * Load one data object: { name: array } = table, { name: object } = JSON
   * template. Validates and normalizes every entry; throws GenError on bad data.
   * @param {object} data
   */
  load(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new GenError('generator data must be a JSON object of named tables');
    }
    for (const [name, value] of Object.entries(data)) {
      if (!NAME_RE.test(name)) throw new GenError(`invalid table name \`${name}\``);
      if (name === 'a' || name === 'an') {
        throw new GenError(`table name \`${name}\` is reserved for the smart article`);
      }
      if (Array.isArray(value)) {
        this.tables.set(name, value.map((e, i) => normalizeEntry(e, name, i)));
      } else if (value && typeof value === 'object') {
        this.templates.set(name, value);
      } else {
        throw new GenError(`\`${name}\` must be a table (array) or JSON template (object)`);
      }
    }
    this.filterCache.clear();
  }

  /** @param {string} name @returns {NormalizedEntry[] | null} */
  getTable(name) {
    return this.tables.get(name) ?? null;
  }

  /** @param {string} name @returns {unknown | null} */
  getTemplate(name) {
    return this.templates.get(name) ?? null;
  }

  /** @returns {string[]} */
  tableNames() {
    return [...this.tables.keys()];
  }

  /** @returns {string[]} */
  templateNames() {
    return [...this.templates.keys()];
  }

  /**
   * Entries of `name` carrying all of `tags` and none of `notTags`.
   * Returns null for an unknown table, [] when nothing matches.
   * Results are cached per (name, filter) — cleared on load().
   * @param {string} name @param {string[]} [tags] @param {string[]} [notTags]
   * @returns {NormalizedEntry[] | null}
   */
  entriesFor(name, tags = [], notTags = []) {
    const table = this.tables.get(name);
    if (!table) return null;
    if (tags.length === 0 && notTags.length === 0) return table;
    const key = `${name} ${[...tags].sort().join(',')} ${[...notTags].sort().join(',')}`;
    let hit = this.filterCache.get(key);
    if (hit === undefined) {
      hit = table.filter(
        (e) => tags.every((t) => e.tags.includes(t)) && !notTags.some((t) => e.tags.includes(t)),
      );
      this.filterCache.set(key, hit);
    }
    return hit;
  }
}

/**
 * Normalize a raw entry. Strings become { text }. Extra string-valued
 * properties on objects are variants; variant names are not hardcoded.
 * @param {unknown} raw @param {string} tableName @param {number} index
 * @returns {NormalizedEntry}
 */
function normalizeEntry(raw, tableName, index) {
  if (typeof raw === 'string') return { text: raw, tags: [], weight: 1, variants: {} };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new GenError(`entry ${index} in \`${tableName}\` must be a string or object`);
  }
  const { text, tags = [], weight = 1, ...variants } = raw;
  if (typeof text !== 'string') {
    throw new GenError(`entry ${index} in \`${tableName}\` is missing "text"`);
  }
  if (!Array.isArray(tags) || tags.some((t) => typeof t !== 'string')) {
    throw new GenError(`entry ${index} in \`${tableName}\`: tags must be an array of strings`);
  }
  if (typeof weight !== 'number' || !(weight > 0)) {
    throw new GenError(`entry ${index} in \`${tableName}\`: weight must be a number > 0`);
  }
  for (const [key, value] of Object.entries(variants)) {
    if (typeof value !== 'string') {
      throw new GenError(`entry ${index} in \`${tableName}\`: variant \`${key}\` must be a string`);
    }
  }
  return { text, tags, weight, variants };
}
