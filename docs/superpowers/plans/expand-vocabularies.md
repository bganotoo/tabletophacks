# Plan: Expand built-in vocabularies & template variation (≥10x)

TODO item: "Further increase (at least 10x) the built-in vocabularies and template
variations across the board to reduce repetition. Every roll should feel distinct."

## Intent

Reduce perceived repetition in every generator — not just top-level names, but the
**sub-parts** of every generated thing. Two levers, used together:

1. **Bigger vocabularies.** Grow every leaf table substantially (target ~10x on the
   small, high-frequency tables that repeat fastest). Bigger pools = fewer collisions.
2. **More structural variation.** Where a generator only had one or two sentence
   shapes (tavern-name, place-name, npc.name, potion), add many patterns so the
   *structure* of a roll varies, not only the words plugged into it. This multiplies
   combinatorially with vocabulary size.

## Approach

- **`common.json` is the highest-leverage file** — its `adjective`/`noun`/name pools
  feed every pack (all built-in files load into one generator, so cross-file refs
  always resolve). Expand these hardest and add cross-cutting helper tables
  (`surname`, `person-name`, `color`, `material`, `gemstone`, `texture`, `scent`,
  `sound`, `time`, `given-verb`) that pack templates can reuse.
- Keep the existing **tag vocabulary** intact (`concrete`, `animal`, `treasure`,
  `monster`, `plant`, `structure`, `abstract`, `weapon`; adjective `condition`, `age`,
  `color`, `mood`, `magic`) so existing `#tag` filters keep matching, and add entries
  under those tags. New tags only where a template will actually use them.
- Per pack: expand each sub-part table and add pattern variety to the top-level
  templates. Add a few tasteful new sub-part fields (e.g. NPC appearance/demeanor)
  where they make a roll feel more distinct — additive only, never removing fields the
  shape tests assert.

## Invariants / risks

- Every `{table}` reference must resolve and every `#tag` filter must have ≥1 match,
  or `data/data.test.js` (strict-run, 25 seeds) fails. New nouns that get pluralized
  via a template need a `plural` variant.
- `unique` `$repeat` pools must stay larger than their max draw count.
- Validate with `npm test` after each file and once at the end.

## Verification

`npm test` — the auto-discovering `data/data.test.js` strict-runs every generator
across 25 seeds; green means all references/tags/variants are sound.
