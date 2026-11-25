/* Weekly Gauntlet: a Devil's-Plan-style elimination run (structure only).
 *
 * Short rounds drawn from four training modules (arithmetic, matrices,
 * code tracing, mental rotation), each tier harder than the last. Fail a
 * round and you take a strike; three strikes and you're out. A capstone
 * event for fun: it never reads or writes any module's difficulty state,
 * so the adaptive training data stays clean (PLAN §6).
 */
(function (root) {
  'use strict';
  const WW = root.WW;

  const STRIKES = 3;
  const MAX_ROUNDS = 12;
  const TYPES = ['arithmetic', 'matrix', 'trace', 'rotation'];

  /** ISO-8601 week key, e.g. 2026-W48. */
  function weekKey(ts) {
    const d = new Date(ts);
    const day = (d.getDay() + 6) % 7; // Monday = 0
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - day + 3); // Thursday of this week
    const jan4 = new Date(d.getFullYear(), 0, 4);
    const week = 1 + Math.round(((d - jan4) / 864e5 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
    return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
  }

  WW.logic = WW.logic || {};
  WW.logic.gauntlet = { weekKey, TYPES, STRIKES };

  WW.games.register({
    id: 'gauntlet',
    name: 'Weekly Gauntlet',
    headline: (s) => `${s.passed} rounds survived (${s.week})`,
    mount(container, ctx) {
      const { h, clear } = ctx.ui;
      const T = ctx.timing;
      const ac = new AbortController();
      const signal = ac.signal;
      const rng = ctx.rng;
      const L = WW.logic;

      const typedAnswer = (prompt, extra, timeoutMs) =>
        new Promise((resolve) => {
          clear(container);
          const input = h('input.fc-input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', 'aria-label': 'answer' });
          const clock = h('p.label', '');
          container.appendChild(h('div.center', clock, extra || null, h('p.fc-problem', prompt), input));
          input.focus();
          const t0 = T.now();
          const tick = setInterval(() => (clock.textContent = `${Math.max(0, Math.ceil((timeoutMs - (T.now() - t0)) / 1000))} s`), 200);
          const done = (v) => {
            clearInterval(tick);
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
          const to = setTimeout(() => done(''), timeoutMs);
          root.addEventListener('keydown', onKey, true);
          signal.addEventListener('abort', () => done(null));
        });

      /** Each round returns { passed, detail } or null if aborted. */
      const ROUNDS = {
        async arithmetic(tier) {
          let right = 0;
          for (let i = 0; i < 4; i++) {
            const p = L.fence.problem(rng, Math.min(12, tier + 2));
            const a = await typedAnswer(`“${p.text}”`, h('p.label', `Arithmetic ${i + 1} / 4`), Math.max(10000, 22000 - tier * 1500));
            if (a === null) return null;
            if (Number(a) === p.answer) right++;
          }
          return { passed: right >= 3, detail: `${right}/4` };
        },
        async matrix(tier) {
          let right = 0;
          for (let i = 0; i < 2; i++) {
            const it = L.cipherMatrix.item(rng, Math.min(10, tier + 2));
            clear(container);
            const opts = it.options.map((c, k) => h('button.cm-choice', { type: 'button' }, L.cipherMatrix.cellSvg(c), h('span', String(k + 1))));
            container.appendChild(h('div.center', h('p.label', `Matrix ${i + 1} / 2`), h('div.cm-grid', it.cells.map((row, r) => row.map((c, j) => (r === 2 && j === 2 ? h('div.cm-missing', '?') : h('div.cm-slot', L.cipherMatrix.cellSvg(c)))))), h('div.cm-options', opts)));
            const keyMap = {};
            for (let k = 1; k <= 8; k++) keyMap['Digit' + k] = k - 1;
            const r = await T.awaitChoice({ keyMap, buttons: opts.map((el, k) => ({ el, value: k })), timeoutMs: 60000, signal });
            if (r.aborted) return null;
            if (!r.timeout && r.value === it.correctIndex) right++;
          }
          return { passed: right === 2, detail: `${right}/2` };
        },
        async trace(tier) {
          const p = L.trace.generate(rng, Math.min(6, Math.ceil(tier / 1.5)));
          const listing = h('ol.tr-code', p.prog.map((ins) => h('li', { class: ins.op === 'LABEL' ? 'label' : '' }, L.trace.fmt(ins))));
          const a = await typedAnswer(`When it halts, what is in ${p.ask}?`, listing, 90000);
          if (a === null) return null;
          return { passed: a.trim() !== '' && Number(a) === p.answer, detail: `${p.ask}=${p.answer}` };
        },
        async rotation(tier) {
          const H = L.hardpoint;
          let right = 0;
          for (let i = 0; i < 4; i++) {
            const t = H.makeTrial(rng, Math.min(16, tier * 2));
            clear(container);
            const size = Math.floor(Math.min(root.innerWidth * 0.44, 260));
            const dpr = Math.min(2, root.devicePixelRatio || 1);
            const mk = () => {
              const c = h('canvas.hp-canvas');
              c.width = c.height = Math.round(size * dpr);
              c.style.width = c.style.height = size + 'px';
              return c;
            };
            const a = mk();
            const b = mk();
            const same = h('button.btn.hp-key', { type: 'button' }, h('kbd', 'F'), ' same');
            const mir = h('button.btn.hp-key', { type: 'button' }, h('kbd', 'J'), ' mirror');
            container.appendChild(h('div.center', h('p.label', `Rotation ${i + 1} / 4`), h('div.row', { style: { justifyContent: 'center' } }, a, b), h('div.row', { style: { justifyContent: 'center' } }, same, mir)));
            const I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
            H.draw(a, t.cubes, t.base, I);
            H.draw(b, t.mirror ? H.mirror(t.cubes) : t.cubes, t.base, t.axis === 'picture' ? H.rz(H.deg(t.angle)) : H.ry(H.deg(t.angle)));
            const r = await T.awaitChoice({ keyMap: { KeyF: false, KeyJ: true }, buttons: [{ el: same, value: false }, { el: mir, value: true }], timeoutMs: Math.max(3000, 8000 - tier * 400), signal });
            if (r.aborted) return null;
            if (!r.timeout && r.value === t.mirror) right++;
          }
          return { passed: right >= 3, detail: `${right}/4` };
        },
      };

      (async () => {
        const week = weekKey(Date.now());
        if (
          !(await WW.screens.intro(container, {
            kicker: 'Weekly event',
            title: 'Gauntlet',
            body: [
              'Rook’s stress test. Rounds come from four modules (arithmetic, cipher lattices, daemon traces, rotations) and every round is harder than the last.',
              `Fail a round, take a strike. ${STRIKES} strikes and you’re out. This never touches your training levels.`,
            ],
            kv: [['Week', week], ['Max', `${MAX_ROUNDS} rounds`]],
            button: 'Enter',
            signal,
          }))
        )
          return;
        ctx.audio.unlock();
        let strikes = 0;
        let passed = 0;
        const order = rng.shuffle(TYPES);
        const log = [];
        for (let tier = 1; tier <= MAX_ROUNDS && strikes < STRIKES; tier++) {
          const type = order[(tier - 1) % order.length];
          clear(container);
          container.appendChild(h('div.center', h('p.label', `Round ${tier}`), h('p.big.title', type.toUpperCase()), h('p', `Strikes: ${'✖'.repeat(strikes)}${'·'.repeat(STRIKES - strikes)}`)));
          await T.sleep(1400);
          if (signal.aborted) return;
          const r = await ROUNDS[type](tier);
          if (!r) return;
          if (r.passed) passed++;
          else strikes++;
          log.push({ tier, type, passed: r.passed, detail: r.detail });
          ctx.session.trial({ condition: type, stimulus: { tier }, response: r.detail, correct: r.passed, rt: null, level: tier });
          ctx.audio.sfx(r.passed ? 'correct' : 'klaxon');
          clear(container);
          container.appendChild(h('div.center', h('p.big', { style: { color: r.passed ? 'var(--good)' : 'var(--magenta)' } }, r.passed ? 'CLEARED' : 'STRIKE'), h('p.muted', r.detail)));
          await T.sleep(1200);
        }
        const summary = { week, passed, strikes, rounds: log.length, log };
        const choice = await WW.screens.results(container, {
          headline: `${passed} ROUNDS`,
          tone: strikes >= STRIKES ? 'warn' : 'good',
          kv: [
            ['Survived', `${passed} of ${log.length} rounds`],
            ['Rounds', log.map((x) => `${x.tier}. ${x.type} ${x.passed ? '✔' : '✖'}`).join('  ')],
          ],
          notes: ['Your best run each week is shown on the hub.'],
          signal,
        });
        if (choice === 'save') ctx.finish(summary);
        else ctx.abort();
      })().catch((e) => console.error(e));

      return {
        stop() {
          ac.abort();
        },
      };
    },
  });
})(globalThis);
