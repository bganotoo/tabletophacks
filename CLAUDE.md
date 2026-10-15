# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
npm test                              # full suite (node --test, 650+ tests)
node --test tools/shared/store.test.js   # one test file
node --test data/                     # just the content-pack validation suite
node --test seo.test.js               # just the per-page metadata suite
node --test a11y.test.js              # static labels/names on every HTML page
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

2. **`data/` — built-in content packs** (content, no code). Each JSON file maps names to either a **table** (array of strings/entry objects) or a **JSON template** (object). `data/data.test.js` auto-discovers every `*.json` in the directory and strict-runs every generator across 25 seeds — a new pack gets validation coverage just by existing, and must pass it. `data/originality.test.js` is auto-discovering too: it fails on any denylisted name (WotC Product Identity and settings, enforced Tolkien terms, and names the 2026-10-10 IP audit removed). Add to its denylist rather than around it; `docs/superpowers/specs/2026-10-10-data-originality-audit.md` records the method a new pack should get. `common.json` holds shared word tables the other packs reference.

   Sentence tables are built for variety (see `docs/superpowers/specs/2026-10-12-generator-variety-design.md`): a headline field is a weighted dispatcher over themed sub-tables named after it (`quest-hook` → `quest-hook-plea`, …), so adding lines never shifts a family's odds; lines take slots from shared vocabulary rather than baking in specifics; and many tables compose a `-core` with an optional tail, joined only onto entries tagged `short` (comma-free). Tags keep slotted combinations viable (`noun#building` for a deed, `foe#sapient` for a captor, `someone#!clause` before another clause) — prefer a tag over a line that is only sometimes true. Write `{a}` before any slot, never a literal "a". A line about a template's own person (the NPC, a quest's patron) uses the pronoun helpers from `common.json` (`{they} never explain{s}`, `{their}`, `{are}`) rather than a literal "they"; the template binds that person once with `"$with": "{pronoun#$pronouns@p}"` and names them with `subject-name`. Literal "they" is right for groups and for anyone else (see README "People and pronouns"). `data/grammar.test.js` checks every lookup against every entry it could pick and samples every generator for a/an, doubled words, and "1 + plural"; `data/variety.test.js` holds a floor under each headline field's effective sentence frames; `data/pronoun.test.js` runs each pronoun set through the person templates and fails on a mismatched name or "she are".

3. **`tools/` — the web tools** (Generator at `tools/generator/`, Workshop at `tools/workshop/`). Testable logic lives in `tools/shared/` as pure/injectable modules (`store.js` versioned localStorage wrapper, `packs.js` pack catalog + assembly, `render.js` result→HTML). Each tool's `app.js` is deliberately thin, untested DOM wiring — put any logic worth testing in a shared module instead. `tools/shared/packs.js` also holds `BUILTIN_PACKS`, the manifest that makes a data pack visible in the tools; new built-in packs must be added there.

The landing page (`index.html`) links to the tools; card badges are "Live" (anchor) or "Coming Soon" (div). Its screenshots (`assets/shot-*.webp`) are hand-captured from the real tools — retake them after a visible UI change.

Two site pages sit outside `tools/`: `your-data/` (what is saved, per tool, plus whole-site backup and restore — the one home for those) and `privacy/` (static prose; keep it true when anything new talks to a third party). Every page, `404.html` included, ends with the same `<footer class="site-footer">` linking Home, Your data, and Privacy; `seo.test.js` enforces it. Only pages under `tools/` carry `SoftwareApplication` JSON-LD.

## Invariants

- All engine runs in the tools use strict mode; every `GenError` is caught and rendered as an error card, never left uncaught.
- Any user or generated text interpolated into HTML goes through `esc()` from `tools/shared/render.js`.
- localStorage keys are namespaced and versioned: `th:<name>:v1` (handled by `store.js`; never touch localStorage directly). `store.setRaw` is the one entry point that takes a full key — for restoring a backup — and it refuses anything outside `th:`.
- `store.set` returning `false` means the write was lost. Tools pass `onError` to `createStore` and let it report the reason; do **not** add a second failure toast at the call site, because `toast` is single-slot and would replace the useful message.
- Export files are `backup.js` envelopes tagged with a kind and a `SNAPSHOT_VERSION`. Adding an exportable tool means a `SNAPSHOT_KINDS` entry (with its shape guard) — not a new file format. Bump `SNAPSHOT_VERSION` only for a breaking change; a file with a higher version is refused.
- Pack load order matters: later loads win, which is how custom packs override built-in tables. `buildGenerator` and `listGenerators` must stay consistent on this.
- `a` and `an` are reserved names (smart article), rejected by the Registry.
- `$pack` is the one reserved top-level key a pack may carry: metadata (`title`, `version`, `author`, `license`, `support`, `url`) that `Registry.load` skips and `tools/shared/packmeta.js` validates. Stored packs gain no fields for it — metadata is always re-read from `source`. Imports go through `planImport` (`tools/shared/packimport.js`) in both the Generator and the Workshop, so a titled pack updates in place instead of duplicating.
- Every page carries the same SEO head block (description, canonical, Open Graph, Twitter card, icons, manifest) plus `SoftwareApplication` JSON-LD on tool pages. `seo.test.js` auto-discovers every `index.html` and enforces it, so **a new tool page also needs a `sitemap.xml` entry** or the suite fails. Canonical origin is `https://tabletophacks.com`, directory URLs with trailing slashes.
- Site icons (`favicon.*`, `apple-touch-icon.png`, `icon-*.png`, `og-image.png`) are committed binaries generated from `assets/*.svg` by `assets/build-icons.sh`. That script is authoring-time only — never a build step, never run by the site or the tests.

## Design docs

`docs/superpowers/specs/` and `docs/superpowers/plans/` hold the design spec and implementation plan for the generator tools — the authoritative record of intent for that feature set.
