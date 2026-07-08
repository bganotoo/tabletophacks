import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_QUOTA_BYTES,
  usageBytes,
  storageEntries,
  usageReport,
  formatBytes,
  storageMeterHtml,
} from './storage.js';

/** Minimal DOM Storage stand-in over a Map (length/key(i)/getItem). */
function fakeStorage(pairs = []) {
  const map = new Map(pairs);
  const keys = () => [...map.keys()];
  return {
    get length() { return map.size; },
    key: (i) => keys()[i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
  };
}

test('usageBytes counts UTF-16 bytes of key + value', () => {
  assert.equal(usageBytes([]), 0);
  // 'ab' (2) + 'cde' (3) = 5 chars * 2 bytes
  assert.equal(usageBytes([['ab', 'cde']]), 10);
});

test('usageBytes sums across pairs', () => {
  assert.equal(usageBytes([['a', 'b'], ['cc', 'dd']]), (1 + 1 + 2 + 2) * 2);
});

test('usageBytes coerces non-string values', () => {
  assert.equal(usageBytes([['k', 42]]), ('k'.length + '42'.length) * 2);
});

test('storageEntries reads every pair from a Storage', () => {
  const storage = fakeStorage([['th:packs:v1', '[]'], ['th:library:v1', '[1]']]);
  assert.deepEqual(storageEntries(storage), [
    ['th:packs:v1', '[]'],
    ['th:library:v1', '[1]'],
  ]);
});

test('usageReport classifies ok below the warn threshold', () => {
  const report = usageReport(0.5 * DEFAULT_QUOTA_BYTES);
  assert.equal(report.level, 'ok');
  assert.equal(report.ratio, 0.5);
  assert.equal(report.quota, DEFAULT_QUOTA_BYTES);
});

test('usageReport warns at 80% and criticals at 95%', () => {
  assert.equal(usageReport(0.79 * DEFAULT_QUOTA_BYTES).level, 'ok');
  assert.equal(usageReport(0.8 * DEFAULT_QUOTA_BYTES).level, 'warn');
  assert.equal(usageReport(0.94 * DEFAULT_QUOTA_BYTES).level, 'warn');
  assert.equal(usageReport(0.95 * DEFAULT_QUOTA_BYTES).level, 'critical');
});

test('usageReport stays critical past the quota', () => {
  const report = usageReport(2 * DEFAULT_QUOTA_BYTES);
  assert.equal(report.level, 'critical');
  assert.equal(report.ratio, 2);
});

test('usageReport honours a custom quota', () => {
  assert.equal(usageReport(50, 100).ratio, 0.5);
  assert.equal(usageReport(50, 100).level, 'ok');
});

test('formatBytes renders B, KB, and MB', () => {
  assert.equal(formatBytes(40), '40 B');
  assert.equal(formatBytes(2048), '2.0 KB');       // < 10 KB → one decimal
  assert.equal(formatBytes(50 * 1024), '50 KB');   // ≥ 10 KB → whole
  assert.equal(formatBytes(1.5 * 1024 * 1024), '1.5 MB');
});

test('storageMeterHtml shows the used/quota label and level', () => {
  const html = storageMeterHtml(usageReport(0.5 * DEFAULT_QUOTA_BYTES));
  assert.match(html, /data-level="ok"/);
  assert.match(html, /of ~5\.0 MB used/);
});

test('storageMeterHtml clamps the fill width at 100% past quota', () => {
  const html = storageMeterHtml(usageReport(3 * DEFAULT_QUOTA_BYTES));
  assert.match(html, /width:100\.0%/);
  assert.match(html, /data-level="critical"/);
});

test('storageMeterHtml adds a message only when filling up', () => {
  assert.doesNotMatch(storageMeterHtml(usageReport(0.1 * DEFAULT_QUOTA_BYTES)), /storage-warn/);
  assert.match(storageMeterHtml(usageReport(0.85 * DEFAULT_QUOTA_BYTES)), /storage-warn/);
  assert.match(storageMeterHtml(usageReport(0.99 * DEFAULT_QUOTA_BYTES)), /storage-warn/);
});
