# Generator Web Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship two static web tools — a Generator runner and a pack-editing Workshop — on top of the `gen/` framework, with localStorage persistence.

**Architecture:** No-build vanilla ES modules. Tested logic modules in `tools/shared/` (store, packs, render); thin untested DOM wiring per tool; new built-in content packs in `data/` auto-validated by the existing data suite.

**Tech Stack:** Vanilla JS (ES2022 modules), `node --test`, localStorage, static HTML/CSS extending the existing site theme.

## Global Constraints

- Zero npm dependencies; no build step. Everything runs from a static file server.
- All engine runs in the tools use strict mode; every engine error is caught and rendered, never uncaught.
- localStorage keys are namespaced + versioned: `th:packs:v1`, `th:library:v1`, `th:settings:v1`.
- All new `data/*.json` generators must strict-run clean across 25 seeds (existing `data/data.test.js` enforces this).
- All user/generated text rendered to HTML must pass through `esc()`.
- Spec: `docs/superpowers/specs/2026-07-02-generator-tools-design.md`.

---

### Task 1: store.js — versioned localStorage wrapper

**Files:**
- Create: `tools/shared/store.js`
- Test: `tools/shared/store.test.js`

**Interfaces:**
- Produces: `createStore(backing)` → `{ get(name, fallback), set(name, value), remove(name) }`.
  `backing` implements `getItem/setItem/removeItem` (defaults to `globalThis.localStorage`).
  Keys stored as `th:<name>:v1`. Values JSON round-tripped. `get` returns
  `fallback` on missing key or corrupt JSON. `set` returns `true`, or `false` if
  the backing throws (quota); never throws.

- [ ] Write failing tests: set/get round-trip (objects, arrays), missing key → fallback, corrupt JSON → fallback, remove, key namespacing (`th:packs:v1` visible in fake backing), `set` returns false when backing throws.
- [ ] Run `node --test tools/shared/store.test.js` — expect failures (module missing).
- [ ] Implement `store.js`.
- [ ] Tests pass; full suite passes.
- [ ] Commit: `feat: versioned localStorage store for web tools`

### Task 2: packs.js — pack catalog and Generator assembly

**Files:**
- Create: `tools/shared/packs.js`
- Test: `tools/shared/packs.test.js`

**Interfaces:**
- Consumes: `Generator.fromData`, `GenError` from `../../gen/index.js`.
- Produces:
  - `BUILTIN_PACKS`: `[{ id, title, description, files: string[], generators: [{ name, title, kind: 'json'|'text' }] }]` — files are site-absolute paths (`/data/npc.json` etc.).
  - `parsePack(source)` → `{ ok: true, data }` | `{ ok: false, error: string }` (JSON.parse errors and engine validation errors both land in `error`).
  - `buildGenerator(builtinData: object[], customPacks: {source}[])` → `{ generator, invalid: [{ id, error }] }` — loads built-ins then each valid custom pack (later wins); invalid packs skipped and reported.
  - `listGenerators(builtinPacks, customPacks)` → `[{ name, title, packTitle, custom: boolean }]` — curated titles for built-ins, table/template names discovered via `parsePack` for customs; dedupe by name (later wins).

- [ ] Write failing tests: parsePack accepts valid pack / rejects bad JSON with error / rejects engine-invalid data (e.g. entry missing `text`); buildGenerator merges packs and custom overrides built-in table; invalid custom pack is skipped and reported, generator still works; listGenerators labels builtin vs custom and dedupes.
- [ ] Run tests — expect failure.
- [ ] Implement `packs.js` (manifest can reference data files that Task 4 creates; tests use inline data only).
- [ ] Tests pass; full suite passes.
- [ ] Commit: `feat: pack catalog with custom-pack validation and merging`

### Task 3: render.js — result rendering to HTML strings

**Files:**
- Create: `tools/shared/render.js`
- Test: `tools/shared/render.test.js`

**Interfaces:**
- Produces:
  - `esc(str)` — HTML-escapes `& < > " '`.
  - `renderResult(value)` → HTML string: string → `<p class="gen-text">`, object → `<dl class="gen-card">` rows (nested arrays → `<ul>`, nested objects → nested `<dl>`), array → list, number/bool/null → inline text.
  - `resultToText(value)` → plain-text/clipboard form: strings verbatim; objects as indented `key: value` lines; arrays as `- item` lines.

- [ ] Write failing tests: esc escapes all five chars; string render escapes HTML; object render contains keys and escaped values; nested array renders `<li>`; resultToText for string / object with array.
- [ ] Run tests — expect failure.
- [ ] Implement `render.js`.
- [ ] Tests pass; full suite passes.
- [ ] Commit: `feat: HTML and plain-text rendering for generator results`

