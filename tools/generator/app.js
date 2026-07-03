/** Generator tool: pick a generator, run it, save results to the library. */

import { createStore } from '../shared/store.js';
import { BUILTIN_PACKS, buildGenerator, listGenerators } from '../shared/packs.js';
import { renderResult, resultToText } from '../shared/render.js';
import { el, clearNode, toast, download, uid } from '../shared/ui.js';

const store = createStore();

const $ = (id) => document.getElementById(id);

const state = {
  /** @type {import('../../gen/index.js').Generator} */ generator: null,
  /** flat picker list from listGenerators() */ list: [],
  /** name of the selected generator */ selected: null,
  lastResult: null,
  lastSeed: null,
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

async function rebuild() {
  const builtinData = await fetchBuiltinData();
  const { generator, invalid } = buildGenerator(builtinData, customPacks());
  state.generator = generator;
  state.list = listGenerators(BUILTIN_PACKS, customPacks());
  if (invalid.length > 0) {
    console.warn('skipped invalid custom packs:', invalid);
  }
  renderSidebar();
}

// ── Sidebar ─────────────────────────────────────────────────────────────────

function renderSidebar() {
  const sidebar = $('sidebar');
  clearNode(sidebar);
  const groups = new Map();
  for (const gen of state.list) {
    if (!groups.has(gen.packTitle)) groups.set(gen.packTitle, []);
    groups.get(gen.packTitle).push(gen);
  }
  for (const [packTitle, gens] of groups) {
    const badge = gens[0].custom
      ? el('span', { class: 'pack-badge custom' }, 'custom')
      : null;
    const heading = el('h2', {}, packTitle, ...(badge ? [badge] : []));
    const list = el('ul', {});
    for (const gen of gens) {
      const item = el(
        'button',
        {
          class: `side-item${gen.name === state.selected ? ' selected' : ''}`,
          onclick: () => select(gen.name),
        },
        gen.title,
      );
      list.append(el('li', {}, item));
    }
    sidebar.append(el('div', { class: 'side-group' }, heading, list));
  }
}

// ── Selection ───────────────────────────────────────────────────────────────

function select(name, { updateHash = true } = {}) {
  const gen = state.list.find((g) => g.name === name) ?? state.list[0];
  if (!gen) return;
  state.selected = gen.name;
  if (updateHash) history.replaceState(null, '', `#${gen.name}`);
  const settings = store.get('settings', {});
  store.set('settings', { ...settings, lastGenerator: gen.name });
  $('gen-title').textContent = gen.title;
  const pack = BUILTIN_PACKS.find((p) => p.title === gen.packTitle);
  $('gen-subtitle').textContent = gen.custom
    ? `from your pack “${gen.packTitle}”`
    : pack?.description ?? '';
  renderSidebar();
  generate();
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
  const panel = $('result-panel');
  clearNode(panel);
  try {
    const result = state.generator.run(state.selected, { seed, mode: 'strict' });
    state.lastResult = result;
    state.lastSeed = seed;
    panel.innerHTML = renderResult(result);
    $('copy-btn').disabled = false;
    $('save-btn').disabled = false;
    showSeed(seed);
  } catch (err) {
    state.lastResult = null;
    panel.append(el('div', { class: 'error-card' }, String(err.message ?? err)));
    $('copy-btn').disabled = true;
    $('save-btn').disabled = true;
    $('seed-used').textContent = '';
  }
}

function showSeed(seed) {
  const holder = $('seed-used');
  clearNode(holder);
  holder.append(
    'seed: ',
    el(
      'button',
      {
        title: 'Click to pin this seed in the seed field',
        onclick: () => {
          $('seed-input').value = seed;
          toast('Seed pinned — Generate will reproduce this result');
        },
      },
      seed,
    ),
  );
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
          $('result-panel').innerHTML = renderResult(entry.data);
          state.lastResult = entry.data;
          state.lastSeed = entry.seed;
          $('copy-btn').disabled = false;
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

function saveToLibrary() {
  if (state.lastResult === null) return;
  const gen = state.list.find((g) => g.name === state.selected);
  const excerpt =
    typeof state.lastResult === 'string'
      ? state.lastResult
      : Object.values(state.lastResult).find((v) => typeof v === 'string') ?? '';
  const entry = {
    id: uid(),
    name: `${gen?.title ?? state.selected}${excerpt ? ` — ${excerpt.slice(0, 60)}` : ''}`,
    generator: state.selected,
    seed: state.lastSeed,
    data: state.lastResult,
    savedAt: new Date().toISOString(),
  };
  if (!store.set('library', [entry, ...library()])) {
    toast('Could not save — browser storage is full');
    return;
  }
  renderLibrary();
  toast('Saved to library');
}

// ── Quick template ──────────────────────────────────────────────────────────

function runQuick() {
  const template = $('quick-input').value;
  const output = $('quick-output');
  clearNode(output);
  if (!template.trim()) return;
  try {
    output.textContent = state.generator.text(template, { seed: randomSeed(), mode: 'strict' });
  } catch (err) {
    output.append(el('span', { class: 'error-card' }, String(err.message ?? err)));
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
  $('seed-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') generate();
  });
  $('copy-btn').addEventListener('click', async () => {
    if (state.lastResult === null) return;
    await navigator.clipboard.writeText(resultToText(state.lastResult));
    toast('Copied');
  });
  $('save-btn').addEventListener('click', saveToLibrary);
  $('export-lib-btn').addEventListener('click', () => {
    download('tabletophacks-library.json', JSON.stringify(library(), null, 2));
  });
  $('quick-btn').addEventListener('click', runQuick);
  $('quick-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runQuick();
  });
  window.addEventListener('hashchange', () => {
    const name = location.hash.slice(1);
    if (name && name !== state.selected) select(name, { updateHash: false });
  });
  // Another tab (e.g. the Workshop) edited packs: pick up the changes.
  window.addEventListener('storage', (e) => {
    if (e.key === 'th:packs:v1') rebuild().then(() => select(state.selected));
  });

  renderLibrary();
  select(initialSelection());
}

main();
