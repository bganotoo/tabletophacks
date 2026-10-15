# Pronouns that follow the person

**Status:** shipped 2026-10-15. Builds on the 2026-10-14 engine additions (`{?silent}`, `#@capture.field`, `#$var`, run `vars`).

## Goal

Generated people get she/her, he/him, or they/them, and everything about them agrees: their name and honorific, gendered roles (kin, titles), and every pronoun and verb in the lines that describe them. Groups and people a line doesn't name keep a plain "they".

## Model

The person is a pronoun set, drawn once per template into `@p`; the name is picked to fit it. Drawing the set first, not reading it off the name, is what keeps rerolls consistent: rerolling the name draws a new name for the same person, and rerolling any other field keeps their pronouns. Every result agrees either way, and `pronoun` weights (45/45/10) set the mix.

- `pronoun` (`common.json`): one entry per set, tagged `she`/`he`/`they`. Variants hold each form (`they`, `them`, `their`, `theirs`, `themselves`, `are`, `were`, `have`, `do`, `s`, `es`) plus `avoid`, the name tag that set never takes (`m`, `f`, or `none`).
- Helper tables `they`, `their`, `s`, … are each `{pronoun#they@?p.<form>}`: @p's form, or they/them when no person is in scope. That keeps every sub-table runnable on its own (the picker's `npc-quirk`, `data.test.js`, custom packs that reference it).
- `first-name` and `honorific` are dispatchers over `-f`/`-m`/`-any` lists, weighted by list size so an unfiltered lookup keeps its old odds. `kin` and `authority` carry `f`/`m` tags.
- `subject-name` is `person-name` with `#!@p.avoid` on every name part. Only the person's own name uses it, so other people mentioned in their lines keep the full name pool.
- `npc` and `quest` start with `"$with": "{pronoun#$pronouns@p}"`; a caller can pick the set with `vars: { pronouns: 'she' }`.

## Engine additions

- `@?x` captures only if `x` is unset; otherwise the lookup renders the existing capture, with its modifiers. It can't go on a repetition.
- `#@x.field` with `x` unset adds no constraint, the same as an unset `#$var`. A set capture missing the field is still an error.
- `$with` on a JSON object is evaluated first and left out of the result. It isn't a child, so a field reroll keeps it, and each `$repeat` element binds afresh.
- `runTraced` keeps the run's captures on the tree root; `rerollPath` starts from them and writes back any it remakes.

## Writing lines

Write the line for they/them and brace each pronoun and agreeing verb: `a wooden leg {they} never explain{s}`, `when {they} {are} angry`, `{they} {have}n't earned`. Braces can't nest inside `{a|b}` alternatives, so reword a line that would need it. `data/pronoun.test.js` runs every set through `npc` and `quest` and fails on a foreign pronoun, an agreement slip, or a name of the wrong gender; add to its `ABOUT_OTHERS` list for a line whose gendered pronoun is about someone else.

## Scope

Migrated: every line in `npc.json` about the NPC, and the patron lines in `quest.json` (twists, deadline, complication, `coming-event`). Not migrated, because "they" there is a group or someone unnamed: encounter, location, travel, treasure, and hazard lines, and `someone`/`foe` slots. Not yet built: a pronoun picker in the Generator UI (pass `vars.pronouns`).
