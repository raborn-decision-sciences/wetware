/* Wetware core: trend statistics for the hub (PLAN §6, profile view).
 *
 * Each module's tune(sessions) maps its main measure to 0..1; applied to one
 * session at a time it gives a per-session score. changeAll() asks how far each
 * module's true level has moved since its first session, with a Bayesian local-level
 * model plus a linear trend over every session (core/bayes.js): an 89% interval and
 * P(improved). Without the trend, smooth learning curves were shrunk to 43–85% with coverage
 * down to 0.54; with it, 0.90–1.00 of the gain and coverage 0.85–0.89 (docs/SIMULATION.md).
 * The model's noise and drift are averaged over a grid, and the prior on that grid is
 * estimated from all your modules together (empirical Bayes), so a module with few
 * sessions borrows what the others show about how noisy and how changeable scores are.
 * Early sessions include learning the task itself: a gain says the scores went up,
 * not that the underlying ability did.
 *
 * contextEffects() pools sessions across modules (each score z-scored within
 * its module) and compares days by check-in: short vs normal sleep, and so on.
 */
(function (root) {
  'use strict';
  const WW = (root.WW = root.WW || {});

  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  // Computed on first call, then remembered.
  const lazy = (fn) => {
    let v;
    let done = false;
    return () => (done ? v : ((done = true), (v = fn())));
  };

  /** Percentile bootstrap interval (89% by default) for mean(b) - mean(a). Seeded, so it is stable between renders. */
  function bootDiff(a, b, seed, n = 2000, level = 0.89) {
    const r = WW.rng.create(seed || 'trend');
    const diffs = new Array(n);
    for (let i = 0; i < n; i++) {
      let sa = 0;
      let sb = 0;
      for (let j = 0; j < a.length; j++) sa += a[r.int(0, a.length - 1)];
      for (let j = 0; j < b.length; j++) sb += b[r.int(0, b.length - 1)];
      diffs[i] = sb / b.length - sa / a.length;
    }
    diffs.sort((x, y) => x - y);
    const tail = (1 - level) / 2;
    return [diffs[Math.floor(tail * n)], diffs[Math.ceil((1 - tail) * n) - 1]];
  }

  /** Chronological per-session points for one module. Flagged sessions are left out. */
  function series(sessions, def) {
    const pts = [];
    let flagged = 0;
    for (const s of sessions.slice().sort((x, y) => x.startedAt - y.startedAt)) {
      if (s.quality && s.quality.flagged) {
        flagged++;
        continue;
      }
      let v = null;
      try {
        v = def && typeof def.tune === 'function' ? def.tune([s]) : null;
      } catch (_) {
        v = null;
      }
      if (Number.isFinite(v)) pts.push({ t: s.startedAt, v, context: s.context || null });
    }
    return { points: pts, flagged };
  }

  const DAY = 864e5;
  // Grid for 0..1 tune scores: session-to-session noise SD, and drift SD per 30 days.
  const NOISE_GRID = () => WW.bayes.logspace(0.01, 0.4, 15);
  const DRIFT_GRID = () => WW.bayes.logspace(0.005, 0.5, 15).map((sd) => (sd * sd) / 30);
  const MIN_N = 3; // sessions before a module gets an estimate
  // Linear trend prior: SD of a whole tune scale per 30 days, effectively flat (docs/SIMULATION.md).
  const TREND_SD = 1 / 30;
  const POOL_MIN = { series: 3, n: 5 }; // modules (with this many sessions) before pooling

  /**
   * Change since the first session for each series ({ points: [{ t, v }] }), in input order.
   * Each entry: null (fewer than MIN_N sessions) or
   * { n, first, latest, mean, lo, hi, pImproved, level: { mean, lo, hi }, pooled, path() }.
   * path() (computed on first call, for the results charts): the smoothed true level at each
   * session, [{ t (ms), mean, lo, hi }], from core/bayes.js levelPath with the same weights.
   */
  function changeAll(seriesList, { pool = true, trend = true } = {}) {
    const B = WW.bayes;
    const noiseGrid = NOISE_GRID();
    const driftGrid = DRIFT_GRID();
    const trendSd = trend ? TREND_SD : 0;
    const obsList = seriesList.map((s) => {
      const pts = (s && s.points) || [];
      if (pts.length < MIN_N) return null;
      const t0 = pts[0].t;
      return pts.map((p) => ({ t: (p.t - t0) / DAY, y: p.v }));
    });
    const fits = obsList.map((obs) => (obs ? B.fit(obs, { driftGrid, noiseGrid, trendSd }) : null));
    const donors = fits.filter((f, k) => f && seriesList[k].points.length >= POOL_MIN.n);
    const pooled = pool && donors.length >= POOL_MIN.series;
    const prior = pooled ? B.pool(donors) : null;
    return fits.map((f, k) => {
      if (!f) return null;
      const g = prior ? B.withPrior(f.cells, (i, j) => Math.log(prior[i * noiseGrid.length + j])) : f;
      const sm = B.summary(g, noiseGrid);
      const pts = seriesList[k].points;
      return {
        n: pts.length,
        first: pts[0].v,
        latest: pts[pts.length - 1].v,
        mean: sm.change.mean,
        lo: sm.change.lo,
        hi: sm.change.hi,
        pImproved: sm.change.pAbove,
        level: { mean: sm.level.mean, lo: sm.level.lo, hi: sm.level.hi },
        noise: sm.noise,
        pooled,
        path: lazy(() => B.levelPath(obsList[k], g, { driftGrid, noiseGrid, trendSd }).map((p) => ({ t: pts[0].t + p.t * DAY, mean: p.mean, lo: p.lo, hi: p.hi }))),
      };
    });
  }

  const SPLITS = [
    { field: 'sleep', label: 'Sleep', low: (v) => v <= 6, lowLabel: '≤6 h', highLabel: '7 h+' },
    { field: 'mood', label: 'Mood', low: (v) => v <= 2, lowLabel: 'low (1–2)', highLabel: '3–5' },
    { field: 'stress', label: 'Stress', low: (v) => v <= 2, lowLabel: 'calm (1–2)', highLabel: '3–5' },
    { field: 'caffeine', label: 'Caffeine', low: (v) => v === 0, lowLabel: 'none', highLabel: 'some' },
  ];

  /**
   * seriesByModule: [{ points }]. Scores are z-scored within each module so modules pool.
   * Returns one row per check-in field with enough data on both sides (>= minN each).
   */
  function contextEffects(seriesByModule, minN = 5) {
    const pooled = [];
    for (const s of seriesByModule) {
      const vs = s.points.map((p) => p.v);
      if (vs.length < 3) continue;
      const m = mean(vs);
      const sd = Math.sqrt(mean(vs.map((x) => (x - m) ** 2))) || null;
      if (!sd) continue;
      for (const p of s.points) if (p.context) pooled.push({ z: (p.v - m) / sd, c: p.context });
    }
    const out = [];
    for (const sp of SPLITS) {
      const lo = pooled.filter((p) => Number.isFinite(p.c[sp.field]) && sp.low(p.c[sp.field])).map((p) => p.z);
      const hi = pooled.filter((p) => Number.isFinite(p.c[sp.field]) && !sp.low(p.c[sp.field])).map((p) => p.z);
      if (lo.length < minN || hi.length < minN) {
        out.push({ ...sp, n: [lo.length, hi.length], enough: false });
        continue;
      }
      const diff = mean(lo) - mean(hi);
      const ci = bootDiff(hi, lo, 'ctx:' + sp.field);
      out.push({ ...sp, n: [lo.length, hi.length], enough: true, diff, ci, clear: ci[0] > 0 || ci[1] < 0 });
    }
    return out;
  }

  WW.trends = { bootDiff, series, changeAll, contextEffects, SPLITS, MIN_N };
})(globalThis);
