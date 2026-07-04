# Shareable result links — design

**Date:** 2026-07-04
**Status:** approved (autonomous — self-reviewed per TODO workflow)
**TODO item:** "Generator tool → Shareable result links"

## Purpose

The Generator already puts the selected generator's name in the URL hash
(`#npc`), so a link opens the tool on that generator. It does **not** capture
which *result* was shown — a link reopens `npc` but rerolls a fresh random NPC.

This change adds the seed to the hash (`#npc:s=abc123`) so a link reproduces an
**exact** result. The engine's RNG is seedable — same seed, same output, always
— so a seed plus a generator name is a complete, deterministic recipe. A GM can
roll a villain they like, copy the link, and paste it into prep notes or a chat;
opening it later (or on another machine) rebuilds the identical villain.

## What "reproduces exactly" means

A shared link reproduces the result **for anyone whose assembled generator
defines that name the same way.** For the built-in packs that is everyone. For a
user's own saved template or custom pack (`#treasure:s=…`), the link only
reproduces for someone who has that same definition — the seed is deterministic,
but the table it indexes into is local. This is inherent to per-user custom
content and is not a regression (today's `#treasure` link already only opens for
users who have `treasure`); we simply carry the existing limitation forward and
don't advertise custom-generator links as universally shareable.

## Scope

In scope:

- **Seed in the hash.** After every successful run the hash becomes
  `#<name>:s=<seed>`, so the address bar is always a link that reproduces the
  visible result. A name-only link (`#npc`, from an old bookmark or hand-typed)
  still works: it selects the generator and rolls a fresh seed, then upgrades
  the hash to include that seed.
- **Opening a seeded link.** On load (and on manual hash edits), a
  `#<name>:s=<seed>` hash selects the generator, pins the seed into the seed
  field, and runs it — reproducing the shared result rather than rerolling.
- **Copy link button.** A "Copy link" action next to Copy / Save to library
  copies a URL that reproduces the **currently displayed** result — including a
  result opened from the library, whose generator may differ from the one
  selected in the sidebar. It is disabled until there is a reproducible result
  (a result with a known seed).

Out of scope (YAGNI / noted as future):

- Encoding a *fully materialised* result (the literal text) in the link, for
  custom generators the recipient lacks. The seed recipe is smaller and is the
  point of a seedable engine; materialised sharing is a separate feature.
- Short-link / server-side persistence. The site is fully static; there is no
  backend to mint IDs.
- Putting `create`/`tables` view state or library selection anywhere richer in
  the hash. Those routes are unchanged.

## The unifying idea: the hash is a tiny route

