# Template syntax reference — design

Date: 2026-07-03. Implements the first item under "Template authoring support"
in [TODO.md](../../../TODO.md): an in-product reference for the `{...}` template
syntax, needed now that users write their own templates on the Create page (see
[custom templates design](2026-07-03-custom-templates-design.md)) and edit
definitions via [View template](2026-07-03-view-template-design.md).

## Goal

A page that documents every piece of `{...}` syntax the parser understands —
table lookups, `#tag`/`#!tag` filters, `.transform` mods, `@capture`/`@ref`,
dice, ranges, weighted alternatives, `{Nx ...}` repetition, and the smart
article — each with a short explanation and a **live, worked example** the
reader can see actually running. Linked from both the Create page and the
Workshop, the two places users write templates.

## Why the reference is data, not prose

The failure mode of hand-written docs is drift: the syntax changes, the prose
doesn't, and the example in the docs no longer runs. This repo already avoids
that for content packs — `data/data.test.js` strict-runs every generator so a
broken pack fails the suite. The reference gets the same treatment.

The reference is a structured module, `tools/shared/syntax-reference.js`,
exporting two things:

- `SYNTAX_REFERENCE_TABLES` — a small, self-contained content pack (the same
  JSON shape as `data/*.json`) defining the demo tables the examples use
  (`color`, `beast`, `metal`, …). Self-contained so the examples never depend
  on the current contents of the real built-in packs, which are free to change.
- `SYNTAX_REFERENCE` — an ordered array of sections. Each section is
  `{ id, title, summary, examples }`; each example is `{ template, note }`
  where `template` is a **runnable** template string over the demo tables.

A companion test (`tools/shared/syntax-reference.test.js`) builds
`Generator.fromData(SYNTAX_REFERENCE_TABLES)` and strict-runs every example's
`template` across many seeds, asserting none throw. A documented example that
stops parsing or references a missing table fails CI, exactly like a broken
pack. The test also pins structural invariants (unique section ids, every
section covered, each example carries both a template and a note) and asserts
the sections named in the TODO all exist, so the reference can't silently lose
coverage of a feature.

## The page

A new standalone mini-tool at `tools/reference/` (`index.html` + thin
`app.js`), styled with the shared `tools.css`. It is a helper, not a generator,
so it does not appear on the homepage's tool grid or in the Generator sidebar;
it is reached only from the two authoring surfaces that link to it.

`app.js` builds one demo generator from `SYNTAX_REFERENCE_TABLES` and, for each
section, renders the title, summary, and every example as: the template string
(monospace, escaped via `esc`), its note, and a **live sample** produced by
running the template through the demo generator. Each example has its own
"reroll" control that re-runs with a fresh seed, so the reader can watch one
template vary — demonstrating the seedable RNG that the rest of the tools rely
on. Samples render with a fixed seed on first paint so the page is
deterministic until the reader interacts.

All engine runs are strict mode and every `GenError` is caught and shown as an
error card, per the tool invariants in [CLAUDE.md](../../../CLAUDE.md) — though
the test guarantees the built-in examples never error in practice.

## Links in

- **Create page** (generator tool): the existing hint under the template
  editor gains a "See the full syntax reference" link to `../reference/`.
- **Workshop**: a nav link in the header (`../reference/`), alongside the
  existing "← Generator" link.

## Non-goals

- Autocomplete and a browsable table catalog are separate TODO items; this page
  documents *syntax*, not the catalog of table names in the assembled
  generator.
- No editing or saving from the reference page — it links back to the Create
  page for that.
