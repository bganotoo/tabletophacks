/** Generator tool: pick a generator, run it, save results to the library. */

import { createStore } from '../shared/store.js';
import { showStorageNoticeOnce } from '../shared/notices.js';
import { BUILTIN_PACKS, buildGenerator, listGenerators, effectiveDefinition } from '../shared/packs.js';
import {
  MY_TEMPLATES_ID,
  myTemplates,
  validateTemplateName,
  saveTemplate,
  deleteTemplate,
  saveDefinition,
} from '../shared/templates.js';
import {
  overriddenNames,
  saveOverride,
  removeOverride,
} from '../shared/overrides.js';
import { buildCatalog, filterCatalog, sampleTable } from '../shared/catalog.js';
import { parseHash, formatGeneratorHash } from '../shared/genhash.js';
import { renderResult, renderResults, resultsToText, resultsToMarkdown } from '../shared/render.js';
import { clampCount, deriveSeeds } from '../shared/batch.js';
import { parseLibrary, mergeLibrary } from '../shared/library.js';
import { planImport } from '../shared/packimport.js';
import { formatVersion } from '../shared/packmeta.js';
import { el, clearNode, toast, download, uid, debounce } from '../shared/ui.js';
import { Generator } from '../../gen/index.js';

const store = createStore(undefined, { onError: (e) => toast(e.message) });

const $ = (id) => document.getElementById(id);

const state = {
  /** @type {import('../../gen/index.js').Generator} */ generator: null,
  /** flat picker list from listGenerators() */ list: [],
  /** name of the selected generator */ selected: null,
  /** which main-panel view is showing */ view: 'generate',
  /** cached table catalog for the Browse tables view */ catalog: [],
  /** names defined by built-in packs only, for shadow warnings */ builtinNames: [],
  /** names the user has overridden */ overridden: [],
  /** raw builtin data objects, kept for effectiveDefinition */ builtinData: [],
  /** the result values currently shown (one, or a batch); [] on error */
  results: [],
  /** reroll trees parallel to `results` (null entries = not per-part rerollable) */
  resultTrees: [],
  /** true once a per-part reroll has hand-edited the shown result */
  diverged: false,
  /** how many results are shown (state.results.length while a run is displayed) */
  count: 1,
  lastSeed: null,
  /** generator that produced the results (may differ from `selected` for library opens) */
  resultGenerator: null,
};

// ── Data loading ────────────────────────────────────────────────────────────

async function fetchBuiltinData() {
  const files = [...new Set(BUILTIN_PACKS.flatMap((p) => p.files))];
  return Promise.all(
    files.map(async (file) => {
      const response = await fetch(file);
      if (!response.ok) throw new Error(`failed to load ${file}: ${response.status}`);
      return response.json();
    }),
  );
}

function customPacks() {
  return store.get('packs', []);
}

/** Persist, and on the first success show the one-time storage notice.
 *  Returns false when the write failed — the store's onError has already
 *  toasted why, and `toast` is single-slot, so callers must not add their own
 *  message or it replaces the useful one. */
function saveAndNotice(name, value) {
  if (!store.set(name, value)) return false;
  showStorageNoticeOnce(store);
  return true;
}

async function rebuild() {
  const builtinData = await fetchBuiltinData();
  const { generator, invalid } = buildGenerator(builtinData, customPacks());
  state.generator = generator;
  state.builtinData = builtinData;
  state.builtinNames = Generator.fromData(...builtinData).names();
  state.overridden = overriddenNames(customPacks());
  state.list = listGenerators(BUILTIN_PACKS, customPacks());
  state.catalog = buildCatalog(generator, { builtinNames: state.builtinNames });
  if (invalid.length > 0) {
    console.warn('skipped invalid custom packs:', invalid);
  }
  renderSidebar();
}

// ── Sidebar ─────────────────────────────────────────────────────────────────

