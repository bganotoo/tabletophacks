import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STORAGE_NOTICE,
  STORAGE_NOTICE_ID,
  NOTICES_KEY,
  shouldShowNotice,
  markNoticeSeen,
} from './notices.js';

test('the storage notice names the risk and the remedy', () => {
  assert.match(STORAGE_NOTICE, /this browser/i);
  assert.match(STORAGE_NOTICE, /export/i);
  assert.match(STORAGE_NOTICE, /Your data/, 'names the page that backs up everything');
});

test('the notices store name is a plain unversioned name', () => {
  assert.equal(NOTICES_KEY, 'notices');
});

test('shouldShowNotice is true until the notice is seen', () => {
  assert.equal(shouldShowNotice({}, STORAGE_NOTICE_ID), true);
  assert.equal(shouldShowNotice({ storage: true }, STORAGE_NOTICE_ID), false);
});

test('shouldShowNotice tolerates a missing or corrupt flag set', () => {
  for (const seen of [undefined, null, 'nonsense', 42, []]) {
    assert.equal(shouldShowNotice(seen, STORAGE_NOTICE_ID), true, String(seen));
  }
});

test('shouldShowNotice ignores a falsy flag', () => {
  assert.equal(shouldShowNotice({ storage: false }, STORAGE_NOTICE_ID), true);
});

test('shouldShowNotice does not confuse one notice for another', () => {
  assert.equal(shouldShowNotice({ other: true }, STORAGE_NOTICE_ID), true);
});

test('markNoticeSeen returns a new object and never mutates its input', () => {
  const seen = {};
  const next = markNoticeSeen(seen, STORAGE_NOTICE_ID);
  assert.deepEqual(seen, {});
  assert.equal(next.storage, true);
  assert.notEqual(next, seen);
});

test('markNoticeSeen keeps other flags and is idempotent', () => {
  const once = markNoticeSeen({ other: true }, STORAGE_NOTICE_ID);
  assert.deepEqual(once, { other: true, storage: true });
  assert.deepEqual(markNoticeSeen(once, STORAGE_NOTICE_ID), once);
});

test('markNoticeSeen recovers from a corrupt flag set', () => {
  assert.deepEqual(markNoticeSeen('nonsense', STORAGE_NOTICE_ID), { storage: true });
});

test('a marked notice stops showing', () => {
  const seen = markNoticeSeen({}, STORAGE_NOTICE_ID);
  assert.equal(shouldShowNotice(seen, STORAGE_NOTICE_ID), false);
});
