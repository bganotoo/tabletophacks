/** Workshop tool: create and edit custom generator packs with live preview. */

import { createStore } from '../shared/store.js';
import { BUILTIN_PACKS, parsePack, buildGenerator } from '../shared/packs.js';
import { renderResult } from '../shared/render.js';
import { el, clearNode, toast, download, debounce, uid } from '../shared/ui.js';
import { usageBytes, storageEntries, usageReport, storageMeterHtml } from '../shared/storage.js';
import { buildBackup, parseBackup, restorePlan, backupFilename } from '../shared/backup.js';
import { showStorageNoticeOnce } from '../shared/notices.js';
import { Generator } from '../../gen/index.js';

const store = createStore(undefined, { onError: (e) => toast(e.message) });

const $ = (id) => document.getElementById(id);

const STARTER_SOURCE = `{
  "mood": [
    "ominous",
    "cheerful",
    { "text": "haunted", "weight": 0.5 }
  ],
  "omen": [
    "{a} {mood} sign appears: {2x noun.join(\\" and \\")}",
    "the {noun#animal.plural} fall silent"
  ],
  "portent": {
    "omen": "{omen}",
    "severity": "{1d6}",
    "detail": { "$maybe": 0.5, "value": "it concerns {a} {adjective} {noun}" }
  }
}
`;

const state = {
  /** custom packs, mirrors th:packs:v1 */ packs: [],
  /** selected pack id */ selected: null,
  /** built-in data objects for previews */ builtinData: null,
  dirty: false,
};

// ── Persistence ─────────────────────────────────────────────────────────────

function loadPacks() {
  state.packs = store.get('packs', []);
}

function persist() {
  // No failure toast here: the store's onError already said why the write
  // failed, and `toast` is single-slot — a second message would replace the
  // useful one. A pack is the only thing this tool saves, so there is nothing
  // to disambiguate.
  const ok = store.set('packs', state.packs);
  if (ok) showStorageNoticeOnce(store);
  refreshStorageMeter();
  return ok;
}

/** Repaint the sidebar localStorage usage meter from current storage. */
function refreshStorageMeter() {
  const meter = $('storage-meter');
  if (meter) meter.innerHTML = storageMeterHtml(usageReport(usageBytes(storageEntries())));
}

// ── Backup & restore ────────────────────────────────────────────────────────

function backupEverything() {
  const now = new Date();
  download(backupFilename(now), JSON.stringify(buildBackup(storageEntries(), now), null, 2));
  toast('Backup downloaded');
}

function restoreEverything(file) {
  const reader = new FileReader();
  reader.onerror = () => toast('Could not read that file');
  reader.onload = () => {
    const parsed = parseBackup(String(reader.result));
    if (!parsed.ok) return toast(`Restore failed — ${parsed.error}`);
    const plan = restorePlan(storageEntries(), parsed.keys);
    if (!plan.writes.length) return toast('That backup is empty — nothing to restore');
    const plural = (n) => (n === 1 ? '' : 's');
    const summary =
      'Restore this backup?\n\n' +
      `Replaces ${plan.replaced.length} saved item${plural(plan.replaced.length)}, ` +
      `adds ${plan.added.length}.\n` +
      `${plan.unaffected.length} item${plural(plan.unaffected.length)} not in the backup ` +
      'will be left alone.\n\n' +
      'The page will reload so every tool reads the restored data.';
    if (!confirm(summary)) return;
    for (const [key, value] of plan.writes) {
      // setRaw refuses anything outside th:, and onError already explained any
      // failure — stop rather than leave a half-restored mix.
      if (!store.setRaw(key, value)) return;
    }
    location.reload();
  };
  reader.readAsText(file);
}

function selectedPack() {
  return state.packs.find((p) => p.id === state.selected) ?? null;
}

// ── Pack list ───────────────────────────────────────────────────────────────

function renderPackList() {
  const list = $('pack-list');
  clearNode(list);
  if (state.packs.length === 0) {
    list.append(el('li', { class: 'hint' }, 'No packs yet.'));
    return;
  }
  for (const pack of state.packs) {
    const invalid = !parsePack(pack.source).ok;
    const item = el(
      'button',
      {
        class: `side-item${pack.id === state.selected ? ' selected' : ''}`,
        onclick: () => select(pack.id),
      },
      pack.name,
      ...(invalid ? [el('span', { class: 'item-flag', title: 'This pack has errors' }, '⚠')] : []),
    );
    list.append(el('li', {}, item));
  }
}

// ── Selection & editor ──────────────────────────────────────────────────────

function select(id, { updateHash = true } = {}) {
  if (state.dirty && !confirm('Discard unsaved changes to this pack?')) return;
  state.selected = id;
  state.dirty = false;
  if (updateHash) history.replaceState(null, '', id ? `#${id}` : '#');
  const pack = selectedPack();
  $('empty-state').hidden = pack !== null;
  $('editor-panel').hidden = pack === null;
  if (pack) {
    $('pack-name').textContent = pack.name;
    $('editor').value = pack.source;
    validateEditor();
    renderPreviewSelect();
    clearNode($('preview-panel'));
    $('preview-panel').append(el('p', { class: 'placeholder' }, 'Run a preview to see output here.'));
  }
  renderPackList();
}

function validateEditor() {
  const status = $('editor-status');
  const result = parsePack($('editor').value);
  clearNode(status);
  status.className = `editor-status ${result.ok ? 'ok' : 'bad'}`;
  status.append(result.ok ? '✓ valid pack' : `✗ ${result.error}`);
  if (state.dirty) status.append(el('span', { class: 'dirty-flag' }, ' • unsaved changes'));
  if (result.ok) renderPreviewSelect();
  return result;
}