function renderSidebar() {
  const sidebar = $('sidebar');
  clearNode(sidebar);
  const sideItem = (gen) => {
    const flag =
      !gen.custom && state.overridden.includes(gen.name)
        ? el('span', { class: 'item-flag modified', title: "You've edited this generator" }, '●')
        : null;
    return el(
      'li',
      {},
      el(
        'button',
        {
          class: `side-item${gen.name === state.selected ? ' selected' : ''}`,
          onclick: () => select(gen.name),
        },
        gen.title,
        ...(flag ? [flag] : []),
      ),
    );
  };
  const groups = new Map();
  const templates = [];
  for (const gen of state.list) {
    // Saved templates get the dedicated Custom group at the bottom.
    if (gen.packId === MY_TEMPLATES_ID) {
      templates.push(gen);
      continue;
    }
    if (!groups.has(gen.packTitle)) groups.set(gen.packTitle, []);
    groups.get(gen.packTitle).push(gen);
  }
  for (const [packTitle, gens] of groups) {
    const badge = gens[0].custom
      ? el('span', { class: 'pack-badge custom' }, 'custom')
      : null;
    const version = formatVersion(gens[0].packVersion);
    const heading = el(
      'h2',
      {},
      packTitle,
      ...(version ? [el('span', { class: 'pack-version' }, version)] : []),
      ...(badge ? [badge] : []),
    );
    const list = el('ul', {}, ...gens.map(sideItem));
    sidebar.append(el('div', { class: 'side-group' }, heading, list));
  }
  const customList = el('ul', {}, ...templates.map(sideItem));
  customList.append(
    el(
      'li',
      {},
      el(
        'button',
        {
          class: `side-item${state.view === 'create' ? ' selected' : ''}`,
          onclick: () => showCreate(),
        },
        '+ New template',
      ),
    ),
    el(
      'li',
      {},
      el(
        'button',
        {
          class: `side-item${state.view === 'import' ? ' selected' : ''}`,
          onclick: () => showImport(),
        },
        'Import a pack…',
      ),
    ),
  );
  sidebar.append(el('div', { class: 'side-group' }, el('h2', {}, 'Custom'), customList));

  const refList = el(
    'ul',
    {},
    el(
      'li',
      {},
      el(
        'button',
        {
          class: `side-item${state.view === 'tables' ? ' selected' : ''}`,
          onclick: () => showTables(),
        },
        'Browse tables',
      ),
    ),
    el('li', {}, el('a', { class: 'side-item', href: '../reference/' }, 'Syntax reference')),
  );
  sidebar.append(el('div', { class: 'side-group' }, el('h2', {}, 'Reference'), refList));
}

// ── Selection ───────────────────────────────────────────────────────────────

function select(name, { updateHash = true, seed = null, count = null } = {}) {
  const gen = state.list.find((g) => g.name === name) ?? state.list[0];
  if (!gen) return;
  state.view = 'generate';
  showOnly('gen-view');
  state.selected = gen.name;
  if (updateHash) history.replaceState(null, '', `#${gen.name}`);
  // Arriving from a shared link: pin its seed and count so the run reproduces it.
  if (seed) $('seed-input').value = seed;
  if (count) $('count-input').value = count;
  const settings = store.get('settings', {});
  store.set('settings', { ...settings, lastGenerator: gen.name });
  $('gen-title').textContent = gen.title;
  const pack = BUILTIN_PACKS.find((p) => p.title === gen.packTitle);
  $('gen-subtitle').textContent =
    gen.packId === MY_TEMPLATES_ID
      ? 'your saved template'
      : gen.custom
        ? `from your pack ${packLabel(gen)}`
        : pack?.description ?? '';
  renderSidebar();
  generate();
  renderViewTemplate();
}

const VIEWS = ['gen-view', 'create-view', 'tables-view', 'import-view'];

/** Show one main-panel view and hide the rest. */
function showOnly(id) {
  for (const view of VIEWS) $(view).hidden = view !== id;
}

/** `“Haunted Coast” v1.1.0`, or just the quoted title when unversioned. */
function packLabel(gen) {
  const version = formatVersion(gen.packVersion);
  return `“${gen.packTitle}”${version ? ` ${version}` : ''}`;
}

function showCreate({ updateHash = true } = {}) {
  state.view = 'create';
  state.selected = null;
  if (updateHash) history.replaceState(null, '', '#create');
  showOnly('create-view');
  renderSidebar();
  renderTemplateList();
}

function showTables({ updateHash = true } = {}) {
  state.view = 'tables';
  state.selected = null;
  if (updateHash) history.replaceState(null, '', '#tables');
  showOnly('tables-view');
  $('catalog-search').value = '';
  renderSidebar();
  renderCatalog('');
}

