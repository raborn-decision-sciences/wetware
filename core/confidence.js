/* Wetware core: the confidence layer (KERNEL).
 *
 * Games probe a fraction of trials: after the response and BEFORE any
 * feedback, the player rates how sure they are that they were right
 * (50% = guess ... 100% = certain). Ratings are logged in the trial row's
 * `confidence` field and summarized per session as [confidence, correct]
 * pairs, which the hub pools across games into a calibration score.
 *
 * Basis: Carpenter et al. (2019) calibration-feedback training; Fleming &
 * Lau (2014) on measuring metacognition; Brier (1950) scoring.
 */
(function (root) {
  'use strict';
  const WW = (root.WW = root.WW || {});

  const LEVELS = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0];

  /** Should this trial carry a probe? Respects the player's setting. */
  function shouldProbe(rng, rate) {
    const on = WW.prefs ? WW.prefs.get('confidenceProbes', true) : true;
    return on && rng.chance(rate);
  }

  /**
   * Ask for a rating. Resolves { confidence, rt } or null if aborted.
   * The overlay is appended to `container` and removed afterwards.
   */
  async function ask(container, opts) {
    const o = Object.assign({ prompt: 'How sure are you that you got that right?', signal: null }, opts || {});
    const { h } = WW.ui;
    const buttons = LEVELS.map((c, i) => h('button.btn.conf-btn', { type: 'button' }, h('kbd', String(i + 1)), Math.round(c * 100) + '%'));
    const overlay = h(
      'div.conf-overlay',
      h('p.label', 'KERNEL · confidence check'),
      h('p', o.prompt),
      h('div.row', { style: { justifyContent: 'center' } }, buttons),
      h('p.muted.small', '50% = pure guess · 100% = certain')
    );
    container.appendChild(overlay);
    const keyMap = {};
    LEVELS.forEach((c, i) => {
      keyMap['Digit' + (i + 1)] = c;
      keyMap['Numpad' + (i + 1)] = c;
    });
    const r = await WW.timing.awaitChoice({ keyMap, buttons: buttons.map((el, i) => ({ el, value: LEVELS[i] })), signal: o.signal });
    overlay.remove();
    return r.aborted ? null : { confidence: r.value, rt: r.rt };
  }

  /**
   * Calibration summary of [confidence, correct] pairs.
   * ece: expected calibration error over the six rating levels.
   * bias: mean confidence - accuracy (positive = overconfident).
   * gap: mean confidence when right - when wrong (resolution; higher is better).
   */
  function score(pairs) {
    const n = pairs.length;
    if (!n) return { n: 0, meanConf: null, accuracy: null, bias: null, brier: null, ece: null, gap: null, bins: [] };
    const acc = pairs.reduce((a, [, ok]) => a + (ok ? 1 : 0), 0) / n;
    const meanConf = pairs.reduce((a, [c]) => a + c, 0) / n;
    const brier = pairs.reduce((a, [c, ok]) => a + (c - (ok ? 1 : 0)) ** 2, 0) / n;
    const bins = LEVELS.map((c) => {
      const inBin = pairs.filter(([x]) => Math.abs(x - c) < 1e-9);
      return { c, n: inBin.length, acc: inBin.length ? inBin.filter(([, ok]) => ok).length / inBin.length : null };
    });
    const ece = bins.reduce((a, b) => a + (b.n ? (b.n / n) * Math.abs(b.acc - b.c) : 0), 0);
    const right = pairs.filter(([, ok]) => ok).map(([c]) => c);
    const wrong = pairs.filter(([, ok]) => !ok).map(([c]) => c);
    const m = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
    return {
      n,
      meanConf,
      accuracy: acc,
      bias: meanConf - acc,
      brier,
      ece,
      gap: right.length && wrong.length ? m(right) - m(wrong) : null,
      bins,
    };
  }

  /** KERNEL tune from pooled pairs: 1 = perfectly calibrated. Needs >= 20 ratings. */
  function tune(pairs) {
    if (pairs.length < 20) return null;
    return Math.max(0, Math.min(1, 1 - score(pairs).ece / 0.25));
  }

  WW.confidence = { LEVELS, shouldProbe, ask, score, tune };
})(globalThis);
