# Browsable table catalog — design

Date: 2026-07-03. Implements the second item under "Template authoring support"
in [TODO.md](../../../TODO.md): a searchable list of every table the assembled
generator knows, with a sample value per table, so writers can discover the
names and tags a `{...}` lookup needs *before* they type it.

## Goal

Writing `{adjective#magic}` requires knowing both that a table named
`adjective` exists and that it carries a `#magic` tag. The engine's
did-you-mean suggestions help *after* a typo; the catalog helps *before*. It
answers three questions at a glance:

- **What tables can I reference?** — every table name in the assembled
  generator, built-in and custom.
- **What tags does a table support?** — the union of tags across a table's
  entries, so `{table#tag}` filters have something to match.
- **What does it produce?** — a live, rerollable sample value per table.

## Scope: tables, not templates

`{...}` lookups resolve **tables** only (via `Registry.entriesFor`), never JSON
templates. So the catalog lists exactly `registry.tableNames()` — including the
private sub-tables (`color`, `metal`, the quirk pieces, …) that never appear in
the sidebar picker but *are* referenceable from a template. JSON templates
(`npc`, `quest`) are intentionally excluded; you cannot write `{npc}` in a text
template. This is the catalog's whole reason to exist: surfacing the referenceable
vocabulary the picker hides.

## Testable logic in a shared module

Following the repo convention (logic in `tools/shared/` with tests, thin
untested DOM wiring in `app.js`), a new module `tools/shared/catalog.js` owns
everything worth testing:

- `buildCatalog(generator, { builtinNames } = {})` → a name-sorted array of
  `{ name, count, tags, custom }`, where `count` is the entry count, `tags` is
  the sorted union of tags across entries, and `custom` flags a table whose
  name is not in `builtinNames` (so custom-pack tables are marked; when
  `builtinNames` is omitted, nothing is flagged). Reads only the public
  `registry.tableNames()` / `registry.getTable()` surface, so it stays engine-
  agnostic.
- `filterCatalog(catalog, query)` → the catalog filtered to rows whose name or
  any tag contains `query` (case-insensitive substring); empty query returns
  the whole catalog. This is the search box's logic, isolated for testing.
- `sampleTable(generator, name, seed)` → a deterministic, fully-expanded sample
  of one table, run in **lenient** mode so a table whose entries reference a
  missing name still yields text (with the engine's visible placeholder)
  instead of throwing. Determinism per seed lets the UI paint a stable first
  sample and reroll on demand, mirroring the reference page.

A companion `tools/shared/catalog.test.js` pins these: the catalog lists all
tables (and no JSON templates) sorted with correct counts and tag unions,
`custom` provenance flips on `builtinNames`, `filterCatalog` matches names and
tags case-insensitively and passes everything through on an empty query, and
`sampleTable` returns a string without throwing even when an entry references an
unknown table.

## The view

The catalog lives inside the Generator tool as a third main-panel view
alongside Generate and Create (it needs the *assembled* generator — built-in
plus the user's custom packs and overrides — which only that tool builds; the
static reference page has no generator to enumerate). A **Reference** group at
the bottom of the sidebar holds a **Browse tables** button; selecting it routes
to `#tables` and shows the view, exactly like `#create`.

The view is a search input over a list of table cards. Each card shows the table
name (with a `custom` badge when applicable), its entry count, its tags as
chips, and a live sample with a reroll control. Typing in the search box filters
the list live (debounced) via `filterCatalog`. Clicking a table name copies the
`{name}` lookup to the clipboard — the fastest path from "I found the table" to
"it's in my template". Samples paint with a name-derived seed for a
deterministic first render, then vary on reroll.

All engine runs stay caught: `sampleTable` is lenient so it cannot throw, and
any surprise is still rendered as text, honoring the CLAUDE.md tool invariants.

## Links in

- **Create page**: the existing hint under the template editor gains a "Browse
  available tables" link to `#tables`, next to the syntax-reference link — the
  catalog and the syntax docs are the two things a writer reaches for.
- **Sidebar**: the Reference group's **Browse tables** button, present on every
  view.

## Non-goals

- **Autocomplete** in the template inputs is the next TODO item; it will reuse
  this same name/tag index but is out of scope here.
- No editing from the catalog — it is a read-only discovery surface. Editing a
  table is View template's and the Workshop's job.
- The Workshop does not get the catalog in this pass. It assembles a generator
  too, so a follow-up could surface the same view there; the immediate need is
  at the point of authoring on the Create page.