function showImport({ updateHash = true } = {}) {
  state.view = 'import';
  state.selected = null;
  if (updateHash) history.replaceState(null, '', '#import');
  showOnly('import-view');
  clearNode($('import-result'));
  renderSidebar();
}

// ── Import a pack ───────────────────────────────────────────────────────────

/** Read a pack file, plan the import, write it, and say what happened —
 *  inline, not in a toast: a buyer needs time to read a failure. */
function importPackFile(file) {
  const reader = new FileReader();
  reader.onerror = () =>
    showImportFailure({ message: 'That file could not be read.', detail: String(reader.error), support: null });
  reader.onload = async () => {
    const packs = customPacks();
    const plan = planImport(packs, String(reader.result), file.name);
    if (!plan.ok) return showImportFailure(plan);
    if (plan.action === 'unchanged') return showImportSuccess(plan, plan.existing.id);

    const now = new Date().toISOString();
    const source = String(reader.result);
    let id;
    let next;
    if (plan.action === 'update') {
      id = plan.existing.id;
      next = packs.map((p) => (p.id === id ? { ...p, source, updatedAt: now } : p));
    } else {
      id = uid();
      next = [...packs, { id, name: plan.name, description: '', source, updatedAt: now }];
    }
    // No message on failure: the store's onError already said why.
    if (!saveAndNotice('packs', next)) return;
    await rebuild();
    showImportSuccess(plan, id);
  };
  reader.readAsText(file);
}

function showImportSuccess(plan, packId) {
  const host = $('import-result');
  clearNode(host);
  const version = formatVersion(plan.meta.version);
  const label = `${plan.name}${version ? ` ${version}` : ''}`;
  const previous = formatVersion(plan.previous?.version);
  const heading =
    plan.action === 'unchanged'
      ? `You already have ${label}`
      : plan.action === 'update'
        ? `Updated ${label}${previous && previous !== version ? ` (was ${previous})` : ''}`
        : `Installed ${label}`;
  const gens = state.list.filter((g) => g.packId === packId);
  const card = el('div', { class: 'import-card import-ok', role: 'status' }, el('h3', {}, heading));
  if (plan.meta.author) card.append(el('p', { class: 'hint' }, `by ${plan.meta.author}`));
  if (gens.length) {
    card.append(
      el('p', {}, gens.length === 1 ? 'It adds one generator:' : `It adds ${gens.length} generators:`),
      el(
        'div',
        { class: 'import-gens' },
        ...gens.map((g) => el('button', { class: 'btn btn-small', type: 'button', onclick: () => select(g.name) }, g.title)),
      ),
    );
  }
  if (plan.meta.license) card.append(el('p', { class: 'hint' }, `License: ${plan.meta.license}`));
  host.append(card);
}

function showImportFailure({ message, detail, support }) {
  const host = $('import-result');
  clearNode(host);
  host.append(
    el(
      'div',
      { class: 'import-card import-failed', role: 'alert' },
      el('h3', {}, message),
      el(
        'p',
        {},
        support
          ? `Send the details below to ${support} and they can fix it for you.`
          : 'Send the details below to whoever gave you this file and they can fix it.',
      ),
      el('details', {}, el('summary', {}, 'Details'), el('pre', { class: 'import-detail' }, detail)),
    ),
  );
}

// ── Browse tables ───────────────────────────────────────────────────────────

/** Render the catalog, filtered by the current search query. */
function renderCatalog(query) {
  const list = $('catalog-list');
  clearNode(list);
  const rows = filterCatalog(state.catalog, query);
  $('catalog-count').textContent =
    rows.length === state.catalog.length
      ? `${state.catalog.length} tables`
      : `${rows.length} of ${state.catalog.length} tables`;
  if (rows.length === 0) {
    list.append(el('p', { class: 'placeholder' }, 'No table matches that filter.'));
    return;
  }
  list.append(...rows.map(catalogCard));
}

