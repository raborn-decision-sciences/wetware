/* Fence (ALU / CLOCK): number sense and mental arithmetic.
 *
 * Three rounds against Vex, a fence who talks fast and lowballs:
 *  1. Eyeball  which crate holds more chips? Dot arrays flashed 600 ms, half
 *              with total area equated so area can't stand in for number
 *              (Halberda, Mazzocco & Feigenson 2008).
 *  2. Ballpark two crates flash in turn; is their total more or less than a
 *              third? Approximate addition (Park & Brannon 2013).
 *  3. Haggle   exact multi-step mental arithmetic, typed in.
 * Rounds 1-2 adapt the ratio (2-down-1-up, ~71%); the Weber fraction is
 * estimated from the threshold ratio. Round 3 adapts problem level (75%).
 * Evidence: ANS training -> symbolic arithmetic gains in adults (Park &
 * Brannon 2013); arithmetic fluency is highly trainable. Grade B.
 */
(function (root) {
  'use strict';
  const WW = root.WW;

  const EYEBALL = 24;
  const BALLPARK = 12;
  const HAGGLE = 8;
  const FLASH_MS = 600;
  const HAGGLE_TIMEOUT = 45000;
  const Z71 = 0.5449; // z at the 2-down-1-up target (70.7%)

  /** Non-overlapping dots inside a disc. equalArea: radii scaled so total area = targetArea. */
  function dots(rng, n, opts) {
    const o = Object.assign({ meanR: 0.035, targetArea: null }, opts || {});
    let base = o.meanR;
    if (o.targetArea) base = Math.sqrt(o.targetArea / (n * Math.PI));
    for (let attempt = 0; attempt < 200; attempt++) {
      const out = [];
      let fail = false;
      for (let i = 0; i < n && !fail; i++) {
        const r = base * rng.float(0.8, 1.2);
        let placed = false;
        for (let k = 0; k < 200 && !placed; k++) {
          const a = rng.float(0, Math.PI * 2);
          const d = Math.sqrt(rng.next()) * (0.44 - r);
          const p = { x: 0.5 + d * Math.cos(a), y: 0.5 + d * Math.sin(a), r };
          if (out.every((q) => Math.hypot(p.x - q.x, p.y - q.y) > p.r + q.r + 0.012)) {
            out.push(p);
            placed = true;
          }
        }
        if (!placed) fail = true;
      }
      if (!fail) {
        if (o.targetArea) {
          // Rescale so total area matches exactly despite the jitter.
          const area = out.reduce((a, p) => a + Math.PI * p.r * p.r, 0);
          const k = Math.sqrt(o.targetArea / area);
          out.forEach((p) => (p.r *= k));
        }
        return out;
      }
      base *= 0.95;
    }
    throw new Error('fence: could not place dots');
  }

  /** Weber fraction from a threshold ratio r (> 1) at accuracy z-score zp. */
  const weber = (r, zp = Z71) => (r - 1) / (zp * Math.sqrt(1 + r * r));

  /** Haggle problem at a level (1-12). Every answer is an integer by construction. */
  function problem(rng, level) {
    const L = Math.max(1, Math.min(12, Math.floor(level)));
    const item = rng.pick(['optic chips', 'med-gel', 'ghost SIMs', 'cyberdecks', 'neural lace', 'drone cores', 'coolant', 'synth-silk']);
    const r = (lo, hi) => rng.int(lo, hi);
    switch (L) {
      case 1: {
        const a = r(12, 89), b = r(12, 89);
        return { text: `Two lots of ${item}: ${a} cr and ${b} cr. Total?`, answer: a + b };
      }
      case 2: {
        const a = r(50, 99), b = r(11, a - 10);
        return { text: `Lot of ${item} worth ${a} cr. I knock off ${b}. What's left?`, answer: a - b };
      }
      case 3: {
        const a = r(120, 899), b = r(23, 98);
        return { text: `${item}: ${a} cr, plus a ${b} cr rush fee. Total?`, answer: a + b };
      }
      case 4: {
        const a = r(3, 9), b = r(12, 48);
        return { text: `${a} crates of ${item} at ${b} cr each. Total?`, answer: a * b };
      }
      case 5: {
        const a = r(400, 999), b = r(123, a - 100);
        return { text: `Book value ${a} cr. My offer is ${b} cr. How much am I shorting you?`, answer: a - b };
      }
      case 6: {
        const p = rng.pick([10, 20, 25, 50]), v = r(2, 19) * 100;
        return { text: `${item} worth ${v} cr. My cut is ${p}%. How much is my cut?`, answer: (v * p) / 100 };
      }
      case 7: {
        const p = rng.pick([5, 10, 15, 20, 30]), v = r(4, 30) * 100;
        return { text: `${item} worth ${v} cr, minus my ${p}% cut. What do you walk with?`, answer: v - (v * p) / 100 };
      }
      case 8: {
        const p = rng.pick([10, 15, 20, 25]), v = r(8, 60) * 100, fee = r(1, 9) * 25;
        return { text: `${v} cr of ${item}. I take ${p}%, then a ${fee} cr handling fee. Your take?`, answer: v - (v * p) / 100 - fee };
      }
      case 9: {
        const p = rng.pick([10, 20, 25]), k = rng.pick([2, 3, 4]);
        const v = r(6, 40) * 100 * k;
        const net = v - (v * p) / 100;
        if (net % k !== 0) return problem(rng, 8);
        return { text: `${v} cr of ${item}, less my ${p}%. Split the rest ${k} ways. Each share?`, answer: net / k };
      }
      case 10: {
        const v = r(12, 90) * 100, p1 = rng.pick([10, 20]), p2 = rng.pick([10, 25, 50]);
        const after1 = v - (v * p1) / 100;
        if ((after1 * p2) % 100 !== 0) return problem(rng, 9);
        return { text: `${v} cr of ${item}. I take ${p1}%, then my runner takes ${p2}% of what's left. Yours?`, answer: after1 - (after1 * p2) / 100 };
      }
      case 11: {
        const a = r(21, 39), b = r(21, 39), fee = r(2, 8) * 50; // product >= 441 > fee
        return { text: `${a} units at ${b} cr, less a ${fee} cr bribe. Net?`, answer: a * b - fee };
      }
      default: {
        const a = r(23, 69), b = r(23, 69), p = rng.pick([10, 20, 50]);
        const gross = a * b * 10;
        return { text: `${a} crates × ${b} units × 10 cr, minus my ${p}%. Your take?`, answer: gross - (gross * p) / 100 };
      }
    }
  }

  WW.logic = WW.logic || {};
  WW.logic.fence = { dots, weber, problem, Z71 };

  WW.games.register({
    id: 'fence',
    name: 'Fence',
    headline: (s) => `w ${s.weber != null ? s.weber : '—'} · haggle L${Math.floor(s.haggleLevel)}`,
    /** ALU/CLOCK tune: mean of number sense (w 0.35 -> 0, 0.10 -> 1) and haggle level (/12). */
    tune(sessions) {
      const s = sessions[0] && sessions[0].summary;
      if (!s) return null;
      const parts = [];
      if (Number.isFinite(s.weber)) parts.push(WW.stats.clamp01((0.35 - s.weber) / 0.25));
      if (Number.isFinite(s.haggleLevel)) parts.push(WW.stats.clamp01(s.haggleLevel / 12));
      return parts.length ? WW.stats.mean(parts) : null;
    },
    mount(container, ctx) {
      const { h, clear } = ctx.ui;
      const T = ctx.timing;
      const S = WW.stats;
      const ac = new AbortController();
      const signal = ac.signal;
      const rng = ctx.rng;
      const SIZE = Math.floor(Math.min(root.innerWidth * 0.44, root.innerHeight * 0.42, 260));
      const dpr = Math.min(2, root.devicePixelRatio || 1);

      function crate() {
        const c = h('canvas.fc-crate.stim');
        c.width = c.height = Math.round(SIZE * dpr);
        c.style.width = c.style.height = SIZE + 'px';
        return c;
      }
      function paint(c, ds, label) {
        const g = c.getContext('2d');
        const n = c.width;
        g.fillStyle = '#0b0b12';
        g.fillRect(0, 0, n, n);
        g.strokeStyle = '#3d3849';
        g.lineWidth = dpr;
        g.beginPath();
        g.arc(n / 2, n / 2, n * 0.46, 0, Math.PI * 2);
        g.stroke();
        g.fillStyle = '#e8e4dc';
        for (const p of ds || []) {
          g.beginPath();
          g.arc(p.x * n, p.y * n, p.r * n, 0, Math.PI * 2);
          g.fill();
        }
        if (label) {
          g.fillStyle = '#8c8fa3';
          g.font = `${14 * dpr}px ui-monospace, monospace`;
          g.textAlign = 'center';
          g.fillText(label, n / 2, n * 0.97);
        }
      }

      let msg, left, right, fBtn, jBtn;
      function twoCrates(fLabel, jLabel) {
        clear(container);
        msg = h('p.label', '');
        left = crate();
        right = crate();
        fBtn = h('button.btn.fc-key', { type: 'button' }, h('kbd', 'F'), ' ' + fLabel);
        jBtn = h('button.btn.fc-key', { type: 'button' }, h('kbd', 'J'), ' ' + jLabel);
        container.appendChild(h('div.center', { style: { userSelect: 'none', touchAction: 'manipulation' } }, msg, h('div.row', { style: { justifyContent: 'center' } }, left, right), h('div.row', { style: { justifyContent: 'center' } }, fBtn, jBtn)));
        paint(left);
        paint(right);
      }
      const choose = () => T.awaitChoice({ keyMap: { KeyF: 0, KeyJ: 1, ArrowLeft: 0, ArrowRight: 1 }, buttons: [{ el: fBtn, value: 0 }, { el: jBtn, value: 1 }], signal });
      const feedback = async (ok) => {
        ctx.audio.sfx(ok ? 'correct' : 'error');
        msg.textContent = ok ? 'Sharp.' : 'Vex grins.';
        await T.sleep(500);
        msg.textContent = '';
      };

      /** Pair of counts at ratio r around a base of 8-18. */
      function pair(r) {
        const small = rng.int(8, 18);
        let big = Math.round(small * r);
        if (big <= small) big = small + 1;
        return [small, big];
      }

      async function eyeball(st, recs) {
        twoCrates('left has more', 'right has more');
        for (let i = 0; i < EYEBALL; i++) {
          msg.textContent = `Eyeball ${i + 1} / ${EYEBALL}`;
          const r = 1 + st.value();
          const [small, big] = pair(r);
          const bigLeft = rng.chance(0.5);
          const equalArea = i % 2 === 0;
          const area = 0.09;
          const mk = (n) => dots(rng, n, equalArea ? { targetArea: area } : { meanR: 0.032 });
          const dl = mk(bigLeft ? big : small);
          const dr = mk(bigLeft ? small : big);
          await T.sleep(500);
          if (signal.aborted) return false;
          await T.present({ frames: T.msToFrames(FLASH_MS, ctx.env.frameMs), onShow: () => (paint(left, dl), paint(right, dr)), onHide: () => (paint(left), paint(right)) });
          const c = await choose();
          if (c.aborted) return false;
          const ok = c.value === (bigLeft ? 0 : 1);
          st.update(ok);
          recs.push({ round: 'eyeball', ok });
          ctx.session.trial({ condition: 'eyeball-' + (equalArea ? 'equal-area' : 'size-congruent'), stimulus: { small, big, ratio: S.round(big / small, 3), bigLeft }, response: c.value, correct: ok, rt: c.rt, level: S.round(r, 3), input: c.input });
          await feedback(ok);
        }
        return true;
      }

      async function ballpark(st, recs) {
        twoCrates('total is MORE', 'total is LESS');
        for (let i = 0; i < BALLPARK; i++) {
          msg.textContent = `Ballpark ${i + 1} / ${BALLPARK}: watch the left crate`;
          const r = 1 + st.value();
          const a = rng.int(6, 18), b = rng.int(6, 18);
          const sum = a + b;
          const sumMore = rng.chance(0.5);
          let comp = Math.round(sumMore ? sum / r : sum * r);
          if (comp === sum) comp += sumMore ? -1 : 1;
          await T.sleep(600);
          if (signal.aborted) return false;
          const flash = (n) => T.present({ frames: T.msToFrames(FLASH_MS, ctx.env.frameMs), onShow: () => paint(left, dots(rng, n, { meanR: 0.03 }), ''), onHide: () => paint(left) });
          await flash(a);
          await T.sleep(400);
          await flash(b);
          await T.sleep(300);
          msg.textContent = 'Are the two together more or less than this?';
          await T.present({ frames: T.msToFrames(FLASH_MS, ctx.env.frameMs), onShow: () => paint(right, dots(rng, comp, { meanR: 0.025 })), onHide: () => paint(right) });
          const c = await choose();
          if (c.aborted) return false;
          const ok = c.value === (sumMore ? 0 : 1);
          st.update(ok);
          recs.push({ round: 'ballpark', ok });
          ctx.session.trial({ condition: 'ballpark', stimulus: { a, b, sum, comparison: comp }, response: c.value === 0 ? 'more' : 'less', correct: ok, rt: c.rt, level: S.round(r, 3), input: c.input });
          await feedback(ok);
        }
        return true;
      }

      async function haggle(st, recs) {
        for (let i = 0; i < HAGGLE; i++) {
          clear(container);
          const level = st.value();
          const p = problem(rng, level);
          const input = h('input.fc-input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', 'aria-label': 'your answer in credits' });
          const go = h('button.btn.primary', { type: 'button' }, 'Answer');
          const timerEl = h('p.muted.small', '');
          container.appendChild(
            h('div.center', h('p.label', `Haggle ${i + 1} / ${HAGGLE} · level ${Math.floor(level)}`), h('p.fc-problem', '“' + p.text + '”'), h('div.row', { style: { justifyContent: 'center' } }, input, h('span', 'cr'), go), timerEl)
          );
          input.focus();
          const t0 = T.now();
          const tick = setInterval(() => (timerEl.textContent = `${Math.max(0, Math.ceil((HAGGLE_TIMEOUT - (T.now() - t0)) / 1000))} s`), 250);
          const typed = await new Promise((resolve) => {
            const done = (v) => {
              clearTimeout(to);
              root.removeEventListener('keydown', onKey, true);
              resolve(v);
            };
            const onKey = (e) => {
              if (e.code === 'Enter' || e.code === 'NumpadEnter') {
                e.preventDefault();
                done(input.value);
              }
            };
            const to = setTimeout(() => done(null), HAGGLE_TIMEOUT);
            root.addEventListener('keydown', onKey, true);
            go.addEventListener('click', () => done(input.value));
            signal.addEventListener('abort', () => done(undefined));
          });
          clearInterval(tick);
          if (typed === undefined) return false;
          const rt = T.now() - t0;
          const val = typed === null ? null : Number(String(typed).replace(/[^0-9.-]/g, ''));
          const ok = val !== null && val === p.answer;
          st.update(ok);
          recs.push({ round: 'haggle', ok, rt });
          ctx.session.trial({ condition: 'haggle', stimulus: { text: p.text, answer: p.answer }, response: typed, correct: ok, rt, level: Math.floor(level), input: 'keyboard' });
          ctx.audio.sfx(ok ? 'correct' : 'error');
          clear(container);
          container.appendChild(h('div.center', h('p.big', { style: { color: ok ? 'var(--good)' : 'var(--magenta)' } }, ok ? 'DEAL' : typed === null ? 'TOO SLOW' : 'NO DEAL'), ok ? null : h('p', `It was ${p.answer} cr.`)));
          await T.sleep(ok ? 700 : 1800);
        }
        return true;
      }

      (async () => {
        const saved = await ctx.loadState('progress', { eye: null, ball: null, haggle: null, sessions: 0 });
        const ratioStair = (s) => (s ? WW.Staircase.fromJSON(s) : new WW.Staircase({ rule: 'updown', nDown: 2, start: 0.5, step: Math.log(1.25), scale: 'log', harderIs: 'down', min: 0.04, max: 1.5 }));
        const eye = ratioStair(saved.eye);
        const ball = ratioStair(saved.ball);
        const hag = saved.haggle ? WW.Staircase.fromJSON(saved.haggle) : new WW.Staircase({ rule: 'weighted', target: 0.75, start: 1, step: 0.5, min: 1, max: 12.99 });
        const eyeRev = eye.reversals.length;
        const ballRev = ball.reversals.length;
        if (
          !(await WW.screens.intro(container, {
            kicker: 'ALU · CLOCK · number sense',
            title: 'Fence',
            body: [
              'Vex moves stolen goods and talks faster than you can count. Three rounds:',
              'Eyeball: two crates flash; which holds more chips? No time to count, so go with your gut. Ballpark: two crates flash in turn; is their total more or less than a third? Haggle: Vex quotes a deal; work out the number exactly and type it.',
            ],
            kv: [['Session', `${EYEBALL} + ${BALLPARK} + ${HAGGLE} rounds, about 5 min`], ['Keys', 'F / J (or ← →) in rounds 1–2; type + Enter in round 3']],
            button: 'Start',
            signal,
          }))
        )
          return;
        const recs = [];
        if (!(await eyeball(eye, recs))) return;
        if (!(await ballpark(ball, recs))) return;
        if (!(await haggle(hag, recs))) return;

        const thrRatio = (st, before) => {
          const r = st.reversals.slice(before).slice(-6);
          return 1 + (r.length >= 2 ? Math.exp(r.reduce((a, b) => a + b, 0) / r.length) : st.value());
        };
        const eyeR = thrRatio(eye, eyeRev);
        const ballR = thrRatio(ball, ballRev);
        const acc = (round) => {
          const x = recs.filter((r) => r.round === round);
          return S.round(x.filter((r) => r.ok).length / x.length, 3);
        };
        const summary = {
          eyeballRatio: S.round(eyeR, 3),
          weber: S.round(weber(eyeR), 3),
          ballparkRatio: S.round(ballR, 3),
          ballparkWeber: S.round(weber(ballR), 3),
          eyeballAccuracy: acc('eyeball'),
          ballparkAccuracy: acc('ballpark'),
          haggleAccuracy: acc('haggle'),
          haggleMedianMs: S.round(S.median(recs.filter((r) => r.round === 'haggle' && r.ok).map((r) => r.rt))),
          haggleLevel: S.round(hag.value(), 2),
        };
        const choice = await WW.screens.results(container, {
          headline: `w = ${summary.weber}`,
          kv: [
            ['Eyeball threshold', `${summary.eyeballRatio} : 1 → Weber fraction ${summary.weber}`],
            ['Ballpark threshold', `${summary.ballparkRatio} : 1 → w ${summary.ballparkWeber}`],
            ['Haggle', `${Math.round(summary.haggleAccuracy * 100)}% at level ${Math.floor(summary.haggleLevel)}` + (summary.haggleMedianMs ? ` · ${(summary.haggleMedianMs / 1000).toFixed(1)} s median` : '')],
          ],
          notes: ['Lower Weber fraction = sharper number sense (adults typically ~0.1–0.25). Progress carries over only if you log the session.'],
          signal,
        });
        if (choice === 'save') {
          await ctx.saveState('progress', { eye: eye.toJSON(), ball: ball.toJSON(), haggle: hag.toJSON(), sessions: saved.sessions + 1 });
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
