/** Registry of loaded tables + AST evaluator (evaluator added in Tasks 7-9). */

import { parseTemplate, parseCount } from './parser.js';
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

/** Reserved top-level key for pack metadata, read by tools/shared/packmeta.js. */
const PACK_META_KEY = '$pack';

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
      // Pack metadata (title, version, …) for the tools; not a table. It is
      // the one `$` name accepted, and NAME_RE keeps it from colliding.
      if (name === PACK_META_KEY) continue;
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
export function createContext({ registry, rng, mode = 'strict', warnings = [], vars = {} }) {
  return { registry, rng, mode, warnings, captures: new Map(), vars: normalizeVars(vars), stack: [] };
}

/**
 * Caller-supplied run variables, read by `#$name` filters. Values are tag
 * strings; an unset variable means "no preference".
 * @param {unknown} vars @returns {Map<string, string>}
 */
function normalizeVars(vars) {
  if (!vars || typeof vars !== 'object' || Array.isArray(vars)) {
    throw new GenError('vars must be an object of name: string');
  }
  const map = new Map();
  for (const [name, value] of Object.entries(vars)) {
    if (!NAME_RE.test(name)) throw new GenError(`invalid variable name \`${name}\``);
    if (typeof value !== 'string' || value === '') {
      throw new GenError(`variable \`${name}\` must be a non-empty string`);
    }
    map.set(name, value);
  }
  return map;
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

/** Evaluate a node list to parts, then resolve smart articles. */
function evalNodes(nodes, ctx) {
  return resolveArticles(nodes.map((node) => evalNode(node, ctx)));
}

/** @returns {{ text: string, value?: number, article?: true }} */
function evalNode(node, ctx) {
  switch (node.type) {
    case 'text':
      return { text: node.value };
    case 'lookup':
      return evalLookup(node, ctx);
    case 'ref':
      return evalRef(node, ctx);
    case 'alt':
      return { text: ctx.rng.weighted(node.options, (o) => o.weight).text };
    case 'range':
      return finishNumber(node, ctx.rng.int(node.min, node.max), ctx);
    case 'dice': {
      let total = node.plus;
      for (let k = 0; k < node.count; k++) total += ctx.rng.int(1, node.sides);
      return finishNumber(node, total, ctx);
    }
    case 'article':
      return { text: '', article: true };
    case 'repeat':
      return evalRepeat(node, ctx);
    default:
      throw new GenError(`unsupported node type \`${node.type}\``);
  }
}

/**
 * A lookup's effective tag filter: its static tags plus any dynamic ones
 * (`#@n.field`, `#$var`) resolved now. An unset `$var` or capture adds no
 * constraint, so a shared table can filter on a person who may not exist in
 * every run; a set capture missing the field is an error.
 * @returns {{ tags: string[], notTags: string[] } | { error: string }}
 */
function resolveFilter(node, ctx) {
  if (!node.dynTags) return { tags: node.tags, notTags: node.notTags };
  const tags = [...node.tags];
  const notTags = [...node.notTags];
  for (const dyn of node.dynTags) {
    let value;
    if (dyn.variable !== undefined) {
      value = ctx.vars.get(dyn.variable);
      if (value === undefined) continue;
    } else {
      const captured = ctx.captures.get(dyn.capture);
      if (!captured) continue;
      value = captured.entry?.variants[dyn.field];
      if (value === undefined) {
        return { error: `capture \`@${dyn.capture}\` has no \`${dyn.field}\` property` };
      }
    }
    (dyn.negated ? notTags : tags).push(value);
  }
  return { tags, notTags };
}

function evalLookup(node, ctx) {
  if (node.keep) {
    const captured = ctx.captures.get(node.capture);
    if (captured) {
      const part = renderCaptured(captured, node.mods, `@${node.capture}`, ctx);
      return node.silent ? { text: '' } : part;
    }
  }
  const filter = resolveFilter(node, ctx);
  if (filter.error) return problem(ctx, filter.error, `⟦${node.table}?⟧`);
  const entries = ctx.registry.entriesFor(node.table, filter.tags, filter.notTags);
  if (entries === null) {
    const hint = suggest(node.table, ctx.registry.tableNames());
    return problem(
      ctx,
      `unknown table \`${node.table}\`${hint ? ` — did you mean \`${hint}\`?` : ''}`,
      `⟦${node.table}?⟧`,
    );
  }
  if (entries.length === 0) {
    const shown = [
      ...filter.tags.map((t) => `#${t}`),
      ...filter.notTags.map((t) => `#!${t}`),
    ].join('');
    return problem(ctx, `no entries in \`${node.table}\` match ${shown}`, `⟦${node.table}?⟧`);
  }
  const entry = ctx.rng.weighted(entries, (e) => e.weight);
  const part = expandEntry(entry, node, ctx);
  if (node.capture) ctx.captures.set(node.capture, { entry, text: part.text });
  return node.silent ? { text: '' } : part;
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

/** Wrap a rolled number as a part; store a numeric capture if requested. */
function finishNumber(node, value, ctx) {
  const part = { text: String(value), value };
  if (node.capture) ctx.captures.set(node.capture, { entry: null, text: part.text, value });
  return part;
}

/** Resolve a repeat/`$repeat` count node to an integer. */
export function evalCount(countNode, ctx) {
  if (countNode.type === 'int') return countNode.value;
  return evalNode(countNode, ctx).value;
}

function evalRef(node, ctx) {
  const captured = ctx.captures.get(node.name);
  if (!captured) return problem(ctx, `unknown capture \`@${node.name}\``, `⟦@${node.name}?⟧`);
  return renderCaptured(captured, node.mods, `@${node.name}`, ctx);
}

/** Render a capture, re-applying modifiers against its entry: variants first, then transforms. */
function renderCaptured(captured, mods, label, ctx) {
  if (mods.length === 0) {
    return captured.value === undefined
      ? { text: captured.text }
      : { text: captured.text, value: captured.value };
  }
  let raw = null;
  let m = 0;
  if (captured.entry) {
    for (; m < mods.length; m++) {
      const variant = captured.entry.variants[mods[m].name];
      if (variant === undefined) break;
      raw = variant;
    }
  }
  const text = raw === null ? captured.text : expandString(raw, label, ctx);
  return { text: applyTransforms(text, mods.slice(m), ctx) };
}

function evalRepeat(node, ctx) {
  const wanted = evalCount(node.count, ctx);
  const inner = node.inner;
  const texts = [];
  if (node.unique) {
    const filter = resolveFilter(inner, ctx);
    if (filter.error) return problem(ctx, filter.error, `⟦${inner.table}?⟧`);
    const all = ctx.registry.entriesFor(inner.table, filter.tags, filter.notTags);
    if (all === null) {
      return problem(ctx, `unknown table \`${inner.table}\``, `⟦${inner.table}?⟧`);
    }
    let count = wanted;
    if (all.length < wanted) {
      fail(ctx, `cannot pick ${wanted} unique entries from \`${inner.table}\` (only ${all.length} match)`);
      count = all.length;
    }
    const pool = [...all];
    for (let k = 0; k < count; k++) {
      const entry = ctx.rng.weighted(pool, (e) => e.weight);
      pool.splice(pool.indexOf(entry), 1);
      texts.push(expandEntry(entry, inner, ctx).text);
    }
  } else {
    for (let k = 0; k < wanted; k++) texts.push(evalNode(inner, ctx).text);
  }
  return { text: texts.join(node.join) };
}

/** Vowel letters that sound like a consonant ("a unicorn", "a one-eyed"). */
const CONSONANT_SOUND = /^(?:uni(?:corn|form|fy|on|que|son|t|vers)|use|usu|eu|ewe|one\b|once)/i;
/** A silent h, which sounds like a vowel ("an hour", "an heir"). */
const VOWEL_SOUND_H = /^(?:hour|honest|hono(?:u)?r|heir)/i;

/** Numerals read with a vowel sound: eight…, eleven, eighteen (and 11,000, 18,000). */
const VOWEL_SOUND_NUMBER = /^(?:8|1[18](?:,?\d{3})*(?![\d,]))/;

/** "an" when `word` starts with a vowel sound, else "a". */
function articleFor(word) {
  if (VOWEL_SOUND_H.test(word) || VOWEL_SOUND_NUMBER.test(word)) return 'an';
  return /^[aeiou]/i.test(word) && !CONSONANT_SOUND.test(word) ? 'an' : 'a';
}

/**
 * Replace article markers with "a"/"an" based on the sound of the next
 * non-empty part — its first letter, plus the common exceptions above.
 */
function resolveArticles(parts) {
  for (let i = 0; i < parts.length; i++) {
    if (!parts[i].article) continue;
    let word = '';
    for (let j = i + 1; j < parts.length && !word; j++) word = parts[j].text.trimStart();
    parts[i] = { text: articleFor(word) };
  }
  return parts;
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

// ---------------------------------------------------------------------------
// JSON templates
// ---------------------------------------------------------------------------

/** Sentinel: a $maybe declined — drop the property/element entirely. */
const OMIT = Symbol('omit');

/**
 * @typedef {{ source: unknown, kind: 'leaf'|'object'|'array',
 *   children?: Record<string, RerollNode> | RerollNode[] }} RerollNode
 */

/**
 * Evaluate a JSON template to a plain value (nodes discarded).
 * @param {unknown} value @param {object} ctx from createContext()
 * @returns {unknown}
 */
export function evaluateJson(value, ctx) {
  const r = evalJsonValue(value, ctx);
  return r === OMIT ? null : r.value;
}

/**
 * Traced evaluation: the same value as evaluateJson, plus a parallel RerollNode
 * tree mapping each kept value to the source fragment that produced it.
 * @param {unknown} value @param {object} ctx from createContext()
 * @returns {{ value: unknown, tree: RerollNode | null }}
 */
export function evaluateJsonTraced(value, ctx) {
  const r = evalJsonValue(value, ctx);
  if (r === OMIT) return { value: null, tree: null };
  // The run's captures ride on the root so a later reroll still sees them.
  return { value: r.value, tree: { ...r.node, captures: ctx.captures } };
}

/** @returns {typeof OMIT | { value: unknown, node: RerollNode }} */
function evalJsonValue(value, ctx) {
  if (typeof value === 'string') {
    return { value: evalJsonString(value, ctx), node: { kind: 'leaf', source: value } };
  }
  if (Array.isArray(value)) {
    const items = [];
    const children = [];
    for (const v of value) {
      const r = evalJsonValue(v, ctx);
      if (r === OMIT) continue;
      items.push(r.value);
      children.push(r.node);
    }
    return { value: items, node: { kind: 'array', source: value, children } };
  }
  if (value && typeof value === 'object') return evalJsonObject(value, ctx);
  return { value, node: { kind: 'leaf', source: value } }; // number, boolean, null
}

/** Type passthrough: exactly one expansion yielding a number stays a number. */
function evalJsonString(str, ctx) {
  const nodes = parse(str);
  const parts = evalNodes(nodes, ctx);
  if (nodes.length === 1 && parts.length === 1 && typeof parts[0].value === 'number') {
    return parts[0].value;
  }
  return joinParts(parts);
}

function evalJsonObject(obj, ctx) {
  if ('$with' in obj) {
    // Evaluated first for its captures (e.g. who a template is about), then
    // dropped from the output. Not a child, so rerolling a field keeps it.
    const { $with, ...rest } = obj;
    evalJsonValue($with, ctx);
    const r = evalJsonObject(rest, ctx);
    return r === OMIT ? OMIT : { value: r.value, node: { ...r.node, source: obj } };
  }
  if ('$repeat' in obj) return evalRepeatDirective(obj, ctx);
  if ('$maybe' in obj) {
    const p = obj.$maybe;
    if (typeof p !== 'number' || p < 0 || p > 1) {
      throw new GenError(`$maybe probability must be a number in [0, 1], got ${JSON.stringify(p)}`);
    }
    if (ctx.rng.next() >= p) return OMIT;
    const r = evalJsonValue(obj.value, ctx);
    if (r === OMIT) return OMIT;
    // Reroll re-evaluates the inner value only, so the field stays present.
    return { value: r.value, node: { ...r.node, source: obj.value } };
  }
  if ('$or' in obj) {
    const branches = obj.$or;
    if (!Array.isArray(branches) || branches.length === 0) {
      throw new GenError('$or requires a non-empty array of branches');
    }
    const weightOf = (b) =>
      (b && typeof b === 'object' && !Array.isArray(b) && typeof b.$weight === 'number')
        ? b.$weight
        : 1;
    const branch = ctx.rng.weighted(branches, weightOf);
    let picked = branch;
    if (branch && typeof branch === 'object' && !Array.isArray(branch)) {
      const { $weight, ...rest } = branch;
      picked = rest;
    }
    const r = evalJsonValue(picked, ctx);
    if (r === OMIT) return OMIT;
    // Reroll re-evaluates the whole $or, so it can re-pick a branch.
    return { value: r.value, node: { ...r.node, source: obj } };
  }
  const out = {};
  const children = {};
  for (const [key, value] of Object.entries(obj)) {
    const r = evalJsonValue(value, ctx);
    if (r === OMIT) continue;
    out[key] = r.value;
    children[key] = r.node;
  }
  return { value: out, node: { kind: 'object', source: obj, children } };
}

function evalRepeatDirective(obj, ctx) {
  const spec = obj.$repeat;
  let count;
  if (typeof spec === 'number') {
    if (!Number.isInteger(spec) || spec < 0) throw new GenError(`invalid $repeat count ${spec}`);
    count = spec;
  } else if (typeof spec === 'string') {
    count = evalCount(parseCount(spec), ctx);
  } else {
    throw new GenError('$repeat count must be an integer or a count string like "1d4"');
  }
  if (!('of' in obj)) throw new GenError('$repeat requires an "of" value');

  const items = [];
  const children = [];
  const seen = new Set();
  let extraDraws = 0;
  while (items.length < count) {
    const r = evalJsonValue(obj.of, ctx);
    const value = r === OMIT ? null : r.value;
    if (obj.unique) {
      const key = JSON.stringify(value);
      if (seen.has(key)) {
        extraDraws += 1;
        if (extraDraws > count * 20) {
          fail(ctx, `$repeat: could not produce ${count} unique values`);
          break;
        }
        continue;
      }
      seen.add(key);
    }
    items.push(value);
    // Each element reroll re-evaluates `of`, producing one fresh item; the whole
    // array node's source is the $repeat itself, so a container reroll re-rolls
    // both count and items.
    children.push(r === OMIT ? { kind: 'leaf', source: obj.of } : { ...r.node, source: obj.of });
  }
  return { value: items, node: { kind: 'array', source: obj, children } };
}

/**
 * Re-evaluate the subtree at `path` with a fresh context (fresh RNG), in place.
 * The context starts from the run's captures, so a rerolled field still knows
 * who the template is about; captures it makes replace the old ones on the
 * root. Nodes are not mutated — the caller splices the returned value/node in.
 * @param {RerollNode} tree root node from evaluateJsonTraced
 * @param {(string|number)[]} path keys/indices from the root
 * @param {object} ctx a fresh context (fresh RNG)
 * @returns {{ value: unknown, node: RerollNode }}
 */
export function rerollNode(tree, path, ctx) {
  let node = tree;
  for (const key of path) {
    const child = node && node.children ? node.children[key] : undefined;
    if (child === undefined) throw new GenError(`no reroll node at path ${JSON.stringify(path)}`);
    node = child;
  }
  if (path.length === 0) throw new GenError('cannot reroll the root node');
  if (tree.captures) for (const [name, captured] of tree.captures) ctx.captures.set(name, captured);
  const r = evalJsonValue(node.source, ctx);
  if (tree.captures) tree.captures = ctx.captures; // only once the reroll succeeded
  if (r === OMIT) {
    // A source that declines (a bare $maybe) keeps the field present as null.
    return { value: null, node: { kind: 'leaf', source: node.source } };
  }
  return { value: r.value, node: r.node };
}
