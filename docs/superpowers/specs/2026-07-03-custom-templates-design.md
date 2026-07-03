# Custom templates — design

Date: 2026-07-03. Implements the first item under "Custom templates" in
[TODO.md](../../../TODO.md): a "Custom" section in the Generator sidebar,
starting with a Create page.

## Goal

Let a user write a template string in the Generator tool, test it (strict
mode, seedable, same error cards as everywhere else), and save it under a
short name. Saved templates appear in a **Custom** group in the sidebar and
behave like any other generator: seed control, reroll, save to library.

## Storage: a reserved user pack

Saved templates are backed by the existing custom-pack system — no new
storage shape. They live in one reserved pack inside `th:packs:v1`:

- fixed id `my-templates` (ordinary Workshop packs get random `uid()` ids,
  so the fixed id is unambiguous and survives a Workshop rename)
- display name "My Templates"
- same `{ id, name, description, source, updatedAt }` shape as every other
  custom pack

Each saved template is a **one-entry table**: `"treasure": ["{a}
{adjective} {noun}"]`. Running `treasure` expands that single entry.

Because it is an ordinary pack, everything downstream works unchanged:
`buildGenerator` merges it (later loads win), `listGenerators` lists its
entries, the Workshop can view/edit/export/import it, and the generator
tool's `storage` listener picks up cross-tab edits.

## Shared logic: `tools/shared/templates.js`

Pure functions over the packs array (the `store.get('packs')` value), all
returning new arrays — no storage access, fully unit-tested:

- `MY_TEMPLATES_ID` / `MY_TEMPLATES_NAME` — the reserved pack constants.
- `myTemplates(packs)` → `[{ name, template }]`. Only entries that are
  single-string arrays count as editable templates; entries reshaped in the
  Workshop (multi-entry tables, JSON templates) are skipped here but still
  run from the sidebar like any pack content.
- `validateTemplateName(name, { builtinNames, templateNames })` →
  `{ ok, error?, warning? }`. Errors: empty, doesn't match the engine name
  pattern (`/^[A-Za-z_][A-Za-z0-9_-]*$/`), reserved `a`/`an`. Warnings:
  name shadows a built-in (collision = override, per the pack load-order
  invariant), or updates an existing saved template.
- `saveTemplate(packs, name, template)` → `{ ok, packs? , error? }`.
  Creates the reserved pack on first save; overwrites an existing entry of
  the same name in place. Pack `source` stays pretty-printed so it reads
  well in the Workshop editor.
- `deleteTemplate(packs, name)` → new packs array; removes the reserved
  pack entirely when its last template is deleted.

`listGenerators` in `packs.js` additionally reports each entry's `packId`
so the sidebar can tell reserved-pack entries apart from other custom
packs.

## Generator UI

- **Sidebar**: entries from the reserved pack are pulled out of the normal
  per-pack custom grouping and rendered in a **Custom** group (with the
  existing `custom` badge), always last, always present. The group always
  ends with a "+ New template" item that opens the Create view.
- **Create view**: a second panel in the main column, toggled with the
  existing generator view; routed as `#create` (takes priority over a
  generator that happens to be named `create`). Contains:
  - name input + template input
  - seed input, Run, Reroll — strict mode via `generator.text()`, output
    and `GenError`s rendered exactly like the main result panel
  - Save with inline validation (error blocks save; shadow/update warnings
    don't)
  - a list of saved templates with Load and Delete
- Saving rebuilds the generator and sidebar in place. Quick template stays
  for now — retiring it is the *next* TODO item, out of scope here.

## Out of scope

Editing built-in generators ("View template"), the syntax reference page,
and the table catalog — all later TODO items that build on this.