function catalogCard(entry) {
  const sample = el('span', { class: 'ref-sample' });
  const paint = (seed) => {
    clearNode(sample);
    sample.append(el('span', { class: 'ref-sample-text' }, sampleTable(state.generator, entry.name, seed)));
  };
  paint(`cat:${entry.name}`); // deterministic first paint
  const reroll = el(
    'button',
    {
      class: 'btn btn-small ref-reroll',
      title: 'Sample again with a fresh seed',
      onclick: () => paint(randomSeed()),
    },
    '↻',
  );
  const name = el(
    'button',
    {
      class: 'catalog-name',
      title: 'Copy {' + entry.name + '} to the clipboard',
      onclick: async () => {
        await navigator.clipboard.writeText(`{${entry.name}}`);
        toast(`Copied {${entry.name}}`);
      },
    },
    `{${entry.name}}`,
  );
  const badge = entry.custom ? el('span', { class: 'pack-badge custom' }, 'custom') : null;
  const meta = el('span', { class: 'catalog-meta' }, `${entry.count} ${entry.count === 1 ? 'entry' : 'entries'}`);
  const tags =
    entry.tags.length > 0
      ? el('div', { class: 'catalog-tags' }, ...entry.tags.map((t) => el('code', { class: 'catalog-tag' }, `#${t}`)))
      : el('span', { class: 'catalog-tags hint' }, 'no tags');
  return el(
    'div',
    { class: 'catalog-card' },
    el('div', { class: 'catalog-head' }, name, ...(badge ? [badge] : []), meta),
    tags,
    el('div', { class: 'ref-run' }, sample, reroll),
  );
}

function initialSelection() {
  const fromHash = location.hash.slice(1);
  if (fromHash && state.list.some((g) => g.name === fromHash)) return fromHash;
  const remembered = store.get('settings', {}).lastGenerator;
  if (remembered && state.list.some((g) => g.name === remembered)) return remembered;
  return state.list[0]?.name;
}

// ── Generation ──────────────────────────────────────────────────────────────

function randomSeed() {
  return Math.random().toString(36).slice(2, 10);
}

function generate(seedOverride) {
  if (!state.selected || !state.generator) return;
  const seed = seedOverride ?? ($('seed-input').value.trim() || randomSeed());
  const count = clampCount($('count-input').value);
  $('count-input').value = count; // reflect the clamp back into the field
  const panel = $('result-panel');
  clearNode(panel);
  try {
    // A batch of N reproduces from one base seed via N derived sub-seeds.
    const runs = deriveSeeds(seed, count).map((s) =>
      state.generator.runTraced(state.selected, { seed: s, mode: 'strict' }),
    );
    state.results = runs.map((r) => r.value);
    state.resultTrees = runs.map((r) => r.tree);
    state.diverged = false;
    state.count = count;
    state.lastSeed = seed;
    state.resultGenerator = state.selected;
    panel.innerHTML = renderResults(state.results, state.resultTrees);
    $('copy-btn').disabled = false;
    $('copy-md-btn').disabled = false;
    $('copy-link-btn').disabled = false;
    $('copy-link-btn').title = 'Copy a link that reproduces this exact result';
    $('save-btn').disabled = false;
    showSeed(seed);
    // Keep the address bar a link that reproduces exactly what's shown.
    history.replaceState(null, '', `#${formatGeneratorHash(state.selected, seed, count)}`);
  } catch (err) {
    state.results = [];
    state.resultTrees = [];
    state.diverged = false;
    panel.append(el('div', { class: 'error-card' }, String(err.message ?? err)));
    $('copy-btn').disabled = true;
    $('copy-md-btn').disabled = true;
    $('copy-link-btn').disabled = true;
    $('save-btn').disabled = true;
    $('seed-used').textContent = '';
  }
}

/** Set value at an array/object path (all but the last key already exist). */
function setAtPath(root, path, value) {
  let obj = root;
  for (let k = 0; k < path.length - 1; k++) obj = obj[path[k]];
  obj[path[path.length - 1]] = value;
}

/** Set a subtree node at a path within a reroll tree. */
function setTreeAtPath(tree, path, node) {
  let n = tree;
  for (let k = 0; k < path.length - 1; k++) n = n.children[path[k]];
  n.children[path[path.length - 1]] = node;
}

/** Re-render just result `i` (whole panel for a single, one card for a batch). */
function rerenderResult(i) {
  const panel = $('result-panel');
  if (state.results.length === 1) {
    panel.innerHTML = renderResults(state.results, state.resultTrees);
  } else {
    const body = panel.querySelectorAll('.gen-batch-body')[i];
    if (body) body.innerHTML = renderResult(state.results[i], state.resultTrees[i]);
  }
}

