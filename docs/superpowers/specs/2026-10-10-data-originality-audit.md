# Originality / IP audit of `data/` — 2026-10-10

The roadmap item: *before money changes hands, confirm no table text is lifted
from a published SRD or supplement, or mark what is OGL/CC-BY and attribute
it.* This is the record of that pass, what changed, and what was deliberately
left alone.

## Scope

Every string in the six built-in packs: `common.json`, `npc.json`,
`encounter.json`, `location.json`, `quest.json`, `treasure.json`. That covers
roughly 1,400 table entries, plus the JSON templates and table names.

Out of scope: tool UI copy, the Syntax Reference's examples (they are
illustrations of the engine, not content), and future paid packs. Those packs
inherit the guard test below automatically.

## Method

1. Provenance. `git log` shows that every pack was authored in this repo:
   `e129ad8` (common/npc), `41325fc` (encounter/location/quest), `c4a06fe`
   (treasure), plus hand additions such as `59f0e4f`. Nothing was imported in
   bulk from an outside source.
2. Line-by-line read against the published tables that these generators most
   resemble, from memory: the 5e PHB d100 Trinkets table; the DMG's magic-item
   *minor properties*, *quirks* and *creator* tables; the DMG's NPC
   *mannerisms*, *traits* and *ideals* tables; the SRD 5.1 monster list; and
   the OGL Product Identity declaration.
3. Name check of every proper noun (first names, surnames, epithets, item
   names, creature names) against well-known fiction and game franchises.

**Limit.** Step 2 is a careful read by someone who knows those books well, not
a plagiarism-database match. It is the right standard for "did we copy a
table", but it is not proof against every obscure supplement.

## Findings

### No lifted text

No entry reproduces published table text. The tables share *ideas* with
published ones, which is unavoidable and not protected: a trinket table, a
"sheds light on command" property, potions that heal. Expression is what
copyright protects, and the expression here is original.

### Too close for comfort — rewritten (11 trinkets, 2 item names, 7 person names)

| Where | Was | Problem | Now |
| --- | --- | --- | --- |
| `trinket` | a small {metal} key that fits no lock you have found | PHB trinket: "an ornate scabbard that fits no blade you have found so far" | a small {metal} key strung on a ribbon gone stiff with age |
| `trinket` | a glass eye that seems to follow the room | PHB trinket: "a glass eye" | a porcelain eye that seems to follow the room |
| `trinket` | a coin stamped with a kingdom no one remembers | PHB: "a gold coin minted in an unknown land" | a coin bitten clean through by someone very determined |
| `trinket` | a music box that plays only when no one is watching | PHB: the music box, plus the "moves when not observed" gimmick | a music box whose tune changes with the weather |
| `trinket` | a tin soldier missing its head | PHB: "two toy soldiers, one with a missing head" | a tin soldier painted in the colours of a regiment that mutinied |
| `trinket` | a bell too small to make any sound | PHB: "a tiny silver bell without a clapper" | a bell that rings only when it is held perfectly still |
| `trinket` | a hank of fur from an animal no one can name | PHB: "a tooth from an unknown beast" | a hank of coarse blue fur tied off with a jeweller's knot |
| `trinket` | a die carved from a yellowed knucklebone | PHB: "a pair of knucklebone dice…" | a die that has, impossibly, seven faces |
| `trinket` | a broken sword-hilt re-wrapped in fresh new leather | PHB: "a hilt from a broken sword" | a sword-belt buckle stamped with the arms of a disgraced house |
| `trinket` | a birdcage welded shut, with nothing inside | PHB: "a tiny cage with no door" | a birdcage whose door has been nailed shut from the inside |
| `trinket` | a jar of buttons, every one from a different coat | PHB: "a small box filled with different-sized buttons" | a jar of pebbles, each one numbered in careful ink |
| `magic-item-name` | Dawnbreaker | Daedric artifact in *Skyrim* | Sunderdawn |
| `magic-item-name` | Oathkeeper | Brienne's sword in *A Song of Ice and Fire* | Trothbinder |
| `epithet` | the Oathkeeper | same | the True-Sworn |
| `epithet` | Coldhand | "Coldhands", *A Song of Ice and Fire* | Greyhand |
| `epithet` | Stormcrow | Gandalf's epithet in *The Lord of the Rings* | Gale-Rider |
| `epithet` | Nine-Fingers | Logen Ninefingers (*The First Law*); Frodo | Crookfinger |
| `surname` | Ninefingers | same | Ninefield |
| `surname` | Kettleblack | the Kettleblack brothers, *A Song of Ice and Fire* | Kettlewell |
| `first-name` | Corvo | protagonist of *Dishonored* | Corwen |

