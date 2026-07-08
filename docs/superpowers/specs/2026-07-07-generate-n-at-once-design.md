# Generate N at once — design

**Date:** 2026-07-07
**TODO item:** Generator tool → "Generate N at once (e.g. roll 5 NPCs into a list)".

## Goal

Let the user roll several results from a generator in a single action — roll 5
NPCs, 3 quests, 8 tavern names — shown as a numbered stack. Common prep need:
you rarely want exactly one NPC when populating a town.

## Principles

- **Single-result behaviour is untouched.** With count = 1 the rendered HTML,
  the copied text, the saved library entry, and — critically — the seeded
  result are byte-for-byte what they are today. Existing shared links must keep
  reproducing their exact result.
- **A batch reproduces from one seed.** The seedable RNG already guarantees
  same-seed-same-output. A batch of N runs uses N sub-seeds *derived* from one
  base seed, so a single base seed (plus the count) reproduces the whole batch.
- **Keep logic in tested shared modules; `app.js` stays thin wiring.**

## Scope

In scope: the Generator view only (`#gen-view`). The Create page (template
authoring/testing) keeps its single-run behaviour — N-at-once there is not the
prep use case and is out of scope.

Out of scope: streaming/lazy rendering, de-duplicating identical results,
per-item reroll. A generous cap (12) keeps DOM and localStorage bounded.

## Seed derivation

New tested module `tools/shared/batch.js`:

- `MAX_BATCH = 12` — the count cap.
- `clampCount(n)` → integer in `[1, MAX_BATCH]`; non-numeric/`<1` → `1`.
- `deriveSeeds(base, count)`:
  - `count === 1` → `[String(base)]` (so a single run uses the base seed
    directly — preserves today's exact result and existing shared links).
  - `count > 1` → `["${base}#0", "${base}#1", …, "${base}#${count-1}"]`.

A batch and a single run at the same base seed are deliberately *different*
addresses (the batch carries `:n=`), so their results differing is expected.

## URL hash

The hash already carries `<name>` and `:s=<seed>`. Add an optional
`:n=<count>` suffix so a shared/pinned link reproduces the batch.

`tools/shared/genhash.js`:

- `formatGeneratorHash(name, seed, count)` — appends `:n=<count>` only when
  `count > 1`. Third arg omitted/≤1 → today's output, unchanged.
- `parseHash` — the generate route gains a `count: number | null` field
  (`null` = unspecified → treat as 1, mirroring `seed: null`). The count is
  parsed from a trailing `:n=<digits>`; because `formatGeneratorHash`
  percent-encodes the seed, an encoded seed never contains a literal `:`, so
  stripping a trailing `:n=<digits>` before the `:s=` split is unambiguous.

Round-trip `parseHash(formatGeneratorHash(name, seed, count))` holds for counts
≥ 1. Existing generate-route test assertions gain `count: null`.

## Rendering

`tools/shared/render.js`:

- `renderResults(values)` — `values` is a non-empty array.
  - length 1 → `renderResult(values[0])` (unchanged single output).
  - length > 1 → a `.gen-batch` container of `.gen-batch-item`s, each a
    `.gen-batch-index` (`1`, `2`, …) beside the item's `renderResult(...)`.
- `resultsToText(values)` — length 1 → `resultToText(values[0])`; length > 1 →
  each item as `#<n>\n<text>` joined by blank lines. (Header-on-own-line keeps
  multi-line object results readable.)

Existing `renderResult`/`resultToText` are unchanged. Escaping flows through
them, so batch output is escaped for free.

CSS: `.gen-batch` (stacked, divider between items), `.gen-batch-index` (muted
ordinal). Added to `tools/shared/tools.css`.

## App wiring (`tools/generator/app.js`)

State moves from a single `lastResult` to `results` (array) + `count`:

- `state.results` — the array of result values currently shown (`[]` on error).
- `state.count` — how many are shown.
- `state.lastSeed` — the base seed; `state.resultGenerator` — unchanged.

- **HTML:** a `#count-input` (`type=number`, `min=1`, `max=12`, `value=1`)
  added to the run bar, labelled "how many to generate".
- **`generate(seedOverride)`** reads the base seed and `clampCount($count)`,
  builds seeds via `deriveSeeds`, runs each in strict mode, renders with
  `renderResults`, and upgrades the address bar via
  `formatGeneratorHash(name, seed, count)`.
- **Copy** → `resultsToText(state.results)`. **Copy link** →
  `formatGeneratorHash(resultGenerator, lastSeed, state.count)`.
- **Save to library** stores one entry for the whole batch: `count`, `seed`
  (base), and `data` = the single value when count 1, else the array. Name gets
  a `×<count>` marker for batches. Opening a saved entry restores
  `results`/`count`/`seed` (`entry.count ?? 1` for older entries) and re-renders
  with `renderResults`. Backward compatible: pre-existing entries have no
  `count`, so they open as single results exactly as before.
- **Routing:** `select()` gains a `count` option that pins `#count-input` from a
  link (mirroring how `seed` is pinned); the hashchange and initial-load routers
  thread `parsed.count` through. The count control otherwise persists across
  generator switches, matching how the seed field already persists.

## Testing

- `batch.test.js` — `clampCount` bounds/coercion; `deriveSeeds` count-1 identity,
  count-N derivation, determinism, clamping.
- `render.test.js` — `renderResults` single-delegation, multi wrapping with
  ordinals and escaping; `resultsToText` single-delegation and numbered join.
- `genhash.test.js` — `count` in parse (present/absent/no-seed), format appends
  only for `>1`, round-trip with counts; existing assertions updated for
  `count: null`.
- `app.js` is thin DOM wiring and stays untested, per repo convention.

Manual check: serve locally, generate 5 NPCs, confirm the numbered stack, copy,
copy-link round-trip (paste the link reloads the same 5), save/open from
library, and that count 1 is unchanged.
