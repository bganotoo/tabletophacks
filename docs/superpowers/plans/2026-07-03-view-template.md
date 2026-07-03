# View template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every generator page a "View template" panel that reveals its JSON definition, lets built-ins be edited into a per-user override, and offers "Save as…" for any generator — while retiring the Quick template box.

**Architecture:** Overrides are a hidden reserved custom pack (`my-overrides`) that loads last so it wins by the existing pack load-order invariant. New pure logic lives in `tools/shared/overrides.js` plus small extensions to `packs.js` and `templates.js`, all unit-tested. `tools/generator/app.js` gets thin, untested DOM wiring.

**Tech Stack:** Plain ES2022 modules, Node's built-in test runner (`node:test` + `node:assert/strict`). No build step, no dependencies.

## Global Constraints

- No new npm dependencies; `node --test` is the only tooling.
- Pure shared modules take and return packs arrays; never touch localStorage.
- Reserved pack ids are fixed strings; ordinary packs use random `uid()`.
- Pack load order: later loads win; the override pack must load LAST.
- `a` and `an` are reserved names (smart article), rejected by the Registry.
- Any user/generated text interpolated into HTML goes through `esc()`; prefer the `el()` DOM helper which sets text safely.
- Run the full suite with `npm test`; a single file with `node --test tools/shared/<file>.test.js`.

---

### Task 1: Overrides storage module

**Files:**
- Create: `tools/shared/overrides.js`
- Test: `tools/shared/overrides.test.js`

**Interfaces:**
- Consumes: `parsePack` from `tools/shared/packs.js`.
- Produces:
  - `MY_OVERRIDES_ID = 'my-overrides'`, `MY_OVERRIDES_NAME = 'My Overrides'`
  - `overriddenNames(packs) → string[]`
  - `saveOverride(packs, name, value) → { ok: true, packs } | { ok: false, error }`
  - `removeOverride(packs, name) → packs[]`

- [ ] **Step 1: Write the failing tests**

