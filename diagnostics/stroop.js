/* Diagnostic: colour-word Stroop (interference control).
 * Stroop (1935). Respond to the INK colour with D F J K (or tap).
 * 120 test trials: 40 congruent, 40 incongruent, 40 neutral (XXXX),
 * each ink 10x per type, ink never repeats on consecutive trials.
 * Interference = median RT incongruent - median RT congruent (correct trials).
 * Stimuli sit on a fixed dark plate so colours look the same in either theme.
 */
(function (root) {
  'use strict';
  const WW = root.WW;

  const INKS = [
    { name: 'RED', css: '#ff4d4d' },
    { name: 'GREEN', css: '#33d17a' },
    { name: 'BLUE', css: '#4d8dff' },
    { name: 'YELLOW', css: '#f4d03f' },
  ];
  const KEYS = ['KeyD', 'KeyF', 'KeyJ', 'KeyK'];
  const LABELS = ['D', 'F', 'J', 'K'];
  const PER_CELL = 10; // per ink per type (40 per condition; doubled 2026-11-24 for reliability)
  const PRACTICE = 12;
  const TIMEOUT_MS = 2500;

  /** Test trial list: [{type, ink, word}] with no consecutive ink repeats. */
  function trials(rng, perCell = PER_CELL) {
    const items = [];
    for (const type of ['congruent', 'incongruent', 'neutral']) {
      for (let ink = 0; ink < 4; ink++) {
        for (let r = 0; r < perCell; r++) {
          let word = ink;
          if (type === 'incongruent') word = rng.pick([0, 1, 2, 3].filter((w) => w !== ink));
          items.push({ type, ink, word: type === 'neutral' ? null : word });
        }
      }
    }
    return WW.dx.arrange(rng, items, (a, b) => a.ink === b.ink);
  }

  WW.dxLogic = WW.dxLogic || {};
  WW.dxLogic.stroopTrials = trials;

  WW.games.register({
    id: 'dx-stroop',
    name: 'Stroop',
    kind: 'diagnostic',
    headline: (s) => (s.interference == null ? 'no valid RTs' : `interference ${Math.round(s.interference)} ms`),
    mount(container, ctx) {
      const { h, clear } = ctx.ui;
      const T = ctx.timing;
      const S = WW.stats;
      const ac = new AbortController();
      const signal = ac.signal;
      const rng = ctx.rng;
      const keyMap = Object.fromEntries(KEYS.map((k, i) => [k, i]));

      let word, msg, buttons;
      function screen() {
        clear(container);
        msg = h('p.label', '');
        word = h('div.stroop-word.stim', '');
        buttons = INKS.map((ink, i) =>
          h('button.btn.stroop-key', { type: 'button' }, h('kbd', LABELS[i]), h('i.swatch', { style: { background: ink.css } }), ink.name.toLowerCase())
        );
        container.appendChild(h('div.center', { style: { userSelect: 'none' } }, msg, h('div.stroop-plate', word), h('div.row', { style: { justifyContent: 'center' } }, buttons)));
      }

      async function trial(t, practice) {
        word.textContent = '+';
        word.style.color = '#8c8fa3';
        await T.sleep(500);
        word.textContent = '';
        await T.sleep(100);
        if (signal.aborted) return null;
        const onset = await T.onNextFrame(() => {
          word.textContent = t.word === null ? 'XXXX' : INKS[t.word].name;
          word.style.color = INKS[t.ink].css;
        });
        const r = await T.awaitChoice({ keyMap, buttons: buttons.map((el, i) => ({ el, value: i })), timeoutMs: TIMEOUT_MS, since: onset, signal });
        if (r.aborted) return null;
        word.textContent = '';
        const correct = !r.timeout && r.value === t.ink;
        if (practice) {
          msg.textContent = r.timeout ? 'Too slow' : correct ? 'Correct' : `Wrong: the ink was ${INKS[t.ink].name.toLowerCase()}`;
          await T.sleep(correct ? 400 : 1200);
          msg.textContent = '';
        } else {
          ctx.session.trial({
            condition: t.type,
            stimulus: { ink: INKS[t.ink].name, word: t.word === null ? 'XXXX' : INKS[t.word].name },
            response: r.timeout ? null : INKS[r.value].name,
            correct,
            rt: r.timeout ? null : r.rt,
            input: r.input,
          });
          await T.sleep(200);
        }
        return { type: t.type, correct, timeout: !!r.timeout, rt: r.rt };
      }

      (async () => {
        const legend = WW.screens.legend(INKS.map((ink, i) => ({ key: LABELS[i], label: ink.name.toLowerCase(), color: ink.css })));
        if (
          !(await WW.screens.intro(container, {
            kicker: 'Diagnostics · untrained probe',
            title: 'Stroop',
            body: ['A word appears in coloured ink. Respond to the INK colour, not the word.', 'Fast, but accurate. Keep your fingers on D F J K.'],
            kv: [['Takes', 'about 4 minutes'], ['Trials', `${PRACTICE} practice + ${PER_CELL * 12}`]],
            legend,
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
