/* Diagnostic: Corsi block-tapping, forward and backward.
 * Corsi (1972); Milner (1971); procedure and product score after
 * Kessels et al. (2000): 9 fixed irregular blocks, 2 trials per length,
 * discontinue when both trials at a length fail. Visuospatial span.
 */
(function (root) {
  'use strict';
  const WW = root.WW;

  // Block centres (fractions of the board). Fixed and irregular; >= 0.25 apart.
  const BLOCKS = [
    [0.1, 0.62],
    [0.3, 0.18],
    [0.55, 0.08],
    [0.8, 0.3],
    [0.2, 0.86],
    [0.45, 0.5],
    [0.7, 0.62],
    [0.88, 0.84],
    [0.55, 0.89],
  ];
  const SIZE = 0.13;
  const ON_MS = 700;
  const OFF_MS = 300;
  const START = 3;
  const MAX = 9;

  WW.games.register({
    id: 'dx-corsi',
    name: 'Corsi blocks',
    kind: 'diagnostic',
    headline: (s) => `fwd ${s.fwdSpan} · bwd ${s.bwdSpan}`,
    mount(container, ctx) {
      const { h, clear } = ctx.ui;
      const { sleep } = ctx.timing;
      const ac = new AbortController();
      const signal = ac.signal;
      const rng = ctx.rng;

      let status;
      let blocks = [];

      function board() {
        clear(container);
        status = h('p.label', '');
        blocks = BLOCKS.map(([x, y], i) =>
          h('button.corsi-block.stim', {
            type: 'button',
            'aria-label': 'block ' + (i + 1),
            disabled: true,
            style: { left: (x - SIZE / 2) * 100 + '%', top: (y - SIZE / 2) * 100 + '%', width: SIZE * 100 + '%', height: SIZE * 100 + '%' },
          })
        );
        container.appendChild(h('div.center', status, h('div.corsi-board', blocks)));
      }

      function collect(n) {
        return new Promise((resolve) => {
          const picks = [];
          let last = null;
          const t0 = ctx.timing.now();
          const handlers = blocks.map((b, i) => {
            const fn = (e) => {
              e.preventDefault();
              picks.push(i);
              last = e;
              b.classList.add('tap');
              setTimeout(() => b.classList.remove('tap'), 160);
              status.textContent = `Your turn · ${picks.length} / ${n}`;
              if (picks.length === n) finish();
            };
            b.disabled = false;
            b.addEventListener('pointerdown', fn);
            return fn;
          });
          const onAbort = () => finish(true);
          signal.addEventListener('abort', onAbort);
          function finish(aborted) {
            blocks.forEach((b, i) => {
              b.removeEventListener('pointerdown', handlers[i]);
              b.disabled = true;
            });
            signal.removeEventListener('abort', onAbort);
            resolve(aborted ? null : { picks, rt: ctx.timing.now() - t0, input: last ? last.pointerType || 'pointer' : null });
          }
        });
      }

      async function trial(len, dir, practice) {
        const seq = rng.sample([0, 1, 2, 3, 4, 5, 6, 7, 8], len);
        status.textContent = 'Watch';
        await sleep(700);
        for (const i of seq) {
          if (signal.aborted) return null;
          blocks[i].classList.add('lit');
          await sleep(ON_MS);
          blocks[i].classList.remove('lit');
          await sleep(OFF_MS);
        }
        if (signal.aborted) return null;
        status.textContent = `Your turn · 0 / ${len}` + (dir === 'backward' ? ' · reverse order' : '');
        const r = await collect(len);
        if (!r) return null;
        const expected = dir === 'forward' ? seq : seq.slice().reverse();
        const ok = r.picks.every((p, k) => p === expected[k]);
        if (practice) {
          status.textContent = ok ? 'Correct.' : 'Not quite. Watch the order carefully.';
          await sleep(1200);
        } else {
          ctx.session.trial({ condition: dir, stimulus: seq, response: r.picks, correct: ok, rt: r.rt, level: len, input: r.input });
          status.textContent = '';
          await sleep(500);
        }
        return ok;
      }

      async function block(dir) {
        const reverse = dir === 'backward';
        const go = await WW.screens.intro(container, {
          kicker: 'Diagnostics · untrained probe',
          title: reverse ? 'Backward' : 'Corsi blocks',
          body: reverse
            ? ['Same blocks, but now tap them in the REVERSE order: last lit first.', 'One practice trial, then it counts.']
            : [
                'Blocks will light up one at a time. When they stop, tap the same blocks in the same order.',
                'Sequences get longer until you miss both tries at a length. Accuracy matters, not speed.',
              ],
          kv: reverse ? null : [['Takes', 'about 4 minutes'], ['Input', 'mouse or touch']],
          button: 'Practice',
          signal,
        });
        if (!go) return null;
        board();
        if ((await trial(2, dir, true)) === null) return null;
        status.textContent = 'Now for real.';
        await sleep(1000);
        return WW.dx.runSpan({ start: START, max: MAX, trial: (len) => trial(len, dir, false) });
      }

      (async () => {
        const fwd = await block('forward');
        if (!fwd) return;
        const bwd = await block('backward');
        if (!bwd) return;
        const summary = {
          fwdSpan: fwd.span,
          fwdCorrect: fwd.correct,
          fwdProduct: fwd.product,
          bwdSpan: bwd.span,
          bwdCorrect: bwd.correct,
          bwdProduct: bwd.product,
        };
        await WW.dx.finish(
          ctx,
          container,
          signal,
          {
            headline: `SPAN ${fwd.span} / ${bwd.span}`,
            kv: [
              ['Forward span', fwd.span],
              ['Backward span', bwd.span],
              ['Correct trials', `${fwd.correct} fwd · ${bwd.correct} bwd`],
              ['Product score', `${fwd.product} fwd · ${bwd.product} bwd`],
            ],
            notes: ['Spans below 3 are recorded as 2.'],
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