/** First per-part reroll: the seed no longer reproduces the result. */
function markDiverged() {
  state.diverged = true;
  const btn = $('copy-link-btn');
  btn.disabled = true;
  btn.title = 'This result was hand-edited; the seed no longer reproduces it.';
}

/** Handle a click on a ↻ per-part reroll button (delegated from the panel). */
function handlePartReroll(btn) {
  const path = JSON.parse(btn.dataset.rerollPath);
  const item = btn.closest('.gen-batch-item');
  const i = item ? [...item.parentNode.children].indexOf(item) : 0;
  const tree = state.resultTrees[i];
  if (!tree) return;
  try {
    const { value, node } = state.generator.rerollPath(tree, path, { seed: randomSeed(), mode: 'strict' });
    setAtPath(state.results[i], path, value);
    setTreeAtPath(tree, path, node);
    rerenderResult(i);
    if (!state.diverged) markDiverged();
  } catch {
    toast("Couldn't reroll this part on its own.");
  }
}

/** URL that reproduces the currently displayed result, or null if none. */
function shareUrl() {
  if (!state.resultGenerator || !state.lastSeed) return null;
  const url = new URL(location.href);
  url.hash = formatGeneratorHash(state.resultGenerator, state.lastSeed, state.count);
  return url.toString();
}

function showSeed(seed, holderId = 'seed-used', inputId = 'seed-input') {
  const holder = $(holderId);
  clearNode(holder);
  holder.append(
    'seed: ',
    el(
      'button',
      {
        title: 'Click to pin this seed in the seed field',
        onclick: () => {
          $(inputId).value = seed;
          toast('Seed pinned — the next run will reproduce this result');
        },
      },
      seed,
    ),
  );
}

// ── View template ─────────────────────────────────────────────────────────

function selectedGen() {
  return state.list.find((g) => g.name === state.selected) ?? null;
}

function isBuiltinName(name) {
  return state.builtinNames.includes(name);
}

function setVtStatus(kind, message) {
  const status = $('vt-status');
  status.className = `editor-status${kind ? ` ${kind}` : ''}`;
  status.textContent = message;
}

/** Show the selected generator's effective definition, read-only. */
function renderViewTemplate() {
  const gen = selectedGen();
  if (!gen) return;
  const name = gen.name;
  const def = effectiveDefinition(state.builtinData, customPacks(), name);
  $('vt-def').value = def === null ? '' : JSON.stringify(def, null, 2);
  $('vt-def').readOnly = true;
  setVtStatus('', '');
  $('vt-saveas-name').value = '';

  const builtin = isBuiltinName(name);
  const overridden = state.overridden.includes(name);
  $('vt-subtitle').textContent = !builtin
    ? gen.packId === MY_TEMPLATES_ID
      ? 'One of your saved templates — edit it on the Create page.'
      : `From your pack ${packLabel(gen)} — edit it in the Workshop.`
    : overridden
      ? 'Built-in generator — modified. You are running your edited copy.'
      : 'Built-in generator.';

  // Built-ins are editable via overrides; customs are read-only here.
  $('vt-edit-btn').hidden = !builtin;
  $('vt-save-btn').hidden = true;
  $('vt-cancel-btn').hidden = true;
  $('vt-reset-btn').hidden = !(builtin && overridden);
}

function vtBeginEdit() {
  $('vt-def').readOnly = false;
  $('vt-def').focus();
  $('vt-edit-btn').hidden = true;
  $('vt-save-btn').hidden = false;
  $('vt-cancel-btn').hidden = false;
  $('vt-reset-btn').hidden = true;
}

function vtParseDefinition() {
  try {
    return { ok: true, value: JSON.parse($('vt-def').value) };
  } catch (err) {
    return { ok: false, error: `invalid JSON: ${err.message}` };
  }
}

async function vtSaveChanges() {
  const gen = selectedGen();
  if (!gen) return;
  const parsed = vtParseDefinition();
  if (!parsed.ok) {
    setVtStatus('bad', `✗ ${parsed.error}`);
    return;
  }
  const result = saveOverride(customPacks(), gen.name, parsed.value);
  if (!result.ok) {
    setVtStatus('bad', `✗ ${result.error}`);
    return;
  }
  if (!saveAndNotice('packs', result.packs)) return;
  await rebuild();
  select(gen.name); // re-runs with the new definition and re-renders the panel
  toast('Saved your version');
}