```javascript
// tools/shared/overrides.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MY_OVERRIDES_ID,
  MY_OVERRIDES_NAME,
  overriddenNames,
  saveOverride,
  removeOverride,
} from './overrides.js';

const OTHER_PACK = { id: 'abc123', name: 'Other', source: '{"mood":["calm"]}' };

function packWith(data) {
  return {
    id: MY_OVERRIDES_ID,
    name: MY_OVERRIDES_NAME,
    description: '',
    source: JSON.stringify(data),
    updatedAt: new Date().toISOString(),
  };
}

// ── overriddenNames ──
test('overriddenNames returns [] with no packs', () => {
  assert.deepEqual(overriddenNames([]), []);
});

test('overriddenNames returns [] when the reserved pack is absent', () => {
  assert.deepEqual(overriddenNames([OTHER_PACK]), []);
});

test('overriddenNames lists the keys of the reserved pack', () => {
  const packs = [packWith({ 'npc-quirk': ['hums'], loot: ['{noun}'] })];
  assert.deepEqual(overriddenNames(packs).sort(), ['loot', 'npc-quirk']);
});

test('overriddenNames tolerates a corrupt reserved pack', () => {
  assert.deepEqual(overriddenNames([{ ...packWith({}), source: '{oops' }]), []);
});

// ── saveOverride ──
test('saveOverride creates the reserved pack on first override', () => {
  const result = saveOverride([OTHER_PACK], 'npc-quirk', ['hums a tune']);
  assert.equal(result.ok, true);
  const pack = result.packs.find((p) => p.id === MY_OVERRIDES_ID);
  assert.equal(pack.name, MY_OVERRIDES_NAME);
  assert.ok(pack.updatedAt);
  assert.deepEqual(JSON.parse(pack.source), { 'npc-quirk': ['hums a tune'] });
});

test('saveOverride stores object (JSON template) definitions', () => {
  const value = { omen: '{noun} falls', severity: '{1d6}' };
  const result = saveOverride([], 'portent', value);
  assert.equal(result.ok, true);
  assert.deepEqual(overriddenNames(result.packs), ['portent']);
  assert.deepEqual(JSON.parse(result.packs[0].source).portent, value);
});

test('saveOverride overwrites an existing override in place', () => {
  const first = saveOverride([], 'loot', ['{noun}']);
  const second = saveOverride(first.packs, 'loot', ['{adjective} {noun}']);
  assert.deepEqual(JSON.parse(second.packs[0].source).loot, ['{adjective} {noun}']);
  assert.equal(overriddenNames(second.packs).length, 1);
});

test('saveOverride rejects a definition that fails engine validation', () => {
  const result = saveOverride([], 'loot', [{ tags: ['x'] }]); // entry missing "text"
  assert.equal(result.ok, false);
  assert.match(result.error, /text/);
});

test('saveOverride rejects reserved and malformed names', () => {
  for (const name of ['a', 'an', '2fast', 'has space']) {
    assert.equal(saveOverride([], name, ['x']).ok, false);
  }
});

test('saveOverride does not mutate its input', () => {
  const packs = [packWith({ loot: ['{noun}'] })];
  const snapshot = JSON.stringify(packs);
  saveOverride(packs, 'omen', ['{noun}']);
  assert.equal(JSON.stringify(packs), snapshot);
});

// ── removeOverride ──
test('removeOverride removes one entry', () => {
  let { packs } = saveOverride([], 'loot', ['{noun}']);
  ({ packs } = saveOverride(packs, 'omen', ['{noun}']));
  const after = removeOverride(packs, 'loot');
  assert.deepEqual(overriddenNames(after), ['omen']);
});

test('removeOverride drops the reserved pack when it empties', () => {
  const { packs } = saveOverride([OTHER_PACK], 'loot', ['{noun}']);
  assert.deepEqual(removeOverride(packs, 'loot'), [OTHER_PACK]);
});

test('removeOverride is a no-op for unknown names', () => {
  const { packs } = saveOverride([], 'loot', ['{noun}']);
  assert.deepEqual(removeOverride(packs, 'nope'), packs);
});

test('removeOverride does not mutate its input', () => {
  const { packs } = saveOverride([], 'loot', ['{noun}']);
  const snapshot = JSON.stringify(packs);
  removeOverride(packs, 'loot');
  assert.equal(JSON.stringify(packs), snapshot);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tools/shared/overrides.test.js`
Expected: FAIL — cannot resolve module `./overrides.js`.

- [ ] **Step 3: Write the implementation**

```javascript
// tools/shared/overrides.js
/**
 * Per-user overrides of built-in generators, backed by one reserved custom
 * pack that loads LAST so its definitions win (the pack load-order invariant).
 * Each entry maps an overridden name to its edited definition value (an array
 * for a table, an object for a JSON template). All functions are pure: they
 * take and return packs arrays.
 */

import { parsePack } from './packs.js';

/** Fixed pack id — ordinary Workshop packs get random uids. */
export const MY_OVERRIDES_ID = 'my-overrides';
export const MY_OVERRIDES_NAME = 'My Overrides';

function reservedPack(packs) {
  return packs.find((p) => p.id === MY_OVERRIDES_ID) ?? null;
}

function packData(pack) {
  if (!pack) return {};
  try {
    const data = JSON.parse(pack.source);
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

/**
 * Names the user has overridden.
 * @param {{ id: string, source: string }[]} packs
 * @returns {string[]}
 */
export function overriddenNames(packs) {
  return Object.keys(packData(reservedPack(packs)));
}

function withPackData(packs, data) {
  const existing = reservedPack(packs);
  const updated = {
    id: MY_OVERRIDES_ID,
    name: existing?.name ?? MY_OVERRIDES_NAME,
    description: existing?.description ?? 'Your edited copies of built-in generators.',
    source: JSON.stringify(data, null, 2),
    updatedAt: new Date().toISOString(),
  };
  return existing
    ? packs.map((p) => (p.id === MY_OVERRIDES_ID ? updated : p))
    : [...packs, updated];
}

/**
 * Save (or overwrite) one override, creating the reserved pack if needed.
 * Validates the whole `{ name: value }` shape through the engine so a broken
 * edit can never be persisted.
 * @param {object[]} packs
 * @param {string} name
 * @param {unknown} value  table array or JSON-template object
 * @returns {{ ok: true, packs: object[] } | { ok: false, error: string }}
 */
export function saveOverride(packs, name, value) {
  const trimmed = String(name).trim();
  const check = parsePack(JSON.stringify({ [trimmed]: value }));
  if (!check.ok) return { ok: false, error: check.error };
  const data = packData(reservedPack(packs));
  return { ok: true, packs: withPackData(packs, { ...data, [trimmed]: value }) };
}

/**
 * Remove one override; drops the reserved pack once empty.
 * @param {object[]} packs
 * @param {string} name
 * @returns {object[]}
 */
export function removeOverride(packs, name) {
  const data = packData(reservedPack(packs));
  if (!(name in data)) return packs;
  const { [name]: _removed, ...rest } = data;
  if (Object.keys(rest).length === 0) {
    return packs.filter((p) => p.id !== MY_OVERRIDES_ID);
  }
  return withPackData(packs, rest);
}
```

