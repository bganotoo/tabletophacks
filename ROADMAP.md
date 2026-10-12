# ROADMAP — tabletophacks.com

Three bands of work, ordered by what stands between the site and its first
dollar:

1. **MVP launch blockers** — the launch surface. Nothing here is a feature;
   it is the plumbing and trust that turn a free tool site into a business.
2. **Monetization — Phase 1** — paid content packs plus ads and donations.
   Deliberately backend-free: no accounts, no server, no change to the
   architecture in [CLAUDE.md](CLAUDE.md).
3. **Deferred to a later launch** — real ideas, wrong order. Each carries a
   note on why it waits, so it does not get re-litigated every planning pass.

## MVP launch blockers

### Start here

The subsections below group by topic, which makes them readable but makes all
of the items look equally urgent. They are not. In order:

1. **Email capture** — without a list, the first paid pack launches to nobody.
   Every other item here affects one launch; this one compounds across all of
   them.
2. ~~**Originality / IP audit of `data/`**~~ — *done 2026-10-10.* The only
   blocker that could become a real problem rather than lost revenue, so it
   had to land before the store page. No lifted text was found; 20 entries
   that sat too close to the PHB or to other franchises were rewritten, and a
   test now keeps them out.
3. **Cache headers** — a landmine specific to this architecture: no build step
   means no content hashing, so a returning visitor can get new HTML against a
   cached `app.js`. It presents as "the site is broken" with nothing in the
   logs. Settle it before the service worker (see Deferred → Architecture,
   which notes the same dependency from the other side).
4. ~~**The SEO and favicon pass**~~ — *done 2026-10-10.* Mechanical, mostly
   one edit per page, and nothing else was discoverable until it shipped.
5. ~~**Trust & data safety**~~ — *done 2026-10-10.* Export, import,
   whole-site backup, and save failures that say what went wrong. It was not
   ranked here originally; it went first because it was the only band that was
   pure code with no outside dependency — no mailing-list account, no hosting
   decision, no judgment call on table text.

Everything after that can go in whatever order suits the week.

### Discoverability & SEO

**Done 2026-10-10** — see
[the design spec](docs/superpowers/specs/2026-10-10-seo-metadata-design.md).
All eight pages now carry the same head block, and `seo.test.js` auto-discovers
every `index.html` and fails the suite if a new one ships without metadata or
without a sitemap entry.

- [x] **Per-page `<meta name="description">`** on the landing page and all
  seven tool pages. One sentence each, written for a search result, not for a
  developer.
- [x] **Open Graph + Twitter card tags** on every page, plus a single
  **social preview image** (1200×630). Links to the site currently unfurl as
  bare URLs everywhere they get shared — which is every launch channel.
- [x] **Favicon and app icons.** The d20 SVG already in `index.html` is the
  artwork; export `favicon.ico`, a 180px apple-touch-icon, and a
  `site.webmanifest`. Every tab shows a blank page icon today.
- [x] **`robots.txt` and `sitemap.xml`.** Eight static URLs — hand-written is
  fine, no generator needed.
- [x] **Canonical URL tags**, so `/tools/dice/` and `/tools/dice/index.html`
  do not compete with each other.
- [x] **`SoftwareApplication` JSON-LD** on each tool page. Cheap, and it is
  what earns a rich result for "free initiative tracker" style queries.

Left open deliberately, now that the plumbing exists:

