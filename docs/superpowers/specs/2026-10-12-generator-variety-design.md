# Generator variety — design

Date: 2026-10-12. A direct request rather than a roadmap item: rolls repeat
too often, especially the specific lines (quest hooks, goals, twists,
complications, deadlines, rewards), and the fix should keep today's natural
language and viable combinations while making each roll feel new.

## The problem, measured

"Repetitive" was measured, not guessed. A table's **frames** are its distinct
sentence shapes: the wording you would recognize on a second roll even with a
different name slotted in. **Effective frames** is `1 / P(two rolls share a
frame)`; with F of them, a ten-roll session repeats one with probability about
`1 - e^(-45/F)`.

Before this change most sentence tables had 10–40 effective frames, so a
repeat was likely within five or six rolls:

| table | before | after |
|---|---:|---:|
| quest-hook | 35 | 223 |
| quest-goal | 40 | 226 |
| quest-twist | 30 | 200 |
| quest-complication | 20 | 149 |
| quest-reward | 20 | 127 |
| quest-deadline (distinct results in 2,000 rolls) | 39 | 798 |
| npc-voice | 20 | 293 |
| npc-motivation | 20 | 216 |
| npc-secret | 24 | 221 |
| settlement-rumor | 40 | 398 |
| settlement-problem | 20 | 159 |
| dungeon-room | 43 | 227 |
| encounter-disposition | 12 | 80 |
| encounter-tell | 12 | 97 |
| travel-event | 32 | 185 |
| trap-twist | 10 | 61 |

`quest-reward` was worse than its line count suggested: `{loot}` sat in the
table twice to make generic rewards common, but each of the sixteen specific
lines was still individually likely, so the specific ones were what repeated.

## Design

**1. Family dispatchers.** A headline field is a weighted dispatcher over
themed sub-tables named after it: `quest-hook` → `quest-hook-messenger`,
`-notice`, `-plea`, `-omen`, `-found`, `-summons`, `-personal`. The dispatcher
weights decide how often each *kind* of hook appears; the family's length
decides only how varied that kind is. Adding lines can never again shift the
odds between kinds — the user's suggested fix for rewards, applied
everywhere.

**2. Slots instead of specifics.** "A flood has taken the bridge they were
counting on" becomes `{a} {disaster#water} has taken the {passage#water} they
were counting on`. Shared vocabulary for slots lives in `common.json`: `kin`,
`authority`, `faction`, `saint`, `festival`, `span`, `hour`, `ago`, `moon`,
`document`, `symbol`, `stranger`, `someone`, `foe`, `disaster`, `passage`,
`wilds`, `wilds-name`, `site`, and more nouns (buildings, birds, domestic
animals, portable objects). Inline alternatives (`{nailed|pinned}`) vary the
wording of memorable lines cheaply.

**3. Composition.** Where a field is naturally two parts, each part gets a
table and the parts multiply: hooks are `{quest-hook-asker}
{quest-hook-approach}`; NPC voice is tone + habit; demeanor is core + "but…";
appearance is look + garb; motivation, secret, rumor, feature, problem, trade,
dungeon theme, entrance, hazard, room, terrain, disposition, tell, travel
event, sight, camp, find, trap trigger, disarm, builder, item origin and quirk
each take an optional tail. A tail only joins onto `-core` entries tagged
`short` (comma-free), so a line never sprouts a second dangling clause.

Where a table's tags are meant for filtering (`road-condition`, `trap-effect`),
the table stays flat and the JSON template reads a wrapper (`travel-road`,
`trap-result`) instead, so `{road-condition#water}` keeps working.

**4. Tags for viable combinations.** A slot is only as good as its worst
entry, so tags carry the constraints: `noun#building` for a deed (not "a deed
to a cairn"), `noun#portable` for a lucky charm (not "a lucky coffin"),
`noun#domestic` for a stray, `foe#sapient` for anything that holds a ransom or
negotiates, `someone#!clause` and `quest-prize#!clause` where another clause
follows, `ago#!personal` where no person is the subject, `encounter-activity#!group`
for a single creature, `creature#humanoid` for anyone who can be paid.

**5. Names that cannot contradict their record.** A JSON template cannot share
a capture between fields — per-part reroll re-evaluates one field in a fresh
context, so a cross-field capture would fail. Dungeon names therefore use
words that never name a type (Halls, Deeps, Delvings, "Ashdown's Folly"), and
magic item names never name a form (Promise, Answer, Burden), so neither can
contradict the `type`/`form` field beside it.

## Engine change

Slotting exposes the smart article to far more words, so `{a}` now follows
sound rather than first letter: silent h (an hourglass, an heir), vowel
letters with consonant sounds (a unicorn, a one-eyed), and numerals read
aloud (an 18-foot pit, an 8-foot drop). Covered in `gen/eval-features.test.js`.

## Fixed along the way

Found by the new checks or by reading samples: "rubys" and "topazs" (gemstone
plurals), "a iron plate", "a ochre chalk mark", "a hourglass", animals as loot
or carried objects ("a dun rook", "a cursed wolf"), "a garden of ashes",
"Dented Silvergate" (place names drew on any adjective), "1 bandits and their
young", a motivation that contradicted the NPC's own occupation, and
dungeon/item names that contradicted their type/form.

## Guards

- `data/grammar.test.js` checks every lookup against **every** entry it could
  pick (tags match, variants exist, captures come first) — the 25-seed run in
  `data.test.js` can miss rare entries — and samples every generator for a/an
  by sound, doubled words, "1 + plural", stray spacing, and placeholders.
- `data/variety.test.js` holds a floor under each headline field's effective
  frames. A failure usually means a heavy weight or a collapsed dispatcher.

## Left open

- **Old shared links roll differently.** A link carries a generator name and
  a seed; the same seed now indexes into different tables. That has been true
  of every content change so far and the site is pre-launch, so nothing was
  done about it. After launch, a content version in the hash (refusing or
  warning on a mismatch) would be the fix — a product call, not made here.
- **Landing screenshots** show generated text from before this change. They
  are still accurate as UI; retake them whenever the next visible UI change
  lands.
- Encounter `creatures` and `activity` are separate fields, so a lone creature
  can still occasionally draw a group activity. Group activities are tagged and
  few; tying the two would need the fields merged, which changes the shape.