Today the hash is read ad hoc in three places (`initialSelection`, the
`hashchange` handler, `main`'s initial routing), each doing its own
`location.hash.slice(1)` string compares against `'create'` / `'tables'`.
Adding a `:s=` suffix to one of those cases would spread the parsing further.

Instead, centralise **all** hash parsing in one pure, tested module. The hash is
a small route with four shapes:

- `''` → empty (fall back to remembered/first generator)
- `create` → the Create view
- `tables` → the Browse tables view
- `<name>` or `<name>:s=<seed>` → run generator `<name>`, optionally at `<seed>`

`create`/`tables` are reserved route words (a generator can't be named either in
practice — and if one were, the route wins, exactly as today). Generator names
match `/^[A-Za-z_][A-Za-z0-9_-]*$/`, so they never contain the `:s=` delimiter;
the split is unambiguous. Seeds can be arbitrary user-pinned text, so the seed
is `encodeURIComponent`-encoded in the hash and decoded on the way out.

## Architecture

Follows the repo shape: pure tested logic in `tools/shared/`, thin untested DOM
wiring in `app.js`.

### `tools/shared/genhash.js` (pure, tested)

```js
parseHash(raw) -> { route: 'empty' }
              |  { route: 'create' }
              |  { route: 'tables' }
              |  { route: 'generate', name: string, seed: string | null }

formatGeneratorHash(name, seed) -> string   // hash body, no leading '#'
```

- `parseHash(raw)` takes the hash body (already `#`-stripped; tolerates
  `null`/`undefined` → `''`). It matches the reserved words first, then splits a
  generator hash on the first `:s=`. The seed is `decodeURIComponent`-decoded
  (falling back to the raw text if decoding throws on malformed input); an empty
  seed (`#npc:s=`) is normalised to `null`.
- `formatGeneratorHash(name, seed)` returns `name` when `seed` is
  null/undefined/empty, else `` `${name}:s=${encodeURIComponent(seed)}` ``.
- Round-trip invariant: for any name and non-empty seed,
  `parseHash(formatGeneratorHash(name, seed))` yields
  `{ route: 'generate', name, seed }` — including seeds containing `:`, `=`,
  spaces, or `%`. The tests assert this.

No DOM, no storage, no engine — just string ⇆ structured route.

### `tools/generator/app.js` (thin, untested) — changes

- Import `parseHash`, `formatGeneratorHash`.
- `select(name, { updateHash, seed })` gains a `seed` option. When a seed is
  supplied (arriving from a shared link) it is written into the seed field
  before running, so the run reproduces it and the field visibly shows it.
- `generate()` — on a **successful** run, `history.replaceState` the hash to
  `#${formatGeneratorHash(state.selected, seed)}` so the URL always reflects the
  visible result, and records `state.resultGenerator = state.selected`. On
  error the seeded hash is not written (there is no reproducible result) and the
  Copy-link button is disabled. `replaceState` (not assignment) is used, so no
  `hashchange` fires and there is no re-entrant loop, matching the existing
  selection code.
- Library "open" records `state.resultGenerator = entry.generator` and
  `state.lastSeed = entry.seed`, and enables Copy link only when a seed is
  present, so a link built from a library result targets the right generator.
- New **Copy link** button (`#copy-link-btn`) builds
  `new URL(location.href)` with its hash set from `state.resultGenerator` +
  `state.lastSeed`, and copies it. Enabled/disabled alongside the result.
- Initial routing and the `hashchange` handler both go through `parseHash`
  instead of bespoke string compares; the `generate` route selects the
  generator (passing the seed), and a seed-only change re-runs at the new seed.

### `tools/generator/index.html` — changes

One button added to the existing `.result-actions` row:

```html
<button class="btn" id="copy-link-btn" disabled>Copy link</button>
```

Uses the existing `.btn` styling; no CSS changes.

## Data flow

1. Load `#npc:s=abc` → `parseHash` → `{ route:'generate', name:'npc', seed:'abc' }`
   → `select('npc', { seed:'abc' })` → seed field = `abc` → `generate()` runs at
   `abc` and rewrites the hash to the same value (idempotent).
2. Load `#npc` → select `npc`, roll a random seed `xyz`, hash upgraded to
   `#npc:s=xyz` — the link is now reproducible.
3. Reroll → new seed → hash updated → address bar is a fresh shareable link.
4. Open a library entry → `resultGenerator`/`lastSeed` from the entry → Copy
   link yields a URL reproducing that saved result.

## Testing

`tools/shared/genhash.test.js` (node:test, picked up by the `**/*.test.js`
glob), covering:

- `parseHash`: empty/`null`/`undefined` → `empty`; `create`/`tables` routes;
  name-only → seed `null`; `name:s=seed`; hyphen/underscore names; encoded seed
  decoded; empty seed (`name:s=`) → `null`; malformed `%` sequence falls back to
  raw without throwing; a stray `:s=` inside the seed stays in the seed.
- `formatGeneratorHash`: no/empty/undefined/null seed → bare name; plain seed;
  special-character seed encoded.
- Round-trip `parseHash(formatGeneratorHash(name, seed))` for plain and
  special-character seeds.

`app.js` stays untested, per repo convention; the routing logic worth testing
lives in `genhash.js`.

## Files

New:

- `tools/shared/genhash.js`
- `tools/shared/genhash.test.js`
- `docs/superpowers/specs/2026-07-04-shareable-result-links-design.md` (this file)

Modified:

- `tools/generator/app.js` (hash routing via `genhash`, seed in hash, Copy link)
- `tools/generator/index.html` (Copy link button)
- `TODO.md` (check the item off)

## Future work (not this change)

- Materialised-result links that embed the literal text, so custom-generator
  results reproduce for recipients who lack the definition.
- Share the same seeded-hash idea in the Dice tool (roll history is already
  seeded internally).
