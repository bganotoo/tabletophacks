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
2. **Originality / IP audit of `data/`** — the only blocker that can become a
   real problem rather than lost revenue. It has to land *before* the store
   page exists, not after.
3. **Cache headers** — a landmine specific to this architecture: no build step
   means no content hashing, so a returning visitor can get new HTML against a
   cached `app.js`. It presents as "the site is broken" with nothing in the
   logs. Settle it before the service worker (see Deferred → Architecture,
   which notes the same dependency from the other side).
4. **The SEO and favicon pass** — mechanical, mostly one edit per page, and
   nothing else is discoverable until it ships.

Everything after that can go in whatever order suits the week.

### Discoverability & SEO

The tools are good and currently invisible. Every page carries only `charset`,
`viewport`, and a `<title>`; for ad revenue and pack sales, organic search *is*
the business.

- [ ] **Per-page `<meta name="description">`** on the landing page and all
  seven tool pages. One sentence each, written for a search result, not for a
  developer.
- [ ] **Open Graph + Twitter card tags** on every page, plus a single
  **social preview image** (1200×630). Links to the site currently unfurl as
  bare URLs everywhere they get shared — which is every launch channel.
- [ ] **Favicon and app icons.** The d20 SVG already in `index.html` is the
  artwork; export `favicon.ico`, a 180px apple-touch-icon, and a
  `site.webmanifest`. Every tab shows a blank page icon today.
- [ ] **`robots.txt` and `sitemap.xml`.** Eight static URLs — hand-written is
  fine, no generator needed.
- [ ] **Canonical URL tags**, so `/tools/dice/` and `/tools/dice/index.html`
  do not compete with each other.
- [ ] **`SoftwareApplication` JSON-LD** on each tool page. Cheap, and it is
  what earns a rich result for "free initiative tracker" style queries.

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

- [ ] **Privacy policy page.** Ads require one; so does a Gumroad/Lemon
  Squeezy checkout. Say plainly what is true: data lives in the visitor's
  browser, the site stores nothing server-side.
- [ ] **Terms of use page**, including a refund policy for pack sales.
- [ ] **Cookie/consent banner** — only if ads serve to EU/UK visitors. Skip it
  entirely if ads are geo-limited or the ad network is cookieless.
- [ ] **A stated content license.** The one item here that can actually bite:
  buyers need to know whether output from a paid pack may appear in an
  adventure they publish commercially. Decide it, put it on the pack page, and
  repeat it inside the pack JSON.
- [ ] **Originality / IP audit of `data/`.** Before money changes hands,
  confirm no table text is lifted from a published SRD or supplement, or mark
  what is OGL/CC-BY and attribute it.

### Deploy & domain

Nothing in the repo puts the site online: no CI workflow, no `CNAME`, no
hosting config.

- [ ] **Commit the deploy path**, whatever it is — a GitHub Actions workflow,
  or a `DEPLOYING.md`. Right now the deploy lives only in your head.
- [ ] **Custom domain + HTTPS** wired to the host, with the `www` → apex
  redirect settled one way.
- [ ] **Cache headers.** A no-build ES-module site on default caching will
  serve returning visitors a stale `app.js` against fresh HTML — the failure
  mode that looks like a broken site. Long-cache hashed assets or short-cache
  the JS; do not leave it to the host's default.
- [ ] **404 page** that links back to the tools.

### Trust & data safety

Everything persists only in `localStorage` under `th:<name>:v1`. Generator and
Workshop can export and import; **Initiative, Score, and Timer cannot.**

- [ ] **Export/import for Initiative and Score.** A GM who loses a combat
  roster or a campaign score sheet does not come back. `tools/shared/store.js`
  already centralizes the keys, so this is one shared helper, not three
  features.
- [ ] **"Back up everything" button** — one JSON file across all `th:*` keys,
  next to the existing storage indicator.
- [ ] **A plain warning that clearing browser data erases saved work**, shown
  on first save rather than buried in a help page.
- [ ] **Graceful `QuotaExceededError` handling.** `store.js` should surface a
  readable message instead of silently failing a save mid-session.

### Landing page & conversion

- [ ] **Email capture** (a Buttondown or ConvertKit embed — static-friendly).
  Highest-leverage item on the whole roadmap: without a list, the first paid
  pack launches to nobody.
- [ ] **Screenshots or a short loop** of the Generator and Initiative Tracker
  in use. Seven text cards ask visitors to imagine the product.
- [ ] **A real value proposition** above the fold — who it is for and why it
  beats the alternatives ("no install, no account, works on the phone already
  in your hand at the table").
- [ ] **Footer links**: About, Privacy, Terms, Contact.
- [ ] **A contact/support channel.** An email alias is enough, and it becomes
  mandatory the moment someone pays.
- [ ] **Link the Syntax Reference from the landing page.** `tools/reference/`
  is live and reachable only from inside the Generator and Workshop.
- [ ] **Resolve the "Rules Reference — Coming Soon" card.** It promises a tool
  that does not exist while a finished reference tool sits unlinked. Build it,
  relabel the card to point at the Syntax Reference, or drop it — but a dead
  promise on the one page everyone sees is worse than a shorter grid.

### Platform checks

- [ ] **Mobile and touch pass** on every tool. Phones and tablets are where
  these get used at a table, and tap targets and layout have never been
  audited.
- [ ] **Accessibility pass**: keyboard navigation, focus states, contrast,
  labels on the tool controls.
- [ ] **Safari/iOS check.** Private-mode `localStorage` behaves differently,
  which matters for a storage-only product.

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
- [ ] **Frictionless purchased-pack import.** Buyers arrive holding a JSON
  file; getting it into the Generator must not require a tour of the Workshop.
  Add a direct "Import a pack" entry point.
- [ ] **Pack versioning and updates.** A `version` field in pack JSON, the
  version visible in the tools, and a decision on how buyers get fixes.
- [ ] **Validation errors that do not blame the buyer.** A failed import of a
  paid pack is a refund request; the message should name the problem and the
  support address.
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
  is what gives the paid packs an audience.

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

### Architecture

- [ ] Offline support (service worker) — the site is fully static, so this
  is mostly cache plumbing. *Deferred: real value for at-table use, but it
  interacts with the cache-header work above. Do it after deploy is settled,
  or a stale service worker will pin an old build.*
- [ ] Consider alternatives to local storage. IndexedDB? *Deferred: nothing
  is near the quota yet, and the export/backup items above address the actual
  user-facing risk at a fraction of the cost.*

### Interface

- [ ] **Replace `prompt()`/`confirm()` dialogs** (new/rename/delete pack)
  with inline UI, consistent with the rest of the tool. *Deferred: visibly
  unpolished, but only on the Workshop path authors use, not the one visitors
  and buyers see.*
- [ ] Make inline edits undoable. Save confirmation dialogs for navigation
  events like closing a page without saving. Deletes, edits, rerolls, etc.
  should all be undoable. The undo/redo stack should be accessible via a toast-
  like interface in a corner of the screen. *Deferred: a genuinely large piece
  of work — it touches every tool's state model — and no part of launch
  depends on it.*

### Template authoring support

- [ ] **Autocomplete for table names in template inputs** (Create page and
  Workshop editor). Nice-to-have after the catalog exists, since it needs the
  same name index. *Deferred: author-facing, and authors are not the paying
  audience in Phase 1.*

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
