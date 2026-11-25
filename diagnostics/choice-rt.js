/* Diagnostic: four-choice reaction time (processing speed).
 * A target lights one of four boxes; press its key (D F J K) or tap it.
 * 8 practice + 40 test trials, positions balanced (10 each, runs <= 3),
 * foreperiod 400-1000 ms. Median correct RT is the headline measure.
 */
(function (root) {
  'use strict';
  const WW = root.WW;

  const KEYS = ['KeyD', 'KeyF', 'KeyJ', 'KeyK'];
  const LABELS = ['D', 'F', 'J', 'K'];
  const PER_POS = 10;
  const PRACTICE = 8;
  const TIMEOUT_MS = 2000;
  const ANTICIPATION_MS = 100;

  WW.dxLogic = WW.dxLogic || {};
  WW.dxLogic.choiceSchedule = (rng) => WW.dx.balanced(rng, [0, 1, 2, 3], PER_POS, 3);

  WW.games.register({
    id: 'dx-choice-rt',
    name: 'Choice reaction time',
    kind: 'diagnostic',
    headline: (s) => (s.medianRt == null ? 'no valid RTs' : `${Math.round(s.medianRt)} ms · ${Math.round(s.accuracy * 100)}%`),
    mount(container, ctx) {
      const { h, clear } = ctx.ui;
      const T = ctx.timing;
      const S = WW.stats;
      const ac = new AbortController();
      const signal = ac.signal;
      const rng = ctx.rng;
      const keyMap = Object.fromEntries(KEYS.map((k, i) => [k, i]));

      let boxes, msg;
      function screen() {
        clear(container);
        msg = h('p.label', '');
        boxes = LABELS.map((l) => h('button.crt-box.stim', { type: 'button', 'aria-label': 'box ' + l }, h('span', l)));
        container.appendChild(h('div.center', { style: { touchAction: 'none', userSelect: 'none' } }, msg, h('div.crt-row', boxes)));
      }

      async function trial(pos, practice, idx, n) {
        msg.textContent = practice ? `Practice ${idx} / ${n}` : '';
        boxes.forEach((b) => b.classList.remove('lit', 'bad'));
        await T.sleep(rng.int(400, 1000));
        if (signal.aborted) return null;
        const onset = await T.onNextFrame(() => boxes[pos].classList.add('lit'));
        const r = await T.awaitChoice({ keyMap, buttons: boxes.map((el, i) => ({ el, value: i })), timeoutMs: TIMEOUT_MS, since: onset, signal });
        if (r.aborted) return null;
        boxes[pos].classList.remove('lit');
        const correct = !r.timeout && r.value === pos;
        const antic = !r.timeout && r.rt < ANTICIPATION_MS;
        if (!r.timeout && !correct) {
          boxes[r.value].classList.add('bad');
          await T.sleep(300);
          boxes[r.value].classList.remove('bad');
        }
        if (practice) {
          msg.textContent = r.timeout ? 'Too slow' : correct ? 'Correct' : 'Wrong box';
          await T.sleep(400);
        } else {
          ctx.session.trial({
            condition: r.timeout ? 'timeout' : antic ? 'anticipation' : 'choice',
            stimulus: pos,
            response: r.timeout ? null : r.value,
            correct: correct && !antic,
            rt: r.timeout ? null : r.rt,
            input: r.input,
          });
        }
        return { correct, antic, timeout: !!r.timeout, rt: r.rt };
      }

      (async () => {
        const legend = WW.screens.legend(LABELS.map((k) => ({ key: k, label: '' })));
        if (
          !(await WW.screens.intro(container, {
            kicker: 'Diagnostics · untrained probe',
            title: 'Choice RT',
            body: ['One of four boxes lights up. Press its key (D, F, J, K, left to right) or tap it, as fast as you can without making mistakes.', 'Rest two fingers of each hand on D F and J K.'],
            kv: [['Takes', 'about 2 minutes'], ['Trials', `${PRACTICE} practice + ${PER_POS * 4}`]],
            legend,
            button: 'Practice',
            signal,
          }))
        )
          return;
        screen();
        for (let i = 0; i < PRACTICE; i++) if ((await trial(rng.int(0, 3), true, i + 1, PRACTICE)) === null) return;
        msg.textContent = 'Now for real.';
        await T.sleep(1200);

        const schedule = WW.dxLogic.choiceSchedule(rng);
        const results = [];
        for (let i = 0; i < schedule.length; i++) {
          const r = await trial(schedule[i], false, i + 1, schedule.length);
          if (r === null) return;
          results.push(r);
        }
        const valid = results.filter((r) => r.correct && !r.antic).map((r) => r.rt);
        const errors = results.filter((r) => !r.timeout && !r.correct).length;
        const summary = {
          medianRt: S.round(S.median(valid)),
          meanRt: S.round(S.mean(valid)),
          sdRt: S.round(S.sd(valid)),
          accuracy: S.round(valid.length / results.length, 3),
          errors,
          timeouts: results.filter((r) => r.timeout).length,
          anticipations: results.filter((r) => r.antic).length,
          trials: results.length,
        };
        await WW.dx.finish(
          ctx,
          container,
          signal,
          {
            headline: summary.medianRt == null ? 'NO VALID RTS' : `${Math.round(summary.medianRt)} MS`,
            tone: summary.medianRt == null || summary.accuracy < 0.8 ? 'warn' : 'good',
            kv: [
              ['Median RT (correct)', `${summary.medianRt} ms`],
              ['Mean ± SD', `${summary.meanRt} ± ${summary.sdRt} ms`],
              ['Accuracy', `${Math.round(summary.accuracy * 100)}%`],
              ['Errors · timeouts', `${errors} · ${summary.timeouts}`],
            ],
            notes: ['Includes your device’s input and display lag; compare on the same device.'],
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
