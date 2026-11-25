/* Diagnostics: shared helpers for the untrained transfer-probe battery.
 *
 * Rules for every diagnostic (PLAN §6):
 *  - fixed procedures, no adaptive difficulty carried between sessions
 *  - never reused inside a training module
 *  - item-based tests use parallel forms: form n is generated from a seed
 *    derived from the test id and n (the number of earlier sessions)
 */
(function (root) {
  'use strict';
  const WW = (root.WW = root.WW || {});

  /**
   * Span procedure (Corsi, digit span): two trials per length, starting at
   * `start`; advance while at least one trial at a length is correct; stop
   * when both fail or after `max`.
   * Span = longest length with at least one correct trial (start - 1 if none).
   * Product score = span x correct trials (Kessels et al. 2000).
   * trial(length, index) -> Promise<boolean | null>; null means aborted.
   */
  async function runSpan({ start, max, perLength = 2, trial }) {
    let span = start - 1;
    let correct = 0;
    const log = [];
    for (let len = start; len <= max; len++) {
      let hits = 0;
      for (let i = 0; i < perLength; i++) {
        const ok = await trial(len, i);
        if (ok === null) return null;
        log.push({ len, ok });
        if (ok) hits++;
      }
      correct += hits;
      if (hits === 0) break;
      span = len;
    }
    return { span, correct, product: span * correct, log };
  }

  /** Seed and index of the parallel form for this administration. */
  async function form(ctx, testId) {
    let n = 0;
    if (ctx.store) {
      try {
        n = (await ctx.store.listSessions({ game: testId })).length;
      } catch (_) {
        n = 0;
      }
    }
    return { index: n, rng: WW.rng.create(WW.rng.hashSeed(testId + ':form:' + n)) };
  }

  /** Show results; save (finish) or discard (abort). */
  async function finish(ctx, container, signal, opts, summary) {
    const hidden = ctx.session.hiddenCount;
    if (hidden) {
      summary.hiddenCount = hidden;
      opts = Object.assign({}, opts, {
        tone: 'warn',
        notes: [`The page was hidden ${hidden} time(s) during this run, so timing may be off. Consider discarding and rerunning.`, ...(opts.notes || [])],
      });
    }
    const choice = await WW.screens.results(container, Object.assign({ signal }, opts));
    if (choice === 'save') ctx.finish(summary);
    else ctx.abort();
  }

  WW.dx = { runSpan, form, finish, arrange: WW.seq.arrange, balanced: WW.seq.balanced };
})(globalThis);
