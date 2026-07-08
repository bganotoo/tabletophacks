# TODO — roadmap for tools and features

Working notes for what's next. Items reference the architecture in
[CLAUDE.md](CLAUDE.md); design records for bigger efforts belong in
`docs/superpowers/specs/` and `docs/superpowers/plans/`.

## Custom templates

- [x] **"Custom" section in the Generator sidebar, starting with a "Create" page.**
  Done 2026-07-03 — see
  [docs/superpowers/specs/2026-07-03-custom-templates-design.md](docs/superpowers/specs/2026-07-03-custom-templates-design.md).
  A dedicated home for what the "Quick template" section does today. On the
  Create page the user writes a template string, runs it to test (strict mode,
  seedable, same error cards as everywhere else), and can save it under a
  short name. Saved templates appear as items in the Custom group of the
  sidebar and behave like any other generator (seed control, reroll, save to
  library).
  - Implementation note: back saved templates with the existing custom-pack
    system rather than a new storage shape — a reserved user pack (e.g.
    "My Templates") whose entries are the saved templates. `buildGenerator`,
    `listGenerators`, the sidebar's custom grouping, and Workshop
    import/export then all work without special cases. Names must pass the
    existing Registry rules (`a`/`an` reserved, collision = override, so warn
    when a chosen name shadows a built-in).

- [x] **Retire the "Quick template" section; add "View template" to every
  generator page instead.** Done 2026-07-03 — see
  [docs/superpowers/specs/2026-07-03-view-template-design.md](docs/superpowers/specs/2026-07-03-view-template-design.md).
  Each generator gets a way to reveal its
  definition. From the view, the user can:
  - **Edit and save** — persists a per-user override that shadows the
    built-in for them only. This is exactly the pack load-order invariant
    (later loads win), so store overrides as a hidden highest-priority user
    pack. Needs a visible "modified" indicator on overridden generators and a
    one-click "Reset to default", or users will forget they diverged and
    blame the site.
  - **Save as…** — copies the definition under a new name into the user's
    custom templates, appearing under Custom.
  - Design wrinkle to resolve first: not every generator is a single template
    string. JSON generators (`npc`, `quest`, …) are objects, and text
    generators like `npc-quirk` are whole tables of entries. "View template"
    should show the underlying JSON definition for that name (the Workshop
    editor already validates this shape via `parsePack`), not pretend
    everything is a one-liner. Consider showing referenced private tables
    read-only alongside, so the definition is comprehensible.

## Template authoring support

- [x] **Template syntax reference page.** Done 2026-07-03 — see
  [docs/superpowers/specs/2026-07-03-syntax-reference-design.md](docs/superpowers/specs/2026-07-03-syntax-reference-design.md).
  Once users write templates on the
  Create page, they need the `{...}` syntax documented in-product: table
  lookups, `#tag`/`#!tag` filters, `.transform` mods, `@capture`, dice,
  ranges, alternatives with weights, `{2x ...}` repetition, smart article.
  Link it from the Create page and the Workshop. Shipped as the standalone
  `tools/reference/` page; every example is data (`tools/shared/syntax-reference.js`)
  and strict-run by the test suite so the docs can't drift.
- [x] **Browsable table catalog.** Done 2026-07-03 — see
  [docs/superpowers/specs/2026-07-03-table-catalog-design.md](docs/superpowers/specs/2026-07-03-table-catalog-design.md).
  A searchable list of every table name the
  assembled generator knows (built-in + custom), with a sample value per
  table — writing `{adjective#magic}` requires knowing `adjective` and
  `magic` exist. The engine's did-you-mean suggestions help after a typo;
  this helps before. Shipped as a "Browse tables" view in the Generator tool,
  with logic in the tested `tools/shared/catalog.js`.
- [ ] **Autocomplete for table names in template inputs** (Create page and
  Workshop editor). Nice-to-have after the catalog exists, since it needs the
  same name index.

## Generator tool

- [x] **Shareable result links.** Done 2026-07-04 — see
  [docs/superpowers/specs/2026-07-04-shareable-result-links-design.md](docs/superpowers/specs/2026-07-04-shareable-result-links-design.md).
  The generator name is already in the hash; the seed now rides along
  (`#npc:s=abc123`) so a link reproduces an exact result — the seedable RNG
  guarantees it. Every successful run upgrades the address bar to a seeded,
  shareable link; opening one pins the seed and reproduces the result instead of
  rerolling; a **Copy link** button copies a URL for the currently shown result
  (including one opened from the library). All hash parsing moved into the tested
  `tools/shared/genhash.js` (`parseHash`/`formatGeneratorHash`).
- [x] **Library import.** Done 2026-07-04 — see
  [docs/superpowers/specs/2026-07-04-library-import-design.md](docs/superpowers/specs/2026-07-04-library-import-design.md).
  An **Import** button beside **Export all** reads a `tabletophacks-library.json`
  and merges it into the saved library, de-duplicating by entry id (existing
  snapshots kept, new ids appended, re-import idempotent). The validation and
  merge logic lives in the tested `tools/shared/library.js`
  (`parseLibrary`/`mergeLibrary`); `app.js` wiring mirrors the Workshop's pack
  import.
- [ ] **Copy as Markdown** alongside plain-text copy, for pasting into
  Notion/Obsidian prep docs.
