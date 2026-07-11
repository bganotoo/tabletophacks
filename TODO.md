# TODO — roadmap for tools and features

## Template authoring support

- [ ] **Autocomplete for table names in template inputs** (Create page and
  Workshop editor). Nice-to-have after the catalog exists, since it needs the
  same name index.

## Generator tool

- [ ] Some generated content mentions generic people, places, and events. It
  would be nice to tag those as generatable items to make it easy to fully flesh
  out the details. For example, if an NPC has a quirk of "harboring a fugative
  in their basement", the "fugitive" could be marked up in the template as being
  a generatable person. The markup would need to support specific generators,
  and probably even parameters that could be passed to the generator to make
  sure the generated content aligns with the placeholder. For example, the
  markup for "fugitive" might specify a minimum age and other requirements that
  are appropriate. The goal is that generated content would never end up making
  more work for the GM. Anything generated can be expanded to include all the
  detail necessary to make it work in a game.

## Interface

- [ ] **Replace `prompt()`/`confirm()` dialogs** (new/rename/delete pack)
  with inline UI, consistent with the rest of the tool.
- [ ] Make inline edits undoable. Save confirmation dialogs for navigation
  events like closing a page without saving. Deletes, edits, rerolls, etc.
  should all be undoable. The undo/redo stack should be accessible via a toast-
  like interface in a corner of the screen.

## Content

- [ ] More built-in packs (each is JSON + one `BUILTIN_PACKS` entry, and
  `data/data.test.js` covers it automatically): weather & travel events,
  traps & hazards, name tables by culture/ancestry.

## Architecture

- [ ] Offline support (service worker) — the site is fully static, so this
  is mostly cache plumbing.
- [ ] Consider alternatives to local storage. IndexedDB?

## Monetization

- [ ] Premium accounts get limited cloud syncing for their data.
- [ ] Premium accounts get access to additional generator packs.
- [ ] Premium accounts get access to additional vocabularies.
- [ ] Premium accounts can host sessions that other players can join remotely.
- [ ] Premium accounts can access currated content.
- [ ] Premium accounts can participate in massively multiplayer tabletop worlds.
- [ ] Premium accounts can take utilize AI features.
