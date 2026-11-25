/* Wetware core: seeded pseudo-random numbers.
 *
 * Every generator in the suite takes an rng from here so that any trial
 * sequence or puzzle can be replayed from its seed and unit-tested.
 * mulberry32 (32-bit state) is plenty for stimulus generation; it is not
 * cryptographic and does not need to be.
 */
(function (root) {
  'use strict';
  const WW = (root.WW = root.WW || {});

  // xmur3-style string hash -> 32-bit unsigned seed.
  function hashSeed(str) {
    str = String(str);
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^ (h >>> 16)) >>> 0;
  }

  function mulberry32(a) {
    return function next() {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function create(seed) {
    const s = typeof seed === 'number' && Number.isFinite(seed) ? seed >>> 0 : hashSeed(seed);
    const next = mulberry32(s);
    const rng = {
      seed: s,
      /** float in [0, 1) */
      next,
      /** float in [lo, hi) */
      float(lo = 0, hi = 1) {
        return lo + next() * (hi - lo);
      },
      /** integer in [lo, hi], inclusive */
      int(lo, hi) {
        return lo + Math.floor(next() * (hi - lo + 1));
      },
      chance(p) {
        return next() < p;
      },
      pick(arr) {
        return arr[Math.floor(next() * arr.length)];
      },
      /** Fisher-Yates; returns a new array. */
      shuffle(arr) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(next() * (i + 1));
          const tmp = a[i];
          a[i] = a[j];
          a[j] = tmp;
        }
        return a;
      },
      /** k distinct elements, in random order. */
      sample(arr, k) {
        return rng.shuffle(arr).slice(0, k);
      },
      /** standard normal via Box-Muller */
      normal(mean = 0, sd = 1) {
        let u = 0;
        while (u === 0) u = next();
        const v = next();
        return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      },
      /** Independent child stream, stable for a given label. */
      fork(label) {
        return create(hashSeed(s + ':' + label));
      },
    };
    return rng;
  }

  function randomSeed() {
    const c = root.crypto;
    if (c && typeof c.getRandomValues === 'function') {
      return c.getRandomValues(new Uint32Array(1))[0];
    }
    return (Date.now() ^ Math.floor(Math.random() * 4294967296)) >>> 0;
  }

  WW.rng = { create, hashSeed, randomSeed };
})(globalThis);
