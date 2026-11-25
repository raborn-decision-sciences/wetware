/* Trace (RAM / COMPILER): mental execution of tiny programs.
 *
 * A captured daemon is a few lines of register-machine code. Run it in
 * your head and predict a register's value when it halts. Program tracing
 * leans on working-memory updating and algorithmic thinking (computational
 * thinking, Wing 2006). No training-transfer evidence. Grade X.
 * Level (1-8) adds lines, registers, register-to-register ops, loops and
 * (level 8) a nested loop.
 * After a wrong answer the full execution trace is shown.
 */
(function (root) {
  'use strict';
  const WW = root.WW;

  const PROGRAMS = 8;
  const REGS = ['A', 'B', 'C', 'D'];
  const STEP_CAP = 400;
  const MAX_LEVEL = 8;
  const CONF_RATE = 1 / 3;

  /** Run a program; returns { regs, steps, trace } or null if it doesn't halt in STEP_CAP. */
  function run(prog) {
    const regs = { A: 0, B: 0, C: 0, D: 0 };
    const labels = {};
    prog.forEach((ins, i) => ins.op === 'LABEL' && (labels[ins.a] = i));
    const val = (x) => (typeof x === 'number' ? x : regs[x]);
    const trace = [];
    let pc = 0;
    let steps = 0;
    while (pc < prog.length) {
      if (++steps > STEP_CAP) return null;
      const ins = prog[pc];
      let next = pc + 1;
      switch (ins.op) {
        case 'MOV': regs[ins.a] = val(ins.b); break;
        case 'ADD': regs[ins.a] += val(ins.b); break;
        case 'SUB': regs[ins.a] -= val(ins.b); break;
        case 'SWP': [regs[ins.a], regs[ins.b]] = [regs[ins.b], regs[ins.a]]; break;
        case 'DEC': regs[ins.a] -= 1; break;
        case 'JNZ': if (regs[ins.a] !== 0) next = labels[ins.b]; break;
        default: break; // LABEL
      }
      if (ins.op !== 'LABEL') trace.push({ line: pc, text: fmt(ins), regs: Object.assign({}, regs) });
      pc = next;
    }
    return { regs, steps, trace };
  }

  function fmt(ins) {
    if (ins.op === 'LABEL') return `${ins.a}:`;
    if (ins.op === 'DEC') return `DEC ${ins.a}`;
    return `${ins.op} ${ins.a}, ${ins.b}`;
  }

  /** Generate a program for a level; returns { prog, ask, answer }. */
  function generate(rng, level) {
    const L = Math.max(1, Math.min(MAX_LEVEL, Math.round(level)));
    for (let attempt = 0; attempt < 200; attempt++) {
      const nRegs = L <= 1 ? 2 : L <= 3 ? 3 : 4;
      const regs = REGS.slice(0, nRegs);
      // Loop counters are set by their loops and never asked about.
      const counters = L >= 8 ? ['C', 'D'] : L >= 4 ? ['D'] : [];
      const prog = [];
      const operand = (allowReg, self) => (allowReg && rng.chance(0.5) ? rng.pick(regs.filter((r) => r !== self)) : rng.int(1, 9));
      const straight = (n, allowReg, allowSwp) => {
        for (let i = 0; i < n; i++) {
          const ops = ['ADD', 'SUB', 'ADD'];
          if (allowSwp) ops.push('SWP');
          const op = rng.pick(ops);
          const pool = regs.filter((r) => !counters.includes(r));
          const a = rng.pick(pool);
          if (op === 'SWP') {
            const b = rng.pick(pool.filter((r) => r !== a));
            if (b) prog.push({ op, a, b });
          } else prog.push({ op, a, b: operand(allowReg, a) });
        }
      };
      const loop = (ctr, label, count, body) => {
        prog.push({ op: 'MOV', a: ctr, b: count });
        prog.push({ op: 'LABEL', a: label });
        body();
        prog.push({ op: 'DEC', a: ctr });
        prog.push({ op: 'JNZ', a: ctr, b: label });
      };
      // Initialise every register used (the loop counters are set by their loops).
      regs.filter((r) => !counters.includes(r)).forEach((r) => prog.push({ op: 'MOV', a: r, b: rng.int(1, 9) }));
      if (L <= 3) {
        straight([0, 2, 3, 5][L], L >= 3, L >= 2);
      } else if (L <= 7) {
        // 4: one loop; 5: longer body, more turns, a closing line; 6: two loops; 7: two loops, three-line bodies.
        const loops = L >= 6 ? 2 : 1;
        for (let k = 0; k < loops; k++) loop('D', 'loop' + (k + 1), rng.int(2, L >= 5 ? 4 : 3), () => straight(L >= 7 ? 3 : L >= 5 ? 2 : 1, true, false));
        if (L >= 5) straight(L >= 7 ? 2 : 1, true, true);
      } else {
        // 8: a loop inside a loop; the inner counter restarts on every outer pass.
        loop('D', 'outer', rng.int(2, 3), () => {
          loop('C', 'inner', rng.int(2, 3), () => straight(2, true, false));
          straight(1, true, false);
        });
        straight(1, true, true);
      }
      const res = run(prog);
      if (!res) continue;
      // Ask about a register the program actually works on.
      const touched = new Set();
      prog.forEach((ins) => {
        if (['ADD', 'SUB', 'SWP'].includes(ins.op)) touched.add(ins.a);
        if (ins.op === 'SWP') touched.add(ins.b);
      });
      const askable = regs.filter((r) => touched.has(r) && !counters.includes(r));
      if (!askable.length) continue;
      const ask = rng.pick(askable);
      const answer = res.regs[ask];
      // Skip programs that leave the asked register where it started.
      if (answer === prog.find((ins) => ins.op === 'MOV' && ins.a === ask).b) continue;
      if (Math.abs(answer) > 200) continue;
      return { prog, ask, answer, trace: res.trace, level: L };
    }
    throw new Error('trace: could not generate');
  }

  WW.logic = WW.logic || {};
  WW.logic.trace = { run, generate, fmt, MAX_LEVEL };

  WW.games.register({
    id: 'trace',
    name: 'Trace',
    headline: (s) => `${s.correct}/${s.programs} · level ${s.level}`,
    tune(sessions) {
      const v = sessions.slice(0, 3).map((s) => s.summary && s.summary.level).filter(Number.isFinite);
      return v.length ? WW.stats.clamp01(WW.stats.mean(v) / MAX_LEVEL) : null;
    },
    mount(container, ctx) {
      const { h, clear } = ctx.ui;
      const T = ctx.timing;
      const S = WW.stats;
      const ac = new AbortController();
      const signal = ac.signal;
      const rng = ctx.rng;

      async function show(p, idx) {
        clear(container);
        const listing = h(
          'ol.tr-code',
          p.prog.map((ins) => h('li', { class: ins.op === 'LABEL' ? 'label' : '' }, fmt(ins)))
        );
        const input = h('input.fc-input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', 'aria-label': 'register value' });
        const go = h('button.btn.primary', { type: 'button' }, 'Submit');
        container.appendChild(
          h(
            'div.center',
            h('p.label', `Daemon ${idx + 1} / ${PROGRAMS} · level ${p.level}`),
            listing,
            h('p', `When it halts, what is in ${p.ask}?`),
            h('div.row', { style: { justifyContent: 'center' } }, input, go),
            h('p.muted.small', 'Registers start at 0. JNZ jumps to the label if the register is not zero. SWP swaps two registers.')
          )
        );
        input.focus();
        const t0 = T.now();
        const typed = await new Promise((resolve) => {
          const done = (v) => (root.removeEventListener('keydown', onKey, true), resolve(v));
          const onKey = (e) => {
            if (e.code === 'Enter' || e.code === 'NumpadEnter') {
              e.preventDefault();
              done(input.value);
            }
          };
          root.addEventListener('keydown', onKey, true);
          go.addEventListener('click', () => done(input.value));
          signal.addEventListener('abort', () => done(null));
        });
        if (typed === null) return null;
        const rt = T.now() - t0;
        const val = Number(String(typed).trim());
        const ok = String(typed).trim() !== '' && val === p.answer;
        let confidence = null;
        if (WW.confidence.shouldProbe(rng, CONF_RATE)) {
          const c = await WW.confidence.ask(container.querySelector('.center'), { prompt: 'How sure are you of that value?', signal });
          if (!c) return null;
          confidence = c.confidence;
        }
        ctx.audio.sfx(ok ? 'correct' : 'error');
        clear(container);
        const cont = h('button.btn.primary', { type: 'button' }, 'Continue');
        container.appendChild(
          h(
            'div.center',
            h('p.big', { style: { color: ok ? 'var(--good)' : 'var(--magenta)' } }, ok ? 'TRACED' : `${p.ask} = ${p.answer}`),
            ok
              ? null
              : h(
                  'table.tr-trace',
                  h('thead', h('tr', h('th', 'step'), h('th', 'instruction'), ...REGS.map((r) => h('th', r)))),
                  h('tbody', p.trace.slice(0, 40).map((s, i) => h('tr', h('td', String(i + 1)), h('td', s.text), ...REGS.map((r) => h('td', String(s.regs[r]))))))
                ),
            cont
          )
        );
        if (!(await WW.screens.waitForButton(cont, signal))) return null;
        return { ok, typed, rt, confidence };
      }

      (async () => {
        const saved = await ctx.loadState('progress', { stair: null, sessions: 0 });
        const st = saved.stair ? WW.Staircase.fromJSON(saved.stair) : new WW.Staircase({ rule: 'updown', nDown: 2, start: 1, step: 1, min: 1, max: MAX_LEVEL, integer: true, fastMultiplier: 1 });
        if (
          !(await WW.screens.intro(container, {
            kicker: 'RAM · COMPILER · tracing',
            title: 'Trace',
            body: ['A hostile daemon, disassembled. Execute it in your head, line by line, and report one register’s value at the end.', 'No scratch paper: that’s the workout. Wrong answers show the full trace so you can see where it slipped.'],
            kv: [['Session', `${PROGRAMS} daemons, about 5 min`], ['Level', `${st.value()} (adds lines, registers, loops)`]],
            button: 'Start',
            signal,
          }))
        )
          return;
        const recs = [];
        const startLevel = st.value();
        for (let i = 0; i < PROGRAMS; i++) {
          const level = st.value();
          const p = generate(rng, level);
          const r = await show(p, i);
          if (!r) return;
          st.update(r.ok);
          recs.push(Object.assign({ level }, r));
          ctx.session.trial({ condition: `level${p.level}`, stimulus: { program: p.prog.map(fmt), ask: p.ask, answer: p.answer, steps: p.trace.length }, response: r.typed, correct: r.ok, rt: r.rt, level, confidence: r.confidence });
        }
        const pairs = recs.filter((r) => r.confidence != null).map((r) => [r.confidence, r.ok]);
        const summary = {
          programs: recs.length,
          correct: recs.filter((r) => r.ok).length,
          startLevel,
          level: st.value(),
          medianMs: S.round(S.median(recs.filter((r) => r.ok).map((r) => r.rt))),
          confidencePairs: pairs,
        };
        const choice = await WW.screens.results(container, {
          headline: `${summary.correct} / ${summary.programs}`,
          kv: [
            ['Traced correctly', `${summary.correct} of ${summary.programs}`],
            ['Level', `${startLevel} → ${summary.level}`],
            ['Median time (correct)', summary.medianMs ? `${(summary.medianMs / 1000).toFixed(1)} s` : '—'],
          ],
          notes: ['Level carries over only if you log the session.'],
          signal,
        });
        if (choice === 'save') {
          await ctx.saveState('progress', { stair: st.toJSON(), sessions: saved.sessions + 1 });
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
