/** Seedable PRNG (mulberry32) and helpers. Same seed ⇒ same sequence. */

/**
 * Hash a string to a 32-bit unsigned seed (xmur3-style final mix).
 * @param {string} str
 * @returns {number}
 */
export function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * mulberry32 PRNG. @param {number} seed @returns {() => number} float in [0,1)
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  /** @param {number|string} [seed] Omit for a random seed. */
  constructor(seed) {
    if (seed === undefined) seed = Math.floor(Math.random() * 0x100000000);
    if (typeof seed === 'string') seed = hashSeed(seed);
    /** @type {() => number} float in [0,1) */
    this.next = mulberry32(seed);
  }

  /**
   * Uniform integer in [min, max], inclusive on both ends.
   * @param {number} min @param {number} max @returns {number}
   */
  int(min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** @template T @param {T[]} arr @returns {T} */
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /**
   * Weighted pick. @template T @param {T[]} items
   * @param {(item: T) => number} weightOf @returns {T}
   */
  weighted(items, weightOf) {
    let total = 0;
    for (const it of items) total += weightOf(it);
    let r = this.next() * total;
    for (const it of items) {
      r -= weightOf(it);
      if (r < 0) return it;
    }
    return items[items.length - 1]; // float rounding fallback
  }
}
