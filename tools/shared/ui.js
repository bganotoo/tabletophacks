/** Tiny DOM helpers shared by the tool pages. No engine knowledge here. */

/**
 * Create an element. `attrs` values: strings become attributes, functions
 * starting with "on" become listeners, `class`/`className` both work.
 * @param {string} tag
 * @param {Record<string, unknown>} [attrs]
 * @param {...(Node|string)} children
 * @returns {HTMLElement}
 */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2), value);
    } else if (key === 'class' || key === 'className') {
      node.className = String(value);
    } else if (value !== false && value !== null && value !== undefined) {
      node.setAttribute(key, value === true ? '' : String(value));
    }
  }
  node.append(...children);
  return node;
}

/** @param {Node} node */
export function clearNode(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

let toastTimer = null;

/** Transient confirmation message, bottom center. @param {string} message */
export function toast(message) {
  let node = document.querySelector('.toast');
  if (!node) {
    node = el('div', { class: 'toast', role: 'status' });
    document.body.append(node);
  }
  node.textContent = message;
  node.classList.add('toast-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('toast-visible'), 2200);
}

/** Trigger a client-side text file download. */
export function download(filename, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = el('a', { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** @param {Function} fn @param {number} ms @returns {Function} */
export function debounce(fn, ms) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/** Short unique id for packs and library entries. */
export function uid() {
  return crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
}
