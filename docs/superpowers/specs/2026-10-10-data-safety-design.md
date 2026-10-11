# Trust & data safety — design

**Date:** 2026-10-10
**ROADMAP band:** MVP launch blockers → Trust & data safety (all four items)

- Export/import for Initiative and Score
- "Back up everything" button
- A plain warning that clearing browser data erases saved work
- Graceful `QuotaExceededError` handling

## Goal

`localStorage` is the only persistence on this site, and three of the tools
that hold a GM's actual work — Initiative, Score, and Timer — cannot get data
out of it. A GM who loses a combat roster or a campaign score
sheet has no recourse and does not come back. Worse, two of the ways to lose it
are silent: `store.set` returns `false` on a full or blocked store, and
Initiative, Score, and Timer all ignore that return value — so a save can fail
mid-session with no feedback at all.

Close all four gaps at once. They are one question — *can a GM trust this site
with their data?* — and they converge on one file, `tools/shared/store.js`.

## Why one unit

Taken separately, each item would touch the same code twice:

- Quota handling changes `store.js`'s contract, which all six tools consume.
  Doing it alone means editing every tool, then editing them again to add
  export buttons.
- The "clearing browser data erases your work" warning is only honest once
  there is an export to point the reader at. Shipping it first means warning
  about a risk with no remedy.
- Per-tool export and whole-origin backup are the same envelope format and the
  same parse/validate code at two scopes.

## Principles

- **Logic in tested shared modules; `app.js` stays thin wiring.** Repo
  convention, and it is what makes four features across six tools tractable.
- **Replace, never merge, on restore.** Merging two encounters or two timer
  states is undefined. A restore means "put it back how it was."
- **Reject rather than guess.** A malformed or mismatched import fails with a
  message that names the problem, in the spirit of the Phase 1 roadmap item
  "validation errors that do not blame the buyer."
- **A backup file may only write `th:*` keys.** Enforced at parse time, so a
  hand-edited or hostile file cannot reach into unrelated origin storage.
- **No new pages.** Full backup lives in the Workshop next to the existing
  storage meter, so no `sitemap.xml` or SEO head work is pulled in.

## 1. `store.js` — graceful write failure

Today `set()` swallows the exception and returns a bare `false`. Three of the
five call-site groups never check it. The fix has to reach unchecked call sites
without auditing every one, so the reporting hangs off store creation rather
than the return value.

### New pure export

`describeWriteError(err)` → `{ reason, message }`

| `reason` | Detected by | Message |
|---|---|---|
| `'quota'` | `err.name` of `QuotaExceededError` or `NS_ERROR_DOM_QUOTA_REACHED`; `err.code` of `22` or `1014` | "Browser storage is full, so that change was not saved. Export your work to a file, then delete something you no longer need." |
| `'unavailable'` | `SecurityError`, or a backing that throws on access | "This browser is blocking storage, so nothing can be saved. Your work will be lost when you close the tab — export it first." |
| `'unknown'` | anything else | "That change could not be saved. Export your work to a file so it is not lost." |

Pure and exported, so every branch is unit-testable with a synthetic error.
Safari private mode throws `QuotaExceededError` on any write, which lands on
the `'quota'` message; it mentions exporting, which is the right advice there
too.

### Changed factory

`createStore(backing = resolveBacking(), { onError } = {})`

- `resolveBacking()` reads `globalThis.localStorage` inside a `try`. Chrome with
  site data blocked throws `SecurityError` on the *property access*, which
  today would throw at module load and white-screen the tool. On failure it
  returns an in-memory `Map`-backed shim so the tool still works for the
  session, and the store reports `persistent === false`.
- `store.persistent` — boolean. `false` means this session's writes go nowhere.
- `onError({ name, reason, message })` — called when a write fails, with `name`
  the unversioned store name. Tools pass `onError: (e) => toast(e.message)` at
  construction, which fixes Initiative, Score, and Timer's silent losses with
  one line each.
- `set()` still returns a boolean. The contract is unchanged, so the Generator
  and Workshop call sites that already check it and add their own context
  ("Could not save pack") keep working; `onError` supplies the reason underneath.
- `get()` gains a `try` around the backing read, so a backing that starts
  throwing mid-session returns the fallback instead of propagating.

## 2. `tools/shared/backup.js` — the envelope (new module)

