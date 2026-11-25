/* Handshake: timing and logging self-test (not a training module).
 *
 * Twelve simple-reaction-time trials with a random foreperiod. It checks
 * that frame timing, response capture, session logging and export work
 * end to end on this device, and gives a reference RT for the device's
 * input lag. Anticipations (< 100 ms) and false starts are flagged.
 */
(function (root) {
  'use strict';
  const WW = root.WW;
  const { h, clear, fmtMs } = WW.ui;

  const TRIALS = 12;
  const FOREPERIOD = [800, 2200];
  const TIMEOUT_MS = 1500;
  const ANTICIPATION_MS = 100;

  function stats(xs) {
    if (!xs.length) return { median: null, mean: null, sd: null };
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = xs.length > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1)) : 0;
    return { median: WW.timing.median(xs), mean, sd };
  }

  WW.games.register({
    id: 'handshake',
    name: 'Handshake',
    mount(container, ctx) {
      const ac = new AbortController();
      const { timing, rng, session, env } = ctx;

      function intro() {
        clear(container);
        const begin = h('button.btn.primary', { type: 'button', on: { click: run } }, 'Begin');
        container.appendChild(
          h(
            'div.center',
            h('p.label', 'System check · not a training module'),
            h('p', 'Rook wants proof your rig is clean before any real work. When the block lights up, hit Space (or tap it) as fast as you can. Don’t jump the gun.'),
            h(
              'dl.kv',
              h('dt', 'Display'),
              h('dd', env.refreshHz ? `${env.refreshHz} Hz (${env.frameMs} ms/frame, jitter ${env.jitterMs} ms)` : 'unknown'),
              h('dt', 'Trials'),
              h('dd', String(TRIALS)),
              h('dt', 'Seed'),
              h('dd', String(rng.seed))
            ),
            begin
          )
        );
        begin.focus();
      }

      async function run() {
        WW.audio.unlock();
        clear(container);
        const counter = h('p.label', '');
        const msg = h('p.muted', 'Wait for the signal…');
        const signal = h('div.stim', {
          style: { width: 'min(60vw, 280px)', height: 'min(60vw, 280px)', borderRadius: '4px', background: 'transparent', border: '1px solid var(--line)' },
        });
        const area = h('div.center', { style: { touchAction: 'none', userSelect: 'none' } }, counter, signal, msg);
        container.appendChild(area);

        const rts = [];
        let falseStarts = 0;
        let timeouts = 0;
        let anticipations = 0;

        for (let i = 1; i <= TRIALS; i++) {
          counter.textContent = `Trial ${i} / ${TRIALS}`;
          signal.style.background = 'transparent';
          msg.textContent = 'Wait for the signal…';
          const fore = rng.int(FOREPERIOD[0], FOREPERIOD[1]);

          // Any response during the foreperiod is a false start.
          const early = await timing.awaitResponse({ keys: ['Space'], pointerTarget: area, timeoutMs: fore, signal: ac.signal });
          if (early.aborted) return;
          if (!early.timeout) {
            falseStarts++;
            session.trial({ condition: 'false-start', stimulus: { foreperiod: fore }, response: early.key, correct: false, rt: null, input: early.input });
            msg.textContent = 'Too early. That one doesn’t count.';
            WW.audio.sfx('error');
            await timing.sleep(900);
            continue;
          }

          const onset = await new Promise((resolve) =>
            root.requestAnimationFrame((t) => {
              signal.style.background = 'var(--cyan)';
              resolve(t);
            })
          );
          const r = await timing.awaitResponse({ keys: ['Space'], pointerTarget: area, timeoutMs: TIMEOUT_MS, since: onset, signal: ac.signal });
          if (r.aborted) return;
          signal.style.background = 'transparent';

          if (r.timeout) {
            timeouts++;
            session.trial({ condition: 'timeout', stimulus: { foreperiod: fore }, response: null, correct: false, rt: null });
            msg.textContent = 'No response.';
          } else {
            const antic = r.rt < ANTICIPATION_MS;
            if (antic) anticipations++;
            else rts.push(r.rt);
            session.trial({ condition: antic ? 'anticipation' : 'simple-rt', stimulus: { foreperiod: fore }, response: r.key, correct: !antic, rt: r.rt, input: r.input });
            msg.textContent = antic ? 'Anticipation (under 100 ms): excluded.' : fmtMs(r.rt);
          }
          await timing.sleep(500);
        }
        results({ rts, falseStarts, timeouts, anticipations });
      }

      function results({ rts, falseStarts, timeouts, anticipations }) {
        const s = stats(rts);
        const clean = falseStarts + timeouts + anticipations <= 2 && rts.length >= TRIALS - 2;
        const summary = {
          clean,
          medianRt: s.median,
          meanRt: s.mean,
          sdRt: s.sd,
          valid: rts.length,
          falseStarts,
          timeouts,
          anticipations,
          refreshHz: env.refreshHz,
        };
        clear(container);
        const save = h('button.btn.primary', { type: 'button', on: { click: () => ctx.finish(summary) } }, 'Log it');
        container.appendChild(
          h(
            'div.center',
            h('p.big', { style: { color: clean ? 'var(--good)' : 'var(--amber)' } }, clean ? 'HANDSHAKE OK' : 'NOISY LINK'),
            h(
              'dl.kv',
              h('dt', 'Median RT'),
              h('dd', fmtMs(s.median)),
              h('dt', 'Mean ± SD'),
              h('dd', s.mean == null ? '—' : `${Math.round(s.mean)} ± ${Math.round(s.sd)} ms`),
              h('dt', 'Valid trials'),
              h('dd', `${rts.length} / ${TRIALS}`),
              h('dt', 'False starts'),
              h('dd', String(falseStarts)),
              h('dt', 'Timeouts'),
              h('dd', String(timeouts)),
              h('dt', 'Anticipations'),
              h('dd', String(anticipations)),
              h('dt', 'Display'),
              h('dd', env.refreshHz ? env.refreshHz + ' Hz' : 'unknown')
            ),
            h('p.muted', 'Median RT here includes your device’s input and display lag. Compare runs on the same device only.'),
            h('div.row', save, h('button.btn', { type: 'button', on: { click: () => ctx.abort() } }, 'Discard'))
          )
        );
      }

      intro();
      return {
        stop() {
          ac.abort();
        },
      };
    },
  });
})(globalThis);
