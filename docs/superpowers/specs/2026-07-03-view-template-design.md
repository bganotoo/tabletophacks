# View template — design

Date: 2026-07-03. Implements the second item under "Custom templates" in
[TODO.md](../../../TODO.md): retire the "Quick template" section and give every
generator page a way to reveal — and, for built-ins, edit — its underlying
definition. Builds directly on the Create page shipped earlier the same day
(see [custom templates design](2026-07-03-custom-templates-design.md)).

## Goal

On any generator page, the user can reveal the JSON definition that produces
that generator's output. For a **built-in** generator they can edit it and save
a personal override that shadows the built-in for them only, with a clear
"modified" indicator and one-click reset. For **any** generator (built-in or
custom) they can "Save as…" a copy under a new name into their custom
templates. The one-off "Quick template" box is removed; the Create page already
covers scratch template testing and saving.

## Why overrides are a hidden, last-loaded pack

The engine already resolves name collisions by load order — later loads win
(the pack load-order invariant in [CLAUDE.md](../../../CLAUDE.md)). A per-user
override of a built-in is exactly "a definition that must win over the
built-in," so it is stored as a custom pack that loads **last**, after every
other custom pack. No new resolution mechanism is introduced.

The override pack is reserved, like `my-templates`:

- fixed id `my-overrides` (ordinary Workshop packs get random `uid()` ids)
- display name "My Overrides"
- same `{ id, name, description, source, updatedAt }` shape as every pack
- its `source` is a JSON object mapping an **overridden name** to the edited
  definition, e.g. `{ "npc-quirk": ["always polishing a coin", …] }`

Because it is an ordinary pack it survives export/import and is visible in the
Workshop like `my-templates` — no special-casing for storage, only for load
order and picker visibility (below).

## Scope of what "View template" shows

A generator's definition is not always a one-line string:

- **JSON templates** (`npc`, `quest`, `settlement`, …) are objects.
- **Text generators** (`npc-quirk`, `tavern-name`, `loot`) are whole tables
  (arrays of strings/entry objects).
- **Saved templates** (My Templates) are one-entry tables.

So the panel shows the **pretty-printed JSON of the definition value** for the
selected name — the object or the array — never a pretend one-liner. This is
the same JSON shape the Workshop editor already validates via `parsePack`, so
editing reuses the exact same validation path.

Showing referenced private tables read-only alongside the definition (the
"consider" note in the TODO) is **out of scope** here; it needs reference
extraction from arbitrary templates and is better handled by the planned table
catalog. Noted as a follow-up.

## Effective vs. default definition

"View template" always shows the **effective** definition — what actually runs
for that name given the current packs. Resolution order mirrors
`buildGenerator`: built-in data, then custom packs, then the override pack
last. A pure helper computes it:

- `effectiveDefinition(builtinData, customPacks, name)` → the raw value
  (array/object) the assembled generator would resolve for `name`, or `null`.

A built-in name is "modified" precisely when the override pack contains an
entry for it. The sidebar and the panel key their indicators off
`overriddenNames(packs)`, not off a value comparison, so the state is
unambiguous and cheap.

## Shared logic

### `tools/shared/overrides.js` (new, unit-tested)

Pure functions over the packs array, mirroring `templates.js`:

- `MY_OVERRIDES_ID` / `MY_OVERRIDES_NAME` — reserved pack constants.
- `overriddenNames(packs)` → `string[]` of names the override pack defines
  (`[]` when absent or corrupt).
- `saveOverride(packs, name, value)` → `{ ok, packs? , error? }`. Validates
  `{ [name]: value }` with `parsePack` (so a malformed edit can't be saved);
  creates the reserved pack on first override; overwrites in place otherwise.
- `removeOverride(packs, name)` → new packs array; drops the reserved pack
  entirely when its last override is removed (matching `deleteTemplate`).

### `tools/shared/packs.js` (extended)

- `buildGenerator` and `listGenerators` treat the override pack specially:
  it loads **last** in `buildGenerator` (so overrides win over everything),
  and is **excluded** from `listGenerators` (it introduces no new picker
  entries — it only reshapes existing built-in names, which already appear via
  their built-in pack). Both changes are internal; call sites are unchanged.
- `effectiveDefinition(builtinData, customPacks, name)` (new) — resolves the
  raw definition value for a name across built-ins + customs + overrides-last.

### `tools/shared/templates.js` (extended)

- `saveDefinition(packs, name, value)` → `{ ok, packs? , error? }`. Like
  `saveTemplate` but stores a raw definition value (array or object) rather
  than wrapping a string as `[template]`. Backs "Save as…" for JSON templates
  and multi-entry tables. Such entries run from the sidebar and appear via
  `listGenerators`, but (as already specified) are not listed by
  `myTemplates`, which stays limited to simple one-string templates.

## Generator UI

### View template panel

Replaces the Quick template `<section>` on the generate view. It is a
`tool-section` that reflects the selected generator:

- **Heading + definition**: a textarea, read-only by default, holding the
  effective definition as pretty-printed JSON. A subtitle notes the kind
  ("built-in", "your saved template", "from your pack …") and, when modified,
  a "modified" tag.
- **Built-in generator**: an **Edit** toggle enables the textarea. While
  editing, live validation (via `parsePack` on `{ [name]: value }`) drives an
  `editor-status` line; **Save changes** writes the override and rebuilds;
  **Cancel** reverts the textarea to the effective definition. When an
  override exists, **Reset to default** removes it.
- **Custom generator** (My Templates or a Workshop pack): textarea stays
  read-only with a hint pointing at where to edit it (the Create page for My
  Templates, the Workshop otherwise). No override path — the definition's home
  is the pack that owns it.
- **Save as…** (all generators): an inline name input + button copies the
  current textarea definition under a new name into My Templates, with the
  same name validation and shadow/update warnings as the Create page.

Whether a name is a built-in is decided by `state.builtinNames.includes(name)`,
not by the picker's `custom` flag — because once a built-in is overridden, the
override pack would otherwise mark it "custom." This keeps an overridden
built-in on the editable path.

### Sidebar "modified" indicator

Built-in sidebar items whose name is in `overriddenNames(packs)` get a small
marker (reusing the `item-flag` slot, accent-colored, titled "You've edited
this generator") so a diverged generator is visible at a glance — the TODO's
explicit requirement so users don't forget they changed something and blame
the site.

### Retire Quick template

The Quick template `<section>`, its `runQuick` handler, and its wiring are
removed. Scratch testing lives on the Create page (`#create`), which the
sidebar's "+ New template" already surfaces.

## State sync

Saving an override or a "Save as" copy calls the same `rebuild()` +
`store.set('packs', …)` path the Create page uses, so the sidebar, picker, and
current result refresh in place, and the existing cross-tab `storage` listener
picks up edits made in another tab (e.g. the Workshop).

## Testing

- `overrides.test.js`: `overriddenNames`, `saveOverride` (create/overwrite/
  validation/immutability), `removeOverride` (remove/empty-drop/no-op/
  immutability).
- `packs.test.js` additions: override pack loads last and wins over other
  custom packs; `listGenerators` excludes the override pack; `effectiveDefinition`
  resolves built-in / custom / overridden cases.
- `templates.test.js` additions: `saveDefinition` stores raw array/object
  values, validates names, and does not mutate input.

DOM wiring in `app.js` stays thin and untested, per the repo convention; all
new logic lives in the shared modules above.

## Out of scope

- Editing custom generators through this panel (they are edited in their owning
  tool).
- Showing referenced private tables alongside a definition (follow-up, needs
  the table catalog's reference index).
- The syntax reference page and table catalog (later TODO items).