async function vtReset() {
  const gen = selectedGen();
  if (!gen) return;
  if (!saveAndNotice('packs', removeOverride(customPacks(), gen.name))) return;
  await rebuild();
  select(gen.name);
  toast('Reset to the built-in');
}

async function vtSaveAs() {
  const name = $('vt-saveas-name').value.trim();
  const parsed = vtParseDefinition();
  if (!parsed.ok) {
    setVtStatus('bad', `✗ ${parsed.error}`);
    return;
  }
  const check = validateTemplateName(name, {
    builtinNames: state.builtinNames,
    templateNames: myTemplates(customPacks()).map((t) => t.name),
  });
  if (!check.ok) {
    setVtStatus('bad', `✗ ${check.error || 'give the copy a name first'}`);
    return;
  }
  const result = saveDefinition(customPacks(), name, parsed.value);
  if (!result.ok) {
    setVtStatus('bad', `✗ ${result.error}`);
    return;
  }
  if (!saveAndNotice('packs', result.packs)) return;
  await rebuild();
  select(name); // jump to the new custom generator
  toast(`Saved as “${name}” under Custom`);
}

// ── Library ─────────────────────────────────────────────────────────────────

function library() {
  return store.get('library', []);
}

function renderLibrary() {
  const list = $('library-list');
  clearNode(list);
  const entries = library();
  if (entries.length === 0) {
    list.append(el('li', { class: 'hint' }, 'Nothing saved yet.'));
    return;
  }
  for (const entry of entries) {
    const open = el(
      'button',
      {
        class: 'lib-name',
        title: 'Show this result',
        onclick: () => {
          // Older entries predate batches: no `count`, `data` is a single value.
          const count = entry.count ?? 1;
          const results = count > 1 ? entry.data : [entry.data];
          state.resultTrees = results.map(() => null);
          state.diverged = false;
          $('result-panel').innerHTML = renderResults(results, state.resultTrees);
          state.results = results;
          state.count = count;
          state.lastSeed = entry.seed;
          state.resultGenerator = entry.generator;
          $('copy-btn').disabled = false;
          $('copy-md-btn').disabled = false;
          $('copy-link-btn').disabled = !entry.seed; // shareable only if we know the seed
          $('save-btn').disabled = true; // already saved
          showSeed(entry.seed);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        },
      },
      entry.name,
    );
    const meta = el(
      'span',
      { class: 'lib-meta' },
      `${entry.generator} · ${new Date(entry.savedAt).toLocaleDateString()}`,
    );
    const remove = el(
      'button',
      {
        class: 'btn btn-small btn-danger',
        onclick: () => {
          store.set('library', library().filter((e) => e.id !== entry.id));
          renderLibrary();
        },
      },
      'Delete',
    );
    list.append(el('li', { class: 'library-item' }, open, meta, remove));
  }
}

function importLibrary(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const parsed = parseLibrary(String(reader.result));
    if (!parsed.ok) {
      toast(`Import failed: ${parsed.error}`);
      return;
    }
    const { merged, added } = mergeLibrary(library(), parsed.entries);
    if (added === 0) {
      toast('Library already up to date');
      return;
    }
    if (!saveAndNotice('library', merged)) return;
    renderLibrary();
    toast(`Imported ${added} result${added === 1 ? '' : 's'}`);
  };
  reader.readAsText(file);
}

function saveToLibrary() {
  if (state.results.length === 0) return;
  const gen = state.list.find((g) => g.name === state.selected);
  const count = state.results.length;
  const first = state.results[0];
  const excerpt =
    typeof first === 'string'
      ? first
      : first && typeof first === 'object'
        ? Object.values(first).find((v) => typeof v === 'string') ?? ''
        : String(first);
  const title = gen?.title ?? state.selected;
  const entry = {
    id: uid(),
    name: `${title}${count > 1 ? ` ×${count}` : ''}${excerpt ? ` — ${excerpt.slice(0, 60)}` : ''}`,
    generator: state.selected,
    seed: state.lastSeed,
    count,
    // Keep single results shaped exactly as before; store a batch as an array.
    data: count === 1 ? first : state.results,
    savedAt: new Date().toISOString(),
  };
  if (!saveAndNotice('library', [entry, ...library()])) return;
  renderLibrary();
  toast('Saved to library');
}

