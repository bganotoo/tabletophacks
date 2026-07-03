import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MY_TEMPLATES_ID,
  MY_TEMPLATES_NAME,
  myTemplates,
  validateTemplateName,
  saveTemplate,
  deleteTemplate,
} from './templates.js';
import { parsePack } from './packs.js';

const OTHER_PACK = { id: 'abc123', name: 'Other', source: '{"mood":["calm"]}' };

function packWith(data) {
  return {
    id: MY_TEMPLATES_ID,
    name: MY_TEMPLATES_NAME,
    description: '',
    source: JSON.stringify(data),
    updatedAt: new Date().toISOString(),
  };
}

// ── myTemplates ─────────────────────────────────────────────────────────────

test('myTemplates returns [] when there are no packs', () => {
  assert.deepEqual(myTemplates([]), []);
});

test('myTemplates returns [] when the reserved pack is absent', () => {
  assert.deepEqual(myTemplates([OTHER_PACK]), []);
});

test('myTemplates lists single-string-array entries as templates', () => {
  const packs = [packWith({ treasure: ['{a} {adjective} {noun}'], omen: ['{noun} falls'] })];
  assert.deepEqual(myTemplates(packs), [
    { name: 'treasure', template: '{a} {adjective} {noun}' },
    { name: 'omen', template: '{noun} falls' },
  ]);
});

test('myTemplates skips entries reshaped in the Workshop', () => {
  const packs = [
    packWith({
      simple: ['{noun}'],
      multi: ['one', 'two'],
      weighted: [{ text: 'rare', weight: 0.5 }],
      json: { name: '{noun}' },
    }),
  ];
  assert.deepEqual(myTemplates(packs), [{ name: 'simple', template: '{noun}' }]);
});

test('myTemplates ignores other packs even if shaped like templates', () => {
  const packs = [{ ...OTHER_PACK, source: '{"omen":["{noun}"]}' }];
  assert.deepEqual(myTemplates(packs), []);
});

test('myTemplates tolerates a corrupt reserved pack', () => {
  const packs = [{ ...packWith({}), source: '{oops' }];
  assert.deepEqual(myTemplates(packs), []);
});

// ── validateTemplateName ────────────────────────────────────────────────────

test('validateTemplateName accepts engine-legal names', () => {
  for (const name of ['treasure', 'my-thing', 'my_thing', '_x', 'Roll2']) {
    assert.deepEqual(validateTemplateName(name, {}), { ok: true });
  }
});

test('validateTemplateName rejects empty and malformed names', () => {
  for (const name of ['', '  ', '2fast', 'has space', 'no{braces}', 'dot.ted']) {
    const result = validateTemplateName(name, {});
    assert.equal(result.ok, false, `expected ${JSON.stringify(name)} to be rejected`);
    assert.ok(result.error.length > 0);
  }
});

test('validateTemplateName rejects the reserved smart-article names', () => {
  for (const name of ['a', 'an']) {
    const result = validateTemplateName(name, {});
    assert.equal(result.ok, false);
    assert.match(result.error, /reserved/);
  }
});

test('validateTemplateName warns when shadowing a built-in', () => {
  const result = validateTemplateName('npc', { builtinNames: ['npc', 'loot'] });
  assert.equal(result.ok, true);
  assert.match(result.warning, /overrid/i);
});

test('validateTemplateName warns when updating an existing template', () => {
  const result = validateTemplateName('omen', { templateNames: ['omen'] });
  assert.equal(result.ok, true);
  assert.match(result.warning, /updat/i);
});

// ── saveTemplate ────────────────────────────────────────────────────────────

test('saveTemplate creates the reserved pack on first save', () => {
  const result = saveTemplate([OTHER_PACK], 'omen', '{noun} falls');
  assert.equal(result.ok, true);
  assert.equal(result.packs.length, 2);
  const pack = result.packs.find((p) => p.id === MY_TEMPLATES_ID);
  assert.equal(pack.name, MY_TEMPLATES_NAME);
  assert.ok(pack.updatedAt);
  assert.equal(parsePack(pack.source).ok, true);
  assert.deepEqual(myTemplates(result.packs), [{ name: 'omen', template: '{noun} falls' }]);
});

test('saveTemplate appends to an existing reserved pack', () => {
  const first = saveTemplate([], 'omen', '{noun} falls');
  const second = saveTemplate(first.packs, 'treasure', '{a} {noun}');
  assert.deepEqual(myTemplates(second.packs), [
    { name: 'omen', template: '{noun} falls' },
    { name: 'treasure', template: '{a} {noun}' },
  ]);
});

test('saveTemplate overwrites in place, keeping entry order', () => {
  let { packs } = saveTemplate([], 'omen', '{noun} falls');
  ({ packs } = saveTemplate(packs, 'treasure', '{a} {noun}'));
  ({ packs } = saveTemplate(packs, 'omen', 'the {noun} rises'));
  assert.deepEqual(myTemplates(packs), [
    { name: 'omen', template: 'the {noun} rises' },
    { name: 'treasure', template: '{a} {noun}' },
  ]);
});

test('saveTemplate preserves Workshop-reshaped entries in the pack', () => {
  const packs = [packWith({ multi: ['one', 'two'] })];
  const result = saveTemplate(packs, 'omen', '{noun}');
  const saved = JSON.parse(result.packs.find((p) => p.id === MY_TEMPLATES_ID).source);
  assert.deepEqual(saved.multi, ['one', 'two']);
  assert.deepEqual(saved.omen, ['{noun}']);
});

test('saveTemplate rejects invalid names', () => {
  for (const name of ['', 'a', '2fast']) {
    const result = saveTemplate([], name, '{noun}');
    assert.equal(result.ok, false);
    assert.ok(result.error.length > 0);
  }
});

test('saveTemplate does not mutate its input', () => {
  const packs = [packWith({ omen: ['{noun}'] })];
  const snapshot = JSON.stringify(packs);
  saveTemplate(packs, 'treasure', '{a} {noun}');
  assert.equal(JSON.stringify(packs), snapshot);
});

// ── deleteTemplate ──────────────────────────────────────────────────────────

test('deleteTemplate removes one template', () => {
  let { packs } = saveTemplate([], 'omen', '{noun}');
  ({ packs } = saveTemplate(packs, 'treasure', '{a} {noun}'));
  const after = deleteTemplate(packs, 'omen');
  assert.deepEqual(myTemplates(after), [{ name: 'treasure', template: '{a} {noun}' }]);
});

test('deleteTemplate removes the reserved pack when it empties', () => {
  const { packs } = saveTemplate([OTHER_PACK], 'omen', '{noun}');
  const after = deleteTemplate(packs, 'omen');
  assert.deepEqual(after, [OTHER_PACK]);
});

test('deleteTemplate keeps the pack when reshaped entries remain', () => {
  const packs = [packWith({ omen: ['{noun}'], multi: ['one', 'two'] })];
  const after = deleteTemplate(packs, 'omen');
  const pack = after.find((p) => p.id === MY_TEMPLATES_ID);
  assert.ok(pack);
  assert.deepEqual(JSON.parse(pack.source), { multi: ['one', 'two'] });
});

test('deleteTemplate is a no-op for unknown names', () => {
  const { packs } = saveTemplate([], 'omen', '{noun}');
  assert.deepEqual(deleteTemplate(packs, 'nope'), packs);
});

test('deleteTemplate does not mutate its input', () => {
  const { packs } = saveTemplate([], 'omen', '{noun}');
  const snapshot = JSON.stringify(packs);
  deleteTemplate(packs, 'omen');
  assert.equal(JSON.stringify(packs), snapshot);
});
