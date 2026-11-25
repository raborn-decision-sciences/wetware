/* Wetware core: the ABCABC study (PLAN §6, docs/STUDY.md).
 *
 * A within-person design for "does training transfer, and is it specific to what I trained?"
 * The domains the diagnostic probes measure are split into three arms. Training focuses on one
 * arm per period, in two cycles (six periods), with the order drawn at random within each cycle
 * (no arm twice in a row). Every probe is retested on a fixed schedule, so each arm's probes are
 * measured both while their arm is trained and while it isn't.
 *
 * Learning doesn't reverse, so the prediction is a staircase: an arm's probes gain during its own
 * periods and stay flat during the others. Retest practice and slow drift (sleep, season,
 * motivation) affect every period alike and cancel in the comparison.
 *
 * Analysis per probe measure: the posterior of (gain per period of own-arm training) − (gain per
 * period of other-arm training), from the local-level model of core/reliable.js plus those two
 * slopes (an interrupted time series). When all six periods are done, a randomization test over
 * the 24 orders the draw could have produced (Edgington & Onghena).
 *
 * The arms are split so no training module trains two arms: Firewall (inhibition + attention),
 * Flashpoint (speed + attention), Heist Ledger (working memory + spatial) and Rule Forge
 * (switching + reasoning) each keep both of their domains in one arm. Modules whose domains no
 * probe measures belong to no arm and may be played in every period.
 */
