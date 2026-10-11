/** localStorage usage measurement + a small meter for the sidebar.
 *  Pure math + an HTML-string builder; no DOM required to test. */

/** Common per-origin localStorage cap. Real caps vary by browser and there is
 *  no synchronous API for the localStorage-specific quota, so this is the
 *  meter's denominator (an honest estimate), not a hard guarantee. */
export const DEFAULT_QUOTA_BYTES = 5 * 1024 * 1024;

const WARN_RATIO = 0.8;
const CRITICAL_RATIO = 0.95;

/** Browsers count the quota in UTF-16 code units: 2 bytes per character. */
const byteSizeOf = (str) => String(str).length * 2;

/** Total bytes for an iterable of [key, value] pairs. */
export function usageBytes(entries) {
  let bytes = 0;
  for (const [key, value] of entries) {
    bytes += byteSizeOf(key) + byteSizeOf(value);
  }
  return bytes;
}

/** Read every [key, value] pair from a DOM Storage-like object. */
export function storageEntries(storage = globalThis.localStorage) {
  const entries = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    entries.push([key, storage.getItem(key) ?? '']);
  }
  return entries;
}

/** Classify usage against a quota. */
export function usageReport(bytes, quota = DEFAULT_QUOTA_BYTES) {
  const ratio = quota > 0 ? bytes / quota : 0;
  const level = ratio >= CRITICAL_RATIO ? 'critical' : ratio >= WARN_RATIO ? 'warn' : 'ok';
  return { bytes, quota, ratio, level };
}

/** Human-readable byte size: 40 B, 2.0 KB, 50 KB, 1.5 MB. */
export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const MESSAGES = {
  warn: 'Storage is filling up — consider backing up anything you want to keep.',
  critical: 'Storage nearly full — back up your work before saves start failing.',
};

/** Sidebar meter markup. All interpolated values are computed numbers or fixed
 *  strings (no user text), so no escaping is needed. */
export function storageMeterHtml(report) {
  const pct = Math.min(report.ratio * 100, 100).toFixed(1);
  const label = `${formatBytes(report.bytes)} of ~${formatBytes(report.quota)} used`;
  const message = MESSAGES[report.level];
  return (
    `<div class="storage-meter" data-level="${report.level}">` +
    `<div class="storage-label">${label}</div>` +
    `<div class="storage-bar"><div class="storage-fill" style="width:${pct}%"></div></div>` +
    (message ? `<div class="storage-warn">${message}</div>` : '') +
    `</div>`
  );
}
