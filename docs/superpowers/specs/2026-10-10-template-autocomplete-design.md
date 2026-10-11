# Autocomplete for table names and tags in template inputs

**Date:** 2026-10-10
**Roadmap item (Deferred → Template authoring support):** Autocomplete for
table names in template inputs (Create page and Workshop editor).

## Where it applies

- Generator: the Create page's template box, and the template editor under a
  result (only while it is editable).
- Workshop: the pack editor. Its catalog is the built-ins plus the pack being
  edited — the same set a preview runs against — rebuilt whenever the editor
  validates.

## What it completes

Mirrors `gen/parser.js` for the two places a writer types a name:

- a **table** right after `{`, or after a repetition count (`{2x lo`,
  `{1d4 x tr`);
- a **tag** after `#` or `#!`, drawn from that table's own tags, minus tags
  already used in the lookup.

Never: `{{` (escaped brace), dice, ranges, `@captures`, `.transforms`, or a
bare `{` with nothing typed — that would pop up on every JSON object brace.
Matching is case-insensitive; prefix matches come first, then substring
matches; at most eight. A name typed out in full offers nothing.

Only tables are offered, not JSON templates: `catalog.js` already records
that templates cannot be the target of a `{…}` lookup.

## Pieces

- `tools/shared/complete.js` (pure, tested): `completionContext(text,
  cursor)`, `completions(context, catalog)`, `applyCompletion(…)`.
- `tools/shared/autocomplete.js` (DOM wiring, untested by convention):
  `attachAutocomplete(field, getCatalog)`. The list opens at the caret
  (mirror-div measurement), follows the ARIA combobox pattern
  (`aria-activedescendant`, `role=listbox/option`), and takes ArrowUp/Down,
  Enter or Tab to accept, Escape to close. Accepting dispatches an `input`
  event so the page's validation and dirty flags run as if typed.
