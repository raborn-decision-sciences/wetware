/* Diagnostic: spatial Stroop (interference control without colour). Opt-in replacement for the
 * colour Stroop (Display settings, "Colour-free Stroop"); logged as its own probe, never pooled
 * with the colour version.
 *
 * A direction word (UP, DOWN, LEFT, RIGHT) appears above, below, left or right of the centre.
 * Respond to WHERE it is with the arrow keys (or tap), not to what it says. Spatial Stroop
 * (Lu & Proctor 1995): the word's meaning competes with its position, as the colour word competes
 * with the ink. Same design as the colour version: 120 test trials, 40 congruent, 40 incongruent,
 * 40 neutral (XXXX), each position 10x per type, never the same position twice running.
 * Interference = median RT incongruent - median RT congruent (correct trials).
 * No published retest data: its noise prior is borrowed from the colour Stroop, weakly
 * (core/reliable.js).
 */
(function (root) {
  'use strict';
  const WW = root.WW;

  const PLACES = [
    { name: 'UP', where: 'above the centre', key: 'ArrowUp', label: '↑', x: 0, y: -1 },
    { name: 'DOWN', where: 'below the centre', key: 'ArrowDown', label: '↓', x: 0, y: 1 },
    { name: 'LEFT', where: 'left of the centre', key: 'ArrowLeft', label: '←', x: -1, y: 0 },
    { name: 'RIGHT', where: 'right of the centre', key: 'ArrowRight', label: '→', x: 1, y: 0 },
  ];
  const PER_CELL = 10; // per position per type: 40 per condition, as the colour version
  const PRACTICE = 12;
  const TIMEOUT_MS = 2500;

  /** Test trial list: [{ type, place, word }] with no consecutive position repeats. */
  function trials(rng, perCell = PER_CELL) {
    const items = [];
    for (const type of ['congruent', 'incongruent', 'neutral']) {
      for (let place = 0; place < 4; place++) {
        for (let r = 0; r < perCell; r++) {
          let word = place;
          if (type === 'incongruent') word = rng.pick([0, 1, 2, 3].filter((w) => w !== place));
          items.push({ type, place, word: type === 'neutral' ? null : word });
        }
      }
    }
    return WW.dx.arrange(rng, items, (a, b) => a.place === b.place);
  }

  WW.dxLogic = WW.dxLogic || {};
  WW.dxLogic.spatialStroopTrials = trials;
  WW.dxLogic.spatialStroopPlaces = PLACES;

  WW.games.register({
    id: 'dx-stroop-spatial',
    name: 'Spatial Stroop',
    kind: 'diagnostic',
    headline: (s) => (s.interference == null ? 'no valid RTs' : `interference ${Math.round(s.interference)} ms`),
    mount(container, ctx) {
      const { h, clear } = ctx.ui;
      const T = ctx.timing;
      const S = WW.stats;
      const ac = new AbortController();
      const signal = ac.signal;
      const rng = ctx.rng;
      const keyMap = Object.fromEntries(PLACES.map((p, i) => [p.key, i]));

      let word, fix, msg, buttons;
      function screen() {
        clear(container);
        msg = h('p.label', '');
        fix = h('span.sst-fix', '+');
        word = h('span.sst-word.stim', '');
        buttons = PLACES.map((p) => h('button.btn.stroop-key', { type: 'button' }, h('kbd', p.label), p.name.toLowerCase()));
        // Buttons in arrow-key layout: up on top, then left, down, right.
        const pad = h('div.sst-pad', h('span'), buttons[0], h('span'), buttons[2], buttons[1], buttons[3]);
        container.appendChild(h('div.center', { style: { userSelect: 'none' } }, msg, h('div.sst-plate', fix, word), pad));
      }

      async function trial(t, practice) {
        word.textContent = '';
        fix.style.visibility = 'visible';
        await T.sleep(500);
        if (signal.aborted) return null;
        const p = PLACES[t.place];
        const onset = await T.onNextFrame(() => {
          word.textContent = t.word === null ? 'XXXX' : PLACES[t.word].name;
          word.style.left = 50 + p.x * 32 + '%';
          word.style.top = 50 + p.y * 34 + '%';
        });
        const r = await T.awaitChoice({ keyMap, buttons: buttons.map((el, i) => ({ el, value: i })), timeoutMs: TIMEOUT_MS, since: onset, signal });
        if (r.aborted) return null;
        word.textContent = '';
        const correct = !r.timeout && r.value === t.place;
        if (practice) {
          msg.textContent = r.timeout ? 'Too slow' : correct ? 'Correct' : `Wrong: it was ${p.where}`;
          await T.sleep(correct ? 400 : 1200);
          msg.textContent = '';
        } else {
          ctx.session.trial({
            condition: t.type,
            stimulus: { place: p.name, word: t.word === null ? 'XXXX' : PLACES[t.word].name },
            response: r.timeout ? null : PLACES[r.value].name,
            correct,
            rt: r.timeout ? null : r.rt,
            input: r.input,
          });
          await T.sleep(200);
        }
        return { type: t.type, correct, timeout: !!r.timeout, rt: r.rt };
      }

      (async () => {
        if (
          !(await WW.screens.intro(container, {
            kicker: 'Diagnostics · untrained probe',
            title: 'Spatial Stroop',
            body: [
              'A word appears above, below, left or right of the centre. Respond to WHERE it is, not what it says.',
              'Use the arrow keys: ↑ above, ↓ below, ← left, → right. Fast, but accurate.',
            ],
            kv: [['Takes', 'about 4 minutes'], ['Trials', `${PRACTICE} practice + ${PER_CELL * 12}`]],
            button: 'Practice',
            signal,
          }))
        )
          return;
        screen();
        const practice = trials(rng.fork('practice'), 1).slice(0, PRACTICE);
        for (const t of practice) if ((await trial(t, true)) === null) return;
        msg.textContent = 'Now for real. No more feedback.';
        await T.sleep(1500);
        msg.textContent = '';

        const results = [];
        for (const t of trials(rng)) {
          const r = await trial(t, false);
          if (r === null) return;
          results.push(r);
        }
        const med = (type) => S.round(S.median(results.filter((r) => r.type === type && r.correct).map((r) => r.rt)));
        const errs = (type) => results.filter((r) => r.type === type && !r.correct).length;
        const mc = med('congruent');
        const mi = med('incongruent');
        const mn = med('neutral');
        const summary = {
          medianCongruent: mc,
          medianIncongruent: mi,
          medianNeutral: mn,
          interference: mi != null && mc != null ? S.round(mi - mc) : null,
          interferenceVsNeutral: mi != null && mn != null ? S.round(mi - mn) : null,
          errorsCongruent: errs('congruent'),
          errorsIncongruent: errs('incongruent'),
          errorsNeutral: errs('neutral'),
          accuracy: S.round(results.filter((r) => r.correct).length / results.length, 3),
        };
        await WW.dx.finish(
          ctx,
          container,
          signal,
          {
            headline: summary.interference == null ? 'NO VALID RTS' : `${summary.interference >= 0 ? '+' : ''}${Math.round(summary.interference)} MS`,
            tone: summary.interference == null || summary.accuracy < 0.8 ? 'warn' : 'good',
            kv: [
              ['Interference (incong − cong)', `${summary.interference} ms`],
              ['vs neutral', `${summary.interferenceVsNeutral} ms`],
              ['Median RT', `${mc} cong · ${mn} neutral · ${mi} incong`],
              ['Errors', `${summary.errorsCongruent} cong · ${summary.errorsNeutral} neutral · ${summary.errorsIncongruent} incong`],
              ['Accuracy', `${Math.round(summary.accuracy * 100)}%`],
            ],
            notes: ['Lower interference means better control of the automatic urge to read.'],
          },
          summary
        );
      })().catch((e) => console.error(e));

      return {
        stop() {
          ac.abort();
        },
      };
    },
  });
})(globalThis);
