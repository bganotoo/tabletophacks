/**
 * Saved user templates, backed by one reserved custom pack in the regular
 * packs store. Each template is a one-entry table (`"name": ["template"]`),
 * so the pack assembles, lists, and Workshop-edits like any other custom
 * pack. All functions are pure: they take and return packs arrays.
 */

/** Fixed pack id — ordinary Workshop packs get random uids. */
export const MY_TEMPLATES_ID = 'my-templates';
export const MY_TEMPLATES_NAME = 'My Templates';

/** Same shape the engine's parser accepts for `{name}` lookups, anchored. */
const NAME_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/;

function reservedPack(packs) {
  return packs.find((p) => p.id === MY_TEMPLATES_ID) ?? null;
}

function packData(pack) {
  if (!pack) return {};
  try {
    const data = JSON.parse(pack.source);
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

/** Entries editable as simple templates: tables with exactly one string. */
function isSimpleTemplate(value) {
  return Array.isArray(value) && value.length === 1 && typeof value[0] === 'string';
}

/**
 * The user's saved templates. Entries reshaped in the Workshop (multi-entry
 * tables, JSON templates) still run from the sidebar but are not listed here.
 * @param {{ id: string, source: string }[]} packs
 * @returns {{ name: string, template: string }[]}
 */
export function myTemplates(packs) {
  return Object.entries(packData(reservedPack(packs)))
    .filter(([, value]) => isSimpleTemplate(value))
    .map(([name, value]) => ({ name, template: value[0] }));
}

/**
 * Check a proposed template name. Errors block saving; warnings inform
 * (shadowing a built-in follows the pack load-order invariant — later wins).
 * @param {string} name
 * @param {{ builtinNames?: string[], templateNames?: string[] }} known
 * @returns {{ ok: true, warning?: string } | { ok: false, error: string }}
 */
export function validateTemplateName(name, { builtinNames = [], templateNames = [] } = {}) {
  const trimmed = name.trim();
  if (trimmed === '') return { ok: false, error: 'name is required' };
  if (trimmed === 'a' || trimmed === 'an') {
    return { ok: false, error: `\`${trimmed}\` is reserved for the smart article` };
  }
  if (!NAME_RE.test(trimmed)) {
    return {
      ok: false,
      error: 'names must start with a letter or _ and use only letters, digits, - and _',
    };
  }
  if (templateNames.includes(trimmed)) {
    return { ok: true, warning: `saving will update your existing “${trimmed}” template` };
  }
  if (builtinNames.includes(trimmed)) {
    return { ok: true, warning: `“${trimmed}” overrides a built-in of the same name for you` };
  }
  return { ok: true };
}

function withPackData(packs, data) {
  const existing = reservedPack(packs);
  const updated = {
    id: MY_TEMPLATES_ID,
    name: existing?.name ?? MY_TEMPLATES_NAME,
    description: existing?.description ?? 'Templates saved from the Generator Create page.',
    source: JSON.stringify(data, null, 2),
    updatedAt: new Date().toISOString(),
  };
  return existing
    ? packs.map((p) => (p.id === MY_TEMPLATES_ID ? updated : p))
    : [...packs, updated];
}

/**
 * Save (or overwrite) one template, creating the reserved pack if needed.
 * @param {object[]} packs
 * @param {string} name
 * @param {string} template
 * @returns {{ ok: true, packs: object[] } | { ok: false, error: string }}
 */
export function saveTemplate(packs, name, template) {
  const valid = validateTemplateName(name);
  if (!valid.ok) return { ok: false, error: valid.error };
  const data = packData(reservedPack(packs));
  return { ok: true, packs: withPackData(packs, { ...data, [name.trim()]: [template] }) };
}

/**
 * Delete one template; drops the reserved pack entirely once empty.
 * @param {object[]} packs
 * @param {string} name
 * @returns {object[]}
 */
export function deleteTemplate(packs, name) {
  const data = packData(reservedPack(packs));
  if (!(name in data)) return packs;
  const { [name]: _removed, ...rest } = data;
  if (Object.keys(rest).length === 0) {
    return packs.filter((p) => p.id !== MY_TEMPLATES_ID);
  }
  return withPackData(packs, rest);
}