// ── Create page ─────────────────────────────────────────────────────────────

function runTemplate(seedOverride) {
  const template = $('tpl-input').value;
  const panel = $('tpl-output');
  clearNode(panel);
  $('tpl-seed-used').textContent = '';
  if (!template.trim()) {
    panel.append(el('p', { class: 'placeholder' }, 'Write a template above, then Run.'));
    return;
  }
  const seed = seedOverride ?? ($('tpl-seed').value.trim() || randomSeed());
  try {
    const text = state.generator.text(template, { seed, mode: 'strict' });
    panel.append(el('p', { class: 'gen-text' }, text));
    showSeed(seed, 'tpl-seed-used', 'tpl-seed');
  } catch (err) {
    panel.append(el('div', { class: 'error-card' }, String(err.message ?? err)));
  }
}

function setTemplateStatus(kind, message) {
  const status = $('tpl-status');
  status.className = `editor-status${kind ? ` ${kind}` : ''}`;
  status.textContent = message;
}

/** Validate the name field and reflect it in the status line. */
function checkTemplateName() {
  const name = $('tpl-name').value.trim();
  if (!name) {
    setTemplateStatus('', '');
    return { ok: false, error: 'name is required' };
  }
  const check = validateTemplateName(name, {
    builtinNames: state.builtinNames,
    templateNames: myTemplates(customPacks()).map((t) => t.name),
  });
  if (!check.ok) setTemplateStatus('bad', `✗ ${check.error}`);
  else if (check.warning) setTemplateStatus('warn', `⚠ ${check.warning}`);
  else setTemplateStatus('ok', `✓ will save as {${name}}`);
  return check;
}

async function saveNewTemplate() {
  const name = $('tpl-name').value.trim();
  const template = $('tpl-input').value;
  const check = checkTemplateName();
  if (!check.ok) {
    if (!name) setTemplateStatus('bad', '✗ give the template a short name first');
    return;
  }
  if (!template.trim()) {
    setTemplateStatus('bad', '✗ the template is empty — write it above');
    return;
  }
  const result = saveTemplate(customPacks(), name, template);
  if (!result.ok) {
    setTemplateStatus('bad', `✗ ${result.error}`);
    return;
  }
  if (!saveAndNotice('packs', result.packs)) return;
  await rebuild();
  renderTemplateList();
  setTemplateStatus('ok', `✓ saved — {${name}} is under Custom in the sidebar`);
  toast('Template saved');
}

function renderTemplateList() {
  const list = $('tpl-list');
  clearNode(list);
  const templates = myTemplates(customPacks());
  if (templates.length === 0) {
    list.append(el('li', { class: 'hint' }, 'Nothing saved yet.'));
    return;
  }
  for (const { name, template } of templates) {
    const open = el(
      'button',
      {
        class: 'lib-name',
        title: 'Load into the editor',
        onclick: () => {
          $('tpl-name').value = name;
          $('tpl-input').value = template;
          checkTemplateName();
          runTemplate();
        },
      },
      name,
    );
    const meta = el(
      'span',
      { class: 'lib-meta' },
      template.length > 42 ? `${template.slice(0, 42)}…` : template,
    );
    const remove = el(
      'button',
      {
        class: 'btn btn-small btn-danger',
        onclick: async () => {
          if (!saveAndNotice('packs', deleteTemplate(customPacks(), name))) return;
          await rebuild();
          renderTemplateList();
        },
      },
      'Delete',
    );
    list.append(el('li', { class: 'library-item' }, open, meta, remove));
  }
}

// ── Wiring ──────────────────────────────────────────────────────────────────