Note: `parsePack` already rejects reserved (`a`/`an`) and malformed names via `Registry.load`, so `saveOverride` needs no separate name regex.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tools/shared/overrides.test.js`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add tools/shared/overrides.js tools/shared/overrides.test.js
git commit -m "feat: overrides storage module for View template"
```

---

### Task 2: Pack assembly — override ordering, picker exclusion, effective definition

**Files:**
- Modify: `tools/shared/packs.js`
- Test: `tools/shared/packs.test.js`

**Interfaces:**
- Consumes: `MY_OVERRIDES_ID` from `tools/shared/overrides.js`.
- Produces: `effectiveDefinition(builtinData, customPacks, name) → unknown | null`.
- Changes: `buildGenerator` loads the override pack last; `listGenerators` skips it.

- [ ] **Step 1: Write the failing tests** (append to `tools/shared/packs.test.js`)

```javascript
import { effectiveDefinition } from './packs.js';
import { MY_OVERRIDES_ID } from './overrides.js';

const overridePack = (data) => ({ id: MY_OVERRIDES_ID, name: 'My Overrides', source: JSON.stringify(data) });

test('buildGenerator loads the override pack last so it wins', () => {
  const { generator } = buildGenerator(
    [{ color: ['red'] }],
    [
      overridePack({ color: ['from-override'] }),
      { id: 'p1', source: JSON.stringify({ color: ['from-custom'] }) },
    ],
  );
  assert.equal(generator.text('{color}', { seed: 1 }), 'from-override');
});

test('listGenerators excludes the override pack', () => {
  const builtins = [
    {
      id: 'core', title: 'Core', description: '', files: [],
      generators: [{ name: 'loot', title: 'Loot', kind: 'text' }],
    },
  ];
  const customs = [overridePack({ loot: ['{noun}'] })];
  const list = listGenerators(builtins, customs);
  assert.equal(list.filter((g) => g.packId === MY_OVERRIDES_ID).length, 0);
  // the built-in entry still appears
  assert.ok(list.some((g) => g.name === 'loot' && g.custom === false));
});

test('effectiveDefinition resolves built-in, custom, then override', () => {
  const builtinData = [{ loot: ['built-in'] }];
  assert.deepEqual(effectiveDefinition(builtinData, [], 'loot'), ['built-in']);
  const withCustom = [{ id: 'p1', source: JSON.stringify({ loot: ['custom'] }) }];
  assert.deepEqual(effectiveDefinition(builtinData, withCustom, 'loot'), ['custom']);
  const withOverride = [...withCustom, overridePack({ loot: ['override'] })];
  assert.deepEqual(effectiveDefinition(builtinData, withOverride, 'loot'), ['override']);
});

test('effectiveDefinition returns object definitions and null for unknown', () => {
  const builtinData = [{ gem: { name: '{color}' } }];
  assert.deepEqual(effectiveDefinition(builtinData, [], 'gem'), { name: '{color}' });
  assert.equal(effectiveDefinition(builtinData, [], 'nope'), null);
});

test('effectiveDefinition ignores invalid custom packs', () => {
  const builtinData = [{ loot: ['built-in'] }];
  const customs = [{ id: 'broken', source: '{nope' }];
  assert.deepEqual(effectiveDefinition(builtinData, customs, 'loot'), ['built-in']);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tools/shared/packs.test.js`
