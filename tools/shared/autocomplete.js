/**
 * Table-name and tag autocomplete on a textarea or text input. Thin DOM
 * wiring over the pure complete.js, untested per repo convention.
 *
 * The list opens at the caret, follows the ARIA combobox pattern
 * (aria-activedescendant on the field, role=listbox/option on the list), and
 * takes ArrowUp/ArrowDown, Enter or Tab to accept, and Escape to close.
 */

import { completionContext, completions, applyCompletion } from './complete.js';
import { el, clearNode } from './ui.js';

let counter = 0;

/** Copy enough of the field's box and font into a hidden mirror to measure
 *  where the caret sits. The standard technique; textareas expose no API. */
const MIRRORED = [
  'boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight',
  'textTransform', 'wordSpacing', 'tabSize', 'whiteSpace', 'wordWrap', 'overflowWrap',
];

function caretOffset(field, position) {
  const style = getComputedStyle(field);
  const mirror = el('div');
  for (const prop of MIRRORED) mirror.style[prop] = style[prop];
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.overflow = 'hidden';
  if (field.tagName === 'TEXTAREA') mirror.style.whiteSpace = 'pre-wrap';
  mirror.textContent = field.value.slice(0, position);
  const marker = el('span', {}, '​');
  mirror.append(marker);
  document.body.append(mirror);
  const top = marker.offsetTop + parseFloat(style.lineHeight || '0') - field.scrollTop;
  const left = marker.offsetLeft - field.scrollLeft;
  mirror.remove();
  return { top, left };
}

/**
 * @param {HTMLTextAreaElement|HTMLInputElement} field
 * @param {() => { name: string, count: number, tags: string[] }[]} getCatalog
 *   called on each keystroke, so it should return a cached catalog
 */
export function attachAutocomplete(field, getCatalog) {
  const id = `ac-${++counter}`;
  const list = el('ul', { class: 'ac-list', id, role: 'listbox', hidden: true });
  // The list is positioned against a wrapper so it scrolls with the field.
  const wrapper = el('div', { class: 'ac-wrap' });
  field.replaceWith(wrapper);
  wrapper.append(field, list);
  field.setAttribute('aria-autocomplete', 'list');
  field.setAttribute('aria-controls', id);
  field.setAttribute('aria-expanded', 'false');

  let items = [];
  let active = 0;
  let context = null;

  const close = () => {
    list.hidden = true;
    items = [];
    field.setAttribute('aria-expanded', 'false');
    field.removeAttribute('aria-activedescendant');
  };

  const highlight = (index) => {
    active = index;
    [...list.children].forEach((li, i) => li.setAttribute('aria-selected', String(i === index)));
    field.setAttribute('aria-activedescendant', `${id}-${index}`);
    list.children[index]?.scrollIntoView({ block: 'nearest' });
  };

  const accept = (index) => {
    const choice = items[index];
    if (!choice || !context) return;
    const { text, cursor } = applyCompletion(field.value, field.selectionStart, context, choice.value);
    field.value = text;
    field.setSelectionRange(cursor, cursor);
    close();
    // Let the page react as if the writer typed it (validation, dirty flags).
    field.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const refresh = () => {
    if (field.readOnly || field.selectionStart !== field.selectionEnd) return close();
    context = completionContext(field.value, field.selectionStart);
    items = completions(context, getCatalog() ?? []);
    if (!items.length) return close();
    clearNode(list);
    items.forEach((item, i) => {
      list.append(
        el(
          'li',
          {
            id: `${id}-${i}`,
            role: 'option',
            class: 'ac-item',
            // mousedown, not click: keep focus in the field.
            onmousedown: (e) => {
              e.preventDefault();
              accept(i);
            },
          },
          el('span', { class: 'ac-value' }, item.value),
          el('span', { class: 'ac-detail' }, item.detail),
        ),
      );
    });
    const { top, left } = caretOffset(field, context.start);
    list.style.top = `${field.offsetTop + Math.min(top, field.clientHeight) + 4}px`;
    list.style.left = `${field.offsetLeft + Math.max(0, Math.min(left, field.clientWidth - 220))}px`;
    list.hidden = false;
    field.setAttribute('aria-expanded', 'true');
    highlight(0);
  };

  field.addEventListener('input', (e) => {
    // Our own synthetic input after accepting must not reopen the list.
    if (e.isTrusted) refresh();
  });
  field.addEventListener('click', refresh);
  field.addEventListener('blur', close);
  field.addEventListener('keydown', (e) => {
    if (list.hidden) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlight((active + 1) % items.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlight((active - 1 + items.length) % items.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      accept(active);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  });
}
