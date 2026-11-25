/* Diagnostic: Sustained Attention to Response Task (SART).
 * Robertson et al. (1997): digits 1-9 for 250 ms, then a mask for 900 ms.
 * Press for every digit EXCEPT 3. Five font sizes. This is a shortened
 * block: 135 trials (15 per digit, ~2.6 min) instead of 225.
 * Measures: commission errors (pressed on 3), omissions, go-RT mean / CV.
 */
(function (root) {
  'use strict';
  const WW = root.WW;

  const DIGIT_MS = 250;
  const MASK_MS = 900;
  const PER_DIGIT = 15;
  const PRACTICE = 18;
  const NOGO = 3;
  const SIZES = [48, 72, 94, 100, 120]; // px, as in the original's five sizes

  /** 135 digits, 15 each, no two no-go trials in a row. Sizes random. */
  function sequence(rng, per = PER_DIGIT) {
    const items = [];
    for (let d = 1; d <= 9; d++) for (let i = 0; i < per; i++) items.push(d);
    const order = WW.dx.arrange(rng, items, (a, b) => a === NOGO && b === NOGO);
    return order.map((digit) => ({ digit, size: rng.pick(SIZES) }));
  }

  WW.dxLogic = WW.dxLogic || {};
  WW.dxLogic.sartSequence = sequence;

  WW.games.register({
    id: 'dx-sart',
    name: 'SART block',
    kind: 'diagnostic',
    headline: (s) => `${s.commissions}/${s.nogoTrials} commissions` + (s.goCv == null ? '' : ` · CV ${s.goCv}`),
    mount(container, ctx) {
      const { h, clear } = ctx.ui;
      const T = ctx.timing;
      const S = WW.stats;
      const ac = new AbortController();
      const signal = ac.signal;
      const rng = ctx.rng;
      const frameMs = ctx.env.frameMs || 16.667;

      let stim, msg, area;
      function screen() {
        clear(container);
        msg = h('p.label', '');
        stim = h('div.sart-stim.stim', '');
        area = h('div.center', { style: { touchAction: 'none', userSelect: 'none' } }, msg, stim);
        container.appendChild(area);
      }
      const mask = () => {
        stim.textContent = '';
        stim.classList.add('mask');
      };

      /** Runs the sequence; responses are captured across digit + mask. */
      async function runSeq(seq, practice) {
        const out = [];
        let current = null;
        const onKey = (e) => {
          if (e.code !== 'Space' || e.repeat) return;
          e.preventDefault();
          if (current && current.rt === null) {
            current.rt = e.timeStamp - current.onset;
            current.input = 'keyboard';
          }
        };
        const onPointer = (e) => {
          e.preventDefault();
          if (current && current.rt === null) {
            current.rt = e.timeStamp - current.onset;
            current.input = e.pointerType || 'pointer';
          }
        };
        root.addEventListener('keydown', onKey, true);
        area.addEventListener('pointerdown', onPointer);
        try {
          for (let i = 0; i < seq.length; i++) {
            if (signal.aborted) return null;
            const t = seq[i];
            const digitFrames = T.msToFrames(DIGIT_MS, frameMs);
            const maskFrames = T.msToFrames(MASK_MS, frameMs);
            const shown = await T.present({
              frames: digitFrames,
              onShow: (onset) => {
                stim.classList.remove('mask');
                stim.style.fontSize = t.size + 'px';
                stim.textContent = String(t.digit);
                // Response window opens at this digit's onset and runs to the next one.
                current = { onset, rt: null, input: null };
              },
              onHide: mask,
            });
            await T.present({ frames: maskFrames });
            const go = t.digit !== NOGO;
            const pressed = current.rt !== null;
            const correct = go ? pressed : !pressed;
            const rec = { digit: t.digit, go, pressed, correct, rt: current.rt, displayMs: shown.actualMs };
            out.push(rec);
            if (practice && !correct) {
              msg.textContent = go ? 'Missed one: press for every digit except 3' : 'That was a 3: hold back';
            } else if (practice) {
              msg.textContent = '';
            }
            if (!practice) {
              ctx.session.trial({
                condition: go ? 'go' : 'nogo',
                stimulus: { digit: t.digit, size: t.size, displayMs: S.round(shown.actualMs) },
                response: pressed ? 'press' : null,
                correct,
                rt: current.rt,
                input: current.input,
              });
            }
          }
          return out;
        } finally {
          root.removeEventListener('keydown', onKey, true);
          area.removeEventListener('pointerdown', onPointer);
        }
      }

      (async () => {
        if (
          !(await WW.screens.intro(container, {
            kicker: 'Diagnostics · untrained probe',
            title: 'SART',
            body: [
              'Digits flash one after another. Press Space (or tap) for EVERY digit, except 3. When you see a 3, do nothing.',
              'Give equal weight to speed and accuracy. It is meant to be monotonous: that is the point.',
            ],
            kv: [['Takes', 'about 3 minutes'], ['Trials', `${PRACTICE} practice + ${PER_DIGIT * 9}`]],
            button: 'Practice',
            signal,
          }))
        )
          return;
        screen();
        const practice = sequence(rng.fork('practice'), 2).slice(0, PRACTICE);
        if ((await runSeq(practice, true)) === null) return;
        msg.textContent = 'Now for real. No more feedback.';
        stim.classList.remove('mask');
        await T.sleep(1800);
        msg.textContent = '';

        const res = await runSeq(sequence(rng), false);
        if (res === null) return;
        const go = res.filter((r) => r.go);
        const nogo = res.filter((r) => !r.go);
        const goRts = go.filter((r) => r.pressed).map((r) => r.rt);
        const summary = {
          commissions: nogo.filter((r) => r.pressed).length,
          nogoTrials: nogo.length,
          omissions: go.filter((r) => !r.pressed).length,
          goTrials: go.length,
          goMeanRt: S.round(S.mean(goRts)),
          goSdRt: S.round(S.sd(goRts)),
          goCv: S.round(S.cv(goRts), 3),
          medianDisplayMs: S.round(S.median(res.map((r) => r.displayMs))),
        };
        await WW.dx.finish(
          ctx,
          container,
          signal,
          {
            headline: `${summary.commissions} / ${summary.nogoTrials}`,
            kv: [
              ['Commission errors (pressed on 3)', `${summary.commissions} of ${summary.nogoTrials}`],
              ['Omissions', `${summary.omissions} of ${summary.goTrials}`],
              ['Go RT mean ± SD', `${summary.goMeanRt} ± ${summary.goSdRt} ms`],
              ['RT variability (CV)', summary.goCv],
              ['Digit shown for', `${summary.medianDisplayMs} ms (median)`],
            ],
            notes: ['Fewer commissions and lower variability indicate steadier sustained attention.'],
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
