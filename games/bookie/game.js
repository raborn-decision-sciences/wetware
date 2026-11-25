/* Bookie (KERNEL): confidence calibration training.
 *
 * Quick perceptual calls (which line was longer? which tone lasted
 * longer?), each followed by a confidence rating that you bet on. The
 * bookie pays by a proper scoring rule, credits = 25 - 100 (c - o)^2
 * (an affine Brier score), so honest confidence maximises winnings.
 * After each block you see your calibration: how often you were right at
 * each confidence level. Difficulty tracks ~70% so ratings are informative.
 * Basis: calibration-feedback training transfers across tasks (Carpenter
 * et al. 2019); probability training improves forecasting (Mellers et al.
 * 2014); calibration (Lichtenstein, Fischhoff & Phillips 1982). Grade B.
 */
(function (root) {
  'use strict';
  const WW = root.WW;

  const BLOCKS = 3;
  const PER_BLOCK = 16;
  const LINE_MS = 350;

  /** Proper scoring: credits for confidence c (0.5-1) in a binary call that was right (o=1) or not. */
  const credits = (c, ok) => Math.round(25 - 100 * (c - (ok ? 1 : 0)) ** 2);

  WW.logic = WW.logic || {};
  WW.logic.bookie = { credits };

  WW.games.register({
    id: 'bookie',
    name: 'Bookie',
    headline: (s) => `calibration error ${s.ece != null ? Math.round(s.ece * 100) : '—'} pts · ${s.credits} cr`,
    tune(sessions) {
      const pairs = sessions.slice(0, 3).flatMap((s) => (s.summary && s.summary.confidencePairs) || []);
      return WW.confidence.tune(pairs);
    },
    mount(container, ctx) {
      const { h, clear } = ctx.ui;
      const T = ctx.timing;
      const S = WW.stats;
      const ac = new AbortController();
      const signal = ac.signal;
      const rng = ctx.rng;

      let plate, msg, aBtn, bBtn, bank;
      function screen() {
        clear(container);
        msg = h('p.label', '');
        plate = h('canvas.bk-plate.stim');
        const w = Math.floor(Math.min(root.innerWidth * 0.9, 480));
        const dpr = Math.min(2, root.devicePixelRatio || 1);
        plate.width = Math.round(w * dpr);
        plate.height = Math.round(180 * dpr);
        plate.style.width = w + 'px';
        plate.style.height = '180px';
        aBtn = h('button.btn.bk-key', { type: 'button' }, h('kbd', 'F'), h('span', ''));
        bBtn = h('button.btn.bk-key', { type: 'button' }, h('kbd', 'J'), h('span', ''));
        bank = h('p.muted.small', '');
        container.appendChild(h('div.center', { style: { userSelect: 'none' } }, msg, plate, h('div.row', { style: { justifyContent: 'center' } }, aBtn, bBtn), bank));
        paint();
      }
      function paint(lines) {
        const g = plate.getContext('2d');
        g.fillStyle = '#0b0b12';
        g.fillRect(0, 0, plate.width, plate.height);
        if (!lines) return;
        g.strokeStyle = '#e8e4dc';
        g.lineWidth = plate.height * 0.04;
        g.lineCap = 'butt';
        lines.forEach(([x0, len], i) => {
          const y = plate.height * (i === 0 ? 0.32 : 0.68);
          g.beginPath();
          g.moveTo(plate.width * x0, y);
          g.lineTo(plate.width * (x0 + len), y);
          g.stroke();
        });
      }
      const label = (a, b) => {
        aBtn.querySelector('span').textContent = ' ' + a;
        bBtn.querySelector('span').textContent = ' ' + b;
      };

      async function lineTrial(d) {
        label('top longer', 'bottom longer');
        const base = rng.float(0.28, 0.4);
        const longTop = rng.chance(0.5);
        const lens = longTop ? [base * (1 + d), base] : [base, base * (1 + d)];
        // Independent horizontal offsets so end-points can't be compared directly.
        const lines = lens.map((len) => [rng.float(0.05, 0.95 - len), len]);
        await T.sleep(400);
        await T.present({ frames: T.msToFrames(LINE_MS, ctx.env.frameMs), onShow: () => paint(lines), onHide: () => paint() });
        const r = await T.awaitChoice({ keyMap: { KeyF: 0, KeyJ: 1 }, buttons: [{ el: aBtn, value: 0 }, { el: bBtn, value: 1 }], signal });
        if (r.aborted) return null;
        return { ok: r.value === (longTop ? 0 : 1), rt: r.rt, input: r.input, stim: { task: 'lines', d: S.round(d, 4), longTop } };
      }

      async function toneTrial(d) {
        label('first longer', 'second longer');
        const base = rng.float(0.22, 0.32);
        const firstLong = rng.chance(0.5);
        const durs = firstLong ? [base * (1 + d), base] : [base, base * (1 + d)];
        const freq = rng.pick([440, 523, 587]);
        await T.sleep(400);
        ctx.audio.tone({ type: 'sine', freq, dur: durs[0], gain: 0.25, attack: 0.01, release: 0.01 });
        ctx.audio.tone({ type: 'sine', freq, dur: durs[1], gain: 0.25, attack: 0.01, release: 0.01, when: durs[0] + 0.45 });
        await T.sleep((durs[0] + durs[1] + 0.5) * 1000);
        const r = await T.awaitChoice({ keyMap: { KeyF: 0, KeyJ: 1 }, buttons: [{ el: aBtn, value: 0 }, { el: bBtn, value: 1 }], signal });
        if (r.aborted) return null;
        return { ok: r.value === (firstLong ? 0 : 1), rt: r.rt, input: r.input, stim: { task: 'tones', d: S.round(d, 4), firstLong } };
      }

      function calibrationView(pairs) {
        const sc = WW.confidence.score(pairs);
        const rows = sc.bins
          .filter((b) => b.n)
          .map((b) => {
            const acc = Math.round(b.acc * 100);
            const conf = Math.round(b.c * 100);
            const verdict = Math.abs(acc - conf) <= 10 ? 'on target' : acc < conf ? 'overconfident' : 'underconfident';
            return h('tr', h('td', `${conf}%`), h('td', String(b.n)), h('td', `${acc}%`), h('td', { class: verdict === 'on target' ? 'ok' : 'off' }, verdict));
          });
        return h('table.bk-cal', h('thead', h('tr', h('th', 'You said'), h('th', 'Bets'), h('th', 'Actually right'), h('th', ''))), h('tbody', rows));
      }

      (async () => {
        const saved = await ctx.loadState('progress', { lines: null, tones: null, sessions: 0 });
        const mk = (s, start) => (s ? WW.Staircase.fromJSON(s) : new WW.Staircase({ rule: 'weighted', target: 0.7, start, step: Math.log(1.08), scale: 'log', harderIs: 'down', min: 0.01, max: 1 }));
        const stairs = { lines: mk(saved.lines, 0.12), tones: mk(saved.tones, 0.35) };
        if (
          !(await WW.screens.intro(container, {
            kicker: 'KERNEL · metacognition',
            title: 'Bookie',
            body: [
              'The bookie doesn’t take bets on fights. He takes bets on you. Each round: a quick call (which line was longer, which tone lasted longer), then bet how sure you are.',
              'Payout: a confident right call earns most, a confident wrong call costs most, and 50% (a pure guess) is always 0. The only way to win long-run is to say exactly how sure you really are.',
            ],
            kv: [['Session', `${BLOCKS} × ${PER_BLOCK} bets, about 5 min`], ['Bets', '1 = 50% … 6 = 100%']],
            button: 'Start',
            signal,
          }))
        )
          return;
        ctx.audio.unlock();
        screen();
        const all = [];
        let bankroll = 0;
        for (let b = 0; b < BLOCKS; b++) {
          const pairs = [];
          for (let i = 0; i < PER_BLOCK; i++) {
            msg.textContent = `Block ${b + 1} / ${BLOCKS} · bet ${i + 1} / ${PER_BLOCK}`;
            const task = rng.chance(0.5) ? 'lines' : 'tones';
            const d = stairs[task].value();
            const r = await (task === 'lines' ? lineTrial(d) : toneTrial(d));
            if (!r) return;
            const c = await WW.confidence.ask(container.querySelector('.center'), { prompt: 'Your bet: how sure?', signal });
            if (!c) return;
            stairs[task].update(r.ok);
            const won = credits(c.confidence, r.ok);
            bankroll += won;
            pairs.push([c.confidence, r.ok]);
            all.push([c.confidence, r.ok]);
            ctx.session.trial({ condition: task, stimulus: r.stim, response: r.ok ? 'right' : 'wrong', correct: r.ok, rt: r.rt, level: r.stim.d, confidence: c.confidence, input: r.input, credits: won });
            msg.textContent = `${r.ok ? 'Right' : 'Wrong'} · ${won >= 0 ? '+' : ''}${won} cr`;
            bank.textContent = `Bankroll: ${bankroll} cr`;
            ctx.audio.sfx(won >= 0 ? 'tick' : 'error');
            await T.sleep(650);
          }
          // Calibration feedback after each block (the active ingredient).
          clear(container);
          const sc = WW.confidence.score(pairs);
          const go = h('button.btn.primary', { type: 'button' }, b < BLOCKS - 1 ? 'Next block' : 'Settle up');
          container.appendChild(
            h(
              'div.center',
              h('p.label', `Block ${b + 1} calibration`),
              calibrationView(pairs),
              h('p', `Average bet ${Math.round(sc.meanConf * 100)}% · actually right ${Math.round(sc.accuracy * 100)}% → ${sc.bias > 0.05 ? 'overconfident' : sc.bias < -0.05 ? 'underconfident' : 'well calibrated'}.`),
              go
            )
          );
          if (!(await WW.screens.waitForButton(go, signal))) return;
          if (b < BLOCKS - 1) screen();
        }
        const sc = WW.confidence.score(all);
        const summary = {
          bets: all.length,
          accuracy: S.round(sc.accuracy, 3),
          meanConfidence: S.round(sc.meanConf, 3),
          bias: S.round(sc.bias, 3),
          ece: S.round(sc.ece, 3),
          brier: S.round(sc.brier, 4),
          resolution: sc.gap != null ? S.round(sc.gap, 3) : null,
          credits: bankroll,
          confidencePairs: all,
        };
        const choice = await WW.screens.results(container, {
          headline: `${bankroll >= 0 ? '+' : ''}${bankroll} CR`,
          tone: bankroll < 0 ? 'warn' : 'good',
          kv: [
            ['Calibration error', `${Math.round(summary.ece * 100)} points (0 = perfect)`],
            ['Bias', `${summary.bias > 0 ? '+' : ''}${Math.round(summary.bias * 100)} points (${summary.bias > 0.05 ? 'overconfident' : summary.bias < -0.05 ? 'underconfident' : 'balanced'})`],
            ['Resolution', summary.resolution != null ? `${Math.round(summary.resolution * 100)} points more confident when right` : '—'],
            ['Accuracy', `${Math.round(summary.accuracy * 100)}%`],
          ],
          notes: ['Good calibration: your 70% bets come true 70% of the time. Resolution: you’re surer when you’re right. Difficulty carries over only if you log the session.'],
          signal,
        });
        if (choice === 'save') {
          await ctx.saveState('progress', { lines: stairs.lines.toJSON(), tones: stairs.tones.toJSON(), sessions: saved.sessions + 1 });
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
