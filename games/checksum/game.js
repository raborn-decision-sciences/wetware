/* Checksum (COMPILER / INFERENCE / ALU): cage-arithmetic logic grids.
 *
 * Fill an n x n grid so each row and column holds 1..n once, and every
 * outlined cage hits its target with its operation (sum; at higher levels
 * also product, difference, quotient). A generic Latin-square cage puzzle
 * in the Kakuro/Sudoku family. Every puzzle is solved by the generator
 * and has exactly one solution (givens are added until it does).
 * Evidence: number-puzzle use correlates with cognition in adults 50+
 * (Brooker et al. 2019; correlational); deduction + arithmetic fluency.
 * Grade C/X.
 */
(function (root) {
  'use strict';
  const WW = root.WW;

  const LEVELS = [
    null,
    { n: 4, ops: ['+'] },
    { n: 4, ops: ['+', '×', '−', '÷'] },
    { n: 5, ops: ['+'] },
    { n: 5, ops: ['+', '×', '−', '÷'] },
    { n: 6, ops: ['+'] },
    { n: 6, ops: ['+', '×', '−', '÷'] },
    { n: 7, ops: ['+'] },
    { n: 7, ops: ['+', '×', '−', '÷'] },
  ];
  const MAX_LEVEL = LEVELS.length - 1;

  /** Random Latin square: cyclic base, shuffled rows, columns and symbols. */
  function latin(rng, n) {
    const rows = rng.shuffle([...Array(n).keys()]);
    const cols = rng.shuffle([...Array(n).keys()]);
    const sym = rng.shuffle([...Array(n).keys()].map((x) => x + 1));
    return rows.map((r) => cols.map((c) => sym[(r + c) % n]));
  }

  /** Partition cells into connected cages of size 1-4 (mostly 2-3). */
  function cages(rng, n) {
    const id = Array.from({ length: n }, () => Array(n).fill(-1));
    const out = [];
    const order = rng.shuffle([...Array(n * n).keys()]);
    for (const k of order) {
      const r0 = Math.floor(k / n);
      const c0 = k % n;
      if (id[r0][c0] >= 0) continue;
      const want = rng.pick([1, 2, 2, 2, 3, 3, 3, 4]);
      const cells = [[r0, c0]];
      id[r0][c0] = out.length;
      while (cells.length < want) {
        const opts = [];
        for (const [r, c] of cells)
          for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const rr = r + dr;
            const cc = c + dc;
            if (rr >= 0 && rr < n && cc >= 0 && cc < n && id[rr][cc] < 0) opts.push([rr, cc]);
          }
        if (!opts.length) break;
        const [rr, cc] = rng.pick(opts);
        id[rr][cc] = out.length;
        cells.push([rr, cc]);
      }
      out.push({ cells });
    }
    return out;
  }

  function assignOps(rng, cg, sol, ops) {
    for (const g of cg) {
      const v = g.cells.map(([r, c]) => sol[r][c]);
      const choices = ['+'];
      if (ops.includes('×')) choices.push('×');
      if (v.length === 2 && ops.includes('−')) choices.push('−');
      if (v.length === 2 && ops.includes('÷') && Math.max(...v) % Math.min(...v) === 0) choices.push('÷');
      g.op = v.length === 1 ? '=' : rng.pick(choices);
      g.target = evalCage(g.op, v);
    }
  }

  function evalCage(op, v) {
    if (op === '=') return v[0];
    if (op === '+') return v.reduce((a, b) => a + b, 0);
    if (op === '×') return v.reduce((a, b) => a * b, 1);
    if (op === '−') return Math.abs(v[0] - v[1]);
    return Math.max(v[0], v[1]) / Math.min(v[0], v[1]);
  }

  /**
   * Count solutions (stops at `limit`). Cells are filled cage by cage so
   * cage targets prune early; sums also prune on partial totals.
   */
  function solve(n, cg, givens, limit = 2) {
    const grid = Array.from({ length: n }, () => Array(n).fill(0));
    const cageOf = Array.from({ length: n }, () => Array(n).fill(null));
    cg.forEach((g) => g.cells.forEach(([r, c]) => (cageOf[r][c] = g)));
    const order = [];
    cg.slice()
      .sort((a, b) => a.cells.length - b.cells.length)
      .forEach((g) => g.cells.forEach((cell) => order.push(cell)));
    const rowUsed = Array.from({ length: n }, () => new Set());
    const colUsed = Array.from({ length: n }, () => new Set());
    let count = 0;
    let first = null;
    let nodes = 0;
    const cageOk = (g) => {
      const vals = g.cells.map(([r, c]) => grid[r][c]);
      const filled = vals.filter((x) => x);
      if (g.op === '+') {
        const s = filled.reduce((a, b) => a + b, 0);
        if (filled.length === vals.length) return s === g.target;
        return s + (vals.length - filled.length) <= g.target;
      }
      if (filled.length < vals.length) {
        if (g.op === '×') return g.target % filled.reduce((a, b) => a * b, 1) === 0;
        return true;
      }
      return evalCage(g.op, vals) === g.target;
    };
    const rec = (i) => {
      if (count >= limit) return;
      if (++nodes > 2e6) throw new Error('checksum: solver budget exceeded');
      if (i === order.length) {
        count++;
        if (!first) first = grid.map((r) => r.slice());
        return;
      }
      const [r, c] = order[i];
      const given = givens[r][c];
      for (let v = given || 1; v <= (given || n); v++) {
        if (rowUsed[r].has(v) || colUsed[c].has(v)) continue;
        grid[r][c] = v;
        if (cageOk(cageOf[r][c])) {
          rowUsed[r].add(v);
          colUsed[c].add(v);
          rec(i + 1);
          rowUsed[r].delete(v);
          colUsed[c].delete(v);
        }
        grid[r][c] = 0;
      }
    };
    rec(0);
    return { count, first, nodes };
  }

  /** A puzzle with exactly one solution: { n, cages, solution, givens, level }. */
  function puzzle(rng, level) {
    const spec = LEVELS[Math.max(1, Math.min(MAX_LEVEL, level))];
    for (let attempt = 0; attempt < 20; attempt++) {
      const sol = latin(rng, spec.n);
      const cg = cages(rng, spec.n);
      assignOps(rng, cg, sol, spec.ops);
      const givens = Array.from({ length: spec.n }, () => Array(spec.n).fill(0));
      try {
        // Add givens where alternative solutions differ until unique (rarely more than 1-2).
        for (let g = 0; g <= spec.n; g++) {
          const res = solve(spec.n, cg, givens, 2);
          if (res.count === 1) return { n: spec.n, cages: cg, solution: sol, givens, level, ops: spec.ops };
          // Find a cell where some other solution differs from ours, and give it.
          const alt = findAlternative(spec.n, cg, givens, sol);
          if (!alt) break;
          givens[alt[0]][alt[1]] = sol[alt[0]][alt[1]];
        }
      } catch (_) {
        /* solver budget: try another layout */
      }
    }
    throw new Error('checksum: could not build a unique puzzle');
  }

  /** A cell where some solution other than `sol` differs from it, or null. */
  function findAlternative(n, cg, givens, sol) {
    // Forbid our solution in one cell at a time; if still solvable, that cell is ambiguous.
    const cells = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (!givens[r][c]) cells.push([r, c]);
    for (const [r, c] of cells) {
      const res = solveExcluding(n, cg, givens, r, c, sol[r][c]);
      if (res) return [r, c];
    }
    return null;
  }
  function solveExcluding(n, cg, givens, r0, c0, banned) {
    // Same solver with one value banned at one cell.
    const patched = cg.map((g) => g);
    const g2 = givens.map((row) => row.slice());
    for (let v = 1; v <= n; v++) {
      if (v === banned) continue;
      g2[r0][c0] = v;
      if (solve(n, patched, g2, 1).count) return true;
    }
    return false;
  }

  WW.logic = WW.logic || {};
  WW.logic.checksum = { latin, cages, solve, puzzle, evalCage, LEVELS, MAX_LEVEL };

  WW.games.register({
    id: 'checksum',
    name: 'Checksum',
    headline: (s) => `${s.n}×${s.n} ${s.solved ? 'solved' : 'abandoned'}` + (s.solved ? ` in ${Math.round(s.timeMs / 1000)} s` : ''),
    tune(sessions) {
      const s = sessions.find((x) => x.summary && Number.isFinite(x.summary.level));
      return s ? WW.stats.clamp01((s.summary.level - 1 + (s.summary.solved ? 1 : 0)) / MAX_LEVEL) : null;
    },
    mount(container, ctx) {
      const { h, clear } = ctx.ui;
      const T = ctx.timing;
      const S = WW.stats;
      const ac = new AbortController();
      const signal = ac.signal;
      const rng = ctx.rng;

      (async () => {
        const saved = await ctx.loadState('progress', { level: 1, sessions: 0 });
        if (
          !(await WW.screens.intro(container, {
            kicker: 'COMPILER · INFERENCE · ALU',
            title: 'Checksum',
            body: [
              'A corrupted checksum block. Fill the grid so every row and column holds each number once, and every outlined cage hits its target: "12+" means the cells add to 12; "6×" multiply to 6; "2−" differ by 2; "3÷" divide to 3.',
              'Pure logic: every block has exactly one answer. Click a cell, type a number. Check when you’re ready.',
            ],
            kv: [['Level', `${saved.level}: ${LEVELS[saved.level].n}×${LEVELS[saved.level].n}, ${LEVELS[saved.level].ops.length > 1 ? 'all four operations' : 'sums only'}`], ['Keys', 'digits, Backspace, arrows']],
            button: 'Start',
            signal,
          }))
        )
          return;
        clear(container);
        container.appendChild(h('div.center', h('p.label', 'Compiling block…')));
        await T.sleep(30);
        const pz = puzzle(rng, saved.level);
        const n = pz.n;
        const cageId = Array.from({ length: n }, () => Array(n).fill(-1));
        pz.cages.forEach((g, i) => g.cells.forEach(([r, c]) => (cageId[r][c] = i)));
        const entries = pz.givens.map((row) => row.slice());
        let sel = [0, 0];
        let checks = 0;
        let wrongMarked = 0;
        const t0 = T.now();

        clear(container);
        const cells = [];
        const grid = h('div.cs-grid', { style: { gridTemplateColumns: `repeat(${n}, 1fr)` } });
        for (let r = 0; r < n; r++)
          for (let c = 0; c < n; c++) {
            const id = cageId[r][c];
            const g = pz.cages[id];
            const isHead = g.cells.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1])[0];
            const head = isHead[0] === r && isHead[1] === c;
            const b = h('button.cs-cell', { type: 'button', dataset: { r: String(r), c: String(c) } }, head ? h('span.cs-tag', `${g.target}${g.op === '=' ? '' : g.op}`) : null, h('span.cs-val', ''));
            const edge = (rr, cc) => rr < 0 || rr >= n || cc < 0 || cc >= n || cageId[rr][cc] !== id;
            b.style.borderTopWidth = edge(r - 1, c) ? '3px' : '1px';
            b.style.borderBottomWidth = edge(r + 1, c) ? '3px' : '1px';
            b.style.borderLeftWidth = edge(r, c - 1) ? '3px' : '1px';
            b.style.borderRightWidth = edge(r, c + 1) ? '3px' : '1px';
            if (pz.givens[r][c]) b.classList.add('given');
            cells.push(b);
            grid.appendChild(b);
          }
        const msg = h('p.label', '');
        const pad = h('div.row', { style: { justifyContent: 'center' } }, [...Array(n).keys()].map((k) => h('button.btn.cs-pad', { type: 'button', dataset: { v: String(k + 1) } }, String(k + 1))), h('button.btn.cs-pad', { type: 'button', dataset: { v: '0' } }, '⌫'));
        const checkBtn = h('button.btn.primary', { type: 'button' }, 'Check');
        const giveUp = h('button.btn', { type: 'button' }, 'Give up');
        container.appendChild(h('div.center', msg, grid, pad, h('div.row', { style: { justifyContent: 'center' } }, checkBtn, giveUp)));

        const render = () => {
          cells.forEach((b) => {
            const r = Number(b.dataset.r);
            const c = Number(b.dataset.c);
            b.querySelector('.cs-val').textContent = entries[r][c] ? String(entries[r][c]) : '';
            b.classList.toggle('sel', r === sel[0] && c === sel[1]);
          });
          msg.textContent = `${Math.floor((T.now() - t0) / 1000)} s · checks ${checks}`;
        };
        const tick = setInterval(render, 1000);
        render();
        const set = (v) => {
          const [r, c] = sel;
          if (pz.givens[r][c]) return;
          entries[r][c] = v;
          cells[r * n + c].classList.remove('bad');
          render();
        };

        const outcome = await new Promise((resolve) => {
          grid.addEventListener('click', (e) => {
            const b = e.target.closest('.cs-cell');
            if (!b) return;
            sel = [Number(b.dataset.r), Number(b.dataset.c)];
            render();
          });
          pad.addEventListener('click', (e) => {
            const b = e.target.closest('button');
            if (b) set(Number(b.dataset.v));
          });
          const onKey = (e) => {
            const m = /^(?:Digit|Numpad)([0-9])$/.exec(e.code);
            if (m && Number(m[1]) <= n) set(Number(m[1]));
            else if (e.code === 'Backspace' || e.code === 'Delete') set(0);
            else if (e.code === 'ArrowUp') sel[0] = Math.max(0, sel[0] - 1);
            else if (e.code === 'ArrowDown') sel[0] = Math.min(n - 1, sel[0] + 1);
            else if (e.code === 'ArrowLeft') sel[1] = Math.max(0, sel[1] - 1);
            else if (e.code === 'ArrowRight') sel[1] = Math.min(n - 1, sel[1] + 1);
            else if (e.code === 'Enter') return check();
            else return;
            e.preventDefault();
            render();
          };
          const check = () => {
            checks++;
            let wrong = 0;
            let empty = 0;
            for (let r = 0; r < n; r++)
              for (let c = 0; c < n; c++) {
                if (!entries[r][c]) empty++;
                else if (entries[r][c] !== pz.solution[r][c]) {
                  wrong++;
                  cells[r * n + c].classList.add('bad');
                }
              }
            wrongMarked += wrong;
            render();
            if (!wrong && !empty) return done({ solved: true });
            ctx.audio.sfx(wrong ? 'error' : 'tick');
            msg.textContent = wrong ? `${wrong} corrupted cell(s) flagged` : `${empty} cell(s) still empty, no errors so far`;
          };
          checkBtn.addEventListener('click', check);
          giveUp.addEventListener('click', () => done({ solved: false }));
          root.addEventListener('keydown', onKey, true);
          signal.addEventListener('abort', () => done(null));
          function done(v) {
            clearInterval(tick);
            root.removeEventListener('keydown', onKey, true);
            resolve(v);
          }
        });
        if (!outcome) return;
        const timeMs = T.now() - t0;
        if (!outcome.solved) {
          for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) entries[r][c] = pz.solution[r][c];
          cells.forEach((b) => b.querySelector('.cs-val') && (b.querySelector('.cs-val').textContent = String(entries[Number(b.dataset.r)][Number(b.dataset.c)])));
          await T.sleep(2500);
        } else {
          ctx.audio.sfx('unlock');
          await T.sleep(900);
        }
        ctx.session.trial({ condition: `n${n}-${pz.ops.length > 1 ? 'allops' : 'sum'}`, stimulus: { n, cages: pz.cages.length, givens: pz.givens.flat().filter(Boolean).length }, response: outcome.solved ? 'solved' : 'gave-up', correct: outcome.solved, rt: timeMs, level: pz.level, checks, wrongMarked });
        const nextLevel = outcome.solved && checks <= 1 ? Math.min(MAX_LEVEL, saved.level + 1) : outcome.solved ? saved.level : Math.max(1, saved.level - 1);
        const summary = { level: saved.level, n, ops: pz.ops.join(''), solved: outcome.solved, timeMs: S.round(timeMs), checks, wrongMarked, givens: pz.givens.flat().filter(Boolean).length, nextLevel };
        const choice = await WW.screens.results(container, {
          headline: outcome.solved ? `${Math.round(timeMs / 1000)} S` : 'ABANDONED',
          tone: outcome.solved ? 'good' : 'warn',
          kv: [
            ['Block', `${n}×${n}, ${pz.ops.length > 1 ? 'all operations' : 'sums'}`],
            ['Result', outcome.solved ? `solved in ${(timeMs / 1000).toFixed(0)} s` : 'gave up'],
            ['Checks · cells flagged', `${checks} · ${wrongMarked}`],
            ['Next level', nextLevel],
          ],
          notes: ['Solve with at most one check to move up a level. Level carries over only if you log the session.'],
          signal,
        });
        if (choice === 'save') {
          await ctx.saveState('progress', { level: nextLevel, sessions: saved.sessions + 1 });
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
