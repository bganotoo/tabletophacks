# Browsable table catalog — plan

Implements [the design](../specs/2026-07-03-table-catalog-design.md). TDD for
the shared logic module; the view is thin, untested DOM wiring inside the
existing Generator `app.js`, like the Create view beside it.

## 1. `tools/shared/catalog.js` (test-first)

Write `tools/shared/catalog.test.js` first, then the module.

Exports:

- `buildCatalog(generator, { builtinNames })` — name-sorted
  `{ name, count, tags, custom }[]` over `registry.tableNames()`; tags are the
  sorted union across a table's entries; `custom` flips for names absent from
  `builtinNames`. Reads only `registry.tableNames()`/`getTable()`.
- `filterCatalog(catalog, query)` — case-insensitive substring match on name or
  any tag; empty query returns the whole catalog.
- `sampleTable(generator, name, seed)` — deterministic, lenient-mode expansion
  of `{name}`, so a missing reference yields text, not a throw.

Tests: all tables listed and sorted with correct counts; JSON templates
excluded; tag unions sorted; `custom` provenance via `builtinNames`; filter
matches names and tags case-insensitively and passes everything through on an
empty query; `sampleTable` is deterministic and never throws.

## 2. Browse-tables view in the Generator tool

- `index.html` — a third `#tables-view` beside `#gen-view`/`#create-view`: a
  search input (`#catalog-search`) with a count readout and a `#catalog-list`
  container. Add a "browse available tables" link (`#tables`) to the Create-page
  hint.
- `app.js` — cache `state.catalog = buildCatalog(...)` in `rebuild()`.
  `showTables()` mirrors `showCreate()` (toggle the three views, `#tables`
  hash). `renderCatalog(query)` filters and renders cards; each card shows the
  `{name}` (click to copy), a `custom` badge, entry count, tag chips, and a
  live sample with reroll. A "Reference" sidebar group holds **Browse tables**
  and a link to the syntax reference. Route `#tables` on load, hashchange, and
  cross-tab storage refresh.

## 3. Styles

`tools.css`: `.catalog-card`, `.catalog-head`, `.catalog-name`,
`.catalog-meta`, `.catalog-tags`/`.catalog-tag`, reusing `.ref-run`/`.ref-sample`
from the syntax reference for the sample row.

## 4. Verify + hand off

- `npm test` green (new suite + no regressions).
- Exercise `buildCatalog`/`filterCatalog`/`sampleTable` over the real built-in
  data to confirm counts, tags, and samples are sensible.
- Check the TODO box with date + spec link. Commit on `feat/table-catalog`.