- [x] **Generate N at once** (e.g. roll 5 NPCs into a list) — cheap to do,
  high prep value. Done 2026-07-07 — see
  [docs/superpowers/specs/2026-07-07-generate-n-at-once-design.md](docs/superpowers/specs/2026-07-07-generate-n-at-once-design.md).
  A count control (1–12) in the run bar rolls N results from one base seed via
  derived sub-seeds, shown as a numbered stack. Count 1 is byte-identical to the
  old single-run behaviour, so existing shared links still reproduce. The base
  seed and count both ride in the hash (`#npc:s=abc:n=5`) so a shared/pinned link
  reproduces the whole batch; Copy, Copy link, and Save to library all handle the
  batch (saved as one library entry, backward compatible with pre-batch entries).
  Seed derivation lives in the tested `tools/shared/batch.js`
  (`deriveSeeds`/`clampCount`); rendering in `renderResults`/`resultsToText`
  (`render.js`); the hash carries `count` via `genhash.js`.

## Workshop

- [ ] **Replace `prompt()`/`confirm()` dialogs** (new/rename/delete pack)
  with inline UI, consistent with the rest of the tool.
- [ ] **Storage usage indicator** — localStorage is the only persistence and
  it's small; show usage and warn before `store.set` starts failing.

## New tools ("Coming Soon" on the homepage)

Each of these already has a card on the landing page; shipping one means
building it under `tools/<name>/` (thin `app.js`, testable logic in
`tools/shared/` or a tool-local module with tests) and flipping its card from
`div` to anchor with the "Live" badge.

- [x] **Dice Roller** — roll any combination of polyhedral dice with
  modifiers. Done 2026-07-03 — see
  [docs/superpowers/specs/2026-07-03-dice-roller-design.md](docs/superpowers/specs/2026-07-03-dice-roller-design.md).
  Shipped at `tools/dice/` with per-die breakdown, keep/drop
  (`4d6kh3`/`kl`/`dh`/`dl`), advantage/disadvantage quick rolls, `d%`, and a
  persisted roll history. Reuses `gen/rng.js` for randomness; the notation
  parser/roller lives in the tested `tools/shared/dice.js` (the engine's dice
  evaluator returns only a total, so a dedicated module gives the breakdown).
- [x] **Initiative Tracker** — turn order and conditions in combat. Done
  2026-07-04 — see
  [docs/superpowers/specs/2026-07-04-initiative-tracker-design.md](docs/superpowers/specs/2026-07-04-initiative-tracker-design.md).
  Shipped at `tools/initiative/` with add/remove/reorder, sort by initiative,
  a Next/Prev turn pointer, a round counter, and per-combatant condition tags
  whose optional durations tick down at each round boundary. The whole
  encounter is persisted in `store.js`, so a mid-combat reload restores turn,
  round, and conditions. The state machine lives in the tested
  `tools/shared/encounter.js` (pure/immutable); `app.js` is thin DOM wiring.
  HP/damage tracking is deliberately out of scope (a future extension).
- [x] **Game Timer** — chess-clock style countdown for turns and rounds. Done
  2026-07-04 — see
  [docs/superpowers/specs/2026-07-04-game-timer-design.md](docs/superpowers/specs/2026-07-04-game-timer-design.md).
  Shipped at `tools/timer/` with per-player clocks, tap-to-pass, a configurable
  per-turn budget (0 = untimed count-up), a round counter, per-player running
  totals, and a visual + WebAudio-beep alert at zero. The clock is stored as
  timestamps (not a decrementing number), so it stays correct across
  tab-switching and full reloads — the whole game persists in `store.js`. The
  chess-clock state machine lives in the tested `tools/shared/timer.js`
  (pure/immutable, `now` injected); `app.js` is thin DOM wiring whose
  `setInterval` only repaints. Total-time-bank (tournament) mode is out of
  scope, noted as future.
- [x] **Score Tracker** — multi-player score sheet for board games. Done
  2026-07-04 — see
  [docs/superpowers/specs/2026-07-04-score-tracker-design.md](docs/superpowers/specs/2026-07-04-score-tracker-design.md).
  Shipped at `tools/score/` with multiple saved, named sheets (switch/rename/
  delete, like the library), named players, and a grid of renameable columns —
  one per round (auto-named `Round N`) or renamed into scoring categories. Cells
  take any number (negatives/fractions); per-player row totals add up live and
  the current leader is highlighted. The whole book of sheets persists in
  `store.js`, so a reload restores every sheet and score. The state machine
  lives in the tested `tools/shared/scoresheet.js` (pure/immutable, book-level +
  active-sheet layers); `app.js` is thin DOM wiring whose cell edits repaint
  only totals so tabbing across the grid isn't interrupted. Target-score/win
  banners, column totals, and sheet import/export are noted as future work.
- [ ] **Rules Reference** — quick-lookup cards for common conditions and
  actions. Content-driven like `data/`: rules live in JSON, the tool renders
  searchable/filterable cards. Needs a licensing decision first (SRD/CC
  content only) and should support multiple rule sets eventually.

## Content packs

- [x] **Grow the shared vocabulary in `data/common.json`.** The word tables
  every pack builds on are small (~15 adjectives, ~12 nouns, a handful of
  metals, names, and weather entries), which makes repeated output feel samey
  fast. Expand each table several-fold, and grow the tag vocabulary along
  with it (`#magic`, `#animal`, `#treasure`, …) so filtered lookups like
  `{adjective#magic}` still have enough entries to vary. The pack validation
  suite in `data/data.test.js` covers the changes automatically; watch
  weights so new entries don't drown out the flavorful rare ones.
- [ ] More built-in packs (each is JSON + one `BUILTIN_PACKS` entry, and
  `data/data.test.js` covers it automatically): magic items / trinkets,
  weather & travel events, traps & hazards, name tables by culture/ancestry.

## Someday / maybe

- [ ] Offline support (service worker) — the site is fully static, so this
  is mostly cache plumbing.
