/* Diagnostic: digit span, forward and backward (visual presentation).
 * Wechsler-style procedure: 2 trials per length, discontinue when both
 * fail. Digits 1-9 without repeats, shown 800 ms on / 200 ms off.
 * Verbal working memory span.
 */
(function (root) {
  'use strict';
  const WW = root.WW;

  const ON_MS = 800;
  const OFF_MS = 200;
  const MAX = 9;

  /** Digits 1-9, no repeats, no ascending/descending neighbours (e.g. 4-5). */
  function sequence(rng, len) {
    for (let attempt = 0; attempt < 200; attempt++) {
      const s = rng.sample([1, 2, 3, 4, 5, 6, 7, 8, 9], len);
      if (s.every((d, i) => i === 0 || Math.abs(d - s[i - 1]) !== 1)) return s;
    }
    return rng.sample([1, 2, 3, 4, 5, 6, 7, 8, 9], len);
  }

  WW.dxLogic = WW.dxLogic || {};
  WW.dxLogic.digitSequence = sequence;

  WW.games.register({
    id: 'dx-digit-span',
    name: 'Digit span',
    kind: 'diagnostic',
    headline: (s) => `fwd ${s.fwdSpan} · bwd ${s.bwdSpan}`,
    mount(container, ctx) {
      const { h, clear } = ctx.ui;
      const { sleep } = ctx.timing;
      const ac = new AbortController();
      const signal = ac.signal;
      const rng = ctx.rng;

      let status, display, entry, pad;

      function screen() {
        clear(container);
        status = h('p.label', '');
        display = h('div.digit.stim', '');
        entry = h('div.entry', '');
        const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9, '⌫', 0, '↵'];
        pad = h(
          'div.keypad',
          keys.map((k) => h('button.btn', { type: 'button', dataset: { k: String(k) }, disabled: true }, String(k)))
        );
        container.appendChild(h('div.center', status, display, entry, pad));
      }

      function collect() {
        return new Promise((resolve) => {
          const typed = [];
          const t0 = ctx.timing.now();
          let input = null;
          const render = () => (entry.textContent = typed.join(' ') || '·');
          render();
          const act = (k, how) => {
            input = input || how;
            if (k === '⌫') typed.pop();
            else if (k === '↵') return finish(false);
            else if (typed.length < 12) typed.push(Number(k));
            render();
          };
          const onKey = (e) => {
            if (e.repeat) return;
            if (/^Digit[0-9]$/.test(e.code) || /^Numpad[0-9]$/.test(e.code)) act(e.code.slice(-1), 'keyboard');
            else if (e.code === 'Backspace') act('⌫', 'keyboard');
            else if (e.code === 'Enter' || e.code === 'NumpadEnter') act('↵', 'keyboard');
            else return;
            e.preventDefault();
          };
          const onPad = (e) => {
            const b = e.target.closest('button');
            if (b && !b.disabled) act(b.dataset.k, e.pointerType || 'pointer');
          };
          const onAbort = () => finish(true);
          root.addEventListener('keydown', onKey, true);
          pad.addEventListener('click', onPad);
          signal.addEventListener('abort', onAbort);
          pad.querySelectorAll('button').forEach((b) => (b.disabled = false));
          function finish(aborted) {
            root.removeEventListener('keydown', onKey, true);
            pad.removeEventListener('click', onPad);
            signal.removeEventListener('abort', onAbort);
            pad.querySelectorAll('button').forEach((b) => (b.disabled = true));
            resolve(aborted ? null : { typed, rt: ctx.timing.now() - t0, input });
          }
        });
      }

      async function trial(len, dir, practice) {
        const seq = sequence(rng, len);
        entry.textContent = '';
        status.textContent = 'Watch';
        await sleep(800);
        for (const d of seq) {
          if (signal.aborted) return null;
          display.textContent = String(d);
          await sleep(ON_MS);
          display.textContent = '';
          await sleep(OFF_MS);
        }
        if (signal.aborted) return null;
        status.textContent = dir === 'backward' ? 'Type them in REVERSE order, then Enter' : 'Type them in order, then Enter';
        const r = await collect();
        if (!r) return null;
        const expected = dir === 'forward' ? seq : seq.slice().reverse();
        const ok = r.typed.length === expected.length && r.typed.every((d, i) => d === expected[i]);
        if (practice) {
          status.textContent = ok ? 'Correct.' : `Not quite: it was ${expected.join(' ')}.`;
          await sleep(1600);
        } else {
          ctx.session.trial({ condition: dir, stimulus: seq, response: r.typed, correct: ok, rt: r.rt, level: len, input: r.input });
          status.textContent = '';
          await sleep(400);
        }
        return ok;
      }

      async function block(dir) {
        const reverse = dir === 'backward';
        const go = await WW.screens.intro(container, {
          kicker: 'Diagnostics · untrained probe',
          title: reverse ? 'Backward' : 'Digit span',
          body: reverse
            ? ['Same again, but type the digits in REVERSE order: last shown first.', 'One practice trial, then it counts.']
            : ['Digits appear one at a time. Afterwards, type them back in the same order and press Enter.', 'Lists get longer until you miss both tries at a length. No need to hurry.'],
          kv: reverse ? null : [['Takes', 'about 4 minutes'], ['Input', 'number keys or the keypad']],
          button: 'Practice',
          signal,
        });
        if (!go) return null;
        screen();
        if ((await trial(2, dir, true)) === null) return null;
        status.textContent = 'Now for real.';
        await sleep(1000);
        return WW.dx.runSpan({ start: reverse ? 2 : 3, max: MAX, trial: (len) => trial(len, dir, false) });
      }

      (async () => {
        const fwd = await block('forward');
        if (!fwd) return;
        const bwd = await block('backward');
        if (!bwd) return;
        const summary = { fwdSpan: fwd.span, fwdCorrect: fwd.correct, bwdSpan: bwd.span, bwdCorrect: bwd.correct };
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
            ],
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
