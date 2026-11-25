/* Wetware core: Bayesian change over time (used by trends.js and reliable.js).
 *
 * Model (local level, irregular spacing):
 *     y_k     = level(t_k) + practice·[k = 1] + e_k        e_k ~ N(0, noise² + v_k)
 *     level(t_k) = level(t_{k-1}) + trend·(t_k − t_{k-1}) + d_k     d_k ~ N(0, drift · (t_k − t_{k-1}))
 * t in days. v_k is a known per-observation variance (e.g. binomial item error), noise² an
 * unknown one. "practice" is an optional first-run offset with prior N(0, practiceSd²): the
 * first run of a task is taken unfamiliar, later runs familiar, so the comparison is
 * "changed beyond getting used to it". The first level gets a flat prior, the trend a wide one
 * (effectively flat). Without the trend, a random walk shrinks smooth changes towards zero: the
 * likelihood barely constrains the drift, so its prior decides (docs/SIMULATION.md, round 1).
 *
 * The question asked is "how far has the true level moved since the first run?", i.e. the
 * posterior of level(t_n) − level(t_1). A Kalman filter on the state [level_t, level_1, practice]
 * gives that exactly (level_1 rides along, so its estimate uses every run), plus the marginal
 * likelihood of the data.
 *
 * The two variances (noise, drift) are not plugged in: the posterior is averaged over a grid
 * of them, weighted by marginal likelihood × prior. Plug-in estimates are overconfident with
 * the 2–12 runs a probe gets in a year. Where the prior comes from is the empirical Bayes part:
 * published retest error for the probes (reliable.js), or the other training games (pool()).
 *
 * Intervals are 89% (McElreath's deliberately unconventional choice: nothing special about 95%).
 */