- [ ] **Keyword-bearing `<title>` tags.** The titles are unchanged ("Tabletop
  Hacks", "Dice Roller — Tabletop Hacks") because they are brand copy, not
  plumbing. The title is the single largest on-page ranking factor, so it is
  worth one deliberate pass — but it is a naming decision, not a mechanical
  one. `og:title` tracks `<title>` automatically, enforced by the test.
- [ ] **Per-tool social preview images.** One site-wide card ships today; a
  per-tool card is a one-line change per page once there is traffic data
  saying which tools get shared.

### Measurement

- [ ] **Privacy-friendly analytics** (Cloudflare Web Analytics or GoatCounter —
  both cookieless, so neither compromises the "no accounts, no tracking"
  promise nor triggers a consent banner on its own). Without numbers there is
  no way to price a pack, tell which tool earns its keep, or answer a sponsor
  who asks for traffic.
- [ ] **A handful of custom events**, not just pageviews: generate, save to
  library, export, pack import. These are the only signal for which tool
  deserves a paid pack.

### Legal & licensing

Required by both Phase 1 paths, and the cheapest work on this list to get
wrong expensively.

- [x] **Privacy policy page.** Ads require one; so does a Gumroad/Lemon
  Squeezy checkout. Say plainly what is true: data lives in the visitor's
  browser, the site stores nothing server-side. *(2026-10-10 — `/privacy/`,
  linked from every page's footer; see [the design spec](docs/superpowers/specs/2026-10-10-site-pages-design.md). It names the one outside
  party that exists today — the web host's logs (Google Fonts was dropped
  for the system font stack on 2026-10-12) — and promises to change before analytics, ads, a list, or a store do.
  **Needs your read:** it is plain-language and accurate, but it is a legal
  page written without a lawyer, and it has no contact address yet.)*
- [ ] **Terms of use page**, including a refund policy for pack sales.
- [ ] **Cookie/consent banner** — only if ads serve to EU/UK visitors. Skip it
  entirely if ads are geo-limited or the ad network is cookieless.
- [ ] **A stated content license.** The one item here that can actually bite:
  buyers need to know whether output from a paid pack may appear in an
  adventure they publish commercially. Decide it, put it on the pack page, and
  repeat it inside the pack JSON. *Carry the SRD 5.1 CC-BY attribution line
  wherever this lands. The packs use "owlbear", "stirge", and the rarity
  ladder, all from SRD 5.1. The audit's position is that bare names do not
  require attribution, but one sentence settles the question. The exact
  wording is in the audit.*
- [x] **Originality / IP audit of `data/`.** *(2026-10-10 — see
  [the audit](docs/superpowers/specs/2026-10-10-data-originality-audit.md).)*
  No table text is lifted. Eleven trinkets that paraphrased the PHB's d100
  table were rewritten. So were nine names tied to other franchises:
  Dawnbreaker and Oathkeeper as item names, plus Oathkeeper, Kettleblack,
  Ninefingers, Corvo and others as person names. No WotC Product Identity
  appears. `data/originality.test.js` now fails the suite if a denylisted
  name (Product Identity, WotC settings, enforced Tolkien terms, or anything
  this audit removed) appears in any built-in pack.
  - Accepted, not fixed: compound place names can occasionally land on a name
    fiction also uses (*Blackmoor*, *Ravenholm*). They are ordinary English
    place-name elements, and preventing them would need an engine change.
  - The audit is a careful read against the tables these generators
    resemble, not a plagiarism-database match. A new paid pack should get the
    same read before it ships; the test is a floor, not a clearance.

### Deploy & domain

Nothing in the repo puts the site online: no CI workflow, no `CNAME`, no
hosting config.

- [ ] **Commit the deploy path**, whatever it is — a GitHub Actions workflow,
  or a `DEPLOYING.md`. Right now the deploy lives only in your head.
- [ ] **Custom domain + HTTPS** wired to the host, with the `www` → apex
  redirect settled one way. The repo already *states* the answer: every
  canonical tag, every `og:url`, and `sitemap.xml` name the apex. What is
  left is the host-side redirect.
- [ ] **Cache headers.** A no-build ES-module site on default caching will
  serve returning visitors a stale `app.js` against fresh HTML — the failure
  mode that looks like a broken site. Long-cache hashed assets or short-cache
  the JS; do not leave it to the host's default.
- [x] **404 page** that links back to the tools. *(2026-10-10 — `404.html`
  at the root, which is what GitHub Pages, Cloudflare Pages, and Netlify all
  serve by default. Marked `noindex, follow`; deliberately carries no
  canonical, Open Graph, or sitemap entry.)*

### Trust & data safety

**Done 2026-10-10** — see
[the design spec](docs/superpowers/specs/2026-10-10-data-safety-design.md).
Every tool that holds a GM's work can now get it out and back in, and no save
fails silently.

