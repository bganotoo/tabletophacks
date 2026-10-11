# Tabletop Hacks

Tools for the table. No app required.

A static site of browser-based tools for tabletop gaming, live at **tabletophacks.com**. Everything runs client-side: no accounts, no server, no build step, no dependencies. Your data stays in your browser (localStorage).

## The tools

- **[Random Generators](tools/generator/)** — roll up NPCs, encounters, settlements, dungeons, quests, loot, travel days, and traps. Optional seed input makes every result reproducible; save favorites to a local library and export them as JSON.
- **[Template Workshop](tools/workshop/)** — write your own generator packs as JSON with live validation and preview. Custom packs show up in the Generator automatically and can build on (or override) the built-in word tables.
- **[Dice Roller](tools/dice/)** — any dice notation (`3d6`, `1d20+5`, `4d6kh3`), with advantage, disadvantage, and a running history.
- **[Initiative Tracker](tools/initiative/)** — turn order, rounds, and conditions whose durations tick down on their own.
- **[Game Timer](tools/timer/)** — a chess-clock turn timer for board games and RPGs.
- **[Score Tracker](tools/score/)** — a multi-player score sheet that totals as you go.
- **[Syntax Reference](tools/reference/)** — every piece of template syntax, each with a live example you can reroll.

## Running locally

Serve the repo root with any static file server (ES modules don't load from `file://`):

```sh
git clone <this repo>
cd tabletophacks
python -m http.server
# open http://localhost:8000
```

## Running tests

Requires Node 20+ (uses the built-in test runner; no npm install needed):

```sh
npm test                                  # everything
node --test gen/                          # just the engine
node --test data/                         # just content-pack validation
node --test seo.test.js                   # just page metadata
```

`seo.test.js` auto-discovers every `index.html` in the repo and checks its
description, canonical URL, Open Graph tags, icons, and `SoftwareApplication`
JSON-LD, plus that `sitemap.xml` lists exactly those pages. A new tool page
cannot ship without metadata.

## Site icons

The favicon, app icons, and the 1200×630 social card are **committed** at the
repo root. They are generated from the SVG sources in [assets/](assets/):

```sh
sh assets/build-icons.sh   # requires ImageMagick 7; not part of npm test
```

This is an authoring-time script, not a build step — the site never runs it and
nothing depends on it. Re-run it after editing any SVG in `assets/`, then commit
the regenerated binaries.

## How it works

The heart of the project is **`gen/`**, a small seedable random-generation framework. Content lives in JSON packs (**`data/`**) that define two kinds of things:

- **Tables** — arrays of strings to pick from, with optional weights, tags, and variants:

  ```json
  "loot": [
    { "text": "{2-20} gold pieces", "tags": ["treasure"] },
    "a map to {a} {noun#treasure}"
  ]
  ```

- **JSON templates** — objects whose string values are expanded, producing structured results:

  ```json
  "npc": {
    "name": "{adjective.capitalize} {noun#animal.capitalize}",
    "hp": "{3d6}",
    "inventory": { "$repeat": "1d4", "of": "{loot}", "unique": true }
  }
  ```

Template strings support table lookups (`{loot}`), tag filters (`{noun#animal}`, `{noun#!cursed}`), transforms (`{name.capitalize}`), dice and ranges (`{3d6}`, `{2-12}`), inline alternatives (`{red|blue|azure*3}`), repetition (`{3x npc-quirk}`), captures for reuse (`{first-name@n}` … `{@n}`), and a smart article (`{a}` → "a"/"an"). All syntax is defined in [gen/parser.js](gen/parser.js).

The same seed always produces the same result, so any generated NPC or dungeon can be shared and re-rolled exactly.

**`tools/`** wraps the framework in two web pages built from plain ES modules; the shared logic (`tools/shared/`) is unit-tested in Node, and the DOM wiring is kept deliberately thin.

## Contributing content

New built-in packs are just JSON files in `data/` plus a manifest entry in `tools/shared/packs.js`. The test suite auto-validates every pack: each generator must run cleanly in strict mode across 25 seeds (`data/data.test.js`), so a typo'd table name or bad filter fails CI before it ships.

For coding conventions and architecture details, see [CLAUDE.md](CLAUDE.md).
