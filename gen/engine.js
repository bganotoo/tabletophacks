/** Registry of loaded tables + AST evaluator (evaluator added in Tasks 7-9). */

import { parseTemplate } from './parser.js';
import { getTransform, transformNames, suggest } from './transforms.js';

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

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

export const MAX_DEPTH = 50;

/** Parsed-template cache: template string -> AST. Tables are finite. */
const astCache = new Map();

/** @param {string} str @returns {object[]} */
function parse(str) {
  let nodes = astCache.get(str);
  if (!nodes) {
    nodes = parseTemplate(str);
    astCache.set(str, nodes);
  }
  return nodes;
}

/**
 * One generation run's state.
 * @param {{ registry: Registry, rng: import('./rng.js').RNG,
 *           mode?: 'strict'|'lenient', warnings?: string[] }} opts
 */
export function createContext({ registry, rng, mode = 'strict', warnings = [] }) {
  return { registry, rng, mode, warnings, captures: new Map(), stack: [] };
}

/**
 * Expand a template string to text.
 * @param {string} template @param {object} ctx from createContext()
 * @returns {string}
 */
export function evaluateText(template, ctx) {
  return joinParts(evalNodes(parse(template), ctx));
}

/** Strict mode: throw. Lenient mode: record a warning and continue. */
function fail(ctx, message) {
  if (ctx.mode === 'strict') throw new GenError(message);
  ctx.warnings.push(message);
}

/** fail(), then render a visible placeholder part (lenient mode). */
function problem(ctx, message, placeholder) {
  fail(ctx, message);
  return { text: placeholder };
}

/** @param {{text: string}[]} parts @returns {string} */
function joinParts(parts) {
  return parts.map((p) => p.text).join('');
}

/** Evaluate a node list to parts. (Article resolution is added in Task 8.) */
function evalNodes(nodes, ctx) {
  return nodes.map((node) => evalNode(node, ctx));
}

/** @returns {{ text: string, value?: number, article?: true }} */
function evalNode(node, ctx) {
  switch (node.type) {
    case 'text':
      return { text: node.value };
    case 'lookup':
      return evalLookup(node, ctx);
    default:
      throw new GenError(`unsupported node type \`${node.type}\``);
  }
}

function evalLookup(node, ctx) {
  const entries = ctx.registry.entriesFor(node.table, node.tags, node.notTags);
  if (entries === null) {
    const hint = suggest(node.table, ctx.registry.tableNames());
    return problem(
      ctx,
      `unknown table \`${node.table}\`${hint ? ` — did you mean \`${hint}\`?` : ''}`,
      `⟦${node.table}?⟧`,
    );
  }
  if (entries.length === 0) {
    const filter = [
      ...node.tags.map((t) => `#${t}`),
      ...node.notTags.map((t) => `#!${t}`),
    ].join('');
    return problem(ctx, `no entries in \`${node.table}\` match ${filter}`, `⟦${node.table}?⟧`);
  }
  const entry = ctx.rng.weighted(entries, (e) => e.weight);
  const part = expandEntry(entry, node, ctx);
  if (node.capture) ctx.captures.set(node.capture, { entry, text: part.text });
  return part;
}

/**
 * Resolve a picked entry: variant mods first (replace the raw text), then
 * recursive expansion, then transform mods on the expanded string.
 */
function expandEntry(entry, node, ctx) {
  let raw = entry.text;
  let m = 0;
  for (; m < node.mods.length; m++) {
    const variant = entry.variants[node.mods[m].name];
    if (variant === undefined) break;
    raw = variant;
  }
  const expanded = expandString(raw, node.table, ctx);
  return { text: applyTransforms(expanded, node.mods.slice(m), ctx) };
}

/** Recursively expand a table entry's text, tracking depth for cycles. */
function expandString(str, label, ctx) {
  if (ctx.stack.length >= MAX_DEPTH) {
    const path = ctx.stack.slice(-6).join(' → ');
    return problem(ctx, `recursion limit (${MAX_DEPTH}) exceeded: ${path}`, '⟦…⟧').text;
  }
  ctx.stack.push(label);
  try {
    return joinParts(evalNodes(parse(str), ctx));
  } finally {
    ctx.stack.pop();
  }
}

/** Apply transform mods to an expanded string. */
function applyTransforms(text, mods, ctx) {
  for (const mod of mods) {
    if (mod.name === 'unique' || mod.name === 'join') {
      fail(ctx, `\`${mod.name}\` only applies to repetition, e.g. \`{3x table.${mod.name}}\``);
      continue;
    }
    const fn = getTransform(mod.name);
    if (!fn) {
      const hint = suggest(mod.name, transformNames());
      fail(ctx, `unknown transform \`${mod.name}\`${hint ? ` — did you mean \`${hint}\`?` : ''}`);
      continue;
    }
    text = mod.arg === undefined ? fn(text) : fn(text, mod.arg);
  }
  return text;
}