function save() {
  const pack = selectedPack();
  if (!pack) return;
  pack.source = $('editor').value;
  pack.updatedAt = new Date().toISOString();
  if (!persist()) return;
  state.dirty = false;
  validateEditor();
  renderPackList();
  toast('Pack saved');
}

// ── Preview ─────────────────────────────────────────────────────────────────

async function fetchBuiltinData() {
  if (state.builtinData) return state.builtinData;
  const files = [...new Set(BUILTIN_PACKS.flatMap((p) => p.files))];
  state.builtinData = await Promise.all(
    files.map(async (file) => {
      const response = await fetch(file);
      if (!response.ok) throw new Error(`failed to load ${file}: ${response.status}`);
      return response.json();
    }),
  );
  return state.builtinData;
}

function renderPreviewSelect() {
  const selectNode = $('preview-select');
  const previous = selectNode.value;
  clearNode(selectNode);
  const parsed = parsePack($('editor').value);
  if (!parsed.ok) return;
  for (const name of Generator.fromData(parsed.data).names()) {
    selectNode.append(el('option', { value: name }, name));
  }
  if ([...selectNode.options].some((o) => o.value === previous)) selectNode.value = previous;
}

async function runPreview() {
  const panel = $('preview-panel');
  clearNode(panel);
  const name = $('preview-select').value;
  if (!name) {
    panel.append(el('p', { class: 'placeholder' }, 'This pack defines no tables or templates yet.'));
    return;
  }
  try {
    const builtinData = await fetchBuiltinData();
    const { generator, invalid } = buildGenerator(builtinData, [
      { id: 'editor', source: $('editor').value },
    ]);
    if (invalid.length > 0) throw new Error(invalid[0].error);
    const result = generator.run(name, { mode: 'strict' });
    panel.innerHTML = renderResult(result);
  } catch (err) {
    panel.append(el('div', { class: 'error-card' }, String(err.message ?? err)));
  }
}

// ── Pack management ─────────────────────────────────────────────────────────

function createPack(name, source) {
  const pack = {
    id: uid(),
    name,
    description: '',
    source,
    updatedAt: new Date().toISOString(),
  };
  state.packs.push(pack);
  if (!persist()) {
    state.packs.pop();
    return null;
  }
  return pack;
}

function newPack() {
  const name = prompt('Pack name:', 'My Pack');
  if (!name) return;
  const pack = createPack(name.trim(), STARTER_SOURCE);
  if (pack) select(pack.id);
}

function renamePack() {
  const pack = selectedPack();
  if (!pack) return;
  const name = prompt('New name:', pack.name);
  if (!name) return;
  pack.name = name.trim();
  if (persist()) {
    $('pack-name').textContent = pack.name;
    renderPackList();
  }
}

function duplicatePack() {
  const pack = selectedPack();
  if (!pack) return;
  const copy = createPack(`${pack.name} (copy)`, $('editor').value);
  if (copy) select(copy.id);
}

function deletePack() {
  const pack = selectedPack();
  if (!pack) return;
  if (!confirm(`Delete “${pack.name}”? This cannot be undone.`)) return;
  state.packs = state.packs.filter((p) => p.id !== pack.id);
  state.dirty = false;
  persist();
  select(state.packs[0]?.id ?? null);
}

function exportPack() {
  const pack = selectedPack();
  if (!pack) return;
  const filename = `${pack.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
  download(filename, $('editor').value);
}

function importPack(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const source = String(reader.result);
    const parsed = parsePack(source);
    if (!parsed.ok) {
      toast(`Import failed: ${parsed.error}`);
      return;
    }
    const name = file.name.replace(/\.json$/i, '') || 'Imported Pack';
    const pack = createPack(name, source);
    if (pack) {
      select(pack.id);
      toast('Pack imported');
    }
  };
  reader.readAsText(file);
}

// ── Wiring ──────────────────────────────────────────────────────────────────

function main() {
  loadPacks();
  refreshStorageMeter();

  $('new-btn').addEventListener('click', newPack);
  $('import-btn').addEventListener('click', () => $('import-input').click());
  $('import-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) importPack(file);
    e.target.value = '';
  });
  $('save-btn').addEventListener('click', save);
  $('rename-btn').addEventListener('click', renamePack);
  $('duplicate-btn').addEventListener('click', duplicatePack);
  $('delete-btn').addEventListener('click', deletePack);
  $('export-btn').addEventListener('click', exportPack);
  $('preview-btn').addEventListener('click', runPreview);

  $('backup-btn').addEventListener('click', backupEverything);
  $('restore-btn').addEventListener('click', () => $('restore-input').click());
  $('restore-input').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) restoreEverything(file);
    e.target.value = ''; // let the same file be re-restored
  });

  const validateSoon = debounce(validateEditor, 300);
  $('editor').addEventListener('input', () => {
    state.dirty = true;
    validateSoon();
  });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      save();
    }
  });
  window.addEventListener('beforeunload', (e) => {
    if (state.dirty) e.preventDefault();
  });
  window.addEventListener('hashchange', () => {
    const id = location.hash.slice(1);
    if (id !== state.selected && state.packs.some((p) => p.id === id)) {
      select(id, { updateHash: false });
    }
  });

  const fromHash = location.hash.slice(1);
  const initial = state.packs.some((p) => p.id === fromHash) ? fromHash : state.packs[0]?.id ?? null;
  select(initial, { updateHash: false });
}

main();
