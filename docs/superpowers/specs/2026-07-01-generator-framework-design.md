# Generator Framework — Design Spec

**Date:** 2026-07-01
**Status:** Approved (pending spec review)
**Project:** tabletophacks.com

## Purpose

A flexible random-generation engine that powers the site's generator tools (NPC
names, loot tables, encounters, and future tools). It fills text or JSON
templates with parts pulled from weighted, tagged dictionaries. Templates and
dictionaries are authored by the developer for v1, but the syntax and error
handling are designed so end users can eventually author their own generators.

## Constraints

- Vanilla JS ES modules, loaded directly by the browser. No build step.
- JSDoc type annotations for editor support.
- Automated tests via Node's built-in `node:test` (dev-only; the site itself
  stays build-free).
- Seeded, reproducible RNG throughout.

## Core Model: Everything Is a Table

There is one concept: the **table** — a named, weighted list of entries.
Dictionaries and templates are the same thing:

- A *dictionary* is a big table of word entries with variants and tags
  (`noun`, `adjective`, `verb`).
- A *template* is a table whose entries contain `{...}` expansions. It may
  have one entry or many alternative patterns.
- Expansion is recursive: when a picked entry contains `{...}`, those expand
  too. Sub-template composition (`{tavern-name}` inside an `npc` template) is
  just another table lookup — no special machinery.

A **generator bundle** is a set of named tables loaded together. Generation
runs against a registry of loaded tables, a seedable RNG, and a per-run
capture scope.

### Table entry format

```json
{
  "noun": [
    "sword",
    { "text": "wolf", "plural": "wolves", "tags": ["animal", "concrete"], "weight": 2 },
    { "text": "{metal} idol", "tags": ["concrete", "treasure"] }
  ]
}
```

- A plain string is shorthand for `{ "text": ... }`.
- **Variants** are extra string properties on an entry (`plural`, `past`,
  anything). Variant names are not hardcoded by the framework.
- **Tags** are an array of strings. **Weight** defaults to 1 (numbers > 0;
  decimals allowed).

## Expansion Syntax (sigil style)

| Syntax | Meaning |
|---|---|
| `{noun}` | Pick a random entry from table `noun` |
| `{noun.plural}` | Use the entry's `plural` variant; if the entry lacks it, fall back to a transform named `plural`; error if neither exists |
| `{noun.plural.capitalize}` | Chain modifiers left-to-right: variants resolve first, then transforms |
| `{noun#animal#concrete}` | Filter: only entries carrying *all* listed tags |
| `{noun#!undead}` | Filter: exclude entries carrying a tag (combinable with positive tags) |
| `{red\|blue\|azure*3}` | Inline alternatives; `*N` weight suffix (azure is 3× as likely) |
| `{2-12}` | Uniform integer range, inclusive |
| `{3d6}`, `{2d4+1}` | Dice notation with optional additive modifier |
| `{noun#animal@beast}` | Pick and capture the result as `beast` for the rest of this run |
| `{@beast}` | Re-emit the captured value; modifiers allowed (`{@beast.plural}`) |
| `{a} {noun}` | Smart article: resolves to "a"/"an" based on the word that follows |
| `{3x loot}` | Repetition: three picks joined with `", "`; count may be a range or dice (`{1d4x loot}`) |
| `{3x loot.unique}` | Repetition without duplicate picks |
| `{3x loot.join(" and ")}` | Custom join separator |
| `{{` and `}}` | Literal `{` and `}` |

Whitespace inside braces is ignored: `{ noun #animal @beast }` is legal.

### Grammar support

Transforms plus the smart article helper only. Built-in transforms:
`capitalize`, `upper`, `lower`, `join(sep)`, `unique` (pick modifier), plus a
registration point for custom transforms. Number agreement is handled by
author-chosen variants (`.plural` etc.), not by an inflection engine.

## JSON Output Templates

A JSON template is any JSON value. Strings inside it are expanded with the
syntax above; objects and arrays are walked recursively.

**Type passthrough rule:** if a string value is *exactly one* expansion and it
produces a number (dice, range, or a numeric capture), the raw number is used.
`"hp": "{3d6}"` → `"hp": 12` (number); `"desc": "{3d6} gold"` → string.
Booleans, nulls, objects, and arrays come from `$` directives, whose branches
are raw JSON subtrees — e.g. `{"$or": [true, false]}` yields a real boolean.
String repetition (`{3x loot}`) always joins to a string; use `$repeat` when
you want an array.

### Structural directives

Objects with a `$` key handle what string syntax can't:

```json
{
  "name": "{adjective.capitalize} {noun#animal.capitalize}",
  "hp": "{3d6}",
  "inventory": { "$repeat": "1d4", "of": "{loot}", "unique": true },
  "quirk": { "$maybe": 0.3, "value": "{npc-quirk}" },
  "home": { "$or": [ { "type": "tavern", "name": "{tavern-name}" },
                     { "type": "hovel", "$weight": 3 } ] }
}
```

- `$repeat` — array of N results; count accepts integers, ranges, or dice;
  optional `unique: true`.
- `$maybe` — include the value with probability p; otherwise the property is
  omitted entirely.
- `$or` — pick one of several JSON subtrees, weighted by optional `$weight`
  (default 1).

## Architecture

Two-phase: **parse** template strings into a small AST, then **evaluate** the
AST against the registry. A regex find-and-replace loop was rejected: it can't
handle nesting, gives poor error messages, and can't support the type
passthrough rule. Compiling templates to JS functions was rejected as unsafe
for future user-authored content.

### Modules

| File | Responsibility |
|---|---|
| `gen/rng.js` | Seedable PRNG (mulberry32), string-seed hashing, helpers (`int`, `pick`, `weighted`) |
| `gen/parser.js` | Template string → AST; all syntax knowledge lives here |
| `gen/transforms.js` | Built-in transforms + custom-transform registration |
| `gen/engine.js` | Registry (load/validate tables, tag indexing) + evaluator (weighted picks, captures, `$` directives, recursion limit) |
| `gen/index.js` | Public API |
| `data/*.json` | Tables and generator definitions |
| `test/*.test.js` | `node:test` suites |

### Public API

```js
import { Generator } from './gen/index.js';

const gen = await Generator.load(['data/common.json', 'data/npc.json']);
gen.run('npc', { seed: 'a7k2' });      // run a named generator (text or JSON)
gen.text('{adjective} {noun#animal}'); // expand a one-off string template
```

Same seed + same tables ⇒ identical output. Seeds are shareable via URL and
usable in tests.

## Errors & Safety

- Parse errors report position and a nearest-name suggestion ("unknown
  transform `capitalise` — did you mean `capitalize`?").
- Two evaluation modes:
  - **strict** — throws on any problem; used during authoring and in tests.
  - **lenient** — renders a visible placeholder (`⟦noun?⟧`) and collects
    warnings; for future end-user content.
- Recursion depth cap (~50) with the cycle path named in the error, so
  `{a}→{b}→{a}` cannot hang the page.
- Empty filter results produce a specific message ("no entries in `noun`
  match `#animal#flying`").

## Testing

- **Parser:** syntax → expected AST; error cases assert the message produced.
- **Engine:** seeded exact-output tests; bounds tests for ranges and dice;
  uniqueness, capture, and article correctness ("an owlbear", "a sword").
- **Data validation:** a test loads every file in `data/` and strict-runs each
  generator, so broken content fails before it ships.

## Out of Scope (v1)

- Generator-editing UI for end users (syntax is designed for it; UI comes later).
- Full grammatical agreement engine (auto-inflection, pronoun resolution).
- Localization / non-English grammar helpers.
