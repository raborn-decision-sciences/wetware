/* Wetware core: constrained random orders for trial lists. */
(function (root) {
  'use strict';
  const WW = (root.WW = root.WW || {});

  /**
   * Random order of `items` such that no adjacent pair conflicts.
   * Greedy random construction with restarts; throws if impossible.
   */
  function arrange(rng, items, conflict) {
    for (let attempt = 0; attempt < 500; attempt++) {
      const pool = rng.shuffle(items);
      const out = [];
      while (pool.length) {
        const prev = out[out.length - 1];
        const okIdx = [];
        for (let i = 0; i < pool.length; i++) if (prev === undefined || !conflict(prev, pool[i])) okIdx.push(i);
        if (!okIdx.length) break;
        out.push(pool.splice(rng.pick(okIdx), 1)[0]);
      }
      if (!pool.length) return out;
    }
    throw new Error('arrange: no valid order found');
  }

  /** Each value `per` times, no run longer than maxRun. */
  function balanced(rng, values, per, maxRun) {
    const items = [];
    for (const v of values) for (let i = 0; i < per; i++) items.push(v);
    if (maxRun >= items.length) return rng.shuffle(items);
    for (let attempt = 0; attempt < 2000; attempt++) {
      const s = rng.shuffle(items);
      let run = 1;
      let ok = true;
      for (let i = 1; i < s.length && ok; i++) {
        run = s[i] === s[i - 1] ? run + 1 : 1;
        if (run > maxRun) ok = false;
      }
      if (ok) return s;
    }
    throw new Error('balanced: no valid order found');
  }

  WW.seq = { arrange, balanced };
})(globalThis);