Pure: no DOM, no `localStorage`, no clock except through an injected `now`.
Imports the three existing shape guards (`isValidEncounter`, `isValidBook`,
`isValidGame`) so a bad import is caught before it is written.

### Kind registry

```js
export const SNAPSHOT_KINDS = {
  encounter: { key: 'encounter', label: 'encounter',    tool: 'Initiative Tracker' },
  score:     { key: 'score',     label: 'score sheets', tool: 'Score Tracker' },
  timer:     { key: 'timer',     label: 'turn timer',   tool: 'Turn Timer' },
};
```

Each entry carries the `store.js` name, a noun for messages, and the tool that
owns it. `tool` is what lets a mismatch say where the file *does* belong.

### Per-tool snapshot

`buildSnapshot(kind, data, now)` → envelope:

```json
{
  "tabletophacks": "encounter",
  "version": 1,
  "exportedAt": "2026-10-10T18:30:00.000Z",
  "data": { "round": 3, "turnIndex": 1, "combatants": [] }
}
```

`parseSnapshot(source, expectedKind)` → `{ ok: true, kind, data, exportedAt }`
or `{ ok: false, error }`. Failure modes, each with its own message:

| Condition | Error |
|---|---|
| not JSON | "not valid JSON — the file may be truncated, or not an export at all" |
| not an object, or no `tabletophacks` field | "this is not a Tabletop Hacks export file" |
| `tabletophacks` names an unknown kind | "this export is of an unrecognised kind (NAME)" |
| kind known but not `expectedKind` | "this is a LABEL export — open it in the TOOL instead" |
| `version` greater than 1 | "this export was made by a newer version of the site" |
| `data` fails the kind's shape guard | "the LABEL data in this file is incomplete or damaged" |

Filename helper `snapshotFilename(kind, now)` →
`tabletophacks-encounter-2026-10-10.json`.

### Whole-origin backup

`buildBackup(entries, now)` → envelope, where `entries` is `[key, value]` pairs
straight from `storageEntries()` (already in `storage.js`), filtered to the
`th:` prefix:

```json
{
  "tabletophacks": "backup",
  "version": 1,
  "exportedAt": "2026-10-10T18:30:00.000Z",
  "keys": { "th:packs:v1": "[{\"id\":\"p1\"}]" }
}
```

**Values stay raw strings, not parsed JSON.** Parsing would read better in a
text editor but makes restore ambiguous: a stored string `"x"` and a corrupt
raw value `x` would both come back as `x`, and a value that is not JSON at all
could not round-trip at all. A backup's one job is to be lossless.

`parseBackup(source)` → `{ ok: true, keys, exportedAt }` or
`{ ok: false, error }`. Same early failure modes as `parseSnapshot`, plus:

- a `keys` field that is not a plain object of string values → rejected
- **any key not starting with `th:`** → rejected, naming the offending key.
  This is the safety property: a restore can only ever write this site's own
  namespace.

`restorePlan(existingEntries, incomingKeys)` →
`{ writes, replaced, added, unaffected }`, where `replaced`, `added`, and
`unaffected` are key names. The Workshop uses the counts to say what a restore
will do *before* doing it. Keys present in storage but absent from the file are
reported as `unaffected` and left alone — a restore puts back what the backup
covered; it does not wipe what it did not.

## 3. `tools/shared/notices.js` — the one-time warning (new module)

Pure decision logic plus one thin wired helper.

- `STORAGE_NOTICE` — the text: "Your saved work lives in this browser only.
  Clearing your browsing data — or using private browsing — will erase it. Use
  Export to keep a copy."
- `shouldShowNotice(seen, id)` → boolean
- `markNoticeSeen(seen, id)` → a new object (never mutates its input)

`seen` is one store value under the name `notices`, shaped `{ storage: true }`,
so later notices share the key instead of each adding one.

`showStorageNoticeOnce(store)` is the wired part: checks the flag, calls
`noticeBar()`, writes the flag back. Thin DOM wiring, untested, per convention.
Tools call it once in their save path.

**Where it fires.** Initiative's `commit()`, Score's and Timer's save
functions, the Generator's library and pack saves, and the Workshop's
`persist()` — the places a user is deliberately keeping work. **Not** the Dice
Roller: its history writes on every roll, so the warning would fire on a
visitor's first click, about something they never asked to save.