async function main() {
  try {
    await rebuild();
  } catch (err) {
    $('gen-title').textContent = 'Failed to load generator data';
    $('gen-subtitle').textContent = String(err.message ?? err);
    return;
  }

  $('generate-btn').addEventListener('click', () => generate());
  $('reroll-btn').addEventListener('click', () => generate(randomSeed()));
  $('result-panel').addEventListener('click', (e) => {
    const btn = e.target.closest('.reroll-part');
    if (btn) handlePartReroll(btn);
  });
  $('seed-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') generate();
  });
  $('count-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') generate();
  });
  $('copy-btn').addEventListener('click', async () => {
    if (state.results.length === 0) return;
    await navigator.clipboard.writeText(resultsToText(state.results));
    toast('Copied');
  });
  $('copy-md-btn').addEventListener('click', async () => {
    if (state.results.length === 0) return;
    await navigator.clipboard.writeText(resultsToMarkdown(state.results));
    toast('Copied as Markdown');
  });
  $('copy-link-btn').addEventListener('click', async () => {
    const url = shareUrl();
    if (!url) return;
    await navigator.clipboard.writeText(url);
    toast('Link copied — it reproduces this exact result');
  });
  $('save-btn').addEventListener('click', saveToLibrary);
  $('export-lib-btn').addEventListener('click', () => {
    download('tabletophacks-library.json', JSON.stringify(library(), null, 2));
  });
  $('import-lib-btn').addEventListener('click', () => $('import-lib-input').click());
  $('import-lib-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) importLibrary(file);
    e.target.value = '';
  });
  $('vt-edit-btn').addEventListener('click', vtBeginEdit);
  $('vt-save-btn').addEventListener('click', vtSaveChanges);
  $('vt-cancel-btn').addEventListener('click', renderViewTemplate);
  $('vt-reset-btn').addEventListener('click', vtReset);
  $('vt-saveas-btn').addEventListener('click', vtSaveAs);
  $('tpl-run-btn').addEventListener('click', () => runTemplate());
  $('tpl-reroll-btn').addEventListener('click', () => runTemplate(randomSeed()));
  $('tpl-seed').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runTemplate();
  });
  $('tpl-input').addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') runTemplate();
  });
  $('catalog-search').addEventListener('input', debounce((e) => renderCatalog(e.target.value), 120));
  $('import-pack-btn').addEventListener('click', () => $('import-pack-input').click());
  $('import-pack-input').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) importPackFile(file);
    e.target.value = ''; // let the same file be chosen again
  });
  const drop = $('import-drop');
  drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('dragging');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragging'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('dragging');
    const file = e.dataTransfer?.files?.[0];
    if (file) importPackFile(file);
  });
  $('tpl-browse-tables').addEventListener('click', (e) => {
    e.preventDefault();
    showTables();
  });
  $('tpl-save-btn').addEventListener('click', saveNewTemplate);
  $('tpl-name').addEventListener('input', checkTemplateName);
  $('tpl-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveNewTemplate();
  });
  window.addEventListener('hashchange', () => {
    const parsed = parseHash(location.hash.slice(1));
    if (parsed.route === 'create') {
      if (state.view !== 'create') showCreate({ updateHash: false });
    } else if (parsed.route === 'tables') {
      if (state.view !== 'tables') showTables({ updateHash: false });
    } else if (parsed.route === 'import') {
      if (state.view !== 'import') showImport({ updateHash: false });
    } else if (parsed.route === 'generate' && parsed.name) {
      if (parsed.name !== state.selected) {
        select(parsed.name, { updateHash: false, seed: parsed.seed, count: parsed.count });
      } else if (
        (parsed.seed && parsed.seed !== state.lastSeed) ||
        (parsed.count ?? 1) !== state.count
      ) {
        // Same generator, a freshly pasted seed and/or count: reproduce it.
        if (parsed.seed) $('seed-input').value = parsed.seed;
        $('count-input').value = parsed.count ?? 1;
        generate();
      }
    }
  });
  // Another tab (e.g. the Workshop) edited packs: pick up the changes.
  window.addEventListener('storage', (e) => {
    if (e.key === 'th:packs:v1') {
      rebuild().then(() => {
        if (state.view === 'create') renderTemplateList();
        else if (state.view === 'tables') renderCatalog($('catalog-search').value);
        else if (state.view !== 'import') select(state.selected);
      });
    }
  });

  renderLibrary();
  const parsed = parseHash(location.hash.slice(1));
  if (parsed.route === 'create') showCreate({ updateHash: false });
  else if (parsed.route === 'tables') showTables({ updateHash: false });
  else if (parsed.route === 'import') showImport({ updateHash: false });
  else if (parsed.route === 'generate' && state.list.some((g) => g.name === parsed.name))
    select(parsed.name, { updateHash: false, seed: parsed.seed, count: parsed.count });
  else select(initialSelection());
}

main();
