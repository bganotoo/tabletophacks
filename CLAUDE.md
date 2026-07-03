# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
npm test                              # full suite (node --test, 140+ tests)
node --test tools/shared/store.test.js   # one test file
node --test data/                     # just the content-pack validation suite
```

There is no build step, no lint step, and no npm dependencies — `package.json` exists only for the `test` script. Node's built-in test runner (`node:test` + `node:assert/strict`) is the only tooling.

To run the site locally, serve the repo root over HTTP (ES modules and `fetch` don't work from `file://`):

```sh
python -m http.server   # then open http://localhost:8000
```

## What this is

Static site for tabletophacks.com: browser tools for tabletop gaming. Plain ES modules (ES2022), no framework, no bundler, no server-side anything. User data persists only in localStorage.

## Architecture

Three layers, each building on the one before:

1. **`gen/` — the generator framework** (engine, no content). `parser.js` owns all `{...}` template-string syntax (table lookups with `#tag`/`#!tag` filters, `.transform` mods, `@capture`s, dice `{3d6}`, ranges `{2-12}`, alternatives `{a|b*3}`, repetition `{2x loot}`, smart article `{a}`). `engine.js` holds the `Registry` (tables + JSON templates) and the evaluators, throwing `GenError` with did-you-mean suggestions. `rng.js` is a seedable RNG — same seed, same output, always. `index.js` exports the public `Generator` API (`load`, `fromData`, `run`, `text`); it works in both Node (fs) and the browser (fetch). Runs are `strict` (unknown names throw) or `lenient` (warnings array).

2. **`data/` — built-in content packs** (content, no code). Each JSON file maps names to either a **table** (array of strings/entry objects) or a **JSON template** (object). `data/data.test.js` auto-discovers every `*.json` in the directory and strict-runs every generator across 25 seeds — a new pack gets validation coverage just by existing, and must pass it. `common.json` holds shared word tables the other packs reference.

3. **`tools/` — the web tools** (Generator at `tools/generator/`, Workshop at `tools/workshop/`). Testable logic lives in `tools/shared/` as pure/injectable modules (`store.js` versioned localStorage wrapper, `packs.js` pack catalog + assembly, `render.js` result→HTML). Each tool's `app.js` is deliberately thin, untested DOM wiring — put any logic worth testing in a shared module instead. `tools/shared/packs.js` also holds `BUILTIN_PACKS`, the manifest that makes a data pack visible in the tools; new built-in packs must be added there.

The landing page (`index.html`) links to the tools; card badges are "Live" (anchor) or "Coming Soon" (div).

## Invariants

- All engine runs in the tools use strict mode; every `GenError` is caught and rendered as an error card, never left uncaught.
- Any user or generated text interpolated into HTML goes through `esc()` from `tools/shared/render.js`.
- localStorage keys are namespaced and versioned: `th:<name>:v1` (handled by `store.js`; never touch localStorage directly).
- Pack load order matters: later loads win, which is how custom packs override built-in tables. `buildGenerator` and `listGenerators` must stay consistent on this.
- `a` and `an` are reserved names (smart article), rejected by the Registry.

## Design docs

`docs/superpowers/specs/` and `docs/superpowers/plans/` hold the design spec and implementation plan for the generator tools — the authoritative record of intent for that feature set.