(function (root) {
  'use strict';
  const WW = (root.WW = root.WW || {});
  const DAY = 864e5;
  const WEEK = 7 * DAY;

  const ARMS = [
    { id: 'A', name: 'Speed & control', domains: ['clock', 'optics', 'firewall'] },
    { id: 'B', name: 'Memory & spatial', domains: ['ram', 'gyro'] },
    { id: 'C', name: 'Switching & reasoning', domains: ['scheduler', 'inference'] },
  ];

  // Period length and probe interval. The first is the default: 3 probe points per period, the
  // minimum the single-case design standards ask for (Kratochwill et al., 2010).
  const PRESETS = [
    { id: '3w', periodWeeks: 3, probeEveryWeeks: 1, label: '3-week periods, probes weekly', note: '' },
    {
      id: '4w',
      periodWeeks: 4,
      probeEveryWeeks: 2,
      label: '4-week periods, probes every 2 weeks',
      note: 'Two probe points per period instead of three, so the estimates are less precise, and longer periods leave more room for slow drift (season, motivation) to build up within a period.',
    },
    {
      id: '6w',
      periodWeeks: 6,
      probeEveryWeeks: 3,
      label: '6-week periods, probes every 3 weeks',
      note: 'Two probe points per period, spread over about eight months: the least precise option, and the most exposed to slow drift and life events.',
    },
  ];
  const PERIODS = 6;
  const OPEN_BEFORE = 2 * DAY; // a probe point opens this long before its date
  const STALE = 7 * DAY; // at the start, re-probe if the last run is older than this
  // Prior SD of the gain per period of training, in SEMs: effectively flat. A sceptical SD of 1
  // shrank estimates to about 45% with power under 8% (docs/SIMULATION.md, round 1); flat was
  // unbiased with nominal 89% coverage in every core cell.
  const SLOPE_SD = 100;

  const C = () => WW.catalog;
  const probedDomains = () => new Set(C().DIAGNOSTICS.map((d) => d.subsystem));

  /** Which arm a subsystem belongs to (null for domains no probe measures). */
  function armOfDomain(sub) {
    const a = ARMS.find((x) => x.domains.includes(sub));
    return a ? a.id : null;
  }

  /** Arm of a training module: 'A' | 'B' | 'C', null (no probed domain), or 'mixed' (should never happen). */
  function armOfModule(m) {
    const arms = new Set(m.primary.map(armOfDomain).filter(Boolean));
    return arms.size === 0 ? null : arms.size === 1 ? [...arms][0] : 'mixed';
  }

  function armOfProbe(id) {
    const d = C().PROBES.find((x) => x.id === id);
    return d ? armOfDomain(d.subsystem) : null;
  }

  /** { A: { modules: [ids], probes: [ids] }, ..., neutral: [ids] } */
  function layout() {
    const out = { neutral: [] };
    for (const a of ARMS) out[a.id] = { modules: [], probes: [] };
    for (const m of C().MODULES) {
      const a = armOfModule(m);
      if (a === null) out.neutral.push(m.id);
      else if (a !== 'mixed') out[a].modules.push(m.id);
    }
    for (const d of C().DIAGNOSTICS) {
      const a = armOfDomain(d.subsystem);
      if (a) out[a].probes.push(d.id);
    }
    return out;
  }

  const preset = (study) => PRESETS.find((p) => p.id === study.preset) || PRESETS[0];

  /** Every order the draw allows: a permutation per cycle, the second not starting with the first's last arm. */
  function allOrders() {
    const perms = [];
    const ids = ARMS.map((a) => a.id);
    const permute = (rest, acc) => (rest.length ? rest.forEach((x, i) => permute(rest.filter((_, j) => j !== i), acc.concat(x))) : perms.push(acc));
    permute(ids, []);
    const out = [];
    for (const p1 of perms) for (const p2 of perms) if (p2[0] !== p1[p1.length - 1]) out.push(p1.concat(p2));
    return out;
  }

  /** Local midnight at or before ts. */
  function midnight(ts) {
    const d = new Date(ts);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }

  /** A new study starting today (local midnight), with its order drawn at random. */
  function create({ now, presetId = PRESETS[0].id, followContract = true, seed }) {
    const orders = allOrders();
    const rng = WW.rng.create(seed != null ? seed : 'study:' + now);
    return { v: 1, startAt: midnight(now), preset: presetId, order: orders[rng.int(0, orders.length - 1)], followContract, createdAt: now };
  }

  const periodMs = (study) => preset(study).periodWeeks * WEEK;
  const endAt = (study) => (study.endedAt ? Math.min(study.endedAt, study.startAt + PERIODS * periodMs(study)) : study.startAt + PERIODS * periodMs(study));

  /** Period boundaries: PERIODS + 1 times from start to end. */
  function boundaries(study) {
    return Array.from({ length: PERIODS + 1 }, (_, k) => study.startAt + k * periodMs(study));
  }

  /**
   * Where the study stands at `now`:
   * { state: 'running' | 'done' | 'ended', index, arm, periodStart, periodEnd, week, weeks }.
   */
  function status(study, now) {
    const P = periodMs(study);
    if (study.endedAt && study.endedAt <= now && study.endedAt < study.startAt + PERIODS * P) return { state: 'ended', index: Math.min(PERIODS - 1, Math.floor((study.endedAt - study.startAt) / P)) };
    const index = Math.floor((now - study.startAt) / P);
    if (index >= PERIODS) return { state: 'done', index: PERIODS - 1 };
    const i = Math.max(0, index);
    const periodStart = study.startAt + i * P;
    return { state: 'running', index: i, arm: study.order[i], periodStart, periodEnd: periodStart + P, week: Math.floor((now - periodStart) / WEEK) + 1, weeks: preset(study).periodWeeks };
  }

  /** Probe points: the start, then every probeEveryWeeks to the end. */
  function probePoints(study) {
    const step = preset(study).probeEveryWeeks * WEEK;
    const n = (PERIODS * preset(study).periodWeeks) / preset(study).probeEveryWeeks;
    return Array.from({ length: n + 1 }, (_, k) => study.startAt + k * step);
  }

  /**
   * Is a probe due under the study schedule? lastRunAt: its latest run (or null).
   * The latest point that has opened (2 days before its date) needs a run since it opened; the
   * start point only needs one if the last run is more than a week old.
   * Returns { due, point, next } (next: the next point's date, or null at the end).
   */
  function probeDue(study, lastRunAt, now) {
    const pts = probePoints(study).filter((p) => p <= endAt(study));
    let k = -1;
    for (let i = 0; i < pts.length; i++) if (pts[i] - (i ? OPEN_BEFORE : 0) <= now) k = i;
    const next = pts.find((p) => p - OPEN_BEFORE > now) || null;
    if (k < 0) return { due: false, point: null, next };
    const opened = k === 0 ? pts[0] - STALE : pts[k] - OPEN_BEFORE;
    return { due: !(lastRunAt >= opened), point: pts[k], next };
  }

  /** Is this training module off-protocol during the current period? */
  function offArm(study, moduleId, now) {
    const st = status(study, now);
    if (st.state !== 'running') return false;
    const m = C().MODULES.find((x) => x.id === moduleId);
    if (!m) return false;
    const a = armOfModule(m);
    return a !== null && a !== st.arm;
  }

  /** Training sessions per period that trained a different arm (off-protocol free play). */
  function offArmCounts(study, sessions) {
    const b = boundaries(study);
    const out = new Array(PERIODS).fill(0);
    for (const s of sessions) {
      const m = C().MODULES.find((x) => x.id === s.game);
      if (!m) continue;
      const k = b.findIndex((t, i) => i < PERIODS && s.startedAt >= t && s.startedAt < b[i + 1]);
      if (k < 0 || s.startedAt >= endAt(study)) continue;
      const a = armOfModule(m);
      if (a !== null && a !== study.order[k]) out[k]++;
    }
    return out;
  }

  /** Cumulative exposure at absolute time T: [periods of `arm` trained, periods of other arms trained]. */
  function exposure(study, order, arm, T) {
    const P = periodMs(study);
    const stop = Math.min(T, endAt(study));
    const e = [0, 0];
    for (let k = 0; k < PERIODS; k++) {
      const x = Math.min(Math.max((stop - (study.startAt + k * P)) / P, 0), 1);
      e[order[k] === arm ? 0 : 1] += x;
    }
    return e;
  }

  /** Posterior of own − other slope for one measure under one order, mixed over the grid. */
  function contrastFor(study, order, arm, m, u, slopeSd = SLOPE_SD) {
    const B = WW.bayes;
    const sign = m.better === 'lower' ? -1 : 1;
    const expo = (tDays) => exposure(study, order, arm, u.t0 + tDays * DAY);
    const cells = [];
    for (let i = 0; i < u.driftGrid.length; i++)
      for (let j = 0; j < u.noiseGrid.length; j++) {
        const r = B.phaseSlopes(u.obs, u.driftGrid[i], u.noiseGrid[j], u.practiceSd, expo, u.S * slopeSd);
        cells.push({ i, j, loglik: r.loglik, r });
      }
    const f = B.withPrior(cells, u.logPrior);
    const comp = (fn) => B.mixture(cells.map((cl, k) => Object.assign({ w: f.weights[k] }, fn(cl.r))));
    const con = comp((r) => ({ m: sign * (r.b[0] - r.b[1]), s: Math.sqrt(Math.max(r.cov[0][0] + r.cov[1][1] - 2 * r.cov[0][1], 0)) }));
    const own = comp((r) => ({ m: sign * r.b[0], s: Math.sqrt(Math.max(r.cov[0][0], 0)) }));
    const other = comp((r) => ({ m: sign * r.b[1], s: Math.sqrt(Math.max(r.cov[1][1], 0)) }));
    return { con, own, other };
  }

  /**
   * Arm-specific transfer per probe measure. runsByProbe: { dxId: [{ startedAt, summary }] } with
   * flagged runs removed. Model: core/bayes.js phaseSlopes, i.e. the local-level model of
   * core/reliable.js plus a gain per period of own-arm training and a gain per period of other-arm
   * training (flat priors, SLOPE_SD); the random walk keeps absorbing slow drift.
   * Returns { rows, periodsDone, randomization }; each row, in the "better" direction
   * (positive = improvement), per period of training:
   * { probe, arm, key, label, unit, better, S, mean, lo, hi, pSpecific, own: {mean, lo, hi}, other: {...} }
   * A row needs at least one completed period of its own arm and one of another.
   */
  function analyse(study, runsByProbe, now, { test = true, slopeSd = SLOPE_SD, setup: setupOpts } = {}) {
    const R = WW.reliable;
    const b = boundaries(study);
    const stop = Math.min(now, endAt(study));
    const periodsDone = b.slice(1).filter((t) => t <= stop).length;
    const rows = [];
    const fits = [];
    for (const d of C().PROBES) {
      const arm = armOfDomain(d.subsystem);
      const ks = [...Array(periodsDone).keys()];
      if (!ks.some((k) => study.order[k] === arm) || !ks.some((k) => study.order[k] !== arm)) continue;
      const runs = (runsByProbe[d.id] || []).filter((r) => r.startedAt <= stop + OPEN_BEFORE);
      for (const m of R.MEASURES[d.id] || []) {
        const u = R.setup(m, runs, setupOpts);
        if (!u) continue;
        const c = contrastFor(study, study.order, arm, m, u, slopeSd);
        fits.push({ arm, m, u });
        rows.push({
          probe: d.id,
          arm,
          key: m.key,
          label: m.label,
          unit: m.unit,
          better: m.better,
          S: u.S,
          n: u.obs.length,
          mean: c.con.mean,
          lo: c.con.lo,
          hi: c.con.hi,
          pSpecific: c.con.pAbove,
          own: { mean: c.own.mean, lo: c.own.lo, hi: c.own.hi },
          other: { mean: c.other.mean, lo: c.other.lo, hi: c.other.hi },
        });
      }
    }
    const randomization = test && periodsDone === PERIODS && fits.length ? randomize(study, fits, slopeSd) : null;
    return { rows, periodsDone, randomization };
  }

  /**
   * Randomization test (Edgington & Onghena): the statistic (sum over measures of the posterior
   * mean own − other contrast, in SEM units) refitted under every order the draw could have
   * produced. p = share of orders with a statistic at least as large (smallest possible: 1/24).
   */
  function randomize(study, fits, slopeSd) {
    const stat = (order) => fits.reduce((acc, f) => acc + contrastFor(study, order, f.arm, f.m, f.u, slopeSd).con.mean / f.u.S, 0);
    const orders = allOrders();
    const obs = stat(study.order);
    const ge = orders.filter((o) => stat(o) >= obs - 1e-9).length;
    return { stat: obs, p: ge / orders.length, orders: orders.length };
  }

  WW.study = { ARMS, PRESETS, PERIODS, layout, armOfModule, armOfProbe, allOrders, create, status, boundaries, probePoints, probeDue, offArm, offArmCounts, analyse, exposure, endAt, preset, SLOPE_SD };
})(globalThis);
