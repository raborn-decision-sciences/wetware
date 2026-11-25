/* Informant (INFERENCE / KERNEL): updating beliefs on evidence, with base rates.
 *
 * Each round a shipment is either rigged (most of its chips marked) or clean
 * (few marked). Vex says how many shipments are rigged this month (the
 * prior). Chips are drawn one at a time; after some draws you say how likely
 * the shipment is rigged. Every answer is scored against the Bayesian
 * posterior, and the session reports two classic distortions by regressing
 * your log-odds on the prior and evidence log-odds (Bayes = 1 and 1):
 *   - weight on evidence below 1 is conservatism (Edwards 1968), above 1 overreaction;
 *   - weight on the prior below 1 is base-rate neglect (Kahneman & Tversky 1973).
 * Feedback after each round shows the exact answer beside yours. Feedback
 * training improves probabilistic reasoning on similar problems (Sedlmeier &
 * Gigerenzer 2001); far transfer is unknown: grade C.
 */
(function (root) {
  'use strict';
  const WW = root.WW;

  const ROUNDS = 10;
  const ASK_AFTER = [1, 3, 6];
  const MAX_LEVEL = 4;

  /** Level -> evidence strength and prior range. Higher: weaker chips, more extreme priors. */
  const params = (level) => {
    const q = [[0.8, 0.2], [0.75, 0.25], [0.7, 0.3], [0.65, 0.35], [0.6, 0.4]][Math.min(level, MAX_LEVEL)];
    const priors = level === 0 ? [0.5] : level === 1 ? [0.3, 0.5, 0.7] : [0.1, 0.2, 0.3, 0.5, 0.7, 0.8, 0.9];
    return { qRigged: q[0], qClean: q[1], priors };
  };

  const logit = (p) => Math.log(p / (1 - p));
  const clampP = (p) => Math.min(0.99, Math.max(0.01, p));

  /** P(rigged | draws), draws as booleans (true = marked chip). */
  function posterior(prior, qRigged, qClean, draws) {
    let lo = logit(prior);
    for (const m of draws) lo += m ? Math.log(qRigged / qClean) : Math.log((1 - qRigged) / (1 - qClean));
    return 1 / (1 + Math.exp(-lo));
  }

  /** One round: truth drawn from the prior, then chips from the true shipment. */
  function makeRound(rng, p) {
    const prior = rng.pick(p.priors);
    const rigged = rng.chance(prior);
    const q = rigged ? p.qRigged : p.qClean;
    const draws = Array.from({ length: Math.max(...ASK_AFTER) }, () => rng.chance(q));
    return { prior, rigged, draws };
  }

  /**
   * Least squares: your log-odds = intercept + priorWeight * prior log-odds + evidenceWeight * evidence log-odds.
   * Returns null without enough spread (e.g. level 0, where every prior is 50%).
   */
  function fitWeights(answers) {
    if (answers.length < 6) return null;
    // Every prior the same (level 0): fit evidence alone; prior weight is not identifiable.
    if (new Set(answers.map((a) => a.priorLo)).size === 1) {
      const xs = answers.map((a) => a.evidenceLo);
      const ys = answers.map((a) => logit(clampP(a.answer)) - a.priorLo);
      const mx = xs.reduce((s, x) => s + x, 0) / xs.length;
      const my = ys.reduce((s, y) => s + y, 0) / ys.length;
      const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
      if (sxx < 1e-9) return null;
      const b = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / sxx;
      return { intercept: my - b * mx, priorWeight: null, evidenceWeight: b };
    }
    const rows = answers.map((x) => [1, x.priorLo, x.evidenceLo, logit(clampP(x.answer))]);
    const XtX = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const Xty = [0, 0, 0];
    for (const r of rows)
      for (let i = 0; i < 3; i++) {
        Xty[i] += r[i] * r[3];
        for (let j = 0; j < 3; j++) XtX[i][j] += r[i] * r[j];
      }
    const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const D = det(XtX);
    if (Math.abs(D) < 1e-6) return null;
    const solve = (k) => det(XtX.map((row, i) => row.map((v, j) => (j === k ? Xty[i] : v)))) / D;
    return { intercept: solve(0), priorWeight: solve(1), evidenceWeight: solve(2) };
  }

  function nextLevel(level, meanAbsErr) {
    if (meanAbsErr <= 0.08) return Math.min(MAX_LEVEL, level + 1);
    if (meanAbsErr > 0.2) return Math.max(0, level - 1);
    return level;
  }

  WW.logic = WW.logic || {};
  WW.logic.informant = { params, posterior, makeRound, fitWeights, nextLevel, logit, ASK_AFTER };

  WW.games.register({
    id: 'informant',
    name: 'Informant',
    headline: (s) => `off Bayes by ${Math.round(s.meanAbsErr * 100)} pts · level ${s.level}`,
    /**
     * Tune: (level + accuracy) / (MAX_LEVEL + 1), where accuracy = 1 - mean absolute error / 0.25.
     * The level carries the skill (the staircase holds error near its band); accuracy places you within it.
     */
    tune(sessions) {
      const v = sessions
        .slice(0, 5)
        .map((s) => s.summary)
        .filter((x) => x && Number.isFinite(x.meanAbsErr) && Number.isFinite(x.level))
        .map((x) => (x.level + WW.stats.clamp01(1 - x.meanAbsErr / 0.25)) / (MAX_LEVEL + 1));
      return v.length ? WW.stats.clamp01(WW.stats.mean(v)) : null;
    },
    mount(container, ctx) {
      const { h, clear } = ctx.ui;
      const S = WW.stats;
      const ac = new AbortController();
      const signal = ac.signal;
      const rng = ctx.rng;

      const chipRow = (draws) => h('div.inf-chips', draws.map((m) => h('span', { class: 'inf-chip ' + (m ? 'marked' : 'plain'), title: m ? 'marked' : 'plain' }, m ? '✕' : '○')));

      function askEstimate(view, draws, prior) {
        return new Promise((resolve) => {
          const out = h('b.inf-val', '50%');
          const slider = h('input.inf-slider', { type: 'range', min: '1', max: '99', step: '1', value: '50', 'aria-label': 'Chance the shipment is rigged, percent' });
          const show = () => (out.textContent = slider.value + '%');
          slider.addEventListener('input', show);
          const go = h('button.btn.primary', { type: 'button' }, 'Lock it in');
          const t0 = performance.now();
          let finished = false;
          const finish = (v) => {
            if (finished) return;
            finished = true;
            root.removeEventListener('keydown', onKey, true);
            resolve(v);
          };
          const onKey = (e) => {
            if (e.code === 'Enter') {
              e.preventDefault();
              finish({ answer: +slider.value / 100, rt: performance.now() - t0 });
            } else if ((e.code === 'ArrowLeft' || e.code === 'ArrowRight') && root.document.activeElement !== slider) {
              e.preventDefault();
              slider.value = String(+slider.value + (e.code === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 10 : 1));
              show();
            }
          };
          root.addEventListener('keydown', onKey, true);
          signal.addEventListener('abort', () => finish(null));
          go.addEventListener('click', () => finish({ answer: +slider.value / 100, rt: performance.now() - t0 }));
          clear(view);
          view.append(
            h('p.label', `Vex: ${Math.round(prior * 100)}% of shipments this month are rigged`),
            chipRow(draws),
            h('p', `${draws.length} chip${draws.length > 1 ? 's' : ''} drawn, ${draws.filter(Boolean).length} marked. How likely is this shipment rigged?`),
            h('div.inf-ask', slider, out),
            go,
            h('p.muted.small', 'Arrows nudge (Shift for 10); Enter locks it in.')
          );
          slider.focus({ preventScroll: true });
        });
      }

      (async () => {
        const saved = await ctx.loadState('progress', { level: 0, sessions: 0 });
        const p = params(saved.level);
        if (
          !(await WW.screens.intro(container, {
            kicker: 'INFERENCE · KERNEL · updating on evidence',
            title: 'Informant',
            body: [
              `A shipment of chips is either rigged (${Math.round(p.qRigged * 100)}% of its chips marked ✕) or clean (${Math.round(p.qClean * 100)}% marked). Vex tells you how many shipments are rigged this month.`,
              `Chips come out one at a time. After ${ASK_AFTER.join(', ')} chips, say how likely this shipment is rigged. Use both: what Vex said and what you have seen.`,
              'After each shipment you see the exact answer next to yours.',
            ],
            kv: [
              ['Session', `${ROUNDS} shipments, ${ROUNDS * ASK_AFTER.length} estimates, about 5 min`],
              ['Level', `${saved.level}: chips ${Math.round(p.qRigged * 100)} / ${Math.round(p.qClean * 100)}% marked`],
            ],
            button: 'Start',
            signal,
          }))
        )
          return;
        const answers = [];
        const view = h('div.center');
        clear(container);
        container.append(view);
        for (let r = 0; r < ROUNDS; r++) {
          const round = makeRound(rng, p);
          const mine = [];
          for (const k of ASK_AFTER) {
            const draws = round.draws.slice(0, k);
            const res = await askEstimate(view, draws, round.prior);
            if (!res) return;
            const bayes = posterior(round.prior, p.qRigged, p.qClean, draws);
            const a = { round: r, k, prior: round.prior, answer: res.answer, bayes, priorLo: logit(round.prior), evidenceLo: logit(bayes) - logit(round.prior) };
            answers.push(a);
            mine.push(a);
            ctx.session.trial({
              condition: `after-${k}`,
              stimulus: { prior: round.prior, draws, qRigged: p.qRigged, qClean: p.qClean, bayes: S.round(bayes, 3), rigged: round.rigged },
              response: res.answer,
              correct: Math.abs(res.answer - bayes) <= 0.1,
              rt: res.rt,
              level: saved.level,
            });
          }
          clear(view);
          const cont = h('button.btn.primary', { type: 'button' }, r + 1 < ROUNDS ? 'Next shipment' : 'Debrief');
          view.append(
            h('p.label', `Shipment ${r + 1} / ${ROUNDS} · it was ${round.rigged ? 'RIGGED' : 'clean'}`),
            chipRow(round.draws),
            WW.screens.kvList(mine.map((a) => [`after ${a.k}`, `you ${Math.round(a.answer * 100)}% · exact ${Math.round(a.bayes * 100)}%`])),
            cont
          );
          cont.focus({ preventScroll: true });
          if (!(await WW.screens.waitForButton(cont, signal))) return;
        }
        const errs = answers.map((a) => Math.abs(a.answer - a.bayes));
        const fit = fitWeights(answers);
        const summary = {
          level: saved.level,
          estimates: answers.length,
          meanAbsErr: S.round(S.mean(errs), 3),
          within10: S.round(errs.filter((e) => e <= 0.1).length / errs.length, 3),
          evidenceWeight: fit ? S.round(fit.evidenceWeight, 2) : null,
          priorWeight: fit ? S.round(fit.priorWeight, 2) : null,
        };
        const next = nextLevel(saved.level, summary.meanAbsErr);
        const describe = (w, what) => (w == null ? 'n/a this level (every rate is 50%)' : w < 0.8 ? `${w} (too little ${what})` : w > 1.25 ? `${w} (too much ${what})` : `${w} (about right)`);
        const choice = await WW.screens.results(container, {
          headline: `${Math.round(summary.meanAbsErr * 100)} PTS OFF BAYES`,
          tone: summary.meanAbsErr <= 0.12 ? 'good' : 'warn',
          kv: [
            ['Within 10 points', `${Math.round(summary.within10 * 100)}% of estimates`],
            ['Weight on the chips', describe(summary.evidenceWeight, 'updating')],
            ['Weight on Vex’s rate', describe(summary.priorWeight, 'base rate')],
            ['Level', `${saved.level} → ${next}`],
          ],
          notes: ['A weight of 1 is exactly Bayesian. Most people under-update on evidence and under-use base rates.'],
          signal,
        });
        if (choice === 'save') {
          await ctx.saveState('progress', { level: next, sessions: saved.sessions + 1 });
          ctx.finish(summary);
        } else ctx.abort();
      })().catch((e) => console.error(e));

      return {
        stop() {
          ac.abort();
        },
      };
    },
  });
})(globalThis);
