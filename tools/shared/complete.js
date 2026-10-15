/**
 * Table-name and tag completion for template inputs. Pure: given the text and
 * the cursor, say what is being typed; given a catalog (catalog.js), say what
 * could finish it. The textarea wiring lives in autocomplete.js.
 *
 * Mirrors the parser's grammar (gen/parser.js) for the two places a writer
 * types a name: a table right after `{` (or after a repetition count, as in
 * `{2x loot}`), and a tag after `#` or `#!`.
 */

const NAME = '[A-Za-z_][A-Za-z0-9_-]*';
/** The repetition counts parser.js accepts: int, range, or dice, then `x`. */
const COUNT = String.raw`(?:\d+\s*d\s*\d+(?:\s*[+-]\s*\d+)?|\d+\s*-\s*\d+|\d+)\s*x\s+`;

// `(?<!\{)` keeps `{{`, the escaped literal brace, out.
// `\??` is the optional silent-lookup sigil: `{?pronouns`.
const TABLE_RE = new RegExp(String.raw`(?<!\{)\{\s*\??\s*(?:${COUNT})?(${NAME})$`);
const TAG_RE = new RegExp(String.raw`(?<!\{)\{\s*\??\s*(?:${COUNT})?(${NAME})((?:#!?[A-Za-z0-9_-]+)*)#!?([A-Za-z0-9_-]*)$`);

/**
 * @param {string} text
 * @param {number} cursor
 * @returns {null
 *   | { kind: 'table', start: number, prefix: string }
 *   | { kind: 'tag', table: string, start: number, prefix: string, used: string[] }}
 */
export function completionContext(text, cursor) {
  const before = text.slice(0, cursor);
  const tag = TAG_RE.exec(before);
  if (tag) {
    const prefix = tag[3];
    const used = tag[2].split('#').map((t) => t.replace(/^!/, '')).filter(Boolean);
    return { kind: 'tag', table: tag[1], start: cursor - prefix.length, prefix, used };
  }
  // Dice and ranges (`{3d`, `{2-`) never match: a name cannot start with a digit.
  const table = TABLE_RE.exec(before);
  if (!table) return null;
  const prefix = table[1];
  return { kind: 'table', start: cursor - prefix.length, prefix };
}

/**
 * @param {ReturnType<typeof completionContext>} context
 * @param {{ name: string, count: number, tags: string[] }[]} catalog
 * @param {number} [limit]
 * @returns {{ value: string, detail: string }[]}
 */
export function completions(context, catalog, limit = 8) {
  if (!context) return [];
  const prefix = context.prefix.toLowerCase();
  let pool;
  if (context.kind === 'table') {
    pool = catalog.map((t) => ({ value: t.name, detail: `${t.count} ${t.count === 1 ? 'entry' : 'entries'}` }));
  } else {
    const table = catalog.find((t) => t.name === context.table);
    if (!table) return [];
    pool = table.tags.filter((t) => !context.used.includes(t)).map((t) => ({ value: t, detail: 'tag' }));
  }
  const starts = pool.filter((c) => c.value.toLowerCase().startsWith(prefix));
  const contains = prefix ? pool.filter((c) => !starts.includes(c) && c.value.toLowerCase().includes(prefix)) : [];
  const matches = [...starts, ...contains];
  // Nothing left to finish: the only match is what is already typed.
  if (matches.length === 1 && matches[0].value.toLowerCase() === prefix) return [];
  return matches.slice(0, limit);
}

/**
 * Replace the partial word with `value`.
 * @returns {{ text: string, cursor: number }}
 */
export function applyCompletion(text, cursor, context, value) {
  const next = text.slice(0, context.start) + value + text.slice(cursor);
  return { text: next, cursor: context.start + value.length };
}
