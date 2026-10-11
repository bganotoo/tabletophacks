/** Your Data page: what is saved in this browser, plus whole-site backup and
 *  restore. Thin DOM wiring; the logic lives in tools/shared. */

import { createStore } from '../tools/shared/store.js';
import { el, clearNode, toast, download } from '../tools/shared/ui.js';
import {
  usageBytes,
  storageEntries,
  usageReport,
  storageMeterHtml,
  formatBytes,
} from '../tools/shared/storage.js';
import { buildBackup, parseBackup, restorePlan, backupFilename } from '../tools/shared/backup.js';
import { inventory } from '../tools/shared/inventory.js';

const store = createStore(undefined, { onError: (e) => toast(e.message) });

const $ = (id) => document.getElementById(id);

/** storageEntries() reads localStorage directly, which throws when a browser
 *  blocks site data; treat that as "nothing saved" rather than white-screen. */
function safeEntries() {
  try {
    return storageEntries();
  } catch {
    return [];
  }
}

function renderInventory() {
  const entries = safeEntries();
  const rows = inventory(entries);
  const host = $('inventory');
  clearNode(host);
  if (!rows.length) {
    host.append(el('p', { class: 'placeholder' }, 'Nothing saved in this browser yet.'));
  } else {
    const body = el('tbody');
    for (const row of rows) {
      body.append(
        el(
          'tr',
          {},
          el('td', {}, row.href ? el('a', { href: row.href }, row.tool) : row.tool ?? '—'),
          el('td', {}, row.label),
          // An unrecognised key has no detail to compute; its name is the
          // most useful thing to show.
          el('td', { class: 'data-detail' }, row.known ? row.detail : el('code', {}, row.key)),
          el('td', { class: 'data-size' }, formatBytes(row.bytes)),
        ),
      );
    }
    host.append(
      el(
        'div',
        { class: 'data-table-wrap' },
        el(
          'table',
          { class: 'data-table' },
          el(
            'thead',
            {},
            el(
              'tr',
              {},
              el('th', { scope: 'col' }, 'Tool'),
              el('th', { scope: 'col' }, 'What'),
              el('th', { scope: 'col' }, 'Details'),
              el('th', { scope: 'col', class: 'data-size' }, 'Size'),
            ),
          ),
          body,
        ),
      ),
    );
  }
  $('storage-meter').innerHTML = storageMeterHtml(usageReport(usageBytes(entries)));
  $('backup-btn').disabled = rows.length === 0;
}

// ── Backup & restore ────────────────────────────────────────────────────────

function backupEverything() {
  const now = new Date();
  download(backupFilename(now), JSON.stringify(buildBackup(safeEntries(), now), null, 2));
  toast('Backup downloaded');
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function hidePlan() {
  const panel = $('restore-plan');
  clearNode(panel);
  panel.hidden = true;
}

/** Say what a restore will do, inline, and only write on an explicit click. */
function showPlan(plan) {
  const panel = $('restore-plan');
  clearNode(panel);
  const apply = () => {
    for (const [key, value] of plan.writes) {
      // setRaw refuses anything outside th:, and onError already explained any
      // failure — stop rather than leave a half-restored mix.
      if (!store.setRaw(key, value)) return;
    }
    location.reload();
  };
  panel.append(
    el('h3', {}, 'Restore this backup?'),
    el(
      'ul',
      { class: 'page-list' },
      el('li', {}, `Replaces ${plural(plan.replaced.length, 'saved item')}.`),
      el('li', {}, `Adds ${plural(plan.added.length, 'item')} you do not have yet.`),
      el('li', {}, `Leaves ${plural(plan.unaffected.length, 'item')} not in the backup alone.`),
    ),
    el('p', { class: 'hint' }, 'The page reloads afterwards so every tool reads the restored data.'),
    el(
      'div',
      { class: 'data-actions' },
      el('button', { class: 'btn btn-primary', type: 'button', onclick: apply }, 'Restore'),
      el('button', { class: 'btn', type: 'button', onclick: hidePlan }, 'Cancel'),
    ),
  );
  panel.hidden = false;
  panel.querySelector('.btn-primary').focus();
}

function readBackup(file) {
  hidePlan();
  const reader = new FileReader();
  reader.onerror = () => toast('Could not read that file');
  reader.onload = () => {
    const parsed = parseBackup(String(reader.result));
    if (!parsed.ok) return toast(`Restore failed — ${parsed.error}`);
    const plan = restorePlan(safeEntries(), parsed.keys);
    if (!plan.writes.length) return toast('That backup is empty — nothing to restore');
    showPlan(plan);
  };
  reader.readAsText(file);
}

// ── Wiring ──────────────────────────────────────────────────────────────────

$('backup-btn').addEventListener('click', backupEverything);
$('restore-btn').addEventListener('click', () => $('restore-input').click());
$('restore-input').addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (file) readBackup(file);
  e.target.value = ''; // let the same file be chosen again
});
// Another tab saving something changes what this page should show.
window.addEventListener('storage', renderInventory);

renderInventory();
