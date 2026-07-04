# Template syntax reference — plan

Implements [the design](../specs/2026-07-03-syntax-reference-design.md). TDD for
the data module; the page itself is thin, untested DOM wiring like the other
tool `app.js` files.

## 1. `tools/shared/syntax-reference.js` (test-first)

Write `tools/shared/syntax-reference.test.js` first, then the module.

Exports:

- `SYNTAX_REFERENCE_TABLES` — a JSON pack of demo tables the examples use.
  Include tagged/weighted entries so `#tag`, `#!tag`, and `*weight` examples are
  meaningful: `color` (with a `#warm`/`#cool` tag split), `beast`, `metal`,
  `mood`. Keep it small.
- `SYNTAX_REFERENCE` — array of sections. Cover exactly the parser features the
  TODO lists, one section each:
  `lookup`, `tags`, `transforms`, `capture`, `dice`, `range`, `alternatives`,
  `repetition`, `article`, `escaping`.
  Each example `{ template, note }` uses only demo tables + pure syntax.

Tests:

- Every example's `template` strict-runs on `Generator.fromData(TABLES)` across
  ~20 seeds without throwing.
- Structural: section ids are unique and non-empty; every section has a title,
  summary, and ≥1 example; every example has a non-empty `template` and `note`.
- Coverage: the set of section ids includes each of the ten named above, so a
  feature can't be dropped without failing.
- The demo pack itself is a valid pack (`Generator.fromData(TABLES)` does not
  throw).

## 2. `tools/reference/` page

- `index.html` — header (home link, `<h1>Syntax reference</h1>`, nav back to
  Generator and Workshop), a `<main>` with an intro line and a container the
  script fills. Loads `../shared/tools.css` and `app.js` as a module.
- `app.js` — imports `Generator`, `SYNTAX_REFERENCE`, `SYNTAX_REFERENCE_TABLES`,
  and `esc`/`el` helpers. Builds the demo generator once. For each section,
  render title + summary + example rows. Each row: the template in a
  `<code>`, the note, a rendered sample (`generator.text(template, {seed,
  mode:'strict'})`), and a reroll button that re-runs with a fresh seed.
  Catch `GenError` → error card. Fixed initial seed for determinism.

## 3. Links in

- Create page hint in `tools/generator/index.html`: append a link to
  `../reference/`.
- Workshop header nav in `tools/workshop/index.html`: add a `../reference/`
  link.

## 4. Verify + hand off

- `npm test` green (new suite + no regressions).
- Serve locally, open `tools/reference/`, confirm examples render and reroll.
- Check the TODO box with date + spec link. Commit on `feat/syntax-reference`.
