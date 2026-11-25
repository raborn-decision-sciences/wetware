/* Wetware core: adaptive difficulty.
 *
 * Two staircase rules, both with "level goes up = harder" semantics by
 * default (set harderIs: 'down' for parameters such as display duration,
 * where smaller is harder):
 *
 *   rule 'weighted'  Kaernbach (1991) weighted up-down. Continuous levels.
 *                    Correct -> step toward harder by `step`; wrong -> step
 *                    toward easier by step * target / (1 - target).
 *                    Converges on P(correct) = target for any target.
 *
 *   rule 'updown'    Levitt (1971) transformed up-down. nDown consecutive
 *                    correct -> one step harder; any error -> one step
 *                    easier. Converges on P(correct) = 0.5^(1/nDown)
 *                    (2-down ~70.7%, 3-down ~79.4%). Good for integer levels.
 *
 * scale 'log' applies steps to log(value): use it for durations and other
 * ratio-scaled parameters. Bounds (min/max) are always in value units.
 *
 * Block-level rules (Jaeggi-style n-back) are in WW.adapt.blockStep.
 */
(function (root) {
  'use strict';
  const WW = (root.WW = root.WW || {});

  const DEFAULTS = {
    rule: 'weighted',
    target: 0.8,
    nDown: 3,
    start: 1,
    step: 1,
    min: -Infinity,
    max: Infinity,
    scale: 'linear',
    harderIs: 'up',
    integer: false,
    // Bigger steps until this many reversals, for fast initial convergence.
    fastReversals: 2,
    fastMultiplier: 2,
  };

  class Staircase {
    constructor(opts) {
      const o = Object.assign({}, DEFAULTS, opts || {});
      if (o.rule !== 'weighted' && o.rule !== 'updown') throw new Error('unknown staircase rule: ' + o.rule);
      if (o.rule === 'weighted' && !(o.target > 0 && o.target < 1)) throw new Error('target must be in (0, 1)');
      if (o.scale === 'log' && !(o.start > 0)) throw new Error('log scale needs start > 0');
      this.opts = o;
      this.level = this._toInternal(o.start); // internal (possibly log) units
      this.streak = 0;
      this.lastDir = 0; // +1 harder, -1 easier
      this.reversals = []; // internal units
      this.trials = 0;
      this.correct = 0;
    }

    _toInternal(v) {
      return this.opts.scale === 'log' ? Math.log(v) : v;
    }
    _toExternal(x) {
      return this.opts.scale === 'log' ? Math.exp(x) : x;
    }
    _clamp(x) {
      const o = this.opts;
      const v = Math.min(o.max, Math.max(o.min, this._toExternal(x)));
      return this._toInternal(v);
    }

    /** Current parameter value in game units. */
    value() {
      const v = this._toExternal(this.level);
      return this.opts.integer ? Math.round(v) : v;
    }

    _stepSize() {
      const o = this.opts;
      return o.step * (this.reversals.length < o.fastReversals ? o.fastMultiplier : 1);
    }

    _move(dir) {
      // dir: +1 harder, -1 easier
      if (this.lastDir !== 0 && dir !== this.lastDir) this.reversals.push(this.level);
      this.lastDir = dir;
      const o = this.opts;
      const sign = o.harderIs === 'down' ? -1 : 1;
      let size = this._stepSize();
      if (o.rule === 'weighted' && dir < 0) size *= o.target / (1 - o.target);
      this.level = this._clamp(this.level + sign * dir * size);
    }

    /** Record one trial outcome; returns the next value. */
    update(wasCorrect) {
      const o = this.opts;
      this.trials++;
      if (wasCorrect) this.correct++;
      if (o.rule === 'weighted') {
        this._move(wasCorrect ? 1 : -1);
      } else if (wasCorrect) {
        this.streak++;
        if (this.streak >= o.nDown) {
          this.streak = 0;
          this._move(1);
        }
      } else {
        this.streak = 0;
        this._move(-1);
      }
      return this.value();
    }

    /** Threshold estimate: mean of the last k reversal levels (game units). */
    threshold(k = 6) {
      const r = this.reversals.slice(-k);
      if (r.length === 0) return null;
      const mean = r.reduce((a, b) => a + b, 0) / r.length;
      return this._toExternal(mean);
    }

    /** P(correct) the rule converges on. */
    targetP() {
      const o = this.opts;
      return o.rule === 'weighted' ? o.target : Math.pow(0.5, 1 / o.nDown);
    }

    toJSON() {
      return {
        opts: Object.assign({}, this.opts, {
          min: Number.isFinite(this.opts.min) ? this.opts.min : null,
          max: Number.isFinite(this.opts.max) ? this.opts.max : null,
        }),
        level: this.level,
        streak: this.streak,
        lastDir: this.lastDir,
        reversals: this.reversals.slice(),
        trials: this.trials,
        correct: this.correct,
      };
    }

    static fromJSON(state) {
      const opts = Object.assign({}, state.opts);
      if (opts.min === null) opts.min = -Infinity;
      if (opts.max === null) opts.max = Infinity;
      const s = new Staircase(opts);
      s.level = state.level;
      s.streak = state.streak;
      s.lastDir = state.lastDir;
      s.reversals = state.reversals.slice();
      s.trials = state.trials;
      s.correct = state.correct;
      return s;
    }
  }

  /**
   * Block-level adaptation (Jaeggi et al. 2008 n-back rule):
   * score >= raiseAt -> level + step; score < lowerAt -> level - step.
   */
  function blockStep(level, score, opts) {
    const o = Object.assign({ raiseAt: 0.9, lowerAt: 0.7, step: 1, min: 1, max: Infinity }, opts || {});
    let next = level;
    if (score >= o.raiseAt) next = level + o.step;
    else if (score < o.lowerAt) next = level - o.step;
    return Math.min(o.max, Math.max(o.min, next));
  }

  WW.Staircase = Staircase;
  WW.adapt = { blockStep };
})(globalThis);
