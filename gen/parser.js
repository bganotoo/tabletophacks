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
  const t = src.trim();
  const offset = base + src.indexOf(t.charAt(0) || '');

  // Repetition: "<count>x <target>" — count is an int, range, or dice.
  const rep = /^(\d+\s*d\s*\d+(?:\s*[+-]\s*\d+)?|\d+\s*-\s*\d+|\d+)\s*x\s+(.+)$/s.exec(t);
  if (rep) {
    const count = parseCount(rep[1], offset);
    const inner = parseExpansion(rep[2], offset + (rep[0].length - rep[2].length));
    if (inner.type !== 'lookup') {
      throw new ParseError('repetition target must be a table lookup', offset);
    }
    if (inner.silent) throw new ParseError('`?` cannot be repeated', offset);
    let unique = false;
    let join = ', ';
    inner.mods = inner.mods.filter((mod) => {
      if (mod.name === 'unique') { unique = true; return false; }
      if (mod.name === 'join') { join = mod.arg ?? join; return false; }
      return true;
    });
    return { type: 'repeat', count, inner, unique, join };
  }

  // Inline alternatives: {red|blue|azure*3} — '|' outside quotes splits.
  const alts = splitAlternatives(t);
  if (alts.length > 1) {
    const options = alts.map((raw) => {
      let text = raw.trim();
      let weight = 1;
      const w = /^(.*?)\s*\*\s*(\d+(?:\.\d+)?)$/.exec(text);
      if (w) { text = w[1].trim(); weight = parseFloat(w[2]); }
      if (!text) throw new ParseError('empty alternative', offset);
      if (!(weight > 0)) throw new ParseError('alternative weight must be > 0', offset);
      return { text, weight };
    });
    return { type: 'alt', options };
  }

  // Dice: {3d6}, {2d4+1}, optional capture {3d6@hp}.
  let m = /^(\d+)\s*d\s*(\d+)\s*(?:([+-])\s*(\d+))?\s*(?:@\s*([A-Za-z_][A-Za-z0-9_-]*))?$/.exec(t);
  if (m) {
    const count = Number(m[1]);
    const sides = Number(m[2]);
    if (count < 1 || sides < 1) throw new ParseError(`invalid dice \`${t}\``, offset);
    const plus = m[4] ? (m[3] === '-' ? -Number(m[4]) : Number(m[4])) : 0;
    return { type: 'dice', count, sides, plus, capture: m[5] ?? null };
  }

  // Range: {2-12}, optional capture {2-12@level}.
  m = /^(\d+)\s*-\s*(\d+)\s*(?:@\s*([A-Za-z_][A-Za-z0-9_-]*))?$/.exec(t);
  if (m) {
    const min = Number(m[1]);
    const max = Number(m[2]);
    if (min > max) throw new ParseError(`range ${min}-${max} has min > max`, offset);
    return { type: 'range', min, max, capture: m[3] ?? null };
  }

  // Smart article. 'a'/'an' are reserved words, not table names.
  if (t === 'a' || t === 'an') return { type: 'article' };

  return parseNameExpansion(src, base);
}

/** Task 4's parseExpansion body: `@ref` or `table` plus trailing sigils. */
function parseNameExpansion(src, base) {
  const cur = new Cursor(src, base);
  cur.skipWs();
  if (cur.peek() === '@') {
    cur.i += 1;
    const name = cur.readName('capture');
    const node = { type: 'ref', name, mods: [] };
    readSigils(cur, node, { allowTags: false, allowCapture: false });
    return node;
  }
  // `{?table@x}` — a silent lookup: picks and captures, renders nothing.
  let silent = false;
  if (cur.peek() === '?') {
    silent = true;
    cur.i += 1;
    cur.skipWs();
    if (cur.peek() === '@') {
      throw new ParseError('`?` applies to table lookups, not `@` references', cur.pos());
    }
  }
  const table = cur.readName('table');
  const node = { type: 'lookup', table, tags: [], notTags: [], capture: null, mods: [] };
  if (silent) node.silent = true;
  readSigils(cur, node, { allowTags: true, allowCapture: true });
  return node;
}

/** Split on '|' outside double quotes; returns [src] when there is none. */
function splitAlternatives(src) {
  const parts = [];
  let current = '';
  let inString = false;
  for (const ch of src) {
    if (ch === '"') { inString = !inString; current += ch; }
    else if (ch === '|' && !inString) { parts.push(current); current = ''; }
    else current += ch;
  }
  parts.push(current);
  return parts;
}

/**
 * Parse a count expression: "3", "2-4", or "1d4". Used for repetition and
 * by the engine for `$repeat` counts.
 * @param {string|number} str @param {number} [pos] @returns {object}
 */
export function parseCount(str, pos = 0) {
  const t = String(str).trim();
  let m = /^(\d+)\s*d\s*(\d+)\s*(?:([+-])\s*(\d+))?$/.exec(t);
  if (m) {
    const count = Number(m[1]);
    const sides = Number(m[2]);
    if (count < 1 || sides < 1) throw new ParseError(`invalid dice \`${t}\``, pos);
    const plus = m[4] ? (m[3] === '-' ? -Number(m[4]) : Number(m[4])) : 0;
    return { type: 'dice', count, sides, plus, capture: null };
  }
  m = /^(\d+)\s*-\s*(\d+)$/.exec(t);
  if (m) {
    const min = Number(m[1]);
    const max = Number(m[2]);
    if (min > max) throw new ParseError(`range ${min}-${max} has min > max`, pos);
    return { type: 'range', min, max, capture: null };
  }
  if (/^\d+$/.test(t)) return { type: 'int', value: Number(t) };
  throw new ParseError(`invalid count \`${t}\``, pos);
}

/**
 * Read trailing sigils onto `node`: `.mod`, `.mod("arg")`, `#tag`, `#!tag`,
 * dynamic tags `#@n.field` / `#$var` (also negatable), `@capture` — any
 * order, whitespace anywhere.
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
      if (cur.peek() === '!') { negated = true; cur.i += 1; cur.skipWs(); }
      if (cur.peek() === '@') {
        // `#@n.field` — tag taken from capture n's `field` variant.
        cur.i += 1;
        const capture = cur.readName('capture');
        if (cur.peek() !== '.') {
          throw new ParseError(`expected '.field' after '#@${capture}'`, cur.pos());
        }
        cur.i += 1;
        const field = cur.readName('field');
        (node.dynTags ??= []).push({ negated, capture, field });
      } else if (cur.peek() === '$') {
        // `#$var` — tag taken from a run variable.
        cur.i += 1;
        const variable = cur.readName('variable');
        (node.dynTags ??= []).push({ negated, variable });
      } else {
        const tag = cur.readName('tag');
        (negated ? node.notTags : node.tags).push(tag);
      }
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
