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