Single words like these are rarely protectable on their own. The reason to
change them is commercial, not legal: a buyer who spots "Oathkeeper" in a
paid pack's sword table asks where the rest came from.

Every edit is a replacement in place, so table lengths, weights, and seeded
output positions are unchanged.

### SRD 5.1 material — kept, attributable

A few terms in the packs originate with D&D and are in **SRD 5.1**. Wizards of
the Coast released SRD 5.1 under **CC-BY-4.0** in January 2023:

- creatures: **owlbear** (in `creature` and `noun#animal`) and **stirge**;
- the magic-item rarity ladder: common / uncommon / rare / very rare /
  legendary (`item-rarity`).

These are bare names and category words, not stat blocks or descriptive text.
The position taken here is that no attribution is *required* for them. But
CC-BY attribution costs one sentence and removes the question entirely, so the
recommendation is to include it wherever the content license is published:

> This work includes material taken from the System Reference Document 5.1
> ("SRD 5.1") by Wizards of the Coast LLC and available at
> https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is
> licensed under the Creative Commons Attribution 4.0 International License
> available at https://creativecommons.org/licenses/by/4.0/legalcode.

That placement is tied to the open **"A stated content license"** item, which
is a product decision and not part of this audit.

No **Product Identity** appears anywhere: no beholders, mind flayers,
displacer beasts, githyanki and so on, and no WotC setting, place or
character names.

### Folklore and generic fantasy — kept

These are fine as they stand:

- Folklore and myth creatures: redcap, boggart, will-o'-wisp, wight, ghoul,
  banshee, basilisk, manticore, chimera, hydra, harpy, lich, wyvern, drake.
- Fantasy staples that no one owns: goblin, hobgoblin, kobold, orc, gnoll,
  ogre, troll, hill giant, dire wolf.
- Real-world given names and surnames that some fiction also uses: Elspeth,
  Morwen, Godric, Ravenna, Blackwood, Underhill, Pyke, Brandywine (also a real
  river), Saltmarsh (a real surname).
- Common-English compounds that some franchise also uses: Widowmaker,
  Doomsayer, Starfall, Longstrider, the Oathbreaker.
- The allusion "a clocktower that strikes thirteen" (Orwell's opening line,
  much quoted) is a nod, not a quotation.

### Accepted: compound names can collide

`place-name` assembles names from `name-start` + `name-end`, the way real
English place names are formed. A few combinations land on names that fiction
also uses: *Blackmoor* (Arneson's setting, and several real English places),
*Ravenholm* (Half-Life 2), *Oakvale* (Fable, and a real town), *Stonehearth*.
They come up rarely and are ordinary English. The engine would need an
exclusion syntax to prevent them, and it does not have one. Not worth it.

## The guard: `data/originality.test.js`

The audit is a snapshot. The test keeps it true. It auto-discovers every pack
in `data/` the same way `data.test.js` does, and fails the suite if any string
(table names, entry text, plurals, template values) matches a denylist:

- WotC Product Identity creatures from the OGL declaration;
- WotC settings, locations, characters, and named spells (`Tasha's`,
  `Mordenkainen`…);
- Tolkien terms the estate's licensees actively enforce (`hobbit`, `balrog`,
  `mithril`…), which is why D&D says *mithral*;
- every name removed by this audit, so it cannot drift back in.

Matching is case-insensitive, diacritic-folded, and on whole words, so
"Tasha Ashdown" or "sigil-marked" pass. Each entry carries a reason that is
printed on failure. "Sigil" (Planescape's city) is deliberately left off
because it is an ordinary word the packs already use.

The denylist is a floor, not a clearance. A new paid pack still deserves a
read with this document's method before it ships.