- [x] **Export/import for Initiative and Score** — *and Timer*, which had the
  same risk, the same shape guard, and three lines of the same wiring. All
  three go through one new shared module, `tools/shared/backup.js`, whose
  envelope carries the kind — so a score export opened in Initiative is
  refused by name instead of written in as a broken encounter.
- [x] **"Back up everything" button** — one JSON file across all `th:*` keys,
  next to the storage indicator in the Workshop. A restore says what it will
  replace, add, and leave alone before doing it.
- [x] **A plain warning that clearing browser data erases saved work**, shown
  as a dismissible bar on the first deliberate save, then never again.
- [x] **Graceful `QuotaExceededError` handling.** `store.js` now reports
  *why* a write failed (full / blocked / unknown) through an `onError` channel
  given at construction — which is what reached the three tools that were
  ignoring `set()`'s return value entirely. Reading `globalThis.localStorage`
  is also guarded now: the property access itself throws when a browser blocks
  site data, which used to white-screen the tool.

Left open deliberately:

- [x] **A discoverable home for backup/restore.** It lives in the Workshop,
  which is the author-facing tool — a GM who only uses Initiative never sees
  it. A footer "Your data" page would fix that, and it pairs naturally with
  the About/Privacy/Terms footer links already on this list. *(2026-10-10 —
  `/your-data/` lists every saved item by tool with its size, and holds
  backup and restore. Restore now confirms inline instead of with
  `confirm()`. The Workshop keeps its meter and links here.)*
- [ ] **Merging imported score sheets by id** instead of replacing the book.
  Replace is what "restore my lost sheet" means; merge is a real feature if
  anyone asks to move one sheet between devices.

### Landing page & conversion

- [ ] **Email capture** (a Buttondown or ConvertKit embed — static-friendly).
  Highest-leverage item on the whole roadmap: without a list, the first paid
  pack launches to nobody.
- [x] **Screenshots or a short loop** of the Generator and Initiative Tracker
  in use. Seven text cards ask visitors to imagine the product. *(2026-10-10
  — a "See it at the table" section: the Generator on desktop and the
  Initiative Tracker on a phone, real captures as WebP (37 KB and 26 KB), with
  alt text. They are hand-captured, so retake them after a visible UI
  change. A short loop would sell harder; it needs a screen recorder, not a
  script.)*
- [x] **A real value proposition** above the fold — who it is for and why it
  beats the alternatives ("no install, no account, works on the phone already
  in your hand at the table"). *(2026-10-10 — a two-sentence pitch under the
  tagline, a primary "Roll up an NPC" button and a "See all the tools" one,
  and three reasons under the screenshots. **Needs your read:** it is brand
  copy, drafted from the line above; the tagline and title are untouched.)*
- [ ] **Footer links**: About, Privacy, Terms, Contact. *(Partly done
  2026-10-10: every page now has a footer with Home, Your data, and Privacy,
  and `seo.test.js` fails a page without it. Terms and Contact join when
  their pages exist — each needs a decision of yours: a refund policy and an
  email address. About is optional; the landing page's value-prop work may
  cover it.)*
- [ ] **A contact/support channel.** An email alias is enough, and it becomes
  mandatory the moment someone pays.
- [x] **Link the Syntax Reference from the landing page.** *(2026-10-10 — it
  now has its own Live card in the grid, and the 404 page links the tools
  too.)*
- [x] **Resolve the "Rules Reference — Coming Soon" card.** *(2026-10-10 —
  replaced with a live Syntax Reference card — the second of the three options.
  The grid is now seven live tools and no promises. A real Rules Reference
  can come back as a card when it exists; the idea is parked under Deferred.)*

### Platform checks

- [x] **Mobile and touch pass** on every tool. Phones and tablets are where
  these get used at a table, and tap targets and layout have never been
  audited. *(2026-10-10 — every page probed at 390px with touch emulation;
  see [the spec](docs/superpowers/specs/2026-10-10-mobile-a11y-pass-design.md). Fixed: tool headers made every tool page scroll sideways; the
  Generator's sidebar pushed results ~800px down (now a "Generators"
  toggle on phones); per-part reroll was hover-only, so invisible on touch;
  number inputs were unstyled; buttons were 28px tall. Touch-only rules
  bring targets to 36–44px without changing the mouse layout.)*
