# Discoverability & SEO pass — design

## Goal

Make the eight pages of tabletophacks.com discoverable and shareable. Today
every page carries exactly three head tags — `charset`, `viewport`, and
`<title>` — so a search result shows a Google-invented snippet, a shared link
unfurls as a bare URL, and every browser tab shows a blank-page icon.

This closes the whole **Discoverability & SEO** section of
[ROADMAP.md](../../../ROADMAP.md): meta descriptions, Open Graph/Twitter cards
plus a social preview image, favicon and app icons, `robots.txt` and
`sitemap.xml`, canonical URLs, and `SoftwareApplication` JSON-LD.

## Scope

Eight URLs, all static:

| Path | Page |
| --- | --- |
| `/` | Landing page |
| `/tools/generator/` | Random Generators |
| `/tools/workshop/` | Template Workshop |
| `/tools/dice/` | Dice Roller |
| `/tools/initiative/` | Initiative Tracker |
| `/tools/timer/` | Game Timer |
| `/tools/score/` | Score Tracker |
| `/tools/reference/` | Syntax Reference |

### Out of scope (YAGNI — recorded as possible future work)

- Analytics and custom events (separate roadmap section; needs a vendor pick).
- Privacy/Terms/About pages and footer links to them (Legal section; needs
  decisions the metadata work does not block). The sitemap and the SEO test
  are written so adding a page later is one entry each.
- A per-tool social preview image. One site-wide 1200×630 card is enough until
  there is traffic data saying otherwise; the markup is per-page, so swapping
  in per-tool images later is a one-line change per page.
- `BreadcrumbList` / `WebSite` JSON-LD, `hreflang`, AMP, RSS.

## Assumptions

1. **Canonical origin is `https://tabletophacks.com`** — apex, no `www`, with a
   trailing slash on directory URLs. The repo already names the apex in the
   README and the page footer. The roadmap's "`www` → apex redirect settled one
   way" item is a host-config decision; this work *states* the answer in the
   canonical tags, which is the half that lives in the repo. If the host ends
   up serving `www` as canonical instead, `SITE_ORIGIN` in the SEO test and the
   eight `<link rel="canonical">` tags are the only places to change.
2. **Directory URLs are canonical**, not `index.html`. Every canonical tag,
   every sitemap entry, and every `og:url` uses the trailing-slash form, so
   `/tools/dice/index.html` consolidates into `/tools/dice/`.

## Design

### Head block shape

Every page gets the same ordered block, differing only in its five values
(title, description, canonical path, and the relative depth of the asset
hrefs). Keeping the order identical across pages is what makes the pass
reviewable at a glance and the test simple.

```html
<meta name="description" content="…" />
<link rel="canonical" href="https://tabletophacks.com/…/" />

<meta property="og:type" content="website" />
<meta property="og:site_name" content="Tabletop Hacks" />
<meta property="og:title" content="…" />
<meta property="og:description" content="…" />
<meta property="og:url" content="https://tabletophacks.com/…/" />
<meta property="og:image" content="https://tabletophacks.com/og-image.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="…" />
<meta name="twitter:card" content="summary_large_image" />

<link rel="icon" href="/favicon.ico" sizes="32x32" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="manifest" href="/site.webmanifest" />
<meta name="theme-color" content="#0d0d1a" />
```

Decisions worth recording:

- **`og:image` is an absolute URL.** Relative `og:image` values are not
  reliably resolved by unfurlers; this is the one place the origin must be
  hardcoded even on pages that otherwise use relative paths.
- **Icon hrefs are root-absolute (`/favicon.ico`).** The icons are one
  site-wide set; root-absolute means the same five lines paste into every page
  regardless of depth. The cost is that the site must be served from a domain
  root — which it is, and which the canonical URLs already assume.
- **No `twitter:title`/`twitter:description`.** X and every other unfurler
  falls back to the `og:` values. Duplicating them doubles the per-page edit
  surface for nothing.
