# Site footer, Privacy page, and a "Your data" page

**Date:** 2026-10-10
**Roadmap items:** Footer links (partial), Privacy policy page, "A discoverable
home for backup/restore".

## Why these together

All three are the same edit — a footer on every page — plus the two pages the
footer links to. Backup/restore lives in the Workshop sidebar today, which a GM
who only uses Initiative never opens; a footer link reaches every visitor. The
Privacy page is required before ads or a checkout, and its honest content
("your data lives in your browser") is exactly what the Your data page shows.

Terms of use and Contact are deliberately **not** here: Terms needs a refund
policy and Contact needs an email address, and both are the owner's decisions.
The footer gains those links when the pages exist.

## Pages

### `/your-data/`

Static HTML shell with `tools/shared/tools.css`, plus a thin `app.js`.

1. **What is saved** — one row per `th:*` key: tool (linked), what it is, a
   short detail ("3 packs", "12 saved results"), and its size. Empty state:
   "Nothing saved in this browser yet."
2. **Storage meter** — the existing `storageMeterHtml`.
3. **Back up / Restore** — moved from the Workshop. Restore now shows the
   plan *inline* (replaces / adds / leaves alone) with Restore and Cancel
   buttons instead of `confirm()`, then reloads.
4. A short note on moving to another device and on private browsing.

The Workshop keeps its storage meter (authors watch it while editing) and its
two buttons become one link: "Back up or restore →".

Not a `/data/` URL: `data/` is the content-pack directory.

### `/privacy/`

Static prose, no script. States only what is true today: no accounts, no
cookies, no analytics, no ads; saved work stays in the browser; shareable
links carry a seed and a generator name in the URL; fonts load from Google
Fonts (a third-party request that reveals the visitor's IP to Google); the
host may keep standard server logs. It says the page changes *before*
analytics, ads, or a checkout arrive. Effective date 2026-10-10.

## Pure module: `tools/shared/inventory.js`

```js
inventory(entries) → [{ key, name, tool, href, label, detail, bytes }]
```

- Takes `storageEntries()` output; ignores keys outside `th:`.
- Known names (packs, library, settings, encounter, score, timer, timer-sound,
  dice-history, notices) come first, in a fixed order; unknown `th:` keys
  follow as "Other saved data" with no tool.
- `detail` is computed from the parsed value and never throws: corrupt JSON
  or an unexpected shape yields `''`.
- `bytes` is `usageBytes([[key, value]])` from `storage.js`, so the rows and
  the meter count the same way.

## Footer

`<footer class="site-footer">` with Home · Your data · Privacy, root-absolute
hrefs, on every `index.html` and on `404.html`. `seo.test.js` asserts it on
every discovered page.

## SEO

Both pages get the standard head block and sitemap entries. They are not
applications, so the `SoftwareApplication` JSON-LD rule narrows from "every
page but the landing page" to "every page under `tools/`".

## Testing

- `inventory.test.js`: ordering, unknown keys, non-`th:` keys ignored,
  every detail formatter including singular/plural, corrupt values.
- `seo.test.js`: footer links on every page; JSON-LD rule scoped to `tools/`.
- DOM wiring stays untested per repo convention.
