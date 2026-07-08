/** Render generator results (text or JSON) to HTML strings or clipboard text. */

/** @param {unknown} str @returns {string} */
export function esc(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Render a generation result as HTML. Strings become flowing text; objects
 * become definition cards; arrays become lists.
 * @param {unknown} value @returns {string}
 */
export function renderResult(value) {
  if (typeof value === 'string') return `<p class="gen-text">${esc(value)}</p>`;
  return renderValue(value);
}

/** @param {unknown} value @returns {string} inline/nested HTML */
function renderValue(value) {
  if (Array.isArray(value)) {
    return `<ul class="gen-list">${value.map((v) => `<li>${renderValue(v)}</li>`).join('')}</ul>`;
  }
  if (value && typeof value === 'object') {
    const rows = Object.entries(value)
      .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${renderValue(v)}</dd>`)
      .join('');
    return `<dl class="gen-card">${rows}</dl>`;
  }
  return esc(value);
}

/**
 * Plain-text form for copying: strings verbatim, objects as indented
 * `key: value` lines, arrays as `- item` lines.
 * @param {unknown} value @returns {string}
 */
export function resultToText(value) {
  if (typeof value === 'string') return value;
  return textLines(value, '').join('\n');
}

/**
 * Render a batch of results. A single-element array is exactly `renderResult`
 * of its one value (unchanged single output); more than one becomes a
 * `.gen-batch` stack, each item numbered.
 * @param {unknown[]} values @returns {string}
 */
export function renderResults(values) {
  if (values.length === 1) return renderResult(values[0]);
  const items = values
    .map(
      (v, i) =>
        `<div class="gen-batch-item"><div class="gen-batch-index">${i + 1}</div>` +
        `<div class="gen-batch-body">${renderResult(v)}</div></div>`,
    )
    .join('');
  return `<div class="gen-batch">${items}</div>`;
}

/**
 * Plain-text form of a batch for copying. A single-element array is exactly
 * `resultToText` of its one value; more than one is each item under a `#<n>`
 * header line, blank-line separated.
 * @param {unknown[]} values @returns {string}
 */
export function resultsToText(values) {
  if (values.length === 1) return resultToText(values[0]);
  return values.map((v, i) => `#${i + 1}\n${resultToText(v)}`).join('\n\n');
}

/**
 * Markdown form for copying into prep docs (Notion/Obsidian): strings verbatim,
 * objects as `- **key:** value` bullet lists, arrays as `- item` bullets, nested
 * structures indented two spaces per level. Values are emitted verbatim, like
 * `resultToText` — no Markdown escaping.
 * @param {unknown} value @returns {string}
 */
export function resultToMarkdown(value) {
  if (typeof value === 'string') return value;
  if (value === null || typeof value !== 'object') return String(value);
  return markdownLines(value, '').join('\n');
}

/**
 * Markdown form of a batch. A single-element array is exactly
 * `resultToMarkdown` of its one value; more than one gives each item a `### <n>`
 * heading, blank-line separated, so a rolled list gets a real outline.
 * @param {unknown[]} values @returns {string}
 */
export function resultsToMarkdown(values) {
  if (values.length === 1) return resultToMarkdown(values[0]);
  return values.map((v, i) => `### ${i + 1}\n\n${resultToMarkdown(v)}`).join('\n\n');
}

/** @param {unknown} value @param {string} indent @returns {string[]} */
function markdownLines(value, indent) {
  if (Array.isArray(value)) {
    // Object elements already emit their own `- **key:**` bullets, so inline them
    // at this level rather than nesting a bullet under an empty label.
    return value.flatMap((v) =>
      v && typeof v === 'object' ? markdownLines(v, indent) : [`${indent}- ${v}`],
    );
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) =>
      v && typeof v === 'object'
        ? [`${indent}- **${k}:**`, ...markdownLines(v, `${indent}  `)]
        : [`${indent}- **${k}:** ${v}`],
    );
  }
  return [`${indent}- ${value}`];
}

/** @param {unknown} value @param {string} indent @returns {string[]} */
function textLines(value, indent) {
  if (Array.isArray(value)) {
    return value.flatMap((v) => {
      if (v && typeof v === 'object') {
        const [first, ...rest] = textLines(v, `${indent}  `);
        return [`${indent}- ${first.trimStart()}`, ...rest];
      }
      return [`${indent}- ${v}`];
    });
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) =>
      v && typeof v === 'object'
        ? [`${indent}${k}:`, ...textLines(v, `${indent}  `)]
        : [`${indent}${k}: ${v}`],
    );
  }
  return [`${indent}${value}`];
}