### Task 4: Built-in content packs

**Files:**
- Modify: `data/common.json` (grow word tables: more adjectives/nouns, add `first-name`, `epithet`, `weather`, `smell` etc. as needed)
- Create: `data/encounter.json` (`encounter` template + supporting tables)
- Create: `data/location.json` (`settlement` and `dungeon` templates + supporting tables)
- Create: `data/quest.json` (`quest` template + supporting tables)
- Modify: `tools/shared/packs.js` — fill `BUILTIN_PACKS` manifest entries for all four packs.
- Test: existing `data/data.test.js` (auto-covers new files); extend with shape tests for `encounter`, `settlement`, `dungeon`, `quest` mirroring the existing `npc` shape test.

**Interfaces:**
- Produces: runnable generators `npc`, `encounter`, `settlement`, `dungeon`, `quest`, plus text tables (`tavern-name`, `npc-quirk`, `loot`, …) referenced by the manifest.

- [ ] Add shape tests for the four new templates (failing).
- [ ] Author the packs; use tags/weights/variants/captures/`$repeat`/`$maybe`/`$or` where they earn their keep.
- [ ] `node --test data/` passes (strict across 25 seeds), full suite passes.
- [ ] Commit: `feat: encounter, location, and quest content packs`

### Task 5: shared UI helpers and tool styling

**Files:**
- Create: `tools/shared/ui.js` — `el(tag, attrs, ...children)`, `clearNode(node)`, `toast(message)`, `download(filename, text)`, `debounce(fn, ms)`.
- Create: `tools/shared/tools.css` — tool layout (sidebar + main), result cards, editor, buttons, toasts; reuses the site's CSS custom properties/theme.

No unit tests (DOM-only). Committed together with Task 6.

### Task 6: Generator tool

**Files:**
- Create: `tools/generator/index.html`
- Create: `tools/generator/app.js`

**Interfaces:**
- Consumes: `createStore`, `BUILTIN_PACKS`, `buildGenerator`, `listGenerators`, `renderResult`, `resultToText`, `esc`, ui helpers, `Generator` (transitively).
- Behavior: sidebar picker grouped by pack (built-ins + custom packs from `th:packs:v1`); hash deep-link `#<generator>`; Generate/reroll with optional seed (used seed always displayed); result panel with Copy and Save-to-library; library (`th:library:v1`) list/load/delete/export-all; quick-text playground running `generator.text()`; strict errors → error card; last generator remembered in `th:settings:v1`.

- [ ] Build page + wiring.
- [ ] Manual smoke via static server (`npx serve` equivalent: `python -m http.server` or node one-liner) — page loads, all generators run, seed reproduces, save/copy/library/export work, custom pack appears.
- [ ] Commit: `feat: generator tool page with library and seed control`

### Task 7: Workshop tool

**Files:**
- Create: `tools/workshop/index.html`
- Create: `tools/workshop/app.js`

**Interfaces:**
- Consumes: same shared modules; `parsePack` for validation, `buildGenerator` for preview-on-top-of-builtins.
- Behavior: pack list sidebar (`th:packs:v1`) + New (starter template) / Import (validated); editor textarea with debounced validation status; explicit Save (button + Ctrl/Cmd-S) with unsaved-changes flag; preview panel (pick generator from pack, runs on top of built-in data); rename/duplicate/delete (confirm)/export; hash deep-link `#<pack-id>`; invalid saved packs flagged in list.

- [ ] Build page + wiring.
- [ ] Manual smoke: create pack, bad JSON shows error, preview runs, save persists across reload, pack shows in Generator tool, import/export round-trips.
- [ ] Commit: `feat: workshop tool for creating and editing custom packs`

### Task 8: Landing page integration

**Files:**
- Modify: `index.html` — "Random Generators" card becomes a live `<a>` link to `tools/generator/` with badge "New"; add "Template Workshop" live card linking to `tools/workshop/`.
- Modify: `style.css` — style for `a.card` (inherit color, no underline) and a "live" badge variant if needed.

- [ ] Update cards; verify landing page visually.
- [ ] Commit: `feat: link live generator and workshop tools from landing page`

### Task 9: Final verification

- [ ] `node --test "**/*.test.js"` — full suite green.
- [ ] Serve site statically; exercise both tools end-to-end (per verify skill): run every built-in generator, seed reproducibility, library round-trip, workshop create→save→generate flow, import/export, landing links.
- [ ] Fix anything found; final commit.
