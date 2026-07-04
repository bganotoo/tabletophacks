/**
 * Dice notation parser and roller for the Dice Roller tool. Pure and testable:
 * randomness comes from an injected RNG (see gen/rng.js), never from Math.random
 * here. The engine (gen/) also rolls `{3d6+2}`, but its evaluator returns only a
 * total — this module keeps the per-die breakdown and adds keep/drop, which a
 * dice roller needs. See docs/superpowers/specs/2026-07-03-dice-roller-design.md.
 */

/** Invalid dice notation. Mirrors GenError / ParseError in style. */
export class DiceError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'DiceError';
  }
}

const MAX_COUNT = 1000;

/** count?d(sides|%) with an optional keep/drop suffix, anchored at the cursor. */
const DICE_RE = /^(\d*)d(\d+|%)(?:(kh|kl|dh|dl)(\d*))?/;
const CONST_RE = /^\d+/;

/**
 * @typedef {{ kind: 'dice', sign: 1|-1, count: number, sides: number,
 *             keepDrop: { op: string, n: number } | null }} DiceTerm
 * @typedef {{ kind: 'const', sign: 1|-1, value: number }} ConstTerm
 * @typedef {{ terms: (DiceTerm|ConstTerm)[] }} ParsedExpression
 */

/**
 * Parse a dice-notation string into terms. Whitespace is ignored and the input
 * is case-insensitive. Throws {@link DiceError} on anything malformed.
 * @param {string} expr @returns {ParsedExpression}
 */
export function parse(expr) {
  const src = String(expr ?? '').replace(/\s+/g, '').toLowerCase();
  if (!src) throw new DiceError('empty dice expression');

  const terms = [];
  let i = 0;
  while (i < src.length) {
    // Every term after the first must be joined by + or -; the first may lead with one.
    let sign = 1;
    if (i === 0) {
      if (src[0] === '+' || src[0] === '-') {
        sign = src[0] === '-' ? -1 : 1;
        i += 1;
      }
    } else {
      const op = src[i];
      if (op !== '+' && op !== '-') {
        throw new DiceError(`expected + or - before "${src.slice(i)}"`);
      }
      sign = op === '-' ? -1 : 1;
      i += 1;
    }

    const rest = src.slice(i);
    const dm = DICE_RE.exec(rest);
    if (dm) {
      terms.push(diceTerm(dm, sign));
      i += dm[0].length;
      continue;
    }
    const cm = CONST_RE.exec(rest);
    if (cm) {
      terms.push({ kind: 'const', sign, value: Number(cm[0]) });
      i += cm[0].length;
      continue;
    }
    throw new DiceError(rest ? `unexpected "${rest}"` : 'expression ends with an operator');
  }

  if (terms.length === 0) throw new DiceError('empty dice expression');
  return { terms };
}

/** Build and validate a dice term from a DICE_RE match. */
function diceTerm(dm, sign) {
  const count = dm[1] === '' ? 1 : Number(dm[1]);
  const sides = dm[2] === '%' ? 100 : Number(dm[2]);
  if (count < 1 || count > MAX_COUNT) {
    throw new DiceError(`dice count must be 1–${MAX_COUNT}, got ${count}`);
  }
  if (sides < 1) throw new DiceError(`a die needs at least 1 side, got d${sides}`);

  let keepDrop = null;
  if (dm[3]) {
    if (dm[4] === '') throw new DiceError(`${dm[3]} needs a number, e.g. 4d6${dm[3]}3`);
    const n = Number(dm[4]);
    if (n < 1 || n > count) {
      const verb = dm[3][0] === 'k' ? 'keep' : 'drop';
      throw new DiceError(`cannot ${verb} ${n} of ${count} dice`);
    }
    keepDrop = { op: dm[3], n };
  }
  return { kind: 'dice', sign, count, sides, keepDrop };
}

/**
 * @typedef {{ value: number, kept: boolean }} Die
 * @typedef {{ kind: 'dice', notation: string, sign: 1|-1, count: number,
 *             sides: number, keepDrop: object|null, dice: Die[], subtotal: number }
 *          | { kind: 'const', sign: 1|-1, value: number, subtotal: number }} RolledTerm
 * @typedef {{ expression: string, terms: RolledTerm[], total: number }} RollResult
 */

/**
 * Parse and roll an expression using `rng` (anything with `.int(min,max)`,
 * inclusive — e.g. an RNG from gen/rng.js). Throws {@link DiceError} on bad
 * notation. Randomness is entirely `rng`'s; same rng sequence ⇒ same result.
 * @param {string} expr @param {{ int(min: number, max: number): number }} rng
 * @returns {RollResult}
 */
export function roll(expr, rng) {
  const { terms } = parse(expr);
  const rolled = terms.map((term) => rollTerm(term, rng));
  const total = rolled.reduce((sum, t) => sum + t.sign * t.subtotal, 0);
  return { expression: formatExpression(rolled), terms: rolled, total };
}

/** Roll one parsed term. */
function rollTerm(term, rng) {
  if (term.kind === 'const') {
    return { kind: 'const', sign: term.sign, value: term.value, subtotal: term.value };
  }
  const values = [];
  for (let k = 0; k < term.count; k++) values.push(rng.int(1, term.sides));
  const keptIdx = keptIndices(values, term.keepDrop);
  const dice = values.map((value, idx) => ({ value, kept: keptIdx.has(idx) }));
  const subtotal = dice.reduce((sum, d) => (d.kept ? sum + d.value : sum), 0);
  return {
    kind: 'dice',
    notation: termNotation(term),
    sign: term.sign,
    count: term.count,
    sides: term.sides,
    keepDrop: term.keepDrop,
    dice,
    subtotal,
  };
}

/**
 * Which original indices survive `keepDrop`. Ranks a stable-sorted copy by
 * value so ties keep exactly N; maps the selection back to roll order.
 * @returns {Set<number>}
 */
function keptIndices(values, keepDrop) {
  if (!keepDrop) return new Set(values.map((_, i) => i));
  const order = values
    .map((value, i) => ({ value, i }))
    .sort((a, b) => a.value - b.value || a.i - b.i); // ascending, stable
  const { op, n } = keepDrop;
  let selected;
  if (op === 'kh') selected = order.slice(order.length - n);
  else if (op === 'kl') selected = order.slice(0, n);
  else if (op === 'dh') selected = order.slice(0, order.length - n);
  else selected = order.slice(n); // dl
  return new Set(selected.map((o) => o.i));
}

/** Canonical `NdMkhK` string for one dice term (no sign). */
function termNotation(term) {
  const kd = term.keepDrop ? `${term.keepDrop.op}${term.keepDrop.n}` : '';
  return `${term.count}d${term.sides}${kd}`;
}

/** Rebuild a clean, signed expression string from rolled terms. */
function formatExpression(terms) {
  return terms
    .map((t, idx) => {
      const body = t.kind === 'const' ? String(t.value) : t.notation;
      if (idx === 0) return t.sign < 0 ? `-${body}` : body;
      return `${t.sign < 0 ? ' - ' : ' + '}${body}`;
    })
    .join('');
}

/**
 * One-line plain-text summary for copying and history.
 * @param {RollResult} result @returns {string}
 */
export function rollToText(result) {
  return `${result.expression} → ${result.total}`;
}
