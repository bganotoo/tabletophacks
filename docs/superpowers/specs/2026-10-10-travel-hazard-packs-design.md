# Weather & Travel and Traps & Hazards packs

**Date:** 2026-10-10
**Roadmap item (Content):** More built-in packs — the first two of the three
named (weather & travel events, traps & hazards).

Same principles as the
[Treasures pack](2026-07-08-treasures-pack-design.md): content only, one
`BUILTIN_PACKS` entry each, reuse the shared vocabulary (`weather`,
`creature`, `metal`, `color`, `noun#…`), rare flavour at `weight < 1`.

## `data/travel.json` — Weather & Travel

| Generator | Kind | What |
|---|---|---|
| `travel-day` | json | weather, road, optional sight, event, optional find, optional night |
| `travel-event` | text | something that happens on the road |
| `forecast` | text | `common.json`'s `weather` plus how it changes through the day |

Supporting: `weather-change`, `road-condition` (tagged `easy`/`slow` and by
terrain: `water`, `hills`, `forest`), `travel-sight`, `travel-camp`,
`travel-find`. Deliberately system-neutral: "ruts deep enough to snap an
axle", not "half speed".

## `data/hazard.json` — Traps & Hazards

| Generator | Kind | What |
|---|---|---|
| `trap` | json | trigger, effect, tell (how to spot it), disarm, optional twist and builder |
| `hazard` | text | a natural hazard, sometimes with weather or a creature caught in it |

Supporting: `trap-trigger`, `trap-effect` (tagged by harm: `fall`, `poison`,
`crush`, `alarm`…), `trap-tell`, `trap-disarm`, `trap-twist`, `trap-maker`,
`natural-hazard` (tagged by terrain). A tell is always present: a trap the
party cannot notice is a GM problem, not a game.

Disarm methods are written mechanism-neutral ("cut the linkage", not "cut the
wire"), because trigger and disarm are rolled independently.

## Guards added with them

- `data.test.js`: no table or template name may appear in two packs. All
  built-ins load into one generator, where a duplicate silently replaces the
  earlier table.
- `packs.test.js`: every `data/*.json` is listed in `BUILTIN_PACKS` and vice
  versa — a pack that exists but is not listed never reaches the tools.
- Shape tests for `travel-day` and `trap`.
- Originality: read per the audit's method; recorded in the
  [audit's addendum](2026-10-10-data-originality-audit.md).
