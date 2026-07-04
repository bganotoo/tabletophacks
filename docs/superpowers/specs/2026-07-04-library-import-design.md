# Library import — design

Date: 2026-07-04
Status: approved (autonomous TODO workflow)

## Problem

The Generator tool's Library can be exported (`export-lib-btn` writes
`tabletophacks-library.json`) but there is no way to bring a library back in.
Export without import is a broken half-feature: a user who exports for backup or
to move between machines/browsers has no path to restore. TODO.md ("Generator
tool → Library import") calls for the matching import with **merge-by-id**,
mirroring the Workshop's pack import.

## Shape of the data

The library is `store.get('library', [])` — an array of entries, newest first:

```js
{ id, name, generator, seed, data, savedAt }
```

`id` is a `uid()`; `data` is the generated result (string or object); the rest
are display/metadata. Export writes this array verbatim as pretty JSON.

## Approach

Follow the repo invariant: pure, testable logic in a shared module; thin DOM
wiring in `app.js`. Two pure functions in a new `tools/shared/library.js`,
tested in `tools/shared/library.test.js`:

- **`parseLibrary(source)`** — parse and validate an exported-library JSON
  string. Returns `{ ok: true, entries }` or `{ ok: false, error }`.
  - Not valid JSON → error.
  - Not a JSON array → error ("expected a library export — a JSON array of
    entries").
  - Every element must be a plain object with a non-empty string `id` and a
    `data` field present; otherwise error naming the offending index. Strict
    (reject the whole file) beats silent partial import — a clear failure is
    easier to act on than mystery data.
  - Valid entries pass through unchanged (export shape is trusted).

- **`mergeLibrary(existing, incoming)`** — combine without duplicating.
  Returns `{ merged, added, skipped }`.
  - `merged` = all `existing` entries in order, then each `incoming` entry whose
    `id` is not already present, appended in file order.
  - Existing entries are never overwritten on id collision (local data is
    authoritative; library entries are immutable result snapshots, so a
    collision means "already have it"). `skipped` counts those; `added` counts
    the newly appended.

Appending imported entries after the existing ones (rather than resorting) keeps
the merge stable and predictable, and re-importing the same file is idempotent.

## UI

Mirror the Workshop's import wiring:

- `index.html`: an **Import** button beside **Export all** in the Library
  section, plus a hidden `<input type="file" accept="application/json">`.
- `app.js`: Import button click → file input `.click()`; on `change`, read the
  file with `FileReader`, call `parseLibrary`. On failure, `toast` the error.
  On success, `mergeLibrary` against the current `library()`, persist with
  `store.set('library', merged)` (handling the quota-false case with the
  existing "storage is full" toast), `renderLibrary()`, and toast a summary
  ("Imported N result(s)" / "already up to date" when nothing was added).

## Testing

`library.test.js` covers `parseLibrary` (bad JSON, non-array, missing/blank id,
missing data, valid passthrough) and `mergeLibrary` (append new, skip
duplicates, empty either side, counts). Wiring in `app.js` is thin and untested,
per repo convention.

## Out of scope

- Overwrite-on-collision / conflict resolution UI (immutable snapshots make it
  moot).
- Importing anything other than the library's own export shape.