Expected: FAIL — `effectiveDefinition` is not exported; override-ordering test fails (custom currently wins by array order).

- [ ] **Step 3: Implement the changes in `tools/shared/packs.js`**

Add the import at the top (after the existing `Generator` import):

```javascript
import { MY_OVERRIDES_ID } from './overrides.js';
```

Add a helper near the top of the module body (after the import):

```javascript
/** Custom packs in load order: overrides always last so they win. */
function orderedCustomPacks(customPacks) {
  const overrides = customPacks.filter((p) => p.id === MY_OVERRIDES_ID);
  const rest = customPacks.filter((p) => p.id !== MY_OVERRIDES_ID);
  return [...rest, ...overrides];
}
```

In `buildGenerator`, iterate the ordered list:

```javascript
export function buildGenerator(builtinData, customPacks = []) {
  const generator = Generator.fromData(...builtinData);
  const invalid = [];
  for (const pack of orderedCustomPacks(customPacks)) {
    const parsed = parsePack(pack.source);
    if (parsed.ok) generator.registry.load(parsed.data);
    else invalid.push({ id: pack.id, error: parsed.error });
  }
  return { generator, invalid };
}
```

In `listGenerators`, skip the override pack in the custom loop:

```javascript
  for (const pack of customPacks) {
    if (pack.id === MY_OVERRIDES_ID) continue; // overrides reshape existing names only
    const parsed = parsePack(pack.source);
    if (!parsed.ok) continue;
    for (const name of Generator.fromData(parsed.data).names()) {
      byName.set(name, { name, title: name, packTitle: pack.name, packId: pack.id, custom: true });
    }
  }
```

Add the new export at the end of the file:

```javascript
/**
 * The raw definition value the assembled generator resolves for `name`:
 * table array or JSON-template object. Scans built-in data, then custom
 * packs, then the override pack last — later wins. Invalid packs are skipped.
 * @param {object[]} builtinData
 * @param {{ id: string, source: string }[]} customPacks
 * @param {string} name
 * @returns {unknown | null}
 */
export function effectiveDefinition(builtinData, customPacks = [], name) {
  let found = null;
  for (const data of builtinData) {
    if (data && Object.prototype.hasOwnProperty.call(data, name)) found = data[name];
  }
  for (const pack of orderedCustomPacks(customPacks)) {
    const parsed = parsePack(pack.source);
    if (parsed.ok && Object.prototype.hasOwnProperty.call(parsed.data, name)) {
      found = parsed.data[name];
    }
  }
  return found;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tools/shared/packs.test.js`
Expected: PASS (existing + new tests).

- [ ] **Step 5: Commit**

```bash
git add tools/shared/packs.js tools/shared/packs.test.js
git commit -m "feat: override ordering + effectiveDefinition in packs"
```

---

### Task 3: `saveDefinition` for "Save as…" of any definition shape

**Files:**
- Modify: `tools/shared/templates.js`
- Test: `tools/shared/templates.test.js`

**Interfaces:**
- Produces: `saveDefinition(packs, name, value) → { ok: true, packs } | { ok: false, error }` — stores a raw definition value (array or object) into the My Templates pack under `name`.

- [ ] **Step 1: Write the failing tests** (append to `tools/shared/templates.test.js`)

