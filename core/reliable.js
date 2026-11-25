/* Wetware core: change in the diagnostic probes over time (Bayesian, via core/bayes.js).
 *
 * "How far has my true level moved since the first run?" Every run counts, not just the first
 * and latest. The answer is a posterior: an 89% interval and the probability of improvement.
 *
 * Measurement error is where the empirical part comes in (full derivations: docs/RELIABLE_CHANGE.md):
 *  - The prior on each probe's noise is the published retest error of a computerized version of
 *    the same task, scaled to our length (conservative: it treats all published error as trial
 *    noise). It counts as NU0 runs; your own run-to-run spread outweighs it after a few runs.
 *  - The two item tests with parallel forms (matrices, paper folding) use Lord's binomial error
 *    of each run's own score (Lord, 1957) as known error.
 *  - Corsi backward has no published retest value for a matching procedure: it gets a weak prior
 *    borrowed from forward span, worth one run, so its interval starts wide.
 * The first run gets a practice offset, so getting used to the task isn't read as change.
 */
(function (root) {
  'use strict';
  const WW = (root.WW = root.WW || {});

  // SEM from a published between-person SD and retest reliability: SD * sqrt(1 - r).
  const semOf = (sd, r) => sd * Math.sqrt(1 - r);
  // Lord's binomial SEM for x correct of k items; x kept off the floor and ceiling so a perfect
  // or zero score doesn't claim zero error.
  const lord = (x, k) => {
    if (!(k > 1) || !Number.isFinite(x)) return null;
    const c = Math.min(Math.max(x, 0.5), k - 0.5);
    return Math.sqrt((c * (k - c)) / (k - 1));
  };

  // Woods, Wyma, Yund & Herron (2015), Front Hum Neurosci 9:595, Exp 1: CRT SD 61.9 / 55.4 / 62.4 ms
  // over three weekly sessions, ICC .89; 140 trials (mean RT). Ours: 40 trials.
  const CRT_SEM = semOf((61.9 + 55.4 + 62.4) / 3, 0.89) * Math.sqrt(140 / 40);
  // Woods, Wyma, Herron & Yund (2016), Front Hum Neurosci 9:690, Exp 1: maximal span before two
  // successive misses, SD 1.32, ICC .68.
  const CORSI_FWD_SEM = semOf(1.32, 0.68);
  // Woods et al. (2011), J Clin Exp Neuropsychol 33:101-111, Exp 1: two-error maximum length,
  // forward SD 0.88, r .39; backward SD 1.42, r .67.
  const DS_FWD_SEM = semOf(0.88, 0.39);
  const DS_BWD_SEM = semOf(1.42, 0.67);
  // Hedge, Powell & Sumner (2018), Behav Res Methods 50:1166-1186, Table 1: Stroop RT cost SEM
  // 21 ms (Study 1) and 24 ms (Study 2), 240 trials per condition. Ours: 40 per condition.
  const STROOP_SEM = Math.sqrt((21 * 21 + 24 * 24) / 2) * Math.sqrt(240 / 40);
  // Woods, Wyma, Herron & Yund (2015), PLoS ONE 10:e0124345, Exp 2: within-subject SD of
  // completion time over three weekly sessions, A 2.67 s, B 5.34 s (25 circles). Errors in A and
  // B are independent, so B - A combines them. Ours: 20 circles.
  const TRAILS_SEM = Math.sqrt(2.67 ** 2 + 5.34 ** 2) * 1000 * Math.sqrt(20 / 25);
  // Robertson et al. (1997), Neuropsychologia 35:747-758, p. 749: SART errors SD 4.88, one-week
  // retest r .76, 25 no-go trials. As a proportion of no-go trials, rescaled to ours.
  const SART_SEM_PROP = semOf(4.88, 0.76) / 25;

  const SOURCES = {
    crt: 'Woods et al. 2015 (Front Hum Neurosci)',
    corsi: 'Woods et al. 2016',
    ds: 'Woods et al. 2011',
    stroop: 'Hedge, Powell & Sumner 2018',
    trails: 'Woods et al. 2015 (PLoS ONE)',
    sart: 'Robertson et al. 1997',
    lord: 'binomial error, Lord 1957',
  };

  // Per probe: the measures tracked. better: which direction is an improvement.
  const MEASURES = {
    'dx-choice-rt': [{ key: 'medianRt', label: 'median RT', unit: 'ms', better: 'lower', sem: () => CRT_SEM, source: SOURCES.crt }],
    'dx-corsi': [
      { key: 'fwdSpan', label: 'forward span', unit: '', better: 'higher', sem: () => CORSI_FWD_SEM, source: SOURCES.corsi },
      // No published retest data for backward Corsi: a weak prior (worth 1 run) borrowed from forward span.
      // minRuns: shown only from run 15 (simulation round 5, rule 10: at twice the borrowed noise the
      // intervals hold from 15 runs, not from 4 or 6).
      { key: 'bwdSpan', label: 'backward span', unit: '', better: 'higher', sem: () => null, borrow: () => CORSI_FWD_SEM, nu0: 1, minRuns: 15, source: 'weak prior from forward span (no published data)' },
    ],
    'dx-digit-span': [
      { key: 'fwdSpan', label: 'forward span', unit: '', better: 'higher', sem: () => DS_FWD_SEM, source: SOURCES.ds },
      { key: 'bwdSpan', label: 'backward span', unit: '', better: 'higher', sem: () => DS_BWD_SEM, source: SOURCES.ds },
    ],
    'dx-stroop': [{ key: 'interference', label: 'interference', unit: 'ms', better: 'lower', sem: () => STROOP_SEM, source: SOURCES.stroop }],
    // No published retest data for this spatial Stroop: a weak prior (worth 1 run) borrowed from the
    // colour Stroop's, as for backward Corsi. Same trial counts, so no rescaling.
    // Shown only from run 15, as backward Corsi (simulation round 5, rule 10).
    'dx-stroop-spatial': [{ key: 'interference', label: 'interference', unit: 'ms', better: 'lower', sem: () => null, borrow: () => STROOP_SEM, nu0: 1, minRuns: 15, source: 'weak prior from the colour Stroop (no published data)' }],
    'dx-trails': [{ key: 'diffMs', label: 'B − A', unit: 'ms', better: 'lower', sem: () => TRAILS_SEM, source: SOURCES.trails }],
    'dx-paper-folding': [
      // score = correct - wrong/4 = 1.25 * correct - items/4 when every item is answered.
      { key: 'score', label: 'corrected score', unit: '', better: 'higher', sem: (s) => (lord(s.correct, s.items) == null ? null : 1.25 * lord(s.correct, s.items)), source: SOURCES.lord },
    ],
    'dx-matrix': [{ key: 'correct', label: 'correct', unit: '', better: 'higher', sem: (s) => lord(s.correct, s.items), source: SOURCES.lord }],
    'dx-sart': [
      { key: 'commissions', label: 'commission errors', unit: '', better: 'lower', sem: (s) => (s.nogoTrials > 0 ? SART_SEM_PROP * Math.sqrt(25 / s.nogoTrials) * s.nogoTrials : null), source: SOURCES.sart },
    ],
  };

  const DAY = 864e5;
  // Smoothed level path for one measure's fit, computed on first call (core/bayes.js levelPath).
  const lazyPath = (u, f) => {
    let v = null;
    return () =>
      v ||
      (v = WW.bayes
        .levelPath(u.obs, f, { driftGrid: u.driftGrid, noiseGrid: u.noiseGrid, practiceSd: u.practiceSd, trendSd: u.trendSd, practiceDecay: u.practiceDecay })
        .map((p) => ({ t: u.t0 + p.t * DAY, mean: p.mean, lo: p.lo, hi: p.hi })));
  };
  const NU0 = 4; // runs' worth of weight on the published noise
  const TREND_SD = 10; // prior SD of the linear trend, SEMs per 30 days
  // What change() uses (M1.TOD, adopted by the confirmatory round 4 of docs/SIMULATION.md): a
  // linear trend, a free overdispersion term for the item tests, and practice that fades over
  // runs (weight exp(−k)). Shown only after the run-in. setup()'s own defaults stay at the
  // round-1 model, which the study's analysis was validated with.
  const CHANGE_DEFAULTS = { trend: true, overdisp: true, practiceDecay: 1 };

  /**
   * Bayesian change in one probe's measures across all its runs (core/bayes.js).
   * runs: [{ startedAt, summary }] (any order; flagged runs already removed).
   * Per measure: the posterior of (true level now) − (true level at the first run), averaged over
   * a grid of noise and drift values.
   *  - noise: prior centred on the published SEM, worth NU0 runs (scaled inverse chi-square), so
   *    your own run-to-run spread takes over as runs accumulate. Item tests use Lord's binomial
   *    error of each run as known error instead (no free noise term).
   *  - drift: how far the true level wanders per 30 days, log-uniform from 0.1 to 3 SEMs.
   *  - practice: the first run gets its own offset, prior SD one SEM, so a first-retest jump
   *    from getting used to the task is not read as change. A run-in of a few runs pins it down.
   * Returns one row per measure with at least 2 runs:
   * { key, label, unit, better, n, first, latest, mean, lo, hi, pImproved, noise, noisePrior, source }
   */
  /**
   * Model inputs for one measure of one probe: observations (t in days from the first run), the
   * prior noise scale S, grids, practice SD and log prior. null if fewer than 2 usable runs.
   * opts (for the simulation study, docs/SIMULATION.md; defaults are what ships):
   *   nu0: noise prior weight; driftRange: [lo, hi] drift SD per 30 days in SEMs; practice: practice SD in SEMs;
   *   trend: true adds a linear trend term, 'sourced' only for measures with a published SEM
   *   (off by default: it failed rules 1–2 for the item tests in round 2 of docs/SIMULATION.md);
   *   overdisp: item tests get a free extra noise term on top of Lord's error (half-normal prior,
   *   scale 0.5 SEM); practiceDecay: practice reaches later runs with weight exp(−k/τ), τ in runs.
   */
  function setup(m, runs, opts = {}) {
    const B = WW.bayes;
    const rs = runs.filter((r) => r.summary && Number.isFinite(r.summary[m.key])).sort((a, b) => a.startedAt - b.startedAt);
    if (rs.length < 2) return null;
    const t0 = rs[0].startedAt;
    const lordBased = m.source === SOURCES.lord;
    const known = lordBased ? rs.map((r) => m.sem(r.summary)) : null;
    if (lordBased && known.some((x) => x == null)) return null;
    // Prior noise scale: the sourced SEM, or (item tests) the typical binomial error of these runs.
    const S = lordBased ? Math.sqrt(known.reduce((a, x) => a + x * x, 0) / known.length) : m.sem(rs[0].summary) != null ? m.sem(rs[0].summary) : m.borrow ? m.borrow() : null;
    if (!(S > 0)) return null;
    const nu0 = opts.nu0 || m.nu0 || NU0;
    const [dLo, dHi] = opts.driftRange || [0.1, 3];
    const obs = rs.map((r, k) => ({ t: (r.startedAt - t0) / DAY, y: r.summary[m.key], v: lordBased ? known[k] ** 2 : 0 }));
    const overdisp = lordBased && opts.overdisp;
    const noiseGrid = overdisp ? Array.from({ length: 16 }, (_, j) => (j * 0.1) * S) : lordBased ? [0] : B.logspace(0.25 * S, 4 * S, 17);
    const driftGrid = B.logspace(dLo * S, dHi * S, 15).map((sd) => (sd * sd) / 30);
    // Scaled inverse chi-square(nu0, S^2) on noise^2, as mass on a log-spaced grid.
    const logPrior = overdisp ? (i, j) => -(noiseGrid[j] ** 2) / (2 * (0.5 * S) ** 2) : lordBased ? null : (i, j) => -(nu0 / 2) * Math.log(noiseGrid[j] ** 2) - (nu0 * S * S) / (2 * noiseGrid[j] ** 2);
    // Optional linear trend, prior SD 10 SEMs per 30 days: effectively flat for any plausible change.
    const trendSd = opts.trend === true || (opts.trend === 'sourced' && !lordBased) ? (TREND_SD * S) / 30 : 0;
    return { runs: rs, t0, obs, S, lordBased, noiseGrid, driftGrid, practiceSd: S * (opts.practice != null ? opts.practice : 1), trendSd, practiceDecay: opts.practiceDecay || 0, logPrior };
  }

  /**
   * Bayesian change in one probe's measures across all its runs (core/bayes.js).
   * runs: [{ startedAt, summary }] (any order; flagged runs already removed).
   * Per measure: the posterior of (true level now) − (true level at the first run), averaged over
   * a grid of noise and drift values.
   *  - noise: prior centred on the published SEM, worth NU0 runs (scaled inverse chi-square), so
   *    your own run-to-run spread takes over as runs accumulate. Item tests use Lord's binomial
   *    error of each run as known error instead (no free noise term).
   *  - drift: how far the true level wanders per 30 days, log-uniform from 0.1 to 3 SEMs.
   *  - practice: the first run gets its own offset, prior SD one SEM, so a first-retest jump
   *    from getting used to the task is not read as change. A run-in of a few runs pins it down.
   * Returns one row per measure with at least 2 runs:
   * { key, label, unit, better, n, first, latest, mean, lo, hi, pImproved, noise, noisePrior, sem, source, path() }
   * sem: the measure's noise scale S (published SEM, or the item tests' typical binomial error), for
   * putting measures on one scale. path() (computed on first call, for the results charts): the
   * smoothed true level at each run, [{ t (ms), mean, lo, hi }], with the same weights.
   */
  function change(id, runs, opts) {
    opts = Object.assign({}, CHANGE_DEFAULTS, opts);
    const ms = MEASURES[id];
    if (!ms || !runs || runs.length < 2) return [];
    const B = WW.bayes;
    const out = [];
    for (const m of ms) {
      const u = setup(m, runs, opts);
      if (!u) continue;
      const f = B.fit(u.obs, { driftGrid: u.driftGrid, noiseGrid: u.noiseGrid, practiceSd: u.practiceSd, trendSd: u.trendSd, practiceDecay: u.practiceDecay, logPrior: u.logPrior });
      const sm = B.summary(f, u.noiseGrid);
      const up = m.better === 'higher';
      out.push({
        key: m.key,
        label: m.label,
        unit: m.unit,
        better: m.better,
        n: u.obs.length,
        first: u.obs[0].y,
        latest: u.obs[u.obs.length - 1].y,
        mean: sm.change.mean,
        lo: sm.change.lo,
        hi: sm.change.hi,
        pImproved: up ? sm.change.pAbove : 1 - sm.change.pAbove,
        noise: u.lordBased ? null : sm.noise,
        // Item tests: estimated noise on top of Lord's binomial error (overdispersion), if modelled.
        extra: u.lordBased && u.noiseGrid.length > 1 ? sm.noise : null,
        noisePrior: u.lordBased ? null : u.S,
        sem: u.S,
        source: m.source,
        path: lazyPath(u, f),
      });
    }
    return out;
  }

  WW.reliable = { change, setup, CHANGE_DEFAULTS, MEASURES, NU0, _sem: { CRT_SEM, CORSI_FWD_SEM, DS_FWD_SEM, DS_BWD_SEM, STROOP_SEM, TRAILS_SEM, SART_SEM_PROP }, lord };
})(globalThis);