(function (root) {
  'use strict';
  const WW = (root.WW = root.WW || {});

  const LEVEL = 0.89;

  // Normal CDF via erf (Abramowitz & Stegun 7.1.26, |error| < 1.5e-7).
  function normCdf(x) {
    const z = Math.abs(x) / Math.SQRT2;
    const t = 1 / (1 + 0.3275911 * z);
    const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
    return x >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
  }

  /** n points from lo to hi, evenly spaced on a log scale. */
  function logspace(lo, hi, n) {
    if (n === 1) return [lo];
    const a = Math.log(lo);
    const b = Math.log(hi);
    return Array.from({ length: n }, (_, i) => Math.exp(a + ((b - a) * i) / (n - 1)));
  }

  /**
   * One Kalman pass. obs: [{ t, y, v? }] sorted by t. drift: variance per day. noise: SD.
   * Returns { loglik, change: {m, s}, level: {m, s} } or null with fewer than 2 observations.
   * loglik leaves out the first observation (absorbed by the flat prior on the first level),
   * so it is comparable across grid points.
   */
  function localLevel(obs, drift, noise, practiceSd, trendSd = 0, practiceDecay = 0) {
    if (!obs || obs.length < 2) return null;
    const n2 = noise * noise;
    const p2 = (practiceSd || 0) ** 2;
    const b2 = trendSd * trendSd;
    const o1 = obs[0];
    // State [level_t, level_1, practice, trend]. After the first observation, with a flat prior
    // on level_1: level_1 = y_1 − practice − e_1 → var p² + r_1, cov(level_1, practice) = −p².
    // The trend (change per day) has prior N(0, trendSd²); 0 gives the plain local level.
    const a = p2 + n2 + (o1.v || 0);
    const m = [o1.y, o1.y, 0, 0];
    const P = [
      [a, a, -p2, 0],
      [a, a, -p2, 0],
      [-p2, -p2, p2, 0],
      [0, 0, 0, b2],
    ];
    let loglik = 0;
    let tPrev = o1.t;
    for (let k = 1; k < obs.length; k++) {
      const o = obs[k];
      const dt = Math.max(0, o.t - tPrev);
      tPrev = o.t;
      // Predict: level += trend·dt (F = I with F[0][3] = dt), plus drift.
      if (b2 > 0) {
        m[0] += dt * m[3];
        const r0 = P[0].map((x, j) => x + dt * P[3][j]);
        for (let j = 0; j < 4; j++) P[0][j] = r0[j];
        for (let i = 0; i < 4; i++) P[i][0] = i === 0 ? r0[0] + dt * r0[3] : r0[i];
      }
      P[0][0] += drift * dt;
      // Practice reaches run k with weight w = exp(−k/practiceDecay) (0: the first run only).
      const w = practiceDecay > 0 ? Math.exp(-k / practiceDecay) : 0;
      const S = P[0][0] + 2 * w * P[0][2] + w * w * P[2][2] + n2 + (o.v || 0);
      const e = o.y - m[0] - w * m[2];
      loglik -= 0.5 * (Math.log(2 * Math.PI * S) + (e * e) / S);
      const row = P[0].map((x, j) => x + w * P[2][j]);
      for (let i = 0; i < 4; i++) {
        const Ki = (P[i][0] + w * P[i][2]) / S;
        m[i] += Ki * e;
        for (let j = 0; j < 4; j++) P[i][j] -= Ki * row[j];
      }
    }
    const cv = P[0][0] + P[1][1] - 2 * P[0][1];
    return { loglik, change: { m: m[0] - m[1], s: Math.sqrt(Math.max(cv, 0)) }, level: { m: m[0], s: Math.sqrt(Math.max(P[0][0], 0)) } };
  }

  /**
   * Local level plus two phase slopes (an interrupted time series for the study, core/study.js):
   *     level(t_k) = level(t_k-1) + b1·Δe1 + b2·Δe2 + d_k
   * where e1(t), e2(t) are cumulative exposures (e.g. periods of own-arm and other-arm training
   * so far) and d_k the random walk. b1, b2 ~ N(0, slopeSd²) a priori. A plain random walk can't
   * tell which period a change happened in and smears it across neighbours; the slopes can.
   * expo(t) → [e1, e2]. Returns { loglik, b: [m1, m2], cov: 2×2 } or null with fewer than 2 obs.
   */
  function phaseSlopes(obs, drift, noise, practiceSd, expo, slopeSd) {
    if (!obs || obs.length < 2) return null;
    const n2 = noise * noise;
    const p2 = (practiceSd || 0) ** 2;
    const s2 = slopeSd * slopeSd;
    const o1 = obs[0];
    // State [level, practice, b1, b2].
    const m = [o1.y, 0, 0, 0];
    const P = [
      [p2 + n2 + (o1.v || 0), -p2, 0, 0],
      [-p2, p2, 0, 0],
      [0, 0, s2, 0],
      [0, 0, 0, s2],
    ];
    let loglik = 0;
    let ePrev = expo(o1.t);
    let tPrev = o1.t;
    for (let k = 1; k < obs.length; k++) {
      const o = obs[k];
      const e = expo(o.t);
      const d1 = e[0] - ePrev[0];
      const d2 = e[1] - ePrev[1];
      ePrev = e;
      // Predict: level += d1·b1 + d2·b2 (F = I with F[0][2] = d1, F[0][3] = d2), plus drift.
      m[0] += d1 * m[2] + d2 * m[3];
      const r0 = P[0].map((x, j) => x + d1 * P[2][j] + d2 * P[3][j]);
      for (let j = 0; j < 4; j++) P[0][j] = r0[j];
      for (let i = 0; i < 4; i++) P[i][0] = i === 0 ? r0[0] + d1 * r0[2] + d2 * r0[3] : r0[i];
      P[0][0] += drift * Math.max(0, o.t - tPrev);
      tPrev = o.t;
      // Update with y = level + e.
      const S = P[0][0] + n2 + (o.v || 0);
      const inn = o.y - m[0];
      loglik -= 0.5 * (Math.log(2 * Math.PI * S) + (inn * inn) / S);
      const row = P[0].slice();
      for (let i = 0; i < 4; i++) {
        const Ki = P[i][0] / S;
        m[i] += Ki * inn;
        for (let j = 0; j < 4; j++) P[i][j] -= Ki * row[j];
      }
    }
    return { loglik, b: [m[2], m[3]], cov: [[P[2][2], P[2][3]], [P[3][2], P[3][3]]] };
  }

  /**
   * Run localLevel over every (drift, noise) grid point. logPrior(i, j) is the log prior weight of
   * driftGrid[i], noiseGrid[j] (default: flat over the grid, i.e. log-uniform for log-spaced grids).
   * Returns { cells: [{ i, j, loglik, change, level }], weights (normalised posterior) } or null.
   */
  function fit(obs, { driftGrid, noiseGrid, practiceSd = 0, trendSd = 0, practiceDecay = 0, logPrior = null }) {
    if (!obs || obs.length < 2) return null;
    const cells = [];
    for (let i = 0; i < driftGrid.length; i++)
      for (let j = 0; j < noiseGrid.length; j++) {
        const r = localLevel(obs, driftGrid[i], noiseGrid[j], practiceSd, trendSd, practiceDecay);
        cells.push({ i, j, loglik: r.loglik, change: r.change, level: r.level });
      }
    return withPrior(cells, logPrior);
  }

  /** Re-weight a fit's cells by a (new) prior. */
  function withPrior(cells, logPrior) {
    const lw = cells.map((c) => c.loglik + (logPrior ? logPrior(c.i, c.j) : 0));
    const mx = Math.max(...lw);
    const w = lw.map((x) => (Number.isFinite(x) ? Math.exp(x - mx) : 0));
    const tot = w.reduce((x, y) => x + y, 0);
    return { cells, weights: w.map((x) => x / tot) };
  }

  /**
   * Summarise a mixture of normals { w, m, s }: mean, central interval at `level`, P(x > 0).
   */
  function mixture(comps, level = LEVEL) {
    const cs = comps.filter((c) => c.w > 0);
    const mean = cs.reduce((a, c) => a + c.w * c.m, 0);
    const cdf = (x) => cs.reduce((a, c) => a + c.w * (c.s > 0 ? normCdf((x - c.m) / c.s) : x >= c.m ? 1 : 0), 0);
    let lo = Infinity;
    let hi = -Infinity;
    for (const c of cs) {
      lo = Math.min(lo, c.m - 9 * c.s - 1e-9);
      hi = Math.max(hi, c.m + 9 * c.s + 1e-9);
    }
    const q = (p) => {
      let a = lo;
      let b = hi;
      for (let k = 0; k < 80; k++) {
        const mid = (a + b) / 2;
        if (cdf(mid) < p) a = mid;
        else b = mid;
      }
      return (a + b) / 2;
    };
    const tail = (1 - level) / 2;
    return { mean, lo: q(tail), hi: q(1 - tail), pAbove: 1 - cdf(0) };
  }

  /** Posterior of the change since the first observation, summarised. Also the posterior-mean noise SD. */
  function summary(f, noiseGrid, level = LEVEL) {
    const ch = mixture(f.cells.map((c, k) => ({ w: f.weights[k], m: c.change.m, s: c.change.s })), level);
    const lv = mixture(f.cells.map((c, k) => ({ w: f.weights[k], m: c.level.m, s: c.level.s })), level);
    const noise = noiseGrid ? f.cells.reduce((a, c, k) => a + f.weights[k] * noiseGrid[c.j], 0) : null;
    return { change: ch, level: lv, noise };
  }

  /**
   * Empirical Bayes across series (Kiefer–Wolfowitz NPMLE by EM): the prior over grid cells that
   * best explains all series' marginal likelihoods together. Each series' posterior then borrows
   * the others' typical noise and drift. Mixed with `floor` of a flat prior so no cell is ruled out.
   * fits: array of fit() results over the same grid. Returns prior weights per cell.
   */
  function pool(fits, { iters = 300, floor = 0.05 } = {}) {
    const C = fits[0].cells.length;
    const L = fits.map((f) => {
      const mx = Math.max(...f.cells.map((c) => c.loglik));
      return f.cells.map((c) => Math.exp(c.loglik - mx));
    });
    let pi = new Array(C).fill(1 / C);
    for (let it = 0; it < iters; it++) {
      const next = new Array(C).fill(0);
      for (const l of L) {
        let tot = 0;
        for (let c = 0; c < C; c++) tot += pi[c] * l[c];
        if (!(tot > 0)) continue;
        for (let c = 0; c < C; c++) next[c] += (pi[c] * l[c]) / tot / L.length;
      }
      pi = next;
    }
    return pi.map((p) => (1 - floor) * p + floor / C);
  }

  /**
   * Smoothed level for one grid cell: the posterior of the true level at each observation in `ks`
   * given ALL observations, for the results charts (core/results.js). Display only: nothing here
   * feeds an estimate or a decision rule.
   *
   * Same model and filter as localLevel, run once forward with its state stored; for each k the
   * stored state gets a fifth component, a copy of the level at run k that then stays fixed (the
   * trick localLevel uses for level_1), and the filter continues to the end. That copy's posterior
   * is the smoothed level. Exact; O(n·|ks|) per cell.
   * Returns per k: { level: { m, s }, change: { m, s } } (change = level_k − level_1).
   */
  function smoothCell(obs, drift, noise, practiceSd, trendSd, practiceDecay, ks) {
    const n2 = noise * noise;
    const p2 = (practiceSd || 0) ** 2;
    const b2 = trendSd * trendSd;
    const o1 = obs[0];
    const a = p2 + n2 + (o1.v || 0);
    // One filter step on a state of any size (component 0 the level, 2 practice, 3 trend).
    const step = (m, P, k) => {
      const N = m.length;
      const o = obs[k];
      const dt = Math.max(0, o.t - obs[k - 1].t);
      if (b2 > 0) {
        m[0] += dt * m[3];
        const r0 = P[0].map((x, j) => x + dt * P[3][j]);
        for (let j = 0; j < N; j++) P[0][j] = r0[j];
        for (let i = 0; i < N; i++) P[i][0] = i === 0 ? r0[0] + dt * r0[3] : r0[i];
      }
      P[0][0] += drift * dt;
      const w = practiceDecay > 0 ? Math.exp(-k / practiceDecay) : 0;
      const S = P[0][0] + 2 * w * P[0][2] + w * w * P[2][2] + n2 + (o.v || 0);
      const e = o.y - m[0] - w * m[2];
      const row = P[0].map((x, j) => x + w * P[2][j]);
      for (let i = 0; i < N; i++) {
        const Ki = (P[i][0] + w * P[i][2]) / S;
        m[i] += Ki * e;
        for (let j = 0; j < N; j++) P[i][j] -= Ki * row[j];
      }
    };
    // Forward pass: the filtered state [level, level_1, practice, trend] after each observation.
    const stored = [];
    const m = [o1.y, o1.y, 0, 0];
    const P = [
      [a, a, -p2, 0],
      [a, a, -p2, 0],
      [-p2, -p2, p2, 0],
      [0, 0, 0, b2],
    ];
    stored.push({ m: m.slice(), P: P.map((r) => r.slice()) });
    for (let k = 1; k < obs.length; k++) {
      step(m, P, k);
      stored.push({ m: m.slice(), P: P.map((r) => r.slice()) });
    }
    return ks.map((k) => {
      const st = stored[k];
      const m5 = st.m.concat(st.m[0]);
      const P5 = st.P.map((r) => r.concat(r[0]));
      P5.push(P5[0].slice());
      for (let j = k + 1; j < obs.length; j++) step(m5, P5, j);
      const cv = P5[4][4] + P5[1][1] - 2 * P5[1][4];
      return { level: { m: m5[4], s: Math.sqrt(Math.max(P5[4][4], 0)) }, change: { m: m5[4] - m5[1], s: Math.sqrt(Math.max(cv, 0)) } };
    });
  }

  /**
   * Smoothed level path, mixed over a fit's grid cells (the same weights the estimates use).
   * Long series are evaluated at up to maxPoints evenly spread observations (always the first and
   * last); the chart joins them. Cells are taken in order of weight until `mass` is covered.
   * opts: the fit's { driftGrid, noiseGrid, practiceSd, trendSd, practiceDecay }.
   * Returns [{ k, t, mean, lo, hi }] (89% by default).
   */
  function levelPath(obs, f, opts, { maxPoints = 80, mass = 0.999, level = LEVEL } = {}) {
    if (!obs || obs.length < 2 || !f) return [];
    const n = obs.length;
    const ks = n <= maxPoints ? [...Array(n).keys()] : [...new Set(Array.from({ length: maxPoints }, (_, i) => Math.round((i * (n - 1)) / (maxPoints - 1))))];
    const ranked = f.weights.map((w, c) => ({ w, c })).sort((x, y) => y.w - x.w);
    const cells = [];
    let cum = 0;
    for (const x of ranked) {
      if (cum >= mass || !(x.w > 0)) break;
      cells.push(x);
      cum += x.w;
    }
    const per = cells.map(({ w, c }) => {
      const cl = f.cells[c];
      return { w: w / cum, r: smoothCell(obs, opts.driftGrid[cl.i], opts.noiseGrid[cl.j], opts.practiceSd || 0, opts.trendSd || 0, opts.practiceDecay || 0, ks) };
    });
    return ks.map((k, idx) => {
      const s = mixture(per.map((p) => ({ w: p.w, m: p.r[idx].level.m, s: p.r[idx].level.s })), level);
      return { k, t: obs[k].t, mean: s.mean, lo: s.lo, hi: s.hi };
    });
  }

  WW.bayes = { LEVEL, normCdf, logspace, localLevel, phaseSlopes, fit, withPrior, mixture, summary, pool, smoothCell, levelPath };
})(globalThis);
