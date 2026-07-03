# Custom templates — implementation plan

Spec: [2026-07-03-custom-templates-design.md](../specs/2026-07-03-custom-templates-design.md)

## Step 1 — `tools/shared/templates.js` (TDD)

Write `tools/shared/templates.test.js` first, then the module.

Tests cover:
- `myTemplates`: empty packs, missing reserved pack, round-trip after save,
  skips non-simple entries (multi-entry table, JSON template, entry object),
  ignores packs with other ids, tolerates invalid JSON source.
- `validateTemplateName`: valid names pass; empty / bad pattern / `a`/`an`
  fail with messages; shadowing a builtin warns; existing template warns
  (update).
- `saveTemplate`: creates reserved pack with correct shape (`id`, `name`,
  `source`, `updatedAt`); appends without touching other packs; overwrite
  keeps entry position; rejects invalid names; result parses via `parsePack`;
  input array not mutated.
- `deleteTemplate`: removes entry; removes pack when empty; no-op for
  unknown name; input not mutated.

## Step 2 — `packs.js`: `packId` in `listGenerators`

Add `packId` to both builtin and custom entries. Update `packs.test.js`
`deepEqual` assertions and add an assertion for `packId`.

## Step 3 — Generator UI

- `index.html`: wrap the existing main-panel content in `#gen-view`; add
  `#create-view` (hidden) with name/template inputs, run bar, output panel,
  validation line, save button, saved-templates list.
- `app.js`: sidebar special-cases `packId === MY_TEMPLATES_ID` into a
  trailing "Custom" group with a "+ New template" item; `#create` routing in
  `initialSelection`/`hashchange`; create-view wiring (run/reroll/save/
  load/delete) calling the shared module and `rebuild()` after writes.
- `tools.css`: only what existing classes don't cover (side-item action
  styling, validation message states).

## Step 4 — Verify & finish

- `npm test` green.
- Serve locally, load both tool pages for module/syntax sanity.
- Self-review the diff; check off the TODO item; commit on the feature
  branch and hand off for user review.
