# Discoverability & SEO Pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give all eight pages of tabletophacks.com the head metadata, icons, and crawl files they need to be found in search and to unfurl as a real card when shared. Closes the entire **Discoverability & SEO** section of [ROADMAP.md](../../../ROADMAP.md).

**Architecture:** Pure static additions. A uniform ~20-line head block per page (description, canonical, Open Graph, Twitter card, icons, manifest), a `SoftwareApplication` JSON-LD block on each tool page, five icon files plus a 1200×630 social card generated from committed SVG sources by a committed ImageMagick script, and `robots.txt` / `sitemap.xml` / `site.webmanifest` at the root. A new root-level `seo.test.js` auto-discovers every `index.html` and enforces the invariants, so a future tool page cannot ship without metadata.

**Tech Stack:** Hand-written HTML. Node's built-in test runner (`node:test` + `node:assert/strict`) for the regression test. ImageMagick (`magick`) for icon generation — an authoring-time tool only, never run by the site or by `npm test`.

See [the design spec](../specs/2026-10-10-seo-metadata-design.md) for the rationale behind each decision.

## Global Constraints

- No build step, no bundler, no npm dependencies. Generated images are **committed**; `assets/build-icons.sh` is for regenerating them, not a prerequisite for anything.
- Canonical origin is `https://tabletophacks.com` (apex, no `www`), directory URLs with trailing slashes.
- The head block is byte-for-byte the same shape and order on every page; only title, description, canonical path, and `og:image:alt` differ. Uniformity is what makes it reviewable and testable.
- Icon and manifest hrefs are root-absolute; `og:image` is a fully absolute URL.
- Two-space indentation, matching every existing HTML file.
- No change to any `app.js`, any `gen/` module, or any `data/` pack. This pass touches `<head>`, new root files, and one new test.

---

## File Structure

- `assets/icon.svg` (create): the d20 mark, transparent, lifted from the inline SVG in `index.html`.
- `assets/icon-solid.svg` (create): same mark on the site's dark background; source for every raster icon.
- `assets/og-image.svg` (create): 1200×630 social card source.
- `assets/build-icons.sh` (create): ImageMagick commands that regenerate the committed binaries from the three SVGs.
- `favicon.svg` (create): copy of `assets/icon.svg` at the root, where browsers look.
- `favicon.ico`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `og-image.png` (create): generated, committed.
- `site.webmanifest`, `robots.txt`, `sitemap.xml` (create).
- `index.html` + the seven `tools/*/index.html` (modify): head block; JSON-LD on the seven tool pages.
- `seo.test.js` (create): the auto-discovering regression suite.
- `ROADMAP.md` (modify): check off the six Discoverability & SEO items.
- `README.md` (modify): the tool list claims the dice roller, initiative tracker, and timers are "on the roadmap" when all three are live — fix while touching discoverability.

---

## Task 1: Icon and social-card artwork

Produce the SVG sources and the generation script, then run it once and commit the outputs.

- [ ] Extract the d20 paths from the inline SVG in `index.html` into `assets/icon.svg` (64×64 viewBox, transparent, `#f59e0b` strokes), widening the stroke weights so the mark survives being shrunk to 16px.
- [ ] `assets/icon-solid.svg`: the same mark on `#0d0d1a`, with a rounded-rect ground so the 180px Apple icon does not look like a sticker.
- [ ] `assets/og-image.svg`: 1200×630, dark ground, d20 mark, "Tabletop Hacks" wordmark with the amber accent on "Hacks", the tagline, and a line listing the tools.
- [ ] `assets/build-icons.sh`: generate `favicon.ico` (16/32/48), `apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png`, `og-image.png` (1200×630). Script is idempotent and writes only to the repo root.
- [ ] Run it; eyeball each output at its real display size, especially the 16px favicon.
- [ ] Copy `assets/icon.svg` to `/favicon.svg`.

**Verify:** `magick identify` reports the expected dimensions for all five binaries; the 1200×630 card is legible as a thumbnail.

---

## Task 2: Root crawl and manifest files

- [ ] `robots.txt`: `User-agent: *`, `Allow: /`, and a `Sitemap:` line with the absolute URL.
- [ ] `sitemap.xml`: the eight URLs, directory form with trailing slashes, `<changefreq>`, no `<lastmod>`, landing page at `priority 1.0`.
- [ ] `site.webmanifest`: name, short name, `start_url: "/"`, `display: "browser"`, `theme_color: "#0d0d1a"`, `background_color: "#0d0d1a"`, the two PNG icons.

**Verify:** `node -e` round-trips the manifest as JSON; the sitemap parses and its URL list matches the eight pages exactly.

---

## Task 3: The regression test

Write `seo.test.js` **before** editing the eight pages, so the first run fails with eight pages' worth of specific, actionable failures and then goes green as each page is done. The test is the executable spec for Task 4.

- [ ] Auto-discover: walk from the repo root for `index.html`, skipping `.git` and `node_modules`.
- [ ] Per page: description present and 50–200 chars; canonical present, starts with the origin, ends with `/`; `og:type`, `og:site_name`, `og:title`, `og:description`, `og:url`, `og:image`, `og:image:width`, `og:image:height`, `og:image:alt` present; `twitter:card` is `summary_large_image`; `favicon.ico`, `favicon.svg`, `apple-touch-icon`, and manifest links present; `og:url` equals canonical; `og:title` equals `<title>`; `og:image` absolute.
- [ ] Per tool page (every discovered page except the root): a `SoftwareApplication` JSON-LD block that parses, with `name`, `url` matching canonical, `applicationCategory`, and `offers.price === "0"`.
- [ ] Site-wide: the discovered page set equals the sitemap `<loc>` set, both directions. Also assert the five icon files, `robots.txt`, `sitemap.xml`, and `site.webmanifest` exist on disk.
- [ ] Parse with regexes over the file text — no DOM library, per the no-dependencies rule.

**Verify:** `node --test seo.test.js` fails, and each failure names the page and the missing tag.

---

## Task 4: The eight head blocks

One page at a time, re-running the test after each so progress is measured in failures removed.

- [ ] `index.html` — description leads with what the site is and who it is for.
- [ ] `tools/generator/index.html` + JSON-LD.
- [ ] `tools/workshop/index.html` + JSON-LD.
- [ ] `tools/dice/index.html` + JSON-LD.
- [ ] `tools/initiative/index.html` + JSON-LD.
- [ ] `tools/timer/index.html` + JSON-LD.
- [ ] `tools/score/index.html` + JSON-LD.
- [ ] `tools/reference/index.html` + JSON-LD.

**Verify:** `npm test` fully green.

---

## Task 5: Documentation

- [ ] Check off the six Discoverability & SEO items in `ROADMAP.md` with the date and a link to the spec.
- [ ] Note in `ROADMAP.md` that the apex-vs-`www` half of the domain item is now *stated* in the canonical tags, so the remaining work there is host config.
- [ ] Fix the stale "on the roadmap" tool list in `README.md` and document `assets/build-icons.sh` as an authoring-time script.

**Verify:** `npm test`; `git diff` review; no stray files.
