/** Template-string parser: all `{...}` syntax knowledge lives here. */

export class ParseError extends Error {
  /** @param {string} message @param {number} position 0-based index in the template */
  constructor(message, position) {
    super(`${message} (at position ${position})`);
    this.name = 'ParseError';
    this.position = position;
  }
}

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_-]*/;

/**
 * Parse a template string into AST nodes.
 * @param {string} str
 * @returns {object[]} nodes — see plan "AST node shapes"
 */
export function parseTemplate(str) {
  const nodes = [];
  let literal = '';
  let i = 0;
  const flush = () => {
    if (literal) {
      nodes.push({ type: 'text', value: literal });
      literal = '';
    }
  };
  while (i < str.length) {
    const ch = str[i];
    if (ch === '{') {
      if (str[i + 1] === '{') { literal += '{'; i += 2; continue; }
      const close = str.indexOf('}', i + 1);
      if (close === -1) throw new ParseError(`unclosed '{'`, i);
      flush();
      nodes.push(parseExpansion(str.slice(i + 1, close), i + 1));
      i = close + 1;
    } else if (ch === '}') {
      if (str[i + 1] === '}') { literal += '}'; i += 2; continue; }
      throw new ParseError(`unexpected '}'`, i);
    } else {
      literal += ch;
      i += 1;
    }
  }
  flush();
  return nodes;
}

/**
 * Parse the inside of one `{...}`. `base` is the offset of `src` in the
 * original template, so errors can report absolute positions.
 * @param {string} src @param {number} base @returns {object}
 */
function parseExpansion(src, base) {
  const cur = new Cursor(src, base);
  const table = cur.readName('table');
  const node = { type: 'lookup', table, tags: [], notTags: [], capture: null, mods: [] };
  cur.skipWs();
  if (!cur.done()) throw new ParseError(`unexpected '${cur.peek()}'`, cur.pos());
  return node;
}

/** Shared scanning helper over the inside of a `{...}` expansion. */
class Cursor {
  constructor(src, base) {
    this.src = src;
    this.base = base;
    this.i = 0;
  }
  pos() { return this.base + this.i; }
  done() { return this.i >= this.src.length; }
  peek() { return this.src[this.i]; }
  skipWs() { while (!this.done() && /\s/.test(this.src[this.i])) this.i += 1; }
  /** Read an identifier or fail with "expected <what> name". */
  readName(what) {
    this.skipWs();
    const m = NAME_RE.exec(this.src.slice(this.i));
    if (!m) throw new ParseError(`expected ${what} name`, this.pos());
    this.i += m[0].length;
    return m[0];
  }
}
