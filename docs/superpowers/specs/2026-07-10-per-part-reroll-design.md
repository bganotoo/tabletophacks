# Per-part reroll — design

## Goal

Let a user reroll one individual component of a generated result while keeping
everything else fixed — e.g. keep an entire NPC but replace only their quirk. A
`↻` button sits next to each rerollable component; clicking it re-rolls just
that component in place.

## Scope

- **JSON templates only.** The rich, structured generators (`npc`, `location`,
  `quest`, `treasure`) are JSON templates rendered as definition-list cards.
  Each key/value is a natural, independently re-evaluable part. Flat tables
  (e.g. `tavern-name`) produce one flowing string with no retained internal
  boundaries; they keep their existing whole-result reroll and gain no per-part
  buttons.
- **Every node, every depth.** Each leaf value, each nested object/array
  subtree, and each array element is rerollable. This answers the "reroll a
  part of a part" question with "yes."

### Out of scope (YAGNI — recorded as possible future work)

- Per-part reroll for flat text (would require the engine to emit a full
  span-level evaluation tree and the renderer to map substrings to DOM nodes).
- Re-flipping a `$maybe` coin on reroll (see "Reroll semantics" below).
- Encoding per-field overrides into share links / the URL hash.
- Adding a currently-absent optional (`$maybe`) field back into a result.

## Core mechanism: the provenance tree

To reroll one field in place, the engine must know **which source-template
fragment produced each rendered node**, so it can re-evaluate just that fragment
with a fresh RNG. The concrete result value alone has lost that link:
`quirk: "collects teeth"` no longer knows it came from
`{ "$maybe": 0.7, "value": "{npc-quirk}" }`.

During a run we emit a parallel **reroll tree** that maps each result node to the
exact source fragment to re-evaluate for an in-place reroll. Reroll then means:
walk to the node, re-evaluate its fragment with a fresh RNG, splice the new value
back in. All randomness is localized to the touched subtree; siblings are
literally not re-evaluated, so they cannot change.

Two alternatives were rejected:

- **Per-part derived seeds** (give every node its own seed stream): more
  invasive to the engine's sequential RNG, and does not naturally handle
  `$or`/`$repeat` structural choices.
- **Re-run the whole template, keep one field**: re-runs everything and discards
  all but the target — wasteful and cannot guarantee siblings stay put.

### Reroll-node shape

```
RerollNode = {
  source,              // the source fragment to re-evaluate in place
  kind: 'leaf' | 'object' | 'array',
  children?            // object: { key -> RerollNode }; array: RerollNode[]
}
```

### What each node's reroll fragment is

| Result node | Reroll re-evaluates | Effect |
|---|---|---|
| plain string (`occupation`) | the string template | new value |
| plain object (`home`, no directive) | the object template | re-rolls all its fields |
| `$or` container (`home`) | the whole `$or` | re-picks branch (tavern ↔ hovel) |
| child of the chosen `$or` branch (`home.name`) | that branch's field template | new tavern name only — *part of a part* |
| `$repeat` array (`inventory`) | the whole `$repeat` | re-rolls count **and** items |
| one array element (`inventory[1]`) | the `of` template | new single item |
| `$maybe` field that is present (`quirk`) | the **inner** `value` only | different quirk, **stays present** |

### Reroll semantics for `$maybe` (deliberate call)

Rerolling a present optional field re-evaluates its inner `value` only, giving a
*different* value rather than re-flipping the coin and possibly deleting it.

Consequence: an *absent* `$maybe` field produces no node, so it cannot be
rerolled into existence — it only returns on a full reroll. Accepted for v1.

### Captures

`@capture`/`@ref` pairs live in one run's context. Re-evaluating a single field
in isolation starts with an empty capture map, so a field whose template
references a sibling-set capture would fail in isolation. No built-in pack does
this. Handled gracefully at the app layer (see Error handling), not designed
around.

## Components & data flow

### 1. Engine (`gen/engine.js`) — emit provenance

A traced variant of the JSON evaluator returns `{ value, node }`, where `node`
is the `RerollNode` for that value. Provenance is threaded through the existing
`evalJsonValue` / `evalJsonObject` / `evalRepeatDirective` / `$or` / `$maybe`
paths — the value logic is unchanged; each path returns its provenance alongside
its value. Specifically:

- string → `{ kind: 'leaf', source: <the string> }`
- plain object → `{ kind: 'object', source: <object template>, children: {…} }`
- plain array → `{ kind: 'array', source: <array template>, children: [...] }`
- `$maybe` present → the inner value's node, but with `source` set to the inner
  `value` template (so reroll keeps it present). Absent → OMIT, no node.