- **`og:type` is `website` on all eight.** These are tools, not articles.

### Descriptions

One sentence each, written for a search result — what the tool does and the
promise that distinguishes it (no account, no install, works on a phone). Kept
to roughly 120–160 characters so Google shows the whole thing. The landing page
and the Generator lead with the search phrases people actually type ("free D&D
NPC generator", "initiative tracker").

### Social preview image

`og-image.png`, 1200×630, generated from a committed SVG source
(`assets/og-image.svg`) so it can be regenerated and edited as text rather than
re-drawn. It reuses the d20 mark and the site's dark palette: wordmark,
tagline, and a line naming the tools, which is what makes a shared link
self-explanatory in a Discord or Reddit preview.

Generation is a committed shell script (`assets/build-icons.sh`) that shells out
to ImageMagick. This is **not** a build step for the site: the outputs are
committed, the site never runs it, and `npm test` does not depend on it. It
exists so the icons are reproducible instead of mystery binaries.

### Icons

From the same d20 artwork already inlined in `index.html`:

| File | Purpose |
| --- | --- |
| `favicon.svg` | Modern browsers; scales, and theme-independent |
| `favicon.ico` | 16/32/48 multi-resolution; old browsers and crawlers |
| `apple-touch-icon.png` | 180×180, iOS home screen |
| `icon-192.png`, `icon-512.png` | `site.webmanifest`, Android home screen |

The raster icons get the site's dark background baked in rather than
transparency: an amber line-art d20 on transparent disappears against the
light home screens and tab bars it will actually sit on.

`site.webmanifest` declares the name, short name, theme/background colors, and
`display: "browser"`. Not `standalone` — this is not an installable app yet
(no service worker; that is Deferred → Architecture), and claiming otherwise
gets a worse install prompt, not a better one.

### `robots.txt` and `sitemap.xml`

Hand-written; eight URLs. `robots.txt` allows everything and points at the
sitemap. Sitemap entries carry `<loc>` and `<changefreq>` but **no
`<lastmod>`** — a hand-maintained `lastmod` is a lie within a week, and a lying
`lastmod` is worse than none.

### JSON-LD

A `SoftwareApplication` block on each of the seven tool pages (not the landing
page, which is not itself an application). Each declares
`applicationCategory: "GameApplication"`, `operatingSystem: "Any (web
browser)"`, and an `offers` block with `price: "0"` — the price is what earns
the "Free" rich-result annotation, and it is also the honest statement of the
free tier.

### Regression test

`seo.test.js` at the repo root auto-discovers every `index.html` outside
`node_modules` and `.git` and asserts the invariants above, mirroring how
`data/data.test.js` gives any new content pack validation coverage just by
existing. A new tool page that forgets its metadata fails `npm test`.

What it checks, per page: a non-empty `description` of sane length; a canonical
tag whose URL starts with the site origin and ends in `/`; the required `og:*`
properties; `twitter:card`; the icon and manifest links; `og:url` matching
`canonical`; and `og:title` matching `<title>`. Site-wide: that the set of
discovered pages exactly matches the set of sitemap `<loc>` entries — the check
that actually catches the realistic failure, which is shipping a ninth tool and
forgetting the sitemap.

The HTML is parsed with small regexes, not a DOM library. That is a deliberate
trade: adding a parser dependency would break the project's "no npm
dependencies" rule for a test that only needs to find `<meta>` tags in files
this repo writes by hand.

## Risks

- **Regex-based HTML parsing is brittle.** Mitigated by it only ever reading
  this repo's own hand-written head blocks, which the same test forces into a
  uniform shape.
- **Hardcoded origin.** If the apex/`www` decision flips, eight canonical tags,
  eight `og:url`s, the sitemap, and one test constant change together. The
  test's origin check makes a partial flip fail loudly rather than silently
  splitting the site's ranking across two hostnames.
