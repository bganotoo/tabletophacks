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

/** Dismissible notice bar, bottom of the page. Unlike `toast`, it stays until
 *  the reader dismisses it — for things worth reading, not confirmations.
 *  @param {string} message
 *  @param {{ actionText?: string, onAction?: () => void }} [options]
 *  @returns {HTMLElement} */
export function noticeBar(message, { actionText = 'Got it', onAction } = {}) {
  document.querySelector('.notice-bar')?.remove();
  const bar = el('div', { class: 'notice-bar', role: 'status' }, el('p', {}, message));
  bar.append(
    el('button', {
      class: 'btn btn-small',
      type: 'button',
      onclick: () => {
        bar.remove();
        onAction?.();
      },
    }, actionText),
  );
  document.body.append(bar);
  return bar;
}

/**
 * Collapse a sidebar behind a toggle button on narrow screens. The CSS only
 * honours `.collapsed` (and only shows the toggle) at phone widths, so this
 * is inert on desktop. Picking a `.side-item` collapses it again, so the
 * choice and its result are what the reader sees next.
 * @param {HTMLElement} toggle a button with aria-controls
 * @param {HTMLElement} sidebar carries `collapsible collapsed` classes
 */
export function wireSidebarToggle(toggle, sidebar) {
  const set = (open) => {
    sidebar.classList.toggle('collapsed', !open);
    toggle.setAttribute('aria-expanded', String(open));
  };
  toggle.addEventListener('click', () => set(sidebar.classList.contains('collapsed')));
  sidebar.addEventListener('click', (e) => {
    // Only when the toggle is actually showing — i.e. on a phone.
    if (toggle.offsetParent !== null && e.target.closest('.side-item')) set(false);
  });
}

/**
 * In-page stand-ins for confirm() and prompt(), built on a native <dialog>:
 * it traps focus, Esc cancels, screen readers announce it as a dialog, and it
 * matches the site instead of the browser. Both return promises.
 */
function openDialog({ message, value = null, confirmText, cancelText, danger }) {
  return new Promise((resolve) => {
    const field =
      value === null ? null : el('input', { type: 'text', class: 'dialog-input', value, 'aria-label': message });
    const dialog = el('dialog', { class: 'dialog' });
    const ok = el('button', { class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, type: 'submit', value: 'ok' }, confirmText);
    const cancel = el('button', { class: 'btn', type: 'button', onclick: () => dialog.close('cancel') }, cancelText);
    dialog.append(
      el(
        'form',
        { method: 'dialog' },
        el('p', { class: 'dialog-message' }, message),
        ...(field ? [field] : []),
        el('div', { class: 'dialog-actions' }, cancel, ok),
      ),
    );
    dialog.addEventListener('close', () => {
      const confirmed = dialog.returnValue === 'ok';
      dialog.remove();
      if (!field) return resolve(confirmed);
      const text = field.value.trim();
      resolve(confirmed && text ? text : null);
    });
    document.body.append(dialog);
    dialog.showModal();
    if (field) {
      field.focus();
      field.select();
    } else {
      // Default to the safe choice for destructive questions.
      (danger ? cancel : ok).focus();
    }
  });
}

/** @returns {Promise<boolean>} */
export function confirmDialog(message, { confirmText = 'OK', cancelText = 'Cancel', danger = false } = {}) {
  return openDialog({ message, confirmText, cancelText, danger });
}

/** @returns {Promise<string|null>} the trimmed answer, or null if cancelled or blank */
export function promptDialog(message, { value = '', confirmText = 'OK', cancelText = 'Cancel' } = {}) {
  return openDialog({ message, value, confirmText, cancelText, danger: false });
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