- [x] **Accessibility pass**: keyboard navigation, focus states, contrast,
  labels on the tool controls. *(2026-10-10 — one `:focus-visible` ring
  site-wide; the landing page honours `prefers-reduced-motion`; the palette
  passes contrast. Every control already had a label or name, and
  `a11y.test.js` now keeps it that way for static markup. Not done: a
  screen-reader walkthrough of the dynamic tools — worth doing with a real
  screen reader rather than a probe.)*
- [ ] **Safari/iOS check.** Private-mode `localStorage` behaves differently,
  which matters for a storage-only product. *(Still open: it needs a real
  iPhone or Safari. The mobile pass used Chromium emulation, which is not
  WebKit. Worth checking alongside it: the Generator's sidebar toggle and
  the `(hover: none)` reroll buttons.)*

## Monetization — Phase 1 (no backend)

Paid content packs are the main line; ads and donations are the floor. Both
keep the site fully static — the Workshop already imports custom packs, so the
delivery mechanism exists.

### Paid content packs

- [ ] **One flagship paid pack**, built visibly above the free bar: deeper
  tables, tighter theming, more interlocking detail. This is the proof the
  model works — ship it before building a store around it.
- [ ] **Decide the free/paid split.** Free has to stay genuinely useful or
  there is no traffic to sell to. Paid should mean depth and theme, never a
  feature gate on the engine.
- [ ] **Static store page** listing packs, each with a payment link (Gumroad
  or Lemon Squeezy — both handle checkout, delivery, and VAT with no server).
- [x] **Frictionless purchased-pack import.** Buyers arrive holding a JSON
  file; getting it into the Generator must not require a tour of the Workshop.
  Add a direct "Import a pack" entry point. *(2026-10-10 — the Generator has
  an Import view at `/tools/generator/#import` (link it from the store and
  the purchase email), reachable from the header and the sidebar: a button,
  a drop zone, and an inline result listing the generators it added. See the
  [spec](docs/superpowers/specs/2026-10-10-pack-import-design.md).)*
- [x] **Pack versioning and updates.** A `version` field in pack JSON, the
  version visible in the tools, and a decision on how buyers get fixes.
  *(2026-10-10 — packs may carry a reserved `$pack` block: `title`,
  `version`, `author`, `license`, `support`, `url`. The version shows in
  the Generator sidebar, the template subtitle, and the Workshop list.
  **How buyers get fixes:** download the new file and import it again; a
  pack whose `$pack.title` matches an installed one updates it in place
  ("Updated Haunted Coast v1.1.0 (was v1.0.0)"). Untitled packs never match,
  so a hand-made pack is never replaced. Whether to also announce updates
  — the mailing list is the obvious channel — is still open.)*
- [x] **Validation errors that do not blame the buyer.** A failed import of a
  paid pack is a refund request; the message should name the problem and the
  support address. *(2026-10-10 — "This pack file could not be loaded. The
  problem is in the file, not anything you did." It names the pack's own
  `$pack.support` contact when the block is readable, even if the tables
  are broken, and keeps the technical reason under Details for the seller.
  The site-wide fallback address waits on the Contact item.)*
- [ ] **Pricing, store copy, refund policy, and the buyer license**, written
  once and kept consistent between store page and pack file.

### Ads and donations

- [ ] **Ad placement that stays out of the way**: landing page and table
  catalog only, nothing inside an active tool. An ad over an initiative
  tracker mid-combat costs more users than it earns.
- [ ] **Pick a network** — EthicalAds if the audience qualifies (cookieless,
  no consent banner), AdSense as the fallback.
- [ ] **Tip jar** (Ko-fi or Buy Me a Coffee) in the footer, plus one tasteful
  prompt after a visitor has clearly gotten value — saved to library, or
  exported.

### Launch

- [ ] **Launch channels**: r/DMAcademy, r/rpg, r/osr, RPG Discords, Bluesky,
  itch.io. Tool-first posts, pack second.
- [ ] **Skip anti-piracy entirely.** DRM on a JSON file is unenforceable and
  insults paying customers; the honest-system license is the whole policy.

