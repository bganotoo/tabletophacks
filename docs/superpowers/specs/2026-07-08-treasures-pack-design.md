# Treasures content pack — design

**Date:** 2026-07-08
**TODO item:** Content packs → "More built-in packs" (first of the list: magic
items / trinkets).

## Goal

Ship a new built-in content pack that fills the most-requested gap in the
current set (characters, encounters, locations, quests): **treasure**. GMs reach
for a magic-item or trinket table constantly — to reward a hoard, to flesh out a
merchant's stock, or to make a pocket's-worth of loot memorable. This pack adds
three featured generators:

- `magic-item` (JSON) — a named, rarity-tagged wondrous item with a property and
  an optional quirk.
- `trinket` (text) — a single evocative but mundane curio, in the spirit of the
  classic d100 trinket table.
- `potion` (text) — a draught: appearance, vessel, and effect in one line.

## Principles

- **Content, no code.** A pack is JSON only; `data/data.test.js` auto-discovers
  every `*.json` and strict-runs every generator across 25 seeds, so the pack
  earns validation coverage just by existing (the invariant in CLAUDE.md). The
  only code change is one `BUILTIN_PACKS` entry so the tools list it.
- **Build on the shared vocabulary.** All built-in pack files are loaded into
  one generator at runtime ([tools/generator/app.js](../../../tools/generator/app.js)
  fetches every `BUILTIN_PACKS[].files`), so this pack reuses `common.json`'s
  `adjective`/`noun`/`metal`/`first-name` tables and even `creature`
  (encounter), `place-name` (location), and `weather` (common) — exactly as
  `quest.json` already reaches across packs. New content only where the treasure
  domain needs it.
- **Watch weights and grammar.** Rarer, flavourful entries carry `weight < 1` so
  they stay rare; `item-rarity` is weighted so `legendary` is uncommon. Every
  entry that sits after `{a}` is written to read correctly with the smart
  article, and appearance/name fragments are shaped to fit their sentence frame.

## New tables (`data/treasure.json`)

Supporting tables (private building blocks, not featured in the picker):

- `item-form` — the physical object (ring, blade, cloak, staff…), weighted so
  common forms dominate.
- `magic-item-name` — evocative proper titles ("Dawnbreaker", "{first-name}'s
  Bane", "the {adjective#mood} Hour"…). Deliberately independent of `item-form`:
  named items whose title need not describe their shape, which keeps each table
  independently browsable and avoids brittle cross-field capture.
- `item-rarity` — common / uncommon / rare / very rare / legendary, weighted.
- `item-property` — what the item *does*, phrased to fit any form and reusing
  `creature`, `noun#treasure`, and `weather`.
- `item-quirk` — a minor drawback or personality, the `$maybe` field.
- `potion-appearance` / `potion-vessel` / `potion-effect` — the three parts the
  `potion` line composes.

Featured generators:

- `trinket` — a flat text table of curios.
- `potion` — a text table of one-line patterns composing the three potion parts.
- `magic-item` — the JSON template:

  ```json
  {
    "name": "{magic-item-name}",
    "form": "{item-form}",
    "rarity": "{item-rarity}",
    "property": "{item-property}",
    "quirk": { "$maybe": 0.55, "value": "{item-quirk}" }
  }
  ```

## Manifest (`tools/shared/packs.js`)

One new `BUILTIN_PACKS` entry:

```js
{
  id: 'treasures',
  title: 'Treasures',
  description: 'Magic items, trinkets, and potions for any hoard.',
  files: ['../../data/treasure.json'],
  generators: [
    { name: 'magic-item', title: 'Magic Item', kind: 'json' },
    { name: 'trinket', title: 'Trinket', kind: 'text' },
    { name: 'potion', title: 'Potion', kind: 'text' },
  ],
}
```

## Testing

- `data/data.test.js` strict-runs every generator across 25 seeds automatically
  — the new pack must pass with no changes to that loop.
- Add one shape assertion for `magic-item` mirroring the existing `npc`/`quest`
  shape tests (name/form/rarity/property are strings, and the result is
  reproducible for a fixed seed).

Manual check: serve locally, pick Treasures → Magic Item / Trinket / Potion,
confirm output reads well, reroll and seed-reproduce.
