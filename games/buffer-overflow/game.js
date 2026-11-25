/* Buffer Overflow (RAM): complex span, operation and symmetry variants.
 *
 * Alternate a processing check (is this equation true? is this pattern
 * symmetric?) with a to-be-remembered item (a letter, or a square on a 4x4
 * grid); at the end of the set, recall the items in order. Daneman &
 * Carpenter (1980); Turner & Engle (1989); automated versions after
 * Unsworth et al. (2005): processing deadline = practice mean + 2.5 SD,
 * processing accuracy must stay >= 85%. Partial-credit unit scoring
 * (Conway et al. 2005). Set size adapts (weighted staircase, 60% perfect sets).
 * Evidence: WM capacity gains without fluid-intelligence gains
 * (Harrison et al. 2013). Grade B/C.
 */
(function (root) {
  'use strict';
  const WW = root.WW;

  const LETTERS = 'FHJKLNPQRSTY'.split('');
  const SETS = 10;
  const LETTER_MS = 800;
  const SQUARE_MS = 650;
  const PRACTICE_PROC = 12;

  /** "(a op b) ± c = d"; d is right when valid, else off by 1-3. */
  function equation(rng, valid) {
    for (;;) {
      const mulOp = rng.chance(0.5);
      let a, b, v;
      if (mulOp) {
        a = rng.int(2, 9);
        b = rng.int(2, 5);
        v = a * b;
      } else {
        b = rng.int(2, 5);
        v = rng.int(1, 6);
        a = v * b;
      }
      const c = rng.int(1, 9);
      const plus = rng.chance(0.5);
      const truth = plus ? v + c : v - c;
      if (truth < 1) continue;
      const shown = valid ? truth : truth + rng.pick([-3, -2, -1, 1, 2, 3]);
      if (shown < 0) continue;
      return { text: `(${a} ${mulOp ? '×' : '÷'} ${b}) ${plus ? '+' : '−'} ${c} = ${shown}`, valid, truth };
    }
  }

  /** 8x8 pattern; symmetric about the vertical axis when valid, else 1-3 cells broken. */
  function pattern(rng, valid) {
    const g = Array.from({ length: 8 }, () => Array(8).fill(false));
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 4; c++) {
        const on = rng.chance(0.45);
        g[r][c] = on;
        g[r][7 - c] = on;
      }
    if (!valid) {
      const flips = rng.int(1, 3);
      for (const k of rng.sample([...Array(32).keys()], flips)) {
        const r = Math.floor(k / 4);
        const c = 4 + (k % 4); // right half only, so the asymmetry is real
        g[r][c] = !g[r][c];
      }
    }
    return g;
  }
  const symmetric = (g) => g.every((row) => row.every((v, c) => v === row[7 - c]));

  /** One set: [{ proc, item }]. Letters never repeat within a set; squares neither. */
  function makeSet(rng, size, mode) {
    const items = mode === 'operation' ? rng.sample(LETTERS, size) : rng.sample([...Array(16).keys()], size);
    return items.map((item) => {
      const valid = rng.chance(0.5);
      return { item, valid, proc: mode === 'operation' ? equation(rng, valid) : pattern(rng, valid) };
    });
  }

  /** Partial credit: items in the right serial position / size. */
  function scoreSet(target, recalled) {
    let pos = 0;
    target.forEach((t, i) => {
      if (recalled[i] === t) pos++;
    });
    return { positions: pos, partial: pos / target.length, perfect: pos === target.length };
  }

  WW.logic = WW.logic || {};
  WW.logic.bufferOverflow = { equation, pattern, symmetric, makeSet, scoreSet, LETTERS };

  WW.games.register({
    id: 'buffer-overflow',
    name: 'Buffer Overflow',
    headline: (s) => `${s.mode} · partial ${Math.round(s.partialScore * 100)}% · set ${s.meanSetSize}`,
    /** RAM tune from mean set size: 2 -> 0, 9 (the staircase top) -> 1. */
    tune(sessions) {
      const v = sessions.slice(0, 3).map((s) => s.summary && s.summary.meanSetSize).filter(Number.isFinite);
      return v.length ? WW.stats.clamp01((WW.stats.mean(v) - 2) / 7) : null;
    },
    mount(container, ctx) {
      const { h, clear } = ctx.ui;
      const T = ctx.timing;
      const S = WW.stats;
      const ac = new AbortController();
      const signal = ac.signal;
      const rng = ctx.rng;

      function grid4(sel, cls) {
        return h(
          'div.bo-grid4',
          [...Array(16).keys()].map((k) => h('div.bo-cell4.stim', { class: 'bo-cell4 stim' + (k === sel ? ' ' + cls : '') }))
        );
      }
      function patternEl(g) {
        return h('div.bo-pattern.stim', g.flat().map((on) => h('i', { class: on ? 'on' : '' })));
      }

      /** Processing step. Returns { ok, rt, timeout } or null. */
      async function processing(step, mode, deadline, label) {
        clear(container);
        const yes = h('button.btn.bo-key', { type: 'button' }, h('kbd', 'F'), mode === 'operation' ? ' true' : ' symmetric');
        const no = h('button.btn.bo-key', { type: 'button' }, h('kbd', 'J'), mode === 'operation' ? ' false' : ' not symmetric');
        const stim = mode === 'operation' ? h('p.bo-eq.stim', step.proc.text) : patternEl(step.proc);
        container.appendChild(h('div.center', { style: { userSelect: 'none' } }, h('p.label', label), stim, h('div.row', { style: { justifyContent: 'center' } }, yes, no)));
        const onset = await T.onNextFrame();
        const r = await T.awaitChoice({ keyMap: { KeyF: true, KeyJ: false }, buttons: [{ el: yes, value: true }, { el: no, value: false }], timeoutMs: deadline, since: onset, signal });
        if (r.aborted) return null;
        return { ok: !r.timeout && r.value === step.valid, rt: r.timeout ? null : r.rt, timeout: !!r.timeout, input: r.input };
      }

      async function showItem(step, mode) {
        clear(container);
        container.appendChild(h('div.center', mode === 'operation' ? h('p.big.bo-letter.stim', step.item) : grid4(step.item, 'hot')));
        await T.sleep(mode === 'operation' ? LETTER_MS : SQUARE_MS);
        return !signal.aborted;
      }

      /** Recall screen. Resolves array of picks (null = blank) or null if aborted. */
      function recallScreen(size, mode, label) {
        clear(container);
        const picks = [];
        const shown = h('p.bo-picks', '');
        const render = () => {
          shown.textContent =
            mode === 'operation' ? (picks.length ? picks.map((p) => (p === null ? '_' : p)).join('  ') : 'tap in order') : `${picks.length} / ${size}` + (picks.includes(null) ? ` (${picks.filter((p) => p === null).length} blank)` : '');
          if (mode === 'symmetry')
            cells.forEach((c, k) => {
              const idx = picks.indexOf(k);
              c.textContent = idx >= 0 ? String(idx + 1) : '';
              c.classList.toggle('picked', idx >= 0);
            });
        };
        let cells = [];
        let board;
        if (mode === 'operation') {
          board = h('div.bo-letters', LETTERS.map((l) => h('button.btn.bo-letter-btn', { type: 'button', dataset: { v: l } }, l)));
        } else {
          cells = [...Array(16).keys()].map((k) => h('button.bo-cell4.pick', { type: 'button', dataset: { v: String(k) } }));
          board = h('div.bo-grid4', cells);
        }
        const blank = h('button.btn', { type: 'button' }, 'Blank');
        const undo = h('button.btn', { type: 'button' }, 'Undo');
        const done = h('button.btn.primary', { type: 'button' }, 'Done');
        container.appendChild(h('div.center', h('p.label', label), shown, board, h('div.row', { style: { justifyContent: 'center' } }, blank, undo, done), h('p.muted.small', `Recall all ${size} in order. Use Blank for one you lost.`)));
        render();
        return new Promise((resolve) => {
          const add = (v) => {
            if (picks.length < size) picks.push(v);
            render();
          };
          board.addEventListener('click', (e) => {
            const b = e.target.closest('button');
            if (!b) return;
            const v = mode === 'operation' ? b.dataset.v : Number(b.dataset.v);
            if (picks.includes(v)) return;
            add(v);
          });
          blank.addEventListener('click', () => add(null));
          undo.addEventListener('click', () => (picks.pop(), render()));
          const onKey = (e) => {
            if (mode === 'operation' && /^Key[A-Z]$/.test(e.code) && LETTERS.includes(e.code.slice(3)) && !picks.includes(e.code.slice(3))) add(e.code.slice(3));
            else if (e.code === 'Backspace') (picks.pop(), render());
            else if (e.code === 'Enter') finish();
            else return;
            e.preventDefault();
          };
          root.addEventListener('keydown', onKey, true);
          done.addEventListener('click', () => finish());
          signal.addEventListener('abort', () => finish(true));
          function finish(aborted) {
            root.removeEventListener('keydown', onKey, true);
            resolve(aborted ? null : picks.slice());
          }
        });
      }

      async function chooseMode(state) {
        clear(container);
        const b = (m, txt) => h('button.btn' + (m === state.lastMode ? '' : '.primary'), { type: 'button', dataset: { m } }, txt);
        const btns = [b('operation', `Operation span · set ${Math.round(state.level.operation)}`), b('symmetry', `Symmetry span · set ${Math.round(state.level.symmetry)}`)];
        container.appendChild(
          h(
            'div.center',
            h('p.label', 'RAM · working memory capacity'),
            h('p.big.title', 'Buffer Overflow'),
            h('p', 'Smuggle addresses through a checkpoint. Each step: pass a quick check (is the equation true? is the pattern mirror-symmetric?), then memorise the address that flashes (a letter, or a square on the grid).'),
            h('p', 'At the end of the set, recall the addresses in order. Keep the checks accurate (85%+): speed-skipping them doesn’t count.'),
            WW.screens.kvList([['Session', `${SETS} sets, about 5 min`], ['Adapts', 'set size (aims for ~60% perfect sets)']]),
            h('div.row', { style: { justifyContent: 'center' } }, btns),
            h('p.muted.small', 'The highlighted mode is the one you did less recently.')
          )
        );
        return new Promise((resolve) => {
          btns.forEach((x) => x.addEventListener('click', () => resolve(x.dataset.m)));
          signal.addEventListener('abort', () => resolve(null));
        });
      }

      (async () => {
        const state = await ctx.loadState('progress', { level: { operation: 3, symmetry: 3 }, stairs: {}, deadline: {}, lastMode: 'symmetry', sessions: 0 });
        const mode = await chooseMode(state);
        if (!mode) return;

        // Calibrate the processing deadline once per mode (Unsworth et al. 2005).
        if (!state.deadline[mode]) {
          if (!(await WW.screens.intro(container, { title: 'Calibrate', body: [`First, ${PRACTICE_PROC} checks on their own, so the deadline fits your speed.`], button: 'Go', signal }))) return;
          const rts = [];
          for (let i = 0; i < PRACTICE_PROC; i++) {
            const valid = rng.chance(0.5);
            const step = { valid, proc: mode === 'operation' ? equation(rng, valid) : pattern(rng, valid) };
            const r = await processing(step, mode, 10000, `Calibration ${i + 1} / ${PRACTICE_PROC}`);
            if (!r) return;
            if (r.ok) rts.push(r.rt);
          }
          state.deadline[mode] = Math.min(8000, Math.max(1500, Math.round(S.mean(rts) + 2.5 * (S.sd(rts) || 0)))) || 4000;
        }
        const deadline = state.deadline[mode];
        const st = state.stairs[mode] ? WW.Staircase.fromJSON(state.stairs[mode]) : new WW.Staircase({ rule: 'weighted', target: 0.6, start: state.level[mode], step: 0.4, min: 2, max: 9 });

        const sets = [];
        let procOk = 0;
        let procN = 0;
        for (let s = 0; s < SETS; s++) {
          const size = Math.round(st.value());
          const set = makeSet(rng, size, mode);
          for (let k = 0; k < set.length; k++) {
            const r = await processing(set[k], mode, deadline, `Set ${s + 1} / ${SETS} · check ${k + 1} / ${size}`);
            if (!r) return;
            procN++;
            if (r.ok) procOk++;
            if (!r.ok) ctx.audio.sfx('tick');
            if (!(await showItem(set[k], mode))) return;
          }
          const picks = await recallScreen(size, mode, `Set ${s + 1} / ${SETS} · recall`);
          if (!picks) return;
          const target = set.map((x) => x.item);
          const sc = scoreSet(target, picks);
          st.update(sc.perfect);
          sets.push({ size, ...sc });
          ctx.session.trial({ condition: mode, stimulus: { items: target }, response: picks, correct: sc.perfect, rt: null, level: size, score: S.round(sc.partial, 3) });
          clear(container);
          container.appendChild(h('div.center', h('p.big', { style: { color: sc.perfect ? 'var(--good)' : 'var(--amber)' } }, `${sc.positions} / ${size}`), h('p.muted', `Checks so far: ${Math.round((procOk / procN) * 100)}%` + (procOk / procN < 0.85 ? ' (keep them above 85%)' : ''))));
          ctx.audio.sfx(sc.perfect ? 'correct' : 'tick');
          await T.sleep(1100);
        }

        const summary = {
          mode,
          sets: sets.length,
          partialScore: S.round(S.mean(sets.map((x) => x.partial)), 3),
          absoluteScore: sets.filter((x) => x.perfect).reduce((a, x) => a + x.size, 0),
          perfectSets: sets.filter((x) => x.perfect).length,
          meanSetSize: S.round(S.mean(sets.map((x) => x.size)), 2),
          processingAccuracy: S.round(procOk / procN, 3),
          deadlineMs: deadline,
          level: S.round(st.value(), 2),
        };
        const choice = await WW.screens.results(container, {
          headline: `${Math.round(summary.partialScore * 100)}%`,
          tone: summary.processingAccuracy < 0.85 ? 'warn' : 'good',
          kv: [
            ['Partial-credit score', `${Math.round(summary.partialScore * 100)}% of items in place`],
            ['Perfect sets', `${summary.perfectSets} of ${summary.sets} (absolute score ${summary.absoluteScore})`],
            ['Mean set size', summary.meanSetSize],
            ['Check accuracy', `${Math.round(summary.processingAccuracy * 100)}%` + (summary.processingAccuracy < 0.85 ? ' (below 85%: span may be inflated)' : '')],
          ],
          notes: ['Set size carries over only if you log the session.'],
          signal,
        });
        if (choice === 'save') {
          state.stairs[mode] = st.toJSON();
          state.level[mode] = st.value();
          state.lastMode = mode;
          state.sessions++;
          await ctx.saveState('progress', state);
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