- `$or` → the chosen branch's node, but with `source` set to the whole `$or`
  object (so a container reroll re-picks the branch).
- `$repeat` → `{ kind: 'array', source: <the $repeat object>, children: [...] }`,
  where each child's `source` is the `of` template (so element reroll re-rolls
  one item, container reroll re-rolls count + items).

### 2. Public API (`gen/index.js`)

- `Generator.runTraced(name, opts)` → `{ value, tree }`. JSON templates return a
  populated `tree`; flat tables return `{ value, tree: null }` (unchanged text
  behavior, no per-part reroll).
- `Generator.rerollPath(tree, path, opts)` → `{ value, node }`: walks `tree` to
  `path` (an array of keys/indices), re-evaluates that node's `source` with a
  fresh RNG (`opts.seed`), and returns the new subvalue and its new subtree. The
  caller splices `value` into the result at `path` and swaps the subtree in.

### 3. Render (`tools/shared/render.js`) — stays pure and testable

`renderResult(value, tree)` gains an optional `tree` argument. When present, each
rerollable node's row is annotated with a `↻` button carrying its path as
`data-reroll-path='["home","name"]'` (JSON-encoded). When `tree` is absent (or
null, as for flat text), output is byte-identical to today.

Buttons appear on **every node except the root** — the global Reroll button
already covers a full re-run, so a root-level per-node button would be redundant.

The batch entry point `renderResults(values, trees)` gains a parallel `trees`
array (one tree per result), passing each result's tree through to its
`renderResult` call. Paths are relative to each result; the batch item index is
tracked separately by the app (see below), not baked into `data-reroll-path`.

### 4. App wiring (`tools/generator/app.js`) — thin, untested glue

- `generate()` calls `runTraced` and stores `state.resultTrees` parallel to
  `state.results`.
- A single delegated click listener on the result panel reads
  `data-reroll-path` (and, in a batch, which item index the button lives under),
  calls `rerollPath` with a fresh random seed, splices the new value + subtree
  into `state.results[i]` / `state.resultTrees[i]`, and re-renders that one
  result card.
- The first per-field reroll sets `state.diverged = true`, which disables Copy
  Link with an explanatory tooltip ("this result was hand-edited; the seed no
  longer reproduces it"). Copy text, Copy Markdown, and Save to library keep
  working on the concrete current `state.results`. A fresh full run
  (`generate`) clears `diverged`.

### Data flow for one reroll

Click `↻` on `home.name` → app reads path `["home","name"]` + batch index →
`rerollPath(tree, path, { seed: randomSeed() })` → engine re-evaluates
`"{tavern-name}"` → returns new string + leaf node → app splices into
`results[i].home.name` and `trees[i]` → re-renders card `i` → sets `diverged`.

## Reproducibility & sharing

A per-part reroll deliberately breaks single-seed reproducibility. The chosen
behavior is **diverge, keep local fidelity**:

- The shown result mutates in place.
- Copy text, Copy Markdown, and Save to library reflect the edited result
  exactly. Save already stores concrete result data, so a hand-tuned NPC saves
  and reopens exactly as shown.
- Copy Link disables once diverged (a single seed cannot reproduce hand-picked
  fields), with a tooltip explaining why.

## Error handling

- `rerollPath` runs in strict mode inside a try/catch. If a field's fragment
  cannot evaluate in isolation (e.g. it references a sibling-set `@capture`),
  catch the `GenError`, leave the field unchanged, and `toast()` "Couldn't
  reroll this part on its own." The rest of the card is untouched.
- Unknown or empty path → no-op.

## Testing

- **Engine:** `runTraced` produces a tree whose paths match the value shape
  across every directive (`$or`, `$repeat`, `$maybe`, nested objects/arrays);
  `rerollPath` changes only the targeted subtree and leaves siblings
  byte-identical under seeded assertions. `$maybe`-present reroll stays present;
  `$or` container reroll can switch branch; `$repeat` element reroll changes one
  item without changing count.
- **Render:** path attributes land on the correct rows; absent when no tree;
  flat-string results render exactly as before.
- **App glue:** untested, per the repo convention (logic worth testing lives in
  the shared/engine modules above).

## Invariants preserved

- All tool runs stay strict mode; every `GenError` (including from
  `rerollPath`) is caught and surfaced, never left uncaught.
- All interpolated text still passes through `esc()`.
- No new localStorage keys; library entries keep their existing shape (concrete
  `data`).