```javascript
import { saveDefinition } from './templates.js';

test('saveDefinition stores a raw array (table) definition', () => {
  const result = saveDefinition([], 'quirk', ['hums', 'fidgets']);
  assert.equal(result.ok, true);
  const saved = JSON.parse(result.packs.find((p) => p.id === MY_TEMPLATES_ID).source);
  assert.deepEqual(saved.quirk, ['hums', 'fidgets']);
});

test('saveDefinition stores a JSON-template object definition', () => {
  const value = { name: '{noun}', value: '{2d6}' };
  const result = saveDefinition([], 'gem', value);
  assert.equal(result.ok, true);
  const saved = JSON.parse(result.packs.find((p) => p.id === MY_TEMPLATES_ID).source);
  assert.deepEqual(saved.gem, value);
});

test('saveDefinition overwrites an existing entry in place', () => {
  const first = saveDefinition([], 'quirk', ['hums']);
  const second = saveDefinition(first.packs, 'quirk', ['fidgets']);
  const saved = JSON.parse(second.packs.find((p) => p.id === MY_TEMPLATES_ID).source);
  assert.deepEqual(saved.quirk, ['fidgets']);
});

test('saveDefinition rejects invalid names', () => {
  for (const name of ['', 'a', '2fast']) {
    assert.equal(saveDefinition([], name, ['x']).ok, false);
  }
});

test('saveDefinition does not mutate its input', () => {
  const packs = [];
  saveDefinition(packs, 'quirk', ['hums']);
  assert.deepEqual(packs, []);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tools/shared/templates.test.js`
Expected: FAIL — `saveDefinition` is not exported.

- [ ] **Step 3: Implement `saveDefinition` in `tools/shared/templates.js`**

Add after the existing `saveTemplate` function:

```javascript
/**
 * Save (or overwrite) a raw definition value (table array or JSON-template
 * object) under `name`, creating the reserved pack if needed. Backs "Save
 * as…" for definitions that are not simple one-line templates. Such entries
 * run and list in the sidebar but are not reported by `myTemplates`.
 * @param {object[]} packs
 * @param {string} name
 * @param {unknown} value
 * @returns {{ ok: true, packs: object[] } | { ok: false, error: string }}
 */
export function saveDefinition(packs, name, value) {
  const valid = validateTemplateName(name);
  if (!valid.ok) return { ok: false, error: valid.error };
  const data = packData(reservedPack(packs));
  return { ok: true, packs: withPackData(packs, { ...data, [name.trim()]: value }) };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tools/shared/templates.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/shared/templates.js tools/shared/templates.test.js
git commit -m "feat: saveDefinition for Save as of any definition shape"
```

---

### Task 4: Generator page markup + styles

**Files:**
- Modify: `tools/generator/index.html`
- Modify: `tools/shared/tools.css`

**Interfaces:**
- Produces DOM ids consumed by Task 5: `vt-section`, `vt-subtitle`, `vt-def` (textarea), `vt-edit-btn`, `vt-save-btn`, `vt-cancel-btn`, `vt-reset-btn`, `vt-status`, `vt-saveas-name`, `vt-saveas-btn`.

- [ ] **Step 1: Replace the Quick template section in `tools/generator/index.html`**

Delete the entire `<section class="tool-section">…Quick template…</section>` block (currently lines 39–51) and replace it with:

```html
          <section class="tool-section" id="vt-section">
            <h2>Template</h2>
            <p class="gen-subtitle" id="vt-subtitle"></p>
            <textarea class="editor-textarea vt-def" id="vt-def" rows="10"
                      spellcheck="false" readonly aria-label="Generator definition"></textarea>
            <div class="editor-status" id="vt-status"></div>
            <div class="result-actions">
              <button class="btn" id="vt-edit-btn">Edit</button>
              <button class="btn btn-primary" id="vt-save-btn" hidden>Save changes</button>
              <button class="btn" id="vt-cancel-btn" hidden>Cancel</button>
              <button class="btn btn-danger" id="vt-reset-btn" hidden>Reset to default</button>
            </div>
            <div class="save-row">
              <input class="tpl-name" id="vt-saveas-name" type="text"
                     placeholder="new name" aria-label="Save as name" />
              <button class="btn" id="vt-saveas-btn">Save as…</button>
            </div>
            <p class="hint">Reveals the JSON definition behind this generator.
              Editing a built-in saves a personal copy that overrides it for you;
              <strong>Save as…</strong> copies it under a new name into
              <strong>Custom</strong>.</p>
          </section>
```

