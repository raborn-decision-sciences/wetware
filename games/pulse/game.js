/* Pulse (CRON): interval timing.
 *
 * Part 1, reproduction: a bar lights for a duration (0.6-2.7 s); hold Space
 * for the same duration. Timing error grows with the interval (scalar
 * timing, Gibbon 1977), so errors are kept as ratios: accuracy is the mean
 * |log ratio|, precision the CV of your ratios.
 * Part 2, synchronise-continue: tap Space along with a flashing beat, then
 * keep tapping at the same rate after it stops (Wing & Kristofferson 1973).
 * Continuation: mean interval vs the beat (drift) and CV (variability).
 * Onsets and offsets are frame-locked and key times are event timestamps, so
 * both parts are measured on the same clock; no audio latency is involved.
 * Timing training evidence is limited (Bartholomew et al. 2015): grade X.
 */
(function (root) {
  'use strict';
  const WW = root.WW;

  const DURATIONS = [600, 900, 1300, 1900, 2700];
  const REPRO_EACH = 2; // per duration
  const BEAT = 650;
  const SYNC_BEATS = 10;
  const CONTINUE_TAPS = 18;

  /** Reproduction summary from [{ target, produced }]. */
  function reproStats(rows) {
    const ok = rows.filter((r) => Number.isFinite(r.produced) && r.produced > 0);
    if (!ok.length) return null;
    const ratios = ok.map((r) => r.produced / r.target);
    const logErr = ok.map((r) => Math.abs(Math.log(r.produced / r.target)));
    const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    const sd = Math.sqrt(ratios.reduce((a, b) => a + (b - mean) ** 2, 0) / ratios.length);
    return { meanRatio: mean, cv: sd / mean, meanAbsLog: logErr.reduce((a, b) => a + b, 0) / logErr.length };
  }

  /** Inter-tap intervals; drop the first continuation interval (transition). */
  function continuationStats(taps, beat) {
    const iti = [];
    for (let i = 1; i < taps.length; i++) iti.push(taps[i] - taps[i - 1]);
    const use = iti.slice(1).filter((x) => x > beat * 0.4 && x < beat * 2.5);
    if (use.length < 4) return null;
    const mean = use.reduce((a, b) => a + b, 0) / use.length;
    const sd = Math.sqrt(use.reduce((a, b) => a + (b - mean) ** 2, 0) / use.length);
    return { meanIti: mean, drift: mean / beat - 1, cv: sd / mean, n: use.length };
  }

  /** Mean asynchrony: each tap minus the nearest flash onset (negative = ahead of the beat). */
  function asynchrony(taps, onsets) {
    const d = taps.map((t) => {
      let best = Infinity;
      for (const o of onsets) if (Math.abs(t - o) < Math.abs(best)) best = t - o;
      return best;
    }).filter((x) => Math.abs(x) < BEAT / 2);
    return d.length ? d.reduce((a, b) => a + b, 0) / d.length : null;
  }

  WW.logic = WW.logic || {};
  WW.logic.pulse = { reproStats, continuationStats, asynchrony, DURATIONS, BEAT };

  WW.games.register({
    id: 'pulse',
    name: 'Pulse',
    headline: (s) => `held ${Math.round(s.reproError * 100)}% off · beat CV ${Math.round((s.continueCv || 0) * 100)}%`,
    /** Tune: half reproduction accuracy (30% off = 0), half continuation steadiness (CV 12% = 0). */
    tune(sessions) {
      const v = sessions
        .slice(0, 5)
        .map((s) => s.summary)
        .filter((x) => x && Number.isFinite(x.reproError) && Number.isFinite(x.continueCv))
        .map((x) => 0.5 * WW.stats.clamp01(1 - x.reproError / 0.3) + 0.5 * WW.stats.clamp01(1 - x.continueCv / 0.12));
      return v.length ? WW.stats.mean(v) : null;
    },
    mount(container, ctx) {
      const { h, clear } = ctx.ui;
      const T = ctx.timing;
      const S = WW.stats;
      const ac = new AbortController();
      const signal = ac.signal;
      const rng = ctx.rng;

      /** Resolve with { down, up } event timestamps of the next Space (or button) hold. */
      function hold(btn) {
        return new Promise((resolve) => {
          let down = null;
          const cleanup = () => {
            root.removeEventListener('keydown', kd, true);
            root.removeEventListener('keyup', ku, true);
            btn.removeEventListener('pointerdown', pd);
            btn.removeEventListener('pointerup', pu);
          };
          const kd = (e) => {
            if (e.code !== 'Space') return;
            e.preventDefault();
            if (!e.repeat && down === null) down = e.timeStamp;
          };
          const ku = (e) => {
            if (e.code !== 'Space' || down === null) return;
            e.preventDefault();
            cleanup();
            resolve({ down, up: e.timeStamp, input: 'keyboard' });
          };
          const pd = (e) => (e.preventDefault(), (down = e.timeStamp));
          const pu = (e) => {
            if (down === null) return;
            cleanup();
            resolve({ down, up: e.timeStamp, input: e.pointerType || 'pointer' });
          };
          root.addEventListener('keydown', kd, true);
          root.addEventListener('keyup', ku, true);
          btn.addEventListener('pointerdown', pd);
          btn.addEventListener('pointerup', pu);
          signal.addEventListener('abort', () => (cleanup(), resolve(null)));
        });
      }

      (async () => {
        const saved = await ctx.loadState('progress', { sessions: 0 });
        if (
          !(await WW.screens.intro(container, {
            kicker: 'CRON · interval timing',
            title: 'Pulse',
            body: [
              'Part 1: a bar lights up for a while. Then hold Space (or the button) for exactly as long. Don’t count out loud; just feel it.',
              'Part 2: tap Space along with a flashing beat. When the flashing stops, keep tapping at the same rate until told to stop.',
            ],
            kv: [['Session', `${DURATIONS.length * REPRO_EACH} holds + 2 beat runs, about 3 min`]],
            button: 'Start',
            signal,
          }))
        )
          return;
        const msg = h('p.label', '');
        const bar = h('div.pu-bar.stim');
        const btn = h('button.btn.pu-btn', { type: 'button' }, h('kbd', 'Space'), ' hold / tap');
        clear(container);
        container.append(h('div.center', { style: { userSelect: 'none', touchAction: 'manipulation' } }, msg, bar, btn));

        // Part 1: reproduction.
        const order = rng.shuffle(DURATIONS.flatMap((d) => Array(REPRO_EACH).fill(d)));
        const repro = [];
        for (let i = 0; i < order.length; i++) {
          const d = order[i];
          msg.textContent = `Hold ${i + 1} / ${order.length}: watch`;
          await T.sleep(900 + rng.int(0, 400));
          if (signal.aborted) return;
          const on = await T.onNextFrame(() => bar.classList.add('on'));
          // Frame-locked offset: switch off on the first frame at or after the target.
          const off = await new Promise((resolve) => {
            const tick = (t) => (t - on >= d - 8 ? (bar.classList.remove('on'), resolve(t)) : root.requestAnimationFrame(tick));
            root.requestAnimationFrame(tick);
          });
          const shown = off - on;
          msg.textContent = 'Now hold for the same time';
          const r = await hold(btn);
          if (!r) return;
          const produced = r.up - r.down;
          repro.push({ target: shown, produced });
          ctx.session.trial({ condition: `repro-${d}`, stimulus: { target: d, shown: S.round(shown) }, response: S.round(produced), correct: Math.abs(Math.log(produced / shown)) <= 0.15, rt: produced, input: r.input });
          msg.textContent = `${(shown / 1000).toFixed(2)} s shown · you held ${(produced / 1000).toFixed(2)} s`;
          await T.sleep(1100);
        }

        // Part 2: synchronise, then continue.
        const runs = [];
        for (let run = 0; run < 2; run++) {
          msg.textContent = `Beat ${run + 1} / 2: tap along, then keep going when it stops`;
          await T.sleep(2000);
          const taps = [];
          const onsets = [];
          const kd = (e) => {
            if (e.code === 'Space' && !e.repeat) (e.preventDefault(), taps.push(e.timeStamp));
          };
          const pd = (e) => (e.preventDefault(), taps.push(e.timeStamp));
          root.addEventListener('keydown', kd, true);
          btn.addEventListener('pointerdown', pd);
          signal.addEventListener('abort', () => (root.removeEventListener('keydown', kd, true), btn.removeEventListener('pointerdown', pd)));
          const t0 = (await T.onNextFrame(() => {})) + 300;
          for (let b = 0; b < SYNC_BEATS; b++) {
            const due = t0 + b * BEAT;
            const at = await new Promise((resolve) => {
              const tick = (t) => (t >= due - 8 ? (bar.classList.add('on'), resolve(t)) : root.requestAnimationFrame(tick));
              root.requestAnimationFrame(tick);
            });
            onsets.push(at);
            if (b === 0) ctx.audio.sfx('tick');
            await T.sleep(90);
            bar.classList.remove('on');
          }
          const syncEnd = onsets[onsets.length - 1] + BEAT / 2;
          msg.textContent = 'Keep tapping';
          // Wait for the continuation taps (or 1.6x the expected time).
          const limit = performance.now() + CONTINUE_TAPS * BEAT * 1.6;
          while (taps.filter((t) => t > syncEnd).length < CONTINUE_TAPS && performance.now() < limit && !signal.aborted) await T.sleep(50);
          root.removeEventListener('keydown', kd, true);
          btn.removeEventListener('pointerdown', pd);
          if (signal.aborted) return;
          const syncTaps = taps.filter((t) => t <= syncEnd);
          const contTaps = taps.filter((t) => t > syncEnd);
          const cs = continuationStats([syncTaps[syncTaps.length - 1], ...contTaps].filter(Number.isFinite), BEAT);
          const as = asynchrony(syncTaps, onsets);
          runs.push({ cs, as });
          ctx.session.trial({
            condition: 'sync-continue',
            stimulus: { beat: BEAT, onsets: onsets.map((o) => S.round(o - onsets[0])) },
            response: taps.map((t) => S.round(t - onsets[0])),
            correct: cs ? Math.abs(cs.drift) <= 0.1 : false,
            rt: as,
          });
          msg.textContent = 'Stop';
          await T.sleep(1200);
        }

        const rs = reproStats(repro);
        const conts = runs.map((r) => r.cs).filter(Boolean);
        const asyncs = runs.map((r) => r.as).filter(Number.isFinite);
        const summary = {
          reproError: rs ? S.round(Math.exp(rs.meanAbsLog) - 1, 3) : null,
          reproRatio: rs ? S.round(rs.meanRatio, 3) : null,
          reproCv: rs ? S.round(rs.cv, 3) : null,
          continueDrift: conts.length ? S.round(S.mean(conts.map((c) => c.drift)), 3) : null,
          continueCv: conts.length ? S.round(S.mean(conts.map((c) => c.cv)), 3) : null,
          asynchronyMs: asyncs.length ? S.round(S.mean(asyncs)) : null,
          beatMs: BEAT,
        };
        const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);
        const choice = await WW.screens.results(container, {
          headline: `${pct(summary.reproError)} OFF · CV ${pct(summary.continueCv)}`,
          tone: (summary.reproError || 1) <= 0.15 && (summary.continueCv || 1) <= 0.06 ? 'good' : 'warn',
          kv: [
            ['Holds: typical error', `${pct(summary.reproError)} · you ${summary.reproRatio == null ? '—' : summary.reproRatio < 1 ? 'run short' : 'run long'} (ratio ${summary.reproRatio})`],
            ['Holds: consistency', `CV ${pct(summary.reproCv)}`],
            ['Beat on your own', `${summary.continueDrift == null ? '—' : (summary.continueDrift >= 0 ? 'slowed ' : 'sped up ') + pct(Math.abs(summary.continueDrift))} · CV ${pct(summary.continueCv)}`],
            ['Along with the flash', summary.asynchronyMs == null ? '—' : `${Math.abs(summary.asynchronyMs)} ms ${summary.asynchronyMs < 0 ? 'ahead (normal)' : 'behind'}`],
          ],
          notes: ['People usually tap slightly ahead of a beat and drift when it stops. A low CV (steady intervals) matters more than the mean.'],
          signal,
        });
        if (choice === 'save') {
          await ctx.saveState('progress', { sessions: saved.sessions + 1 });
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
