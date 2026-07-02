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
  cur.skipWs();
  if (cur.peek() === '@') {
    cur.i += 1;
    const name = cur.readName('capture');
    const node = { type: 'ref', name, mods: [] };
    readSigils(cur, node, { allowTags: false, allowCapture: false });
    return node;
  }
  const table = cur.readName('table');
  const node = { type: 'lookup', table, tags: [], notTags: [], capture: null, mods: [] };
  readSigils(cur, node, { allowTags: true, allowCapture: true });
  return node;
}

/**
 * Read trailing sigils onto `node`: `.mod`, `.mod("arg")`, `#tag`, `#!tag`,
 * `@capture` — any order, whitespace anywhere.
 */
function readSigils(cur, node, { allowTags, allowCapture }) {
  cur.skipWs();
  while (!cur.done()) {
    const ch = cur.peek();
    if (ch === '.') {
      cur.i += 1;
      const name = cur.readName('modifier');
      const mod = { name };
      cur.skipWs();
      if (cur.peek() === '(') mod.arg = readArg(cur);
      node.mods.push(mod);
    } else if (ch === '#' && allowTags) {
      cur.i += 1;
      cur.skipWs();
      let negated = false;
      if (cur.peek() === '!') { negated = true; cur.i += 1; }
      const tag = cur.readName('tag');
      (negated ? node.notTags : node.tags).push(tag);
    } else if (ch === '@' && allowCapture) {
      cur.i += 1;
      node.capture = cur.readName('capture');
    } else {
      throw new ParseError(`unexpected '${ch}'`, cur.pos());
    }
    cur.skipWs();
  }
}

/** Read a parenthesized, double-quoted argument: ("...") */
function readArg(cur) {
  cur.i += 1; // consume '('
  cur.skipWs();
  if (cur.peek() !== '"') throw new ParseError('expected quoted string argument', cur.pos());
  cur.i += 1;
  let arg = '';
  while (!cur.done() && cur.peek() !== '"') { arg += cur.peek(); cur.i += 1; }
  if (cur.done()) throw new ParseError('unterminated string argument', cur.pos());
  cur.i += 1; // consume closing '"'
  cur.skipWs();
  if (cur.peek() !== ')') throw new ParseError(`expected ')'`, cur.pos());
  cur.i += 1;
  return arg;
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
