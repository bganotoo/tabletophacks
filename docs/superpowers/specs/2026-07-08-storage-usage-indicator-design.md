# Storage usage indicator — design

**Date:** 2026-07-08
**TODO item:** Workshop → "Storage usage indicator — localStorage is the only
persistence and it's small; show usage and warn before `store.set` starts
failing."

## Goal

localStorage is the *only* persistence for the whole site — custom packs, the
saved library, and every tool's state all share one small (~5 MB) per-origin
budget. When that budget runs out, `store.set` silently returns `false` and a
save is lost. Today the only feedback is an after-the-fact "browser storage is
full" toast on the write that already failed. Give the user a *before*-the-fact
signal: a small usage meter in the Workshop sidebar that shows how much of the
budget is used and warns as it fills.

## Principles

- **Keep the math in a tested shared module.** All measurement, classification,
  and formatting live in a new pure `tools/shared/storage.js`. `app.js` stays
  thin wiring: read the meter HTML, drop it in a container, refresh after saves.
- **Measure the whole origin, not just packs.** The quota is per-origin, so the
  meter sums every `localStorage` key (all `th:*` state plus anything else),
  giving a true picture that includes the library and other tools — not just the
  packs the Workshop happens to edit.
- **An estimate, honestly labelled.** Real caps vary by browser and there is no
  synchronous API for the localStorage-specific quota. We assume the common
  ~5 MB cap as the denominator and label it "of ~5 MB", so the meter is a useful
  gauge, not a false promise.
- **Reusable, wired once.** The meter is a plain HTML-string builder any tool can
  adopt with a few lines; only the Workshop is wired now (its TODO home and the
  place packs — the biggest single writes — are created). Other tools are an
  easy follow-up.

## Measurement

Browsers count localStorage against the quota in UTF-16 code units (2 bytes per
character, key + value). The module mirrors that:

New pure exports in `tools/shared/storage.js`:

- `DEFAULT_QUOTA_BYTES` — `5 * 1024 * 1024`, the common per-origin cap, used as
  the meter's denominator.
- `usageBytes(entries)` — sum of `(key.length + value.length) * 2` over an
  iterable of `[key, value]` string pairs. Pure; the unit under test.
- `storageEntries(storage = localStorage)` — read every `[key, value]` pair from
  a DOM `Storage` (via `.length`/`.key(i)`/`.getItem`). Injectable, so a fake
  `Storage` exercises it in Node.
- `usageReport(bytes, quota = DEFAULT_QUOTA_BYTES)` → `{ bytes, quota, ratio,
  level }` where `ratio = bytes / quota` and `level` is:
  - `'ok'`     — `ratio < 0.8`
  - `'warn'`   — `0.8 ≤ ratio < 0.95`
  - `'critical'` — `ratio ≥ 0.95`
- `formatBytes(bytes)` — `40 B`, `812 KB`, `1.4 MB` (KB shown with one decimal
  under 10 KB, else whole; MB always one decimal).
- `storageMeterHtml(report)` — the sidebar markup: a label
  (`{used} of ~{quota} used`), a bar whose fill width is `min(ratio, 1) * 100`%,
  and, for `warn`/`critical`, a short message line. Every interpolated value is a
  computed number or a fixed string — no user text — so no escaping is needed.
  `data-level` carries the level for CSS to colour the bar.

## App wiring (`tools/workshop/app.js` + `index.html`)

- **HTML:** a new sidebar `side-group` at the bottom of `.sidebar` containing a
  heading ("Storage") and an empty `<div id="storage-meter">`.
- **`refreshStorageMeter()`:**
  `$('storage-meter').innerHTML = storageMeterHtml(usageReport(usageBytes(storageEntries())))`.
  Called once in `main()` and after every successful `persist()` (the single
  choke point for save/create/delete/rename/import), so the meter tracks reality
  without extra call sites.

No engine, hash, or store.js changes. `store.js` already reports quota failure
via `set()` returning `false`; this feature is a read-only gauge layered on top.

## Testing

- `storage.test.js`:
  - `usageBytes` — empty → 0; a single pair counts UTF-16 bytes of key + value;
    multiple pairs sum; non-string values coerced via `String()`.
  - `storageEntries` — reads all pairs from a fake `Storage` (length/key/getItem).
  - `usageReport` — `ratio`/`level` at each threshold boundary (below 0.8 = ok,
    at 0.8 = warn, at 0.95 = critical, over quota still critical); default quota.
  - `formatBytes` — B / KB (one-decimal vs whole) / MB boundaries.
  - `storageMeterHtml` — contains the used/quota label and `data-level`; fill
    width clamps at 100% past quota; warn/critical include a message, ok does not.
- `app.js` stays untested DOM wiring, per repo convention.

Manual check: serve locally, open the Workshop, confirm the meter shows a small
usage figure; create/import packs and watch it climb after each save.