- [ ] **Step 2: Add styles to `tools/shared/tools.css`**

Replace the `/* ── Quick text ─── */` block (the `.quick-row`, `.quick-input`, `.quick-output` rules) with:

```css
/* ── View template ──────────────────────────── */
.vt-def { min-height: 12rem; }

.vt-def[readonly] { opacity: 0.85; }

.side-item .item-flag.modified { color: var(--accent); }
```

- [ ] **Step 3: Verify the page still loads**

Run: `python -m http.server` (from repo root), open `http://localhost:8000/tools/generator/`, confirm no console errors and the Quick template box is gone. (Panel is wired in Task 5; buttons are inert until then.)

- [ ] **Step 4: Commit**

```bash
git add tools/generator/index.html tools/shared/tools.css
git commit -m "feat: View template markup and styles; drop Quick template box"
```

---

### Task 5: Wire the View template panel and modified indicator in `app.js`

**Files:**
- Modify: `tools/generator/app.js`

**Interfaces:**
- Consumes: `effectiveDefinition` (packs.js); `MY_OVERRIDES_ID`, `overriddenNames`, `saveOverride`, `removeOverride` (overrides.js); `saveDefinition`, `validateTemplateName`, `myTemplates` (templates.js); DOM ids from Task 4.

- [ ] **Step 1: Update imports**

Change the packs import to add `effectiveDefinition`:

```javascript
import { BUILTIN_PACKS, buildGenerator, listGenerators, effectiveDefinition } from '../shared/packs.js';
```

Add the templates import for `saveDefinition` (extend the existing block) and a new overrides import:

```javascript
import {
  MY_TEMPLATES_ID,
  myTemplates,
  validateTemplateName,
  saveTemplate,
  deleteTemplate,
  saveDefinition,
} from '../shared/templates.js';
import {
  MY_OVERRIDES_ID,
  overriddenNames,
  saveOverride,
  removeOverride,
} from '../shared/overrides.js';
```

- [ ] **Step 2: Track overridden names and builtin flags in state and `rebuild`**

Add to the `state` object (after `builtinNames`):

```javascript
  /** names the user has overridden */ overridden: [],
  /** raw builtin data objects, kept for effectiveDefinition */ builtinData: [],
```

In `rebuild`, store the fetched data and overridden names (replace the existing body up to `renderSidebar()`):

```javascript
async function rebuild() {
  const builtinData = await fetchBuiltinData();
  const { generator, invalid } = buildGenerator(builtinData, customPacks());
  state.generator = generator;
  state.builtinData = builtinData;
  state.builtinNames = Generator.fromData(...builtinData).names();
  state.overridden = overriddenNames(customPacks());
  state.list = listGenerators(BUILTIN_PACKS, customPacks());
  if (invalid.length > 0) {
    console.warn('skipped invalid custom packs:', invalid);
  }
  renderSidebar();
}
```

- [ ] **Step 3: Show the modified marker in the sidebar**

In `renderSidebar`, change the `sideItem` helper to append a flag for overridden built-ins:

```javascript
  const sideItem = (gen) => {
    const flag =
      !gen.custom && state.overridden.includes(gen.name)
        ? el('span', { class: 'item-flag modified', title: "You've edited this generator" }, '●')
        : null;
    return el(
      'li',
      {},
      el(
        'button',
        {
          class: `side-item${gen.name === state.selected ? ' selected' : ''}`,
          onclick: () => select(gen.name),
        },
        gen.title,
        ...(flag ? [flag] : []),
      ),
    );
  };
```

- [ ] **Step 4: Render the View template panel on selection**

