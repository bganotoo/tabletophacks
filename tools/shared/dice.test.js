import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, roll, rollToText, DiceError } from './dice.js';

/** RNG stub: hands back a fixed sequence of `.int()` results, in order. */
function stubRng(values) {
  let i = 0;
  return {
    int() {
      if (i >= values.length) throw new Error('stub RNG exhausted');
      return values[i++];
    },
  };
}

// --- parsing ---------------------------------------------------------------

test('parse: a bare die defaults the count to 1', () => {
  const { terms } = parse('d20');
  assert.equal(terms.length, 1);
  assert.deepEqual(
    { kind: terms[0].kind, sign: terms[0].sign, count: terms[0].count, sides: terms[0].sides },
    { kind: 'dice', sign: 1, count: 1, sides: 20 },
  );
});

test('parse: d% is a d100', () => {
  const { terms } = parse('d%');
  assert.equal(terms[0].sides, 100);
});

test('parse: is case-insensitive and ignores whitespace', () => {
  const { terms } = parse('  2 D 6  +  3 ');
  assert.equal(terms[0].count, 2);
  assert.equal(terms[0].sides, 6);
  assert.equal(terms[1].kind, 'const');
  assert.equal(terms[1].value, 3);
});

test('parse: multi-term signs', () => {
  const { terms } = parse('1d8-1d4+2');
  assert.deepEqual(terms.map((t) => t.sign), [1, -1, 1]);
  assert.deepEqual(terms.map((t) => t.kind), ['dice', 'dice', 'const']);
});

test('parse: keep/drop suffixes', () => {
  assert.deepEqual(parse('4d6kh3').terms[0].keepDrop, { op: 'kh', n: 3 });
  assert.deepEqual(parse('2d20kl1').terms[0].keepDrop, { op: 'kl', n: 1 });
  assert.deepEqual(parse('4d6dl1').terms[0].keepDrop, { op: 'dl', n: 1 });
  assert.deepEqual(parse('2d20dh1').terms[0].keepDrop, { op: 'dh', n: 1 });
  assert.equal(parse('3d6').terms[0].keepDrop, null);
});

// --- parse errors ----------------------------------------------------------

test('parse: empty input throws DiceError', () => {
  assert.throws(() => parse('   '), DiceError);
  assert.throws(() => parse(''), DiceError);
});

test('parse: garbage throws DiceError', () => {
  assert.throws(() => parse('hello'), DiceError);
  assert.throws(() => parse('2d6 & 3'), DiceError);
});

test('parse: a trailing operator throws DiceError', () => {
  assert.throws(() => parse('1d20+'), DiceError);
});

test('parse: count out of range throws DiceError', () => {
  assert.throws(() => parse('0d6'), DiceError);
  assert.throws(() => parse('1001d6'), DiceError);
});

test('parse: sides must be at least 1', () => {
  assert.throws(() => parse('1d0'), DiceError);
});

test('parse: keep/drop needs a number', () => {
  assert.throws(() => parse('4d6kh'), DiceError);
});

test('parse: keeping more dice than rolled throws DiceError', () => {
  assert.throws(() => parse('2d6kh3'), DiceError);
  assert.throws(() => parse('2d6dl3'), DiceError);
});

// --- rolling ---------------------------------------------------------------

test('roll: a single die returns its value', () => {
  const r = roll('1d20', stubRng([13]));
  assert.equal(r.total, 13);
  assert.equal(r.terms[0].subtotal, 13);
  assert.deepEqual(r.terms[0].dice, [{ value: 13, kept: true }]);
});

test('roll: sums dice and adds a flat modifier', () => {
  const r = roll('3d6+2', stubRng([4, 1, 5]));
  assert.equal(r.terms[0].subtotal, 10);
  assert.equal(r.total, 12);
});

test('roll: subtracts a negative term', () => {
  const r = roll('1d8-1d4', stubRng([6, 3]));
  assert.deepEqual(r.terms.map((t) => t.sign), [1, -1]);
  assert.equal(r.total, 3);
});

test('roll: keep-highest drops the lowest dice, preserving roll order', () => {
  const r = roll('4d6kh3', stubRng([5, 2, 6, 4]));
  assert.deepEqual(
    r.terms[0].dice,
    [
      { value: 5, kept: true },
      { value: 2, kept: false },
      { value: 6, kept: true },
      { value: 4, kept: true },
    ],
  );
  assert.equal(r.terms[0].subtotal, 15);
  assert.equal(r.total, 15);
});

test('roll: keep-lowest keeps only the smallest', () => {
  const r = roll('4d6kl1', stubRng([5, 2, 6, 4]));
  assert.equal(r.terms[0].subtotal, 2);
  assert.deepEqual(r.terms[0].dice.filter((d) => d.kept).map((d) => d.value), [2]);
});

test('roll: drop-highest removes the top die', () => {
  const r = roll('2d20dh1', stubRng([18, 7]));
  assert.equal(r.total, 7);
});

test('roll: drop-lowest removes the bottom die', () => {
  const r = roll('2d20dl1', stubRng([18, 7]));
  assert.equal(r.total, 18);
});

test('roll: advantage keeps the higher of two d20', () => {
  assert.equal(roll('2d20kh1', stubRng([12, 19])).total, 19);
});

test('roll: disadvantage keeps the lower of two d20', () => {
  assert.equal(roll('2d20kl1', stubRng([12, 19])).total, 12);
});

test('roll: ties in keep/drop still keep exactly N and total correctly', () => {
  const r = roll('4d6kh2', stubRng([4, 4, 4, 4]));
  assert.equal(r.terms[0].dice.filter((d) => d.kept).length, 2);
  assert.equal(r.terms[0].subtotal, 8);
});

test('roll: propagates the normalized expression', () => {
  const r = roll('2d6+1', stubRng([3, 4]));
  assert.equal(typeof r.expression, 'string');
});

test('roll: invalid notation throws DiceError', () => {
  assert.throws(() => roll('nonsense', stubRng([])), DiceError);
});

// --- rollToText ------------------------------------------------------------

test('rollToText: expression and total on one line', () => {
  const r = roll('1d20+5', stubRng([10]));
  assert.equal(rollToText(r), `${r.expression} → 15`);
});
