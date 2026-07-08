# Copy as Markdown — design

**Date:** 2026-07-07
**TODO item:** Generator tool → "Copy as Markdown alongside plain-text copy, for
pasting into Notion/Obsidian prep docs".

## Goal

Beside the existing **Copy** (plain text) button, add **Copy as Markdown** so a
generated result — or a whole batch — pastes into Notion/Obsidian as structured
Markdown: bold field labels, bullet lists, and per-item headings for batches,
instead of the loose `key: value` / `- item` indentation the plain-text copy
produces.

## Principles

- **Plain-text copy is untouched.** `resultToText`/`resultsToText` and the
  existing Copy button behave exactly as today. Markdown is a second, parallel
  serializer.
- **Keep logic in the tested shared module.** The Markdown serializers live in
  `tools/shared/render.js` next to their text counterparts and get test
  coverage; `app.js` stays thin wiring (one more button, one more handler).
- **Faithful, not clever.** Values are emitted verbatim (no Markdown escaping) —
  matching `resultToText`, which also copies content verbatim. Generated tabletop
  content is fantasy names and flavor text; over-escaping would hurt readability
  more than the rare literal `*`/`_` helps.

## Serialization

New exports in `tools/shared/render.js`:

- `resultToMarkdown(value)` — one result:
  - **string** → the string verbatim (a Markdown paragraph).
  - **object** → a bullet list, one bullet per key: `- **key:** value`. A nested
    object/array value becomes `- **key:**` followed by its bullets, indented two
    spaces per level.
  - **array** → a bullet list, `- item` per element; object/array elements nest
    with deeper indentation (mirrors the plain-text `textLines` shape, but with
    `- ` bullets at every level and bold keys).
  - **number/boolean/null** → its `String()` form.
- `resultsToMarkdown(values)` — a batch (non-empty array):
  - length 1 → `resultToMarkdown(values[0])` (single output, no heading).
  - length > 1 → each item as `### <n>` heading + blank line + its Markdown,
    joined by blank lines. Headings (rather than the plain-text `#<n>` label)
    give Notion/Obsidian a real outline for a rolled list.

`renderResult`/`resultToText`/`renderResults`/`resultsToText` are unchanged.

## App wiring (`tools/generator/app.js`)

- **HTML:** a `#copy-md-btn` button in `.result-actions`, next to `#copy-btn`,
  disabled/enabled in lockstep with it (same three enable/disable sites:
  successful `generate`, error `generate`, and opening a library entry).
- **Handler:** `navigator.clipboard.writeText(resultsToMarkdown(state.results))`
  then `toast('Copied as Markdown')`, guarded by the same
  `state.results.length === 0` early-return as Copy.

No state, hash, or library changes — Markdown is derived from `state.results`
on demand, exactly like the plain-text copy.

## Testing

- `render.test.js` — `resultToMarkdown`: strings verbatim; object → bold-key
  bullets; nested object/array indentation; top-level array; primitives.
  `resultsToMarkdown`: single-delegation; multi with `### n` headings and blank
  lines; escaping-free verbatim values.
- `app.js` stays untested DOM wiring, per repo convention.

Manual check: serve locally, generate an NPC and a batch of 3, Copy as Markdown,
paste into a Markdown preview, confirm bold labels, bullets, and per-item
headings render.