At the end of `select()` (after `generate();`), add `renderViewTemplate();`. Then add this new function after `showSeed()`:

```javascript
// ── View template ─────────────────────────────────────────────────────────

/** State for the panel: whether the textarea is currently editable. */
let vtEditing = false;

function selectedGen() {
  return state.list.find((g) => g.name === state.selected) ?? null;
}

function isBuiltinName(name) {
  return state.builtinNames.includes(name);
}

function renderViewTemplate() {
  const gen = selectedGen();
  if (!gen) return;
  vtEditing = false;
  const name = gen.name;
  const def = effectiveDefinition(state.builtinData, customPacks(), name);
  $('vt-def').value = def === null ? '' : JSON.stringify(def, null, 2);
  $('vt-def').readOnly = true;
  $('vt-status').className = 'editor-status';
  $('vt-status').textContent = '';
  $('vt-saveas-name').value = '';

  const builtin = isBuiltinName(name);
  const overridden = state.overridden.includes(name);
  const kind = !builtin
    ? gen.packId === MY_TEMPLATES_ID
      ? 'One of your saved templates — edit it on the Create page.'
      : `From your pack “${gen.packTitle}” — edit it in the Workshop.`
    : overridden
      ? 'Built-in generator — modified. You are running your edited copy.'
      : 'Built-in generator.';
  $('vt-subtitle').textContent = kind;

  // Built-ins are editable via overrides; customs are read-only here.
  $('vt-edit-btn').hidden = !builtin;
  $('vt-save-btn').hidden = true;
  $('vt-cancel-btn').hidden = true;
  $('vt-reset-btn').hidden = !(builtin && overridden);
}

function vtBeginEdit() {
  vtEditing = true;
  $('vt-def').readOnly = false;
  $('vt-def').focus();
  $('vt-edit-btn').hidden = true;
  $('vt-save-btn').hidden = false;
  $('vt-cancel-btn').hidden = false;
  $('vt-reset-btn').hidden = true;
}

function vtParseDefinition() {
  const raw = $('vt-def').value;
  let value;
  try {
    value = JSON.parse(raw);
  } catch (err) {
    return { ok: false, error: `invalid JSON: ${err.message}` };
  }
  return { ok: true, value };
}

async function vtSaveChanges() {
  const gen = selectedGen();
  if (!gen) return;
  const parsed = vtParseDefinition();
  if (!parsed.ok) {
    setVtStatus('bad', `✗ ${parsed.error}`);
    return;
  }
  const result = saveOverride(customPacks(), gen.name, parsed.value);
  if (!result.ok) {
    setVtStatus('bad', `✗ ${result.error}`);
    return;
  }
  if (!store.set('packs', result.packs)) {
    toast('Could not save — browser storage is full');
    return;
  }
  await rebuild();
  select(gen.name); // re-runs with the new definition and re-renders the panel
  toast('Saved your version');
}

async function vtReset() {
  const gen = selectedGen();
  if (!gen) return;
  if (!store.set('packs', removeOverride(customPacks(), gen.name))) {
    toast('Could not save — browser storage is full');
    return;
  }
  await rebuild();
  select(gen.name);
  toast('Reset to the built-in');
}

async function vtSaveAs() {
  const name = $('vt-saveas-name').value.trim();
  const parsed = vtParseDefinition();
  if (!parsed.ok) {
    setVtStatus('bad', `✗ ${parsed.error}`);
    return;
  }
  const check = validateTemplateName(name, {
    builtinNames: state.builtinNames,
    templateNames: myTemplates(customPacks()).map((t) => t.name),
  });
  if (!check.ok) {
    setVtStatus('bad', `✗ ${check.error || 'give the copy a name first'}`);
    return;
  }
  const result = saveDefinition(customPacks(), name, parsed.value);
  if (!result.ok) {
    setVtStatus('bad', `✗ ${result.error}`);
    return;
  }
  if (!store.set('packs', result.packs)) {
    toast('Could not save — browser storage is full');
    return;
  }
  await rebuild();
  select(name); // jump to the new custom generator
  toast(`Saved as “${name}” under Custom`);
}

function setVtStatus(kind, message) {
  const status = $('vt-status');
  status.className = `editor-status${kind ? ` ${kind}` : ''}`;
  status.textContent = message;
}
```

