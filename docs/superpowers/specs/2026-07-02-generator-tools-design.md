# Generator Web Tools — Design

Date: 2026-07-02
Status: Approved (autonomous session — user delegated all design decisions)

## Goal

Ship the first live tools on tabletophacks.com, built on the `gen/` generator
framework: a **Generator** tool for running content generators (characters,
encounters, locations, quests, loot) and a **Workshop** tool for creating and
editing custom generator packs. All user data persists in the browser via
localStorage. No build step, no dependencies — plain ES modules, matching the
rest of the repo.

## Non-goals

- No accounts, sync, or server-side anything. The site stays static.
- No visual (form-based) pack editor in v1 — the Workshop edits pack JSON
  directly with live validation and preview. A form builder can come later.
- No framework (React etc.) and no bundler.

## URL structure

```
/                          landing page (cards link to the tools)
/tools/generator/          run generators   — hash: #npc, #encounter, …
/tools/workshop/           edit packs       — hash: #<pack-id>
```

Hash fragments deep-link to a specific generator / custom pack and are kept in
sync as the user navigates, so links are shareable and reload-safe on any
static host.

## Architecture

```
tools/
  generator/
    index.html
    app.js          thin DOM wiring for the Generator tool
  workshop/
    index.html
    app.js          thin DOM wiring for the Workshop tool
  shared/
    tools.css       shared tool styling, extends the site theme
    store.js        versioned localStorage wrapper           [tested]
    packs.js        pack catalog + Generator assembly        [tested]
    render.js       result → HTML string rendering           [tested]
    ui.js           tiny DOM helpers (el, clear, toast)
data/
  common.json       (existing) shared word tables — extended
  npc.json          (existing) character/NPC generator
  encounter.json    (new) encounter generator
  location.json     (new) settlements, taverns, dungeons
  quest.json        (new) plot hooks + loot/items
```

Logic modules (`store.js`, `packs.js`, `render.js`) are pure/injectable and
unit-tested with `node --test` alongside the existing suites. The two `app.js`
files are thin untested wiring. New data files are automatically covered by
the existing `data/data.test.js` strict-run-across-seeds suite.

## Components

### store.js — versioned localStorage wrapper

- `createStore(backing = window.localStorage)` returns `{ get, set, remove }`
  over namespaced keys (`th:<name>:v1`), JSON-encoded, with safe parsing
  (corrupt/missing values return the caller's default).
- Injectable backing makes it testable in Node with a Map-based fake.

### packs.js — pack catalog and Generator assembly

- `BUILTIN_PACKS`: manifest of built-in packs
  `{ id, title, description, files: [urls], generators: [{name, title, kind}] }`.
- Custom pack shape:
  `{ id, name, description, source, updatedAt }` where `source` is the pack's
  JSON text. Stored under `th:packs:v1` as an array.
- `parsePack(source)` → `{ ok: true, data }` or `{ ok: false, error }`:
  JSON.parse + engine validation (`Generator.fromData` throws `GenError` on
  bad shapes).
- `buildGenerator({ builtinData, customPacks })` → a `Generator` with all
  built-in data plus every valid custom pack loaded on top (later loads win,
  so users can override built-in tables).
- `listGenerators(...)` → deduplicated, labeled list of runnable names for
  the picker (built-in ones get curated titles; custom ones show their pack).

### render.js — result rendering

- `renderResult(value)` → HTML string. Strings render as flowing text;
  objects render as definition cards (key/value rows, nested arrays as
  lists, nested objects as sub-cards). All interpolated text is
  HTML-escaped via an exported `esc()`.
- Pure string-in/string-out so it's testable in Node without a DOM.

### Generator tool (tools/generator/)

Layout: sidebar (generator picker grouped by pack) + main panel.

- **Run controls**: Generate button, optional seed field (blank = random;
  the seed actually used is always displayed so any result can be
  reproduced), "reroll" repeats with a fresh random seed.
- **Result panel**: rendered via `render.js`; Copy button (copies plain
  text/JSON), Save button (adds to library).
- **Library**: saved results under `th:library:v1`
  `{ id, name, generator, seed, data, savedAt }`, listed with load/delete;
  export all as JSON download.
- **Quick text box**: a one-line template input running `generator.text()`
  for ad-hoc expansions like `{3x npc-quirk.join(" / ")}` — doubles as a
  syntax playground.
- Errors from strict mode render as a friendly error card with the engine's
  message (which includes did-you-mean hints).

### Workshop tool (tools/workshop/)

Layout: sidebar (custom pack list + New/Import) + editor panel.

- **Editor**: `<textarea>` bound to the pack's JSON `source`, validated on
  input (debounced): status line shows ✓ or the JSON/GenError message.
- **Preview**: picks any generator defined in the pack (custom packs are
  previewed on top of built-in data, so they can reference `common.json`
  tables); preview panel reuses `render.js`.
- **Pack management**: create (from a commented starter template),
  duplicate, rename, delete (with confirm), export as `.json` download,
  import via file picker (validated before saving).
- Saving is explicit (Save button + Ctrl/Cmd-S); unsaved changes are flagged.
- Custom packs appear in the Generator tool automatically.

### Landing page

- "Random Generators" card → live link to `/tools/generator/`, badge "New".
- Add a "Template Workshop" card → live link to `/tools/workshop/`.
- Live cards become anchor tags; coming-soon cards stay divs.

## New content packs

All entries use the existing engine features (tags, weights, variants,
captures, `$repeat`/`$maybe`/`$or`), and must strict-run clean across 25
seeds (enforced by the existing data suite).

- **encounter.json** — `encounter` JSON template: creatures (with count
  dice), activity, location hint, complication (`$maybe`), loot (`$maybe`,
  reuses `loot`).
- **location.json** — `settlement` template (name, size, notable feature,
  rumor) and `dungeon` template (name, theme, danger, rooms via `$repeat`);
  `tavern-name` already exists in npc.json and is reused.
- **quest.json** — `quest` template (hook, patron via `npc` tables, goal,
  twist `$maybe`, reward reusing `loot`).
- **common.json** — grows word tables (adjectives, nouns, names fragments)
  as needed to support the above without repetition feeling thin.

## Error handling

- All engine runs in the tools use **strict** mode; errors are caught and
  rendered as error cards — never uncaught.
- `store.js` swallows corrupt localStorage values (returns defaults) so a
  bad write can never brick a tool.
- Workshop never persists invalid JSON silently: Save is allowed (so users
  don't lose work) but invalid packs are flagged in the pack list and
  skipped by `buildGenerator`.
- Import validates before writing; a failed import shows the error and
  changes nothing.

## Testing

- `tools/shared/store.test.js` — get/set/remove, namespacing, corrupt-value
  recovery, default handling (Map-backed fake).
- `tools/shared/packs.test.js` — parsePack accept/reject, buildGenerator
  merging + override order, listGenerators labeling, invalid packs skipped.
- `tools/shared/render.test.js` — escaping, string results, object/array
  rendering shapes.
- `data/data.test.js` — existing suite auto-validates the new packs.
- Manual verification: serve the site statically and exercise both tools
  end-to-end before finishing.
