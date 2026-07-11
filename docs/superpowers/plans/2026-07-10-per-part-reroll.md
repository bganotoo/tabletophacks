# Per-Part Reroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user reroll one individual component of a generated JSON-template result in place (e.g. keep an NPC but replace only their quirk) while every sibling stays byte-identical.

**Architecture:** During a JSON run the engine emits a parallel *reroll tree* mapping each rendered value node to the exact source fragment that produced it. Rerolling walks to a node, re-evaluates its `source` with a fresh RNG, and splices the new value + subtree back in. The renderer adds a `↻` button (carrying the node's path) to every non-root row; the app wires clicks to `rerollPath` and marks the result "diverged" (disabling Copy Link) on first use.

**Tech Stack:** Plain ES2022 modules, no dependencies. Node's built-in test runner (`node:test` + `node:assert/strict`). Browser tools are hand-wired DOM (no framework).

## Global Constraints

- No build/lint/bundler step; no npm dependencies. Only tooling is `node --test`.
- Node **and** browser must both load `gen/` modules — no Node-only or browser-only globals in engine/index/render.
- All tool runs stay **strict mode**; every `GenError` (including from reroll) is caught and surfaced, never left uncaught.
- All user/generated text interpolated into HTML goes through `esc()` from `tools/shared/render.js`.
- Same seed ⇒ same output. RNG is `new RNG(seed)`; a "fresh RNG" means a new `RNG` with a new seed.
- localStorage untouched by this feature: no new keys, library entries keep their existing concrete-`data` shape.
- `tools/*/app.js` is deliberately thin, **untested** DOM glue — any logic worth testing lives in `gen/` or `tools/shared/`.
- Backward compatibility: `renderResult`/`renderResults` and `evaluateJson` keep their current signatures and byte-identical output when no tree is supplied.

---

## File Structure

- `gen/engine.js` (modify): thread provenance through the JSON evaluator; add `evaluateJsonTraced` and `rerollNode`. This is the core.
- `gen/eval-traced.test.js` (create): unit tests for `evaluateJsonTraced` and `rerollNode`.
- `gen/index.js` (modify): add `Generator.runTraced` and `Generator.rerollPath` to the public API.
- `gen/index.test.js` (modify): tests for the two new public methods.
- `tools/shared/render.js` (modify): optional `tree` arg on `renderResult`/`renderResults`; emit `↻` buttons.
- `tools/shared/render.test.js` (modify): button-annotation tests; byte-identical-without-tree tests.
- `tools/generator/app.js` (modify): call `runTraced`, store `state.resultTrees`, delegate `↻` clicks to `rerollPath`, splice + re-render, manage the `diverged` flag. Untested glue.
- `tools/shared/tools.css` (modify): style the `.reroll-part` button.

---

## Task 1: Engine — thread provenance through the JSON evaluator

Convert the internal JSON evaluators so each returns its value **and** a `RerollNode` alongside it, then expose a traced entry point. `evaluateJson`'s observable behavior is unchanged (it just discards the nodes), so the existing `gen/eval-json.test.js` suite must stay green. This is one atomic refactor: `evalJsonValue`'s return contract changes, so every internal caller changes in the same commit.

**Files:**
- Modify: `gen/engine.js` (JSON-template section, lines ~362–465)
- Test: `gen/eval-traced.test.js` (create)

**Interfaces:**
- Consumes: existing `parse`, `evalNodes`, `joinParts`, `evalCount`, `parseCount`, `fail`, `RNG` via `ctx.rng`, the `OMIT` sentinel.
- Produces:
  - `RerollNode` typedef: `{ source: unknown, kind: 'leaf'|'object'|'array', children?: Record<string,RerollNode> | RerollNode[] }`
  - internal `evalJsonValue(value, ctx)` → `typeof OMIT | { value: unknown, node: RerollNode }`
  - exported `evaluateJson(value, ctx)` → `unknown` (unchanged signature/behavior)
  - exported `evaluateJsonTraced(value, ctx)` → `{ value: unknown, tree: RerollNode | null }`

- [ ] **Step 1: Write the failing traced-evaluation tests**

Create `gen/eval-traced.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { Registry, createContext, evaluateJson, evaluateJsonTraced } from './engine.js';
import { RNG } from './rng.js';

const ctxFor = (data, opts = {}) => {
  const registry = new Registry();
  registry.load(data);
  return createContext({ registry, rng: new RNG(opts.seed ?? 1), ...opts });
};

test('traces a leaf string to its source template', () => {
  const { value, tree } = evaluateJsonTraced({ name: '{noun}' }, ctxFor({ noun: ['wolf'] }));
  assert.equal(value.name, 'wolf');
  assert.equal(tree.kind, 'object');
  assert.equal(tree.children.name.kind, 'leaf');
  assert.equal(tree.children.name.source, '{noun}');
});

test('plain arrays trace each element by index', () => {
  const { tree } = evaluateJsonTraced({ list: ['{noun}', 42] }, ctxFor({ noun: ['wolf'] }));
  assert.equal(tree.children.list.kind, 'array');
  assert.equal(tree.children.list.children[0].source, '{noun}');
  assert.equal(tree.children.list.children[1].source, 42);
});

test('$maybe present traces to the inner value template, not the wrapper', () => {
  const { value, tree } = evaluateJsonTraced(
    { q: { $maybe: 1, value: '{noun}' } }, ctxFor({ noun: ['wolf'] }));
  assert.equal(value.q, 'wolf');
  assert.equal(tree.children.q.source, '{noun}');
});

test('$maybe absent produces no value and no node', () => {
  const { value, tree } = evaluateJsonTraced(
    { q: { $maybe: 0, value: '{noun}' } }, ctxFor({ noun: ['wolf'] }));
  assert.ok(!('q' in value));
  assert.ok(!('q' in tree.children));
});

test('$or traces the chosen branch but keeps the whole $or as source', () => {
  const tpl = { home: { $or: [{ type: 'tavern', name: '{noun}' }] } };
  const { value, tree } = evaluateJsonTraced(tpl, ctxFor({ noun: ['wolf'] }));
  assert.equal(value.home.type, 'tavern');
  assert.equal(tree.children.home.source, tpl.home);           // whole $or object
  assert.equal(tree.children.home.kind, 'object');
  assert.equal(tree.children.home.children.name.source, '{noun}'); // part of a part
});

test('$repeat traces the whole directive and each element to `of`', () => {
  const tpl = { inv: { $repeat: 2, of: '{noun}' } };
  const { value, tree } = evaluateJsonTraced(tpl, ctxFor({ noun: ['wolf'] }));
  assert.deepEqual(value.inv, ['wolf', 'wolf']);
  assert.equal(tree.children.inv.source, tpl.inv);               // whole $repeat
  assert.equal(tree.children.inv.children[0].source, '{noun}');  // the `of`
});

test('evaluateJson value equals the traced value under the same seed', () => {
  const data = { noun: ['wolf', 'fox', 'owl'] };
  const tpl = { a: '{noun}', b: { $repeat: 2, of: '{noun}' }, c: { $maybe: 0.5, value: '{noun}' } };
  assert.deepEqual(
    evaluateJson(tpl, ctxFor(data, { seed: 4 })),
    evaluateJsonTraced(tpl, ctxFor(data, { seed: 4 })).value,
  );
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `node --test gen/eval-traced.test.js`
Expected: FAIL — `evaluateJsonTraced` is not exported (`TypeError: evaluateJsonTraced is not a function`).

- [ ] **Step 3: Replace the JSON-template section of `gen/engine.js`**

Replace the entire block from the `OMIT` sentinel comment (line ~366) through the end of `evalRepeatDirective` (line ~465) with:

```js
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
  return { value: r.value, tree: r.node };
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
```

Note: this replacement includes `evalJsonString` (moved verbatim, unchanged) so the whole JSON section stays contiguous. Confirm no *second* copy of `evalJsonString` remains elsewhere in the file after editing.

- [ ] **Step 4: Run the traced tests and the existing JSON suite**

Run: `node --test gen/eval-traced.test.js gen/eval-json.test.js`
Expected: PASS — all traced tests pass and the existing `eval-json` suite is still green (proves `evaluateJson` behavior is unchanged).

- [ ] **Step 5: Run the full engine suite for regressions**

Run: `node --test gen/`
Expected: PASS — no regressions across the engine.

- [ ] **Step 6: Commit**

```bash
git add gen/engine.js gen/eval-traced.test.js
git commit -m "feat(engine): emit a provenance tree from JSON runs

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Engine — `rerollNode` (re-evaluate one subtree in place)

Add the walk-and-re-evaluate primitive: given the tree, a path, and a fresh context, re-run just that node's `source` and return the new value + subtree. It does not mutate anything — the caller splices.

**Files:**
- Modify: `gen/engine.js` (append after `evalRepeatDirective`)
- Test: `gen/eval-traced.test.js` (add tests)

**Interfaces:**
- Consumes: `evalJsonValue`, `OMIT`, `GenError`, the `RerollNode` shape from Task 1.
- Produces: exported `rerollNode(tree, path, ctx)` → `{ value: unknown, node: RerollNode }`; throws `GenError` on an unknown/empty-target path.

- [ ] **Step 1: Write the failing reroll tests**

Append to `gen/eval-traced.test.js`:

```js
import { evaluateJsonTraced as _traced } from './engine.js'; // (already imported above)
import { rerollNode } from './engine.js';

test('rerolling a leaf leaves its sibling byte-identical', () => {
  const data = { noun: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] };
  const { value, tree } = evaluateJsonTraced({ a: '{noun}', b: '{noun}' }, ctxFor(data, { seed: 1 }));
  const b0 = value.b;
  const r = rerollNode(tree, ['a'], ctxFor(data, { seed: 5 }));
  // caller splices:
  value.a = r.value;
  tree.children.a = r.node;
  assert.equal(typeof value.a, 'string');
  assert.equal(value.b, b0); // sibling never re-evaluated
});

test('rerollNode is deterministic under a fixed seed', () => {
  const data = { noun: ['a', 'b', 'c', 'd', 'e', 'f'] };
  const { tree } = evaluateJsonTraced({ a: '{noun}' }, ctxFor(data, { seed: 1 }));
  const r1 = rerollNode(tree, ['a'], ctxFor(data, { seed: 42 }));
  const r2 = rerollNode(tree, ['a'], ctxFor(data, { seed: 42 }));
  assert.equal(r1.value, r2.value);
});

test('rerolling a $maybe-present field keeps it present with a fresh value', () => {
  const data = { noun: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] };
  const { value, tree } = evaluateJsonTraced(
    { q: { $maybe: 1, value: '{noun}' } }, ctxFor(data, { seed: 1 }));
  assert.ok('q' in value);
  let changed = false;
  for (let s = 0; s < 30 && !changed; s++) {
    const r = rerollNode(tree, ['q'], ctxFor(data, { seed: s }));
    assert.equal(typeof r.value, 'string'); // never OMIT — stays present
    if (r.value !== value.q) changed = true;
  }
  assert.ok(changed, 'reroll should be able to produce a different value');
});

test('rerolling a $or container can switch the branch', () => {
  const tpl = { home: { $or: [{ type: 'tavern' }, { type: 'hovel' }] } };
  const { value, tree } = evaluateJsonTraced(tpl, ctxFor({}, { seed: 1 }));
  const seen = new Set([value.home.type]);
  for (let s = 0; s < 50; s++) seen.add(rerollNode(tree, ['home'], ctxFor({}, { seed: s })).value.type);
  assert.deepEqual([...seen].sort(), ['hovel', 'tavern']);
});

test('rerolling one $repeat element changes only that item, not the count', () => {
  const data = { noun: ['a', 'b', 'c', 'd', 'e', 'f'] };
  const { value, tree } = evaluateJsonTraced({ inv: { $repeat: 3, of: '{noun}' } }, ctxFor(data, { seed: 2 }));
  const before = [...value.inv];
  const r = rerollNode(tree, ['inv', 1], ctxFor(data, { seed: 7 }));
  value.inv[1] = r.value;
  tree.children.inv.children[1] = r.node;
  assert.equal(value.inv.length, 3);      // count unchanged
  assert.equal(value.inv[0], before[0]);  // siblings unchanged
  assert.equal(value.inv[2], before[2]);
});

test('rerollNode throws on an unknown path', () => {
  const { tree } = evaluateJsonTraced({ a: '{noun}' }, ctxFor({ noun: ['x'] }));
  assert.throws(() => rerollNode(tree, ['zzz'], ctxFor({ noun: ['x'] })), /reroll node/);
});
```

(Remove the redundant `import { evaluateJsonTraced as _traced }` line if it duplicates the file's existing import — it is shown only to make the added `rerollNode` import explicit. Keep a single `import { ..., rerollNode } from './engine.js';` at the top of the file.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test gen/eval-traced.test.js`
Expected: FAIL — `rerollNode is not a function`.

- [ ] **Step 3: Implement `rerollNode`**

Append to `gen/engine.js`, after `evalRepeatDirective`:

```js
/**
 * Re-evaluate the subtree at `path` with a fresh context (fresh RNG), in place.
 * Does not mutate the tree — the caller splices the returned value/node back in.
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
  const r = evalJsonValue(node.source, ctx);
  if (r === OMIT) {
    // A source that declines (a bare $maybe) keeps the field present as null.
    return { value: null, node: { kind: 'leaf', source: node.source } };
  }
  return { value: r.value, node: r.node };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test gen/eval-traced.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add gen/engine.js gen/eval-traced.test.js
git commit -m "feat(engine): rerollNode re-evaluates one subtree in place

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Public API — `runTraced` and `rerollPath`

Surface the two engine primitives on `Generator`. `runTraced` returns `{ value, tree }` (tree is `null` for flat tables); `rerollPath` builds a fresh context and delegates to `rerollNode`.

**Files:**
- Modify: `gen/index.js`
- Test: `gen/index.test.js`

**Interfaces:**
- Consumes: `evaluateJsonTraced`, `rerollNode` from `engine.js`; existing `#context`, `evaluateText`.
- Produces:
  - `Generator.runTraced(name, opts?)` → `{ value: unknown, tree: RerollNode | null }`
  - `Generator.rerollPath(tree, path, opts?)` → `{ value: unknown, node: RerollNode }`

- [ ] **Step 1: Write the failing API tests**

Append to `gen/index.test.js`:

```js
test('runTraced returns a populated tree for JSON templates', () => {
  const g = Generator.fromData({ npc: { name: '{n}' }, n: ['wolf'] });
  const { value, tree } = g.runTraced('npc', { seed: 1 });
  assert.equal(value.name, 'wolf');
  assert.equal(tree.kind, 'object');
  assert.equal(tree.children.name.source, '{n}');
});

test('runTraced returns a null tree for flat tables', () => {
  const g = Generator.fromData({ n: ['wolf'] });
  const { value, tree } = g.runTraced('n', { seed: 1 });
  assert.equal(value, 'wolf');
  assert.equal(tree, null);
});

test('runTraced value matches run() under the same seed', () => {
  const g = Generator.fromData({ npc: { a: '{n}', b: { $repeat: 2, of: '{n}' } }, n: ['wolf', 'fox'] });
  assert.deepEqual(g.runTraced('npc', { seed: 3 }).value, g.run('npc', { seed: 3 }));
});

test('runTraced throws on an unknown generator', () => {
  const g = Generator.fromData({ n: ['wolf'] });
  assert.throws(() => g.runTraced('nope'), /unknown generator/);
});

test('rerollPath re-rolls one field without touching siblings', () => {
  const g = Generator.fromData({ npc: { a: '{n}', b: '{n}' }, n: ['w', 'x', 'y', 'z', 'p', 'q'] });
  const { value, tree } = g.runTraced('npc', { seed: 1 });
  const b0 = value.b;
  const r = g.rerollPath(tree, ['a'], { seed: 5 });
  assert.equal(typeof r.value, 'string');
  assert.equal(value.b, b0); // rerollPath does not mutate; sibling intact
});
```

Confirm the file's existing imports include `Generator` and `assert` (they do); add nothing new.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test gen/index.test.js`
Expected: FAIL — `g.runTraced is not a function`.

- [ ] **Step 3: Implement the two methods**

In `gen/index.js`, update the engine import to add the two functions:

```js
import {
  Registry,
  createContext,
  evaluateText,
  evaluateJson,
  evaluateJsonTraced,
  rerollNode,
  GenError,
} from './engine.js';
```

Add these two methods to the `Generator` class, immediately after `run(...)`:

```js
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test gen/index.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add gen/index.js gen/index.test.js
git commit -m "feat(gen): runTraced and rerollPath public API

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Render — `↻` buttons from the reroll tree

Give `renderResult`/`renderResults` an optional `tree`/`trees` argument. When present, annotate every non-root row with a `↻` button carrying its JSON-encoded path. When absent (flat text, library opens), output is byte-identical to today.

**Files:**
- Modify: `tools/shared/render.js`
- Test: `tools/shared/render.test.js`

**Interfaces:**
- Consumes: `esc`, the `RerollNode` shape (`{ kind, source, children }`).
- Produces:
  - `renderResult(value, tree = null)` → HTML string
  - `renderResults(values, trees = null)` → HTML string
  - button markup: `<button type="button" class="reroll-part" data-reroll-path='<esc(JSON.stringify(path))>' ...>↻</button>`; `data-reroll-path` values look like `[&quot;home&quot;,&quot;name&quot;]` and `[&quot;inv&quot;,0]` after `esc`.

- [ ] **Step 1: Write the failing render tests**

Append to `tools/shared/render.test.js`:

```js
test('renderResult without a tree is byte-identical to the no-arg call', () => {
  const v = { name: 'Wolf', inventory: ['map', 'gold'] };
  assert.equal(renderResult(v), renderResult(v, null));
  assert.ok(!renderResult(v).includes('reroll-part'));
});

test('renderResult with a tree annotates each non-root row with its path', () => {
  const value = { home: { name: 'The Owl' } };
  const tree = {
    kind: 'object', source: {}, children: {
      home: {
        kind: 'object', source: {}, children: {
          name: { kind: 'leaf', source: '{tavern-name}' },
        },
      },
    },
  };
  const html = renderResult(value, tree);
  assert.ok(html.includes('data-reroll-path="[&quot;home&quot;]"'));
  assert.ok(html.includes('data-reroll-path="[&quot;home&quot;,&quot;name&quot;]"'));
});

test('the root node gets no reroll button', () => {
  const value = { name: 'Wolf' };
  const tree = { kind: 'object', source: {}, children: { name: { kind: 'leaf', source: '{n}' } } };
  const html = renderResult(value, tree);
  assert.equal((html.match(/reroll-part/g) || []).length, 1); // only `name`, none for root
});

test('array elements get indexed reroll paths', () => {
  const value = { inv: ['map', 'gold'] };
  const tree = {
    kind: 'object', source: {}, children: {
      inv: {
        kind: 'array', source: {}, children: [
          { kind: 'leaf', source: '{loot}' },
          { kind: 'leaf', source: '{loot}' },
        ],
      },
    },
  };
  const html = renderResult(value, tree);
  assert.ok(html.includes('data-reroll-path="[&quot;inv&quot;,0]"'));
  assert.ok(html.includes('data-reroll-path="[&quot;inv&quot;,1]"'));
});

test('renderResults threads one tree per result', () => {
  const values = [{ a: 'x' }, { a: 'y' }];
  const oneTree = () => ({ kind: 'object', source: {}, children: { a: { kind: 'leaf', source: '{n}' } } });
  const html = renderResults(values, [oneTree(), oneTree()]);
  assert.equal((html.match(/reroll-part/g) || []).length, 2);
});

test('renderResults without trees stays byte-identical', () => {
  const values = ['one', 'two'];
  assert.equal(renderResults(values), renderResults(values, null));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tools/shared/render.test.js`
Expected: FAIL — no `reroll-part` / `data-reroll-path` in output.

- [ ] **Step 3: Update `renderResult`, `renderValue`, and add `rerollButton`**

In `tools/shared/render.js`, replace `renderResult` (lines ~18–21) and `renderValue` (lines ~23–35) with:

```js
/**
 * Render a generation result as HTML. Strings become flowing text; objects
 * become definition cards; arrays become lists. When a reroll `tree` is given,
 * every non-root row gains a ↻ button carrying its path.
 * @param {unknown} value @param {object|null} [tree] RerollNode from runTraced
 * @returns {string}
 */
export function renderResult(value, tree = null) {
  if (typeof value === 'string') return `<p class="gen-text">${esc(value)}</p>`;
  return renderValue(value, tree, []);
}

/** @param {unknown} value @param {object|null} node @param {(string|number)[]} path */
function renderValue(value, node, path) {
  if (Array.isArray(value)) {
    const items = value.map((v, i) => {
      const child = node && Array.isArray(node.children) ? node.children[i] : null;
      const childPath = path.concat(i);
      return `<li>${rerollButton(child, childPath)}${renderValue(v, child, childPath)}</li>`;
    });
    return `<ul class="gen-list">${items.join('')}</ul>`;
  }
  if (value && typeof value === 'object') {
    const rows = Object.entries(value)
      .map(([k, v]) => {
        const child = node && node.children && !Array.isArray(node.children) ? node.children[k] : null;
        const childPath = path.concat(k);
        return `<dt>${esc(k)}${rerollButton(child, childPath)}</dt><dd>${renderValue(v, child, childPath)}</dd>`;
      })
      .join('');
    return `<dl class="gen-card">${rows}</dl>`;
  }
  return esc(value);
}

/** A ↻ button for a rerollable node, or '' when there is no tree at this path. */
function rerollButton(node, path) {
  if (!node) return '';
  const data = esc(JSON.stringify(path));
  return (
    `<button type="button" class="reroll-part" data-reroll-path="${data}"` +
    ` title="Reroll just this part" aria-label="Reroll this part">↻</button>`
  );
}
```

- [ ] **Step 4: Update `renderResults` to accept `trees`**

In `tools/shared/render.js`, replace `renderResults` (lines ~53–63) with:

```js
/**
 * Render a batch of results. A single-element array is exactly `renderResult`
 * of its one value; more than one becomes a `.gen-batch` stack, each item
 * numbered. An optional `trees` array supplies one reroll tree per result.
 * @param {unknown[]} values @param {(object|null)[]|null} [trees] @returns {string}
 */
export function renderResults(values, trees = null) {
  if (values.length === 1) return renderResult(values[0], trees ? trees[0] : null);
  const items = values
    .map((v, i) => {
      const body = renderResult(v, trees ? trees[i] : null);
      return (
        `<div class="gen-batch-item"><div class="gen-batch-index">${i + 1}</div>` +
        `<div class="gen-batch-body">${body}</div></div>`
      );
    })
    .join('');
  return `<div class="gen-batch">${items}</div>`;
}
```

- [ ] **Step 5: Run the render suite (new + existing)**

Run: `node --test tools/shared/render.test.js`
Expected: PASS — new tests pass; every pre-existing render test still passes (proves byte-identical output without a tree).

- [ ] **Step 6: Commit**

```bash
git add tools/shared/render.js tools/shared/render.test.js
git commit -m "feat(render): per-part reroll buttons from the reroll tree

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: App wiring + button styling

Wire the Generator tool: run traced, store trees, handle `↻` clicks (splice + re-render), and mark the result "diverged" (disabling Copy Link) on first per-part reroll. This is thin, untested DOM glue — verified by serving the site and clicking, per repo convention. Style the button so it appears on row hover/focus.

**Files:**
- Modify: `tools/generator/app.js`
- Modify: `tools/shared/tools.css`

**Interfaces:**
- Consumes: `Generator.runTraced`, `Generator.rerollPath` (Task 3); `renderResult`, `renderResults` (Task 4); existing `deriveSeeds`, `randomSeed`, `toast`, `$`.
- Produces: no exported API. New state fields `state.resultTrees` (array parallel to `state.results`) and `state.diverged` (boolean).

- [ ] **Step 1: Import `renderResult` and add state fields**

In `tools/generator/app.js`, change the render import (line ~20) to add `renderResult`:

```js
import { renderResult, renderResults, resultsToText, resultsToMarkdown } from '../shared/render.js';
```

In the `state` object (lines ~30–46), add two fields after `results: []`:

```js
  /** reroll trees parallel to `results` (null entries = not per-part rerollable) */
  resultTrees: [],
  /** true once a per-part reroll has hand-edited the shown result */
  diverged: false,
```

- [ ] **Step 2: Switch `generate()` to `runTraced` and store trees**

In `generate()` (lines ~287–320), replace the `try` block's result-building lines. Change:

```js
    // A batch of N reproduces from one base seed via N derived sub-seeds.
    const results = deriveSeeds(seed, count).map((s) =>
      state.generator.run(state.selected, { seed: s, mode: 'strict' }),
    );
    state.results = results;
    state.count = count;
    state.lastSeed = seed;
    state.resultGenerator = state.selected;
    panel.innerHTML = renderResults(results);
```

to:

```js
    // A batch of N reproduces from one base seed via N derived sub-seeds.
    const runs = deriveSeeds(seed, count).map((s) =>
      state.generator.runTraced(state.selected, { seed: s, mode: 'strict' }),
    );
    state.results = runs.map((r) => r.value);
    state.resultTrees = runs.map((r) => r.tree);
    state.diverged = false;
    state.count = count;
    state.lastSeed = seed;
    state.resultGenerator = state.selected;
    panel.innerHTML = renderResults(state.results, state.resultTrees);
```

In the same `generate()`, add a Copy-Link tooltip reset next to `$('copy-link-btn').disabled = false;`:

```js
    $('copy-link-btn').disabled = false;
    $('copy-link-btn').title = 'Copy a link that reproduces this exact result';
```

In the `catch` block of `generate()`, add tree/diverged resets next to `state.results = [];`:

```js
    state.results = [];
    state.resultTrees = [];
    state.diverged = false;
```

- [ ] **Step 3: Give library opens a null tree (no per-part reroll on saved results)**

In `renderLibrary()`'s open handler (lines ~493–507), after `const results = count > 1 ? entry.data : [entry.data];`, set trees to nulls and render with them:

```js
          const results = count > 1 ? entry.data : [entry.data];
          state.resultTrees = results.map(() => null);
          state.diverged = false;
          $('result-panel').innerHTML = renderResults(results, state.resultTrees);
```

(Replace the existing `$('result-panel').innerHTML = renderResults(results);` line.) Saved results have no source templates, so they render without buttons — as intended.

- [ ] **Step 4: Add reroll click handling, splice helpers, and re-render helper**

In `tools/generator/app.js`, add these helpers in the Generation section (near `generate`), and wire the delegated listener in `main()`.

Helpers (add after `generate()`):

```js
/** Set value at an array/object path (all but the last key already exist). */
function setAtPath(root, path, value) {
  let obj = root;
  for (let k = 0; k < path.length - 1; k++) obj = obj[path[k]];
  obj[path[path.length - 1]] = value;
}

/** Set a subtree node at a path within a reroll tree. */
function setTreeAtPath(tree, path, node) {
  let n = tree;
  for (let k = 0; k < path.length - 1; k++) n = n.children[path[k]];
  n.children[path[path.length - 1]] = node;
}

/** Re-render just result `i` (whole panel for a single, one card for a batch). */
function rerenderResult(i) {
  const panel = $('result-panel');
  if (state.results.length === 1) {
    panel.innerHTML = renderResults(state.results, state.resultTrees);
  } else {
    const body = panel.querySelectorAll('.gen-batch-body')[i];
    if (body) body.innerHTML = renderResult(state.results[i], state.resultTrees[i]);
  }
}

/** First per-part reroll: the seed no longer reproduces the result. */
function markDiverged() {
  state.diverged = true;
  const btn = $('copy-link-btn');
  btn.disabled = true;
  btn.title = 'This result was hand-edited; the seed no longer reproduces it.';
}

/** Handle a click on a ↻ per-part reroll button (delegated from the panel). */
function handlePartReroll(btn) {
  const path = JSON.parse(btn.dataset.rerollPath);
  const item = btn.closest('.gen-batch-item');
  const i = item ? [...item.parentNode.children].indexOf(item) : 0;
  const tree = state.resultTrees[i];
  if (!tree) return;
  try {
    const { value, node } = state.generator.rerollPath(tree, path, { seed: randomSeed(), mode: 'strict' });
    setAtPath(state.results[i], path, value);
    setTreeAtPath(tree, path, node);
    rerenderResult(i);
    if (!state.diverged) markDiverged();
  } catch {
    toast("Couldn't reroll this part on its own.");
  }
}
```

Wire the delegated listener in `main()`, next to the other result-panel wiring (e.g. after `$('reroll-btn').addEventListener(...)` at line ~715):

```js
  $('result-panel').addEventListener('click', (e) => {
    const btn = e.target.closest('.reroll-part');
    if (btn) handlePartReroll(btn);
  });
```

- [ ] **Step 5: Style the `.reroll-part` button**

In `tools/shared/tools.css`, add after the `.gen-list` rules (after line ~312):

```css
/* ── Per-part reroll button ─────────────────── */
.reroll-part {
  border: none;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.85em;
  line-height: 1;
  padding: 0 0.3rem;
  opacity: 0;
  transition: opacity 0.1s, color 0.1s;
}

.gen-card dt:hover .reroll-part,
.gen-list li:hover > .reroll-part,
.reroll-part:focus-visible {
  opacity: 1;
}

.reroll-part:hover { color: var(--accent); }
```

- [ ] **Step 6: Run the full suite (nothing should have broken)**

Run: `npm test`
Expected: PASS — all 140+ tests green. (`app.js` and CSS carry no automated tests; this confirms nothing shared regressed.)

- [ ] **Step 7: Manually verify in the browser**

Run: `python -m http.server` and open `http://localhost:8000/tools/generator/#npc`

Verify:
- Hovering an NPC card row reveals a `↻` button on each key; clicking `quirk`'s button changes only the quirk, leaving name/occupation/etc. byte-identical.
- Clicking `home`'s button can flip tavern↔hovel; clicking a nested `home.name` changes only the tavern name.
- Clicking one `inventory` item changes that item without changing the item count.
- After the first per-part reroll, Copy Link is disabled with the divergence tooltip; Copy text / Copy Markdown / Save to library reflect the edited result.
- A fresh Reroll (global) re-enables Copy Link.
- A flat generator (e.g. `tavern-name`) shows no per-part buttons.

- [ ] **Step 8: Commit**

```bash
git add tools/generator/app.js tools/shared/tools.css
git commit -m "feat(generator): per-part reroll UI wiring and button styling

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Provenance tree / reroll-node shape → Task 1 (`RerollNode`, `evaluateJsonTraced`).
- Per-directive reroll fragments ($or→whole, $maybe→inner, $repeat→`of`/whole, nested part-of-a-part) → Task 1 implementation + Task 2 tests.
- `$maybe` stays-present semantics; absent produces no node → Task 1 (`$maybe` branch) + Task 2 test.
- Captures-in-isolation failure handled at app layer → Task 5 try/catch + toast.
- `Generator.runTraced` / `rerollPath` → Task 3.
- `renderResult(value, tree)` / `renderResults(values, trees)`, buttons on every non-root node, byte-identical without tree → Task 4.
- App: `state.resultTrees`, delegated click, splice + re-render one card, `diverged` disables Copy Link, other exports unaffected, fresh run clears `diverged` → Task 5.
- Error handling: strict-mode reroll in try/catch, toast on failure, unknown/empty path no-op → Task 5 (`handlePartReroll`) + Task 2 (`rerollNode` throws on unknown path; empty path guarded).
- Invariants: strict mode, `esc()` on interpolated text (button path via `esc`), no new localStorage keys → Tasks 4–5.

**Placeholder scan:** No TBD/"handle edge cases"/"similar to Task N" — every code step carries full code.

**Type consistency:** `RerollNode` (`kind`/`source`/`children`) is used identically in engine, `rerollNode`, render, and app. `runTraced` returns `{ value, tree }`; `rerollPath`/`rerollNode` return `{ value, node }` — the app reads `.value`/`.node`, consistent throughout. Paths are `(string|number)[]` everywhere; `data-reroll-path` is `JSON.stringify(path)` and parsed back with `JSON.parse`.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-10-per-part-reroll.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