- [ ] **Step 5: Remove Quick template code and wire the new buttons**

Delete the `runQuick` function (the `// ── Quick template ──` block) and its two wiring lines:

```javascript
  $('quick-btn').addEventListener('click', runQuick);
  $('quick-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runQuick();
  });
```

Add these listeners in `main()` (near the other button wiring):

```javascript
  $('vt-edit-btn').addEventListener('click', vtBeginEdit);
  $('vt-save-btn').addEventListener('click', vtSaveChanges);
  $('vt-cancel-btn').addEventListener('click', renderViewTemplate);
  $('vt-reset-btn').addEventListener('click', vtReset);
  $('vt-saveas-btn').addEventListener('click', vtSaveAs);
```

- [ ] **Step 6: Verify in the browser**

Run: `python -m http.server`, open `http://localhost:8000/tools/generator/`.
Confirm, in order:
1. Selecting `npc` (JSON) shows its object definition; selecting `npc-quirk` shows its array. Both read-only, Edit visible.
2. Edit `npc-quirk`, add an entry, Save changes → result re-runs; sidebar shows the `●` modified marker; subtitle says "modified"; Reset to default appears.
3. Reset to default → marker and Reset disappear; definition reverts.
4. Break the JSON, Save changes → red `✗ invalid JSON…`, nothing persisted.
5. Save as… with a new name → jumps to the new generator under Custom; it runs.
6. Selecting a My Templates entry shows read-only with the Create-page hint and no Edit button.

- [ ] **Step 7: Commit**

```bash
git add tools/generator/app.js
git commit -m "feat: wire View template panel and modified indicator"
```

---

### Task 6: Full suite, cleanup, and TODO checkbox

**Files:**
- Modify: `TODO.md`

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: PASS — all 140+ tests plus the new ones; no references to removed `runQuick`/quick ids remain.

- [ ] **Step 2: Grep for stragglers**

Run: `grep -rn "quick-input\|quick-btn\|quick-output\|runQuick" tools/`
Expected: no matches.

- [ ] **Step 3: Check off the TODO item**

In `TODO.md`, change the "Retire the Quick template section…" bullet from `[ ]` to `[x]` and add a "Done 2026-07-03 — see [spec](docs/superpowers/specs/2026-07-03-view-template-design.md)." note, matching the format of the completed item above it.

- [ ] **Step 4: Commit**

```bash
git add TODO.md
git commit -m "docs: check off View template TODO item"
```

---

## Self-Review

**Spec coverage:**
- Hidden last-loaded override pack → Task 1 (storage) + Task 2 (ordering). ✓
- View shows effective JSON definition (object/array, not one-liner) → Task 4 markup + Task 5 `renderViewTemplate` using `effectiveDefinition`. ✓
- Built-in edit → override; modified indicator; reset → Task 5 (`vtSaveChanges`, sidebar marker, `vtReset`). ✓
- Custom generators read-only with pointer → Task 5 `renderViewTemplate` `kind`/button logic. ✓
- Save as… into My Templates for any shape → Task 3 `saveDefinition` + Task 5 `vtSaveAs`. ✓
- Retire Quick template → Task 4 (markup) + Task 5 (code/wiring removal) + Task 6 grep. ✓
- Built-in detection via `builtinNames` not `custom` flag → Task 5 `isBuiltinName`. ✓
- State sync via rebuild + storage listener → existing `select`/`rebuild` path reused. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases" — every code step is complete. ✓

**Type consistency:** `effectiveDefinition(builtinData, customPacks, name)`, `saveOverride/removeOverride/overriddenNames`, `saveDefinition` signatures match between definition (Tasks 1–3) and use (Task 5). DOM ids in Task 4 markup match those referenced in Task 5. ✓
