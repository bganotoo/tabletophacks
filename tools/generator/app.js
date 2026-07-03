/** Generator tool: pick a generator, run it, save results to the library. */

import { createStore } from '../shared/store.js';
import { BUILTIN_PACKS, buildGenerator, listGenerators } from '../shared/packs.js';
import {
  MY_TEMPLATES_ID,
  myTemplates,
  validateTemplateName,
  saveTemplate,
  deleteTemplate,
} from '../shared/templates.js';
import { renderResult, resultToText } from '../shared/render.js';
import { el, clearNode, toast, download, uid } from '../shared/ui.js';
import { Generator } from '../../gen/index.js';

const store = createStore();

const $ = (id) => document.getElementById(id);

const state = {
  /** @type {import('../../gen/index.js').Generator} */ generator: null,
  /** flat picker list from listGenerators() */ list: [],
  /** name of the selected generator */ selected: null,
  /** which main-panel view is showing */ view: 'generate',
  /** names defined by built-in packs only, for shadow warnings */ builtinNames: [],
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
  state.builtinNames = Generator.fromData(...builtinData).names();
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
  const sideItem = (gen) =>
    el(
      'li',
      {},
      el(
        'button',
        {
          class: `side-item${gen.name === state.selected ? ' selected' : ''}`,
          onclick: () => select(gen.name),
        },
        gen.title,
      ),
    );
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
    const heading = el('h2', {}, packTitle, ...(badge ? [badge] : []));
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
  );
  sidebar.append(el('div', { class: 'side-group' }, el('h2', {}, 'Custom'), customList));
}

// ── Selection ───────────────────────────────────────────────────────────────

function select(name, { updateHash = true } = {}) {
  const gen = state.list.find((g) => g.name === name) ?? state.list[0];
  if (!gen) return;
  state.view = 'generate';
  $('gen-view').hidden = false;
  $('create-view').hidden = true;
  state.selected = gen.name;
  if (updateHash) history.replaceState(null, '', `#${gen.name}`);
  const settings = store.get('settings', {});
  store.set('settings', { ...settings, lastGenerator: gen.name });
  $('gen-title').textContent = gen.title;
  const pack = BUILTIN_PACKS.find((p) => p.title === gen.packTitle);
  $('gen-subtitle').textContent =
    gen.packId === MY_TEMPLATES_ID
      ? 'your saved template'
      : gen.custom
        ? `from your pack “${gen.packTitle}”`
        : pack?.description ?? '';
  renderSidebar();
  generate();
}

function showCreate({ updateHash = true } = {}) {
  state.view = 'create';
  state.selected = null;
  if (updateHash) history.replaceState(null, '', '#create');
  $('gen-view').hidden = true;
  $('create-view').hidden = false;
  renderSidebar();
  renderTemplateList();
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
  if (!store.set('packs', result.packs)) {
    toast('Could not save — browser storage is full');
    return;
  }
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
          if (!store.set('packs', deleteTemplate(customPacks(), name))) {
            toast('Could not save — browser storage is full');
            return;
          }
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
  $('tpl-run-btn').addEventListener('click', () => runTemplate());
  $('tpl-reroll-btn').addEventListener('click', () => runTemplate(randomSeed()));
  $('tpl-seed').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runTemplate();
  });
  $('tpl-input').addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') runTemplate();
  });
  $('tpl-save-btn').addEventListener('click', saveNewTemplate);
  $('tpl-name').addEventListener('input', checkTemplateName);
  $('tpl-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveNewTemplate();
  });
  window.addEventListener('hashchange', () => {
    const name = location.hash.slice(1);
    if (name === 'create') {
      if (state.view !== 'create') showCreate({ updateHash: false });
    } else if (name && name !== state.selected) {
      select(name, { updateHash: false });
    }
  });
  // Another tab (e.g. the Workshop) edited packs: pick up the changes.
  window.addEventListener('storage', (e) => {
    if (e.key === 'th:packs:v1') {
      rebuild().then(() => {
        if (state.view === 'create') renderTemplateList();
        else select(state.selected);
      });
    }
  });

  renderLibrary();
  if (location.hash.slice(1) === 'create') showCreate({ updateHash: false });
  else select(initialSelection());
}

main();
