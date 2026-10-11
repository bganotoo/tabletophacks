# Buyer-ready pack import: metadata, versions, and a direct import view

**Date:** 2026-10-10
**Roadmap items (Monetization → Paid content packs):** Frictionless
purchased-pack import; Pack versioning and updates; Validation errors that do
not blame the buyer.

## Why these together

A buyer arrives holding a JSON file. All three items are about what happens in
the next thirty seconds: where they put it, what the tool tells them it is,
and what it says if the file is bad. They share one new piece of data — pack
metadata — and one new code path — import planning.

## Pack metadata: the `$pack` key

A pack stays a JSON object of named tables and templates. It may also carry
one reserved top-level key:

```json
{
  "$pack": {
    "title": "Haunted Coast",
    "version": "1.1.0",
    "author": "Tabletop Hacks",
    "license": "Personal and commercial table use; see the store page.",
    "support": "help@example.com",
    "url": "https://tabletophacks.com/store/haunted-coast/"
  },
  "wreck": ["…"]
}
```

- `$` cannot start a table name (`NAME_RE`), so no existing pack can collide.
- **Engine:** `Registry.load` skips `$pack` and nothing else. Every other
  `$`-name is still "invalid table name". The engine does not read the
  metadata; that is the tools' business.
- **Tools:** `tools/shared/packmeta.js` validates it. Every field is optional;
  a known field must be a non-empty string of at most 200 characters; unknown
  fields are ignored (forward compatibility); `$pack` itself must be an
  object. A bad `$pack` fails the pack like any other validation error.
- **No new storage fields.** A stored pack is still `{ id, name, source, … }`;
  metadata is always re-read from `source`, so the editor stays the single
  source of truth.

## Import planning (pure, `tools/shared/packimport.js`)

Separate from `packmeta.js` because it needs `parsePack`, and `packs.js` needs
the metadata reader — one module each way would be a cycle.

```js
planImport(existingPacks, source, filename)
  → { ok: false, message, detail, support }
  | { ok: true, action: 'add' | 'update' | 'unchanged', name, meta, existing }
```

- `name` is `meta.title`, else the filename without `.json`, else
  "Imported Pack".
- **Updates:** an incoming pack with a `title` matches an existing pack whose
  own `$pack.title` equals it (case-insensitive). Same source → `unchanged`;
  different → `update`, and the import replaces that pack's source in place,
  keeping its id. That is the "how do buyers get fixes" answer: download the
  new file, import it again. Packs without a title never match, so a
  hand-made pack is never silently replaced.
- **Failure copy** never blames the reader. `message` is fixed:
  "This pack file could not be loaded. The problem is in the file, not
  anything you did." `detail` is the technical reason (for the seller).
  `support` is `meta.support` when the `$pack` block could be read, even if
  the tables failed; the UI says "Send the details below to <support>". With
  no support field the UI says to contact whoever provided the file. The site
  has no support address of its own yet (Contact is an open roadmap item).

## Version display

`formatVersion("1.1.0")` → `v1.1.0` (no double `v`). Shown:

- Generator sidebar: next to the pack's group heading, beside "custom".
- Generator template subtitle: "From your pack “Haunted Coast” v1.1.0 — …".
- Workshop pack list: after the name.

`listGenerators` entries gain `packVersion` (`null` when absent).

## The import view

- New Generator route `#import` (reserved word, like `create`/`tables`).
  A store page can link straight to `/tools/generator/#import`.
- The sidebar's Custom group gets "Import a pack…", which opens that view.
- The view: one sentence, an "Choose a pack file…" button, and a drop zone.
  The result shows inline (not a toast — a buyer must be able to read it):
  - success: "Installed Haunted Coast v1.1.0" (or "Updated … from v1.0.0"),
    with a button per generator it adds, which opens that generator;
  - unchanged: "You already have this version";
  - failure: the fixed message, the support line, and the detail in a
    `<details>` block.
- The Workshop's own Import… uses `planImport` too, so a re-imported paid
  pack updates there as well rather than duplicating.

## Testing

- `registry.test.js`: `$pack` skipped; other `$` names still rejected.
- `packmeta.test.js`: field validation, `formatVersion`, and every `planImport`
  branch (add, update, unchanged, untitled never matches, bad JSON, bad
  tables with readable support, bad `$pack`).
- `packs.test.js`: `parsePack` returns `meta`; `listGenerators` carries
  `packVersion` and does not list `$pack`.
- `genhash.test.js`: `import` route.
- DOM wiring stays untested per repo convention.