## Content

Each pack is JSON plus one `BUILTIN_PACKS` entry, and `data/data.test.js`
covers it automatically.

- [ ] More built-in packs: weather & travel events, traps & hazards, name
  tables by culture/ancestry. These make the free tier worth visiting, which
  is what gives the paid packs an audience. *(2026-10-10 — Weather & Travel
  (`travel-day`, `travel-event`, `forecast`) and Traps & Hazards (`trap`,
  `hazard`) shipped; see
  [the design](docs/superpowers/specs/2026-10-10-travel-hazard-packs-design.md).
  Name tables by culture are left: they are the easiest place to stumble into
  a real culture's names carelessly, so that pack wants your call on which
  cultures, and how — real-world-inspired or wholly invented.)*

## Deferred to a later launch

### Monetization at scale

All of this needs accounts, a payment subscription, and a server — which the
whole codebase is built to avoid. Worth doing once Phase 1 proves people pay;
not worth it before, because it replaces the architecture to reach the same
first dollar.

- [ ] Premium accounts get limited cloud syncing for their data.
- [ ] Premium accounts get access to additional generator packs.
  *(Phase 1 ships this as one-time pack purchases instead — same revenue, no
  auth.)*
- [ ] Premium accounts get access to additional vocabularies.
- [ ] Premium accounts can host sessions that other players can join remotely.
- [ ] Premium accounts can access currated content.
- [ ] Premium accounts can participate in massively multiplayer tabletop
  worlds.
- [ ] Premium accounts can take utilize AI features.

### New tools

- [ ] **Rules Reference** — quick-lookup cards for common conditions and
  actions. *Deferred: this was the landing page's one "Coming Soon" card and
  is now unadvertised, so it ships when it is built rather than blocking
  anything. It is also the item most likely to need an originality pass
  (condition text is exactly the kind of thing lifted from an SRD), which is
  a reason to build it after the `data/` IP audit, not before.*

### Architecture

- [ ] Offline support (service worker) — the site is fully static, so this
  is mostly cache plumbing. *Deferred: real value for at-table use, but it
  interacts with the cache-header work above. Do it after deploy is settled,
  or a stale service worker will pin an old build.*
- [ ] Consider alternatives to local storage. IndexedDB? *Deferred: nothing
  is near the quota yet, and the export/backup items above address the actual
  user-facing risk at a fraction of the cost.*

### Interface

- [x] **Replace `prompt()`/`confirm()` dialogs** (new/rename/delete pack)
  with inline UI, consistent with the rest of the tool. *Deferred: visibly
  unpolished, but only on the Workshop path authors use, not the one visitors
  and buyers see.* *(2026-10-10 — done for all eleven, not only the
  Workshop's: Initiative, Score, and Timer asked the same way. One shared
  `confirmDialog`/`promptDialog` pair in `ui.js` on a native `<dialog>`
  (focus trap, Esc to cancel, announced as a dialog). Destructive questions
  name the action on the button — Delete, Clear, Replace — and focus Cancel.
  The Your data page's restore confirmation stays inline in the page.)*
- [ ] Make inline edits undoable. Save confirmation dialogs for navigation
  events like closing a page without saving. Deletes, edits, rerolls, etc.
  should all be undoable. The undo/redo stack should be accessible via a toast-
  like interface in a corner of the screen. *Deferred: a genuinely large piece
  of work — it touches every tool's state model — and no part of launch
  depends on it.*

### Template authoring support

- [x] **Autocomplete for table names in template inputs** (Create page and
  Workshop editor). Nice-to-have after the catalog exists, since it needs the
  same name index. *Deferred: author-facing, and authors are not the paying
  audience in Phase 1.* *(2026-10-10 — table names after `{` and tags after
  `#`, in the Create box, the template editor, and the Workshop editor; see
  [the design](docs/superpowers/specs/2026-10-10-template-autocomplete-design.md).)*

### Generator

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
  detail necessary to make it work in a game. *Deferred: the most interesting
  idea on this list, and a parser/engine change of real depth — a
  differentiator for a second launch, not a prerequisite for the first.*