### `ui.js` addition

`noticeBar(message, { actionText, onAction })` — a dismissible bar appended to
`document.body`, with a "Got it" button that removes it and fires the dismiss
callback. Styled in `tools/shared/tools.css` alongside `.toast`, reusing
`--card-hover` / `--accent` / `--border`. One bar at a time, same as the toast.

## 4. App wiring

### Initiative, Score, Timer (`index.html` + `app.js`)

Each gets an `Export` and an `Import…` button plus a hidden file input, in the
existing header button row next to "New encounter" / "New sheet". Wiring per
tool:

- **Export** — `download(snapshotFilename(kind, now), JSON.stringify(buildSnapshot(kind, state, now), null, 2))`
- **Import** — `FileReader` → `parseSnapshot(text, kind)`. On `ok: false`,
  `toast('Import failed — ' + error)`. On success, `confirm()` that this
  replaces current state, then write, re-render, and toast what landed. The
  shape guard already ran inside `parseSnapshot`, so the state is safe to adopt.
- `createStore()` gains `{ onError: (e) => toast(e.message) }`.

Score's import replaces the whole book rather than merging sheets by id.
Merging is defensible for a book of sheets, but replace is what the other two
do and what "restore my lost sheet" means; a merge can be added later if
anyone asks for it.

`confirm()` is used deliberately here, even though the roadmap wants
`prompt()`/`confirm()` replaced eventually — that is a separate deferred item,
and matching the existing tools beats inventing a one-off dialog.

### Workshop (`index.html` + `app.js`)

In the existing Storage `side-group`, under the meter:

- **Back up everything** — `buildBackup(storageEntries(), now)`, downloaded as
  `tabletophacks-backup-2026-10-10.json`.
- **Restore…** — file input → `parseBackup`. On success, build a `restorePlan`
  and `confirm()` with its counts ("This will replace 2 saved items and add 1.
  Anything not in the backup is left alone."). On confirm, write each pair,
  refresh the meter, and reload the page so every tool's in-memory state is
  re-read rather than left stale.

Restore writes full `th:…:v1` keys, which `createStore`'s name-based API does
not express. Rather than weaken the "never touch localStorage directly"
invariant in `CLAUDE.md`, `store.js` gains a narrow `setRaw(fullKey, value)`
that **rejects any key not starting with `th:`** — the same guard as
`parseBackup`, enforced at the storage layer too.

Any key name from a file that reaches the DOM goes in as a text node via `el()`,
never interpolated markup, so the `esc()` invariant holds by construction.

## Testing

New and extended `node --test` suites, matching repo convention (pure modules
tested, `app.js` left alone):

- **`backup.test.js`** — snapshot round-trip for all three kinds; every
  `parseSnapshot` failure branch, including a kind mismatch naming the right
  tool; the version guard; `buildBackup` filtering non-`th:` keys and
  preserving raw string values; `parseBackup` rejecting a non-`th:` key by
  name; `restorePlan` splitting `added` / `replaced` / `unaffected`; filename
  shape.
- **`store.test.js`** (extended) — `describeWriteError` for each reason, by
  `name` and by legacy `code`; `onError` firing with name and reason on a
  throwing backing; `set` still returning `false`; `get` returning the fallback
  when the backing throws; the in-memory fallback round-tripping and reporting
  `persistent === false`; `setRaw` writing a `th:` key and rejecting others.
- **`notices.test.js`** — `shouldShowNotice` true on an empty or absent flag
  set, false once seen; `markNoticeSeen` not mutating its input, and idempotent.

Existing suites (`storage.test.js`, `encounter.test.js`, `scoresheet.test.js`,
`timer.test.js`, `seo.test.js`, `data/`) must stay green; `store.js`'s changed
signature is additive, so no existing call site changes meaning.

Manual check: serve locally; in Initiative add combatants, export, "New
encounter", import the file, confirm the roster returns; try importing a score
export into Initiative and read the mismatch message; in the Workshop back up,
change a pack, restore, confirm the pack reverts; confirm the storage notice
appears on a first save and never again.

## Out of scope

- Per-tool export for the Dice Roller (history is incidental, not authored
  work) and the Generator (library export already exists).
- Replacing `confirm()` with inline UI — separate deferred roadmap item.
- Merging imported score sheets by id.
- Any new page, route, or `sitemap.xml` entry.
