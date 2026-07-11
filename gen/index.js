/** Public API for the generator framework. */
import { RNG } from './rng.js';
import {
  Registry,
  createContext,
  evaluateText,
  evaluateJson,
  evaluateJsonTraced,
  rerollNode,
  GenError,
} from './engine.js';

export { registerTransform } from './transforms.js';
export { GenError };

/**
 * @typedef {{ seed?: number|string, mode?: 'strict'|'lenient',
 *             warnings?: string[] }} RunOptions
 */

export class Generator {
  /** @param {Registry} registry */
  constructor(registry) {
    this.registry = registry;
  }

  /**
   * Load a generator bundle from JSON files. Uses fetch() in the browser
   * and node:fs in Node (paths may be strings or file URLs).
   * @param {(string|URL)[]} paths @returns {Promise<Generator>}
   */
  static async load(paths) {
    const generator = new Generator(new Registry());
    for (const path of paths) generator.registry.load(await loadJson(path));
    return generator;
  }

  /**
   * Build from already-parsed data objects (tests, inline definitions).
   * @param {...object} datasets @returns {Generator}
   */
  static fromData(...datasets) {
    const generator = new Generator(new Registry());
    for (const data of datasets) generator.registry.load(data);
    return generator;
  }

  /** Every runnable name: tables and JSON templates. @returns {string[]} */
  names() {
    return [...this.registry.tableNames(), ...this.registry.templateNames()];
  }

  /**
   * Run a named generator. JSON templates produce JSON; tables produce text.
   * @param {string} name @param {RunOptions} [opts]
   * @returns {unknown}
   */
  run(name, opts = {}) {
    const ctx = this.#context(opts);
    const template = this.registry.getTemplate(name);
    if (template !== null) return evaluateJson(template, ctx);
    if (this.registry.getTable(name) !== null) return evaluateText(`{${name}}`, ctx);
    throw new GenError(`unknown generator \`${name}\``);
  }

  /**
   * Run a named generator, also returning a reroll tree for in-place per-part
   * reroll. JSON templates return a populated tree; flat tables return
   * { value, tree: null } (text behavior unchanged, no per-part reroll).
   * @param {string} name @param {RunOptions} [opts]
   * @returns {{ value: unknown, tree: object|null }}
   */
  runTraced(name, opts = {}) {
    const ctx = this.#context(opts);
    const template = this.registry.getTemplate(name);
    if (template !== null) return evaluateJsonTraced(template, ctx);
    if (this.registry.getTable(name) !== null) {
      return { value: evaluateText(`{${name}}`, ctx), tree: null };
    }
    throw new GenError(`unknown generator \`${name}\``);
  }

  /**
   * Re-evaluate the subtree at `path` (from a runTraced tree) with a fresh RNG.
   * @param {object} tree @param {(string|number)[]} path @param {RunOptions} [opts]
   * @returns {{ value: unknown, node: object }}
   */
  rerollPath(tree, path, opts = {}) {
    return rerollNode(tree, path, this.#context(opts));
  }

  /**
   * Expand a one-off string template.
   * @param {string} template @param {RunOptions} [opts] @returns {string}
   */
  text(template, opts = {}) {
    return evaluateText(template, this.#context(opts));
  }

  #context({ seed, mode = 'strict', warnings = [] } = {}) {
    return createContext({ registry: this.registry, rng: new RNG(seed), mode, warnings });
  }
}

/** @param {string|URL} path @returns {Promise<object>} */
async function loadJson(path) {
  if (typeof window === 'undefined') {
    const { readFile } = await import('node:fs/promises');
    return JSON.parse(await readFile(path, 'utf8'));
  }
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`failed to load ${path}: ${response.status} ${response.statusText}`);
  }
  return response.json();
}
