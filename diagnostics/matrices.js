/* Diagnostic: held-out matrix reasoning.
 * Raven-style 3x3 matrices built from a vocabulary reserved for diagnostics:
 * line segments on a 3x3 dot lattice plus a row of count dots. The training
 * module Cipher Matrix must never use this lattice vocabulary or these
 * rules on it (PLAN §5, item 9), so practice there doesn't inflate this.
 *
 * Rules (Carpenter, Just & Shell 1990 taxonomy):
 *   or / xor / and  third cell = first (op) second, applied to segments
 *   rot             the shape rotates 90° clockwise each column
 *   dots            count of dots changes by a constant step across the row
 * 10 items: 5 one-rule, 5 two-rule. 8 options each.
 */
(function (root) {
  'use strict';
  const WW = root.WW;

  // Lattice points 0..8 = (row, col), row-major. Edges: 12 orthogonal + 8 small diagonals.
  const EDGES = [];
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) {
      const i = r * 3 + c;
      if (c < 2) EDGES.push([i, i + 1]);
      if (r < 2) EDGES.push([i, i + 3]);
      if (r < 2 && c < 2) {
        EDGES.push([i, i + 4]);
        EDGES.push([i + 1, i + 3]);
      }
    }
  const edgeIndex = new Map(EDGES.map(([a, b], k) => [Math.min(a, b) + '-' + Math.max(a, b), k]));
  const pt = (i) => [Math.floor(i / 3), i % 3];
  const id = (r, c) => r * 3 + c;

  function mapEdges(fn) {
    return EDGES.map(([a, b]) => {
      const [ra, ca] = fn(...pt(a));
      const [rb, cb] = fn(...pt(b));
      const x = id(ra, ca);
      const y = id(rb, cb);
      return edgeIndex.get(Math.min(x, y) + '-' + Math.max(x, y));
    });
  }
  const ROT = mapEdges((r, c) => [c, 2 - r]); // 90° clockwise
  const FLIP = mapEdges((r, c) => [r, 2 - c]); // left-right mirror

  const applyMap = (map, mask) => {
    let out = 0;
    for (let k = 0; k < EDGES.length; k++) if (mask & (1 << k)) out |= 1 << map[k];
    return out;
  };
  const rot = (m, n = 1) => {
    for (let i = 0; i < ((n % 4) + 4) % 4; i++) m = applyMap(ROT, m);
    return m;
  };
  const flip = (m) => applyMap(FLIP, m);
  const popcount = (m) => {
    let c = 0;
    while (m) {
      m &= m - 1;
      c++;
    }
    return c;
  };
  const OPS = { or: (a, b) => a | b, xor: (a, b) => a ^ b, and: (a, b) => a & b };

  function randomMask(rng, lo, hi) {
    const n = rng.int(lo, hi);
    let m = 0;
    for (const k of rng.sample(EDGES.map((_, i) => i), n)) m |= 1 << k;
    return m;
  }

  /** Row of three segment masks following `rule`. */
  function segRow(rng, rule) {
    for (let attempt = 0; attempt < 1000; attempt++) {
      if (rule === 'rot') {
        const s = randomMask(rng, 3, 5);
        if (rot(s) === s || rot(s, 2) === s || flip(s) === s) continue;
        return [s, rot(s), rot(s, 2)];
      }
      if (rule === 'const') {
        const s = randomMask(rng, 3, 5);
        return [s, s, s];
      }
      const and = rule === 'and';
      const a = randomMask(rng, and ? 4 : 3, and ? 5 : 4);
      const b = randomMask(rng, and ? 4 : 3, and ? 5 : 4);
      const ov = popcount(a & b);
      if (a === b || ov < (and ? 2 : 1) || ov > (and ? 3 : 2)) continue;
      const c = OPS[rule](a, b);
      if (!c || c === a || c === b) continue;
      return [a, b, c];
    }
    throw new Error('matrices: segRow failed for ' + rule);
  }

  /** Row of dot counts: base + step * column. */
  function dotRow(rng, step) {
    const base = step > 0 ? rng.int(0, 2) : rng.int(2, 3) + 1;
    return [base, base + step, base + 2 * step];
  }

  const ITEM_PLAN = [
    { seg: 'const', dots: 1 },
    { seg: 'or', dots: null },
    { seg: 'rot', dots: null },
    { seg: 'and', dots: null },
    { seg: 'xor', dots: null },
    { seg: 'rot', dots: 1 },
    { seg: 'or', dots: -1 },
    { seg: 'and', dots: 1 },
    { seg: 'xor', dots: -1 },
    { seg: 'xor', dots: 1 },
  ];

  const cellKey = (c) => c.seg + ':' + c.dots;

  /** Third cell a segment rule predicts from a row's first two cells (null = rule can't apply). */
  function predict(rule, a, b) {
    if (rule === 'rot') return b === rot(a) ? rot(a, 2) : null;
    if (rule === 'const') return a === b ? a : null;
    return OPS[rule](a, b);
  }

  /**
   * An item is ambiguous if another segment rule also explains rows 0-1 but
   * predicts a different answer for row 2. (Rules that agree everywhere,
   * e.g. const vs or on identical cells, are harmless.)
   */
  function unambiguous(rows, rule) {
    const answer = rows[2][2];
    for (const alt of ['or', 'xor', 'and', 'rot', 'const']) {
      if (alt === rule) continue;
      const fitsShown = rows.slice(0, 2).every(([a, b, c]) => predict(alt, a, b) === c);
      if (fitsShown && predict(alt, rows[2][0], rows[2][1]) !== answer) return false;
    }
    return true;
  }

  function item(rng, plan) {
    for (let attempt = 0; attempt < 200; attempt++) {
      const segRows = [0, 1, 2].map(() => segRow(rng, plan.seg));
      if (new Set(segRows.map((r) => r[0])).size < 3) continue;
      if (!unambiguous(segRows, plan.seg)) continue;
      const dRows = plan.dots === null ? null : [0, 1, 2].map(() => dotRow(rng, plan.dots));
      if (dRows && new Set(dRows.map((r) => r[0])).size < 2) continue;
      const cells = segRows.map((r, i) => r.map((seg, j) => ({ seg, dots: dRows ? dRows[i][j] : 0 })));
      const answer = cells[2][2];
      const options = distractors(rng, plan, cells, answer);
      if (options.length < 7) continue;
      const all = rng.shuffle([answer, ...options.slice(0, 7)]);
      return { plan, cells, answer, options: all, correctIndex: all.indexOf(answer) };
    }
    throw new Error('matrices: could not generate item');
  }

  function distractors(rng, plan, cells, answer) {
    const [a, b] = [cells[2][0], cells[2][1]];
    const d = answer.dots;
    const pool = [];
    const add = (seg, dots) => pool.push({ seg, dots });
    // Wrong rule on the right inputs.
    for (const op of Object.keys(OPS)) if (op !== plan.seg) add(OPS[op](a.seg, b.seg), d);
    if (plan.seg === 'rot') {
      add(rot(a.seg, 3), d); // counter-clockwise
      add(flip(answer.seg), d); // mirror image
      add(b.seg, d); // no rotation
    }
    // Copies of row neighbours.
    add(a.seg, d);
    add(b.seg, d);
    // Right segments, wrong count (only when dots carry a rule).
    if (plan.dots !== null) {
      add(answer.seg, d + 1);
      add(answer.seg, Math.max(0, d - 1));
      add(answer.seg, b.dots);
    }
    // One- and two-edge perturbations of the answer.
    for (let i = 0; i < 12; i++) {
      const k = rng.int(0, EDGES.length - 1);
      add(answer.seg ^ (1 << k), d);
    }
    const seen = new Set([cellKey(answer)]);
    const out = [];
    const semantic = pool.slice(0, pool.length - 12);
    const perturb = pool.slice(pool.length - 12);
    for (const c of [...rng.shuffle(semantic), ...perturb]) {
      if (!c.seg || c.dots < 0 || c.dots > 6) continue;
      const k = cellKey(c);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(c);
    }
    return out;
  }

  WW.dxLogic = WW.dxLogic || {};
  WW.dxLogic.matrices = { EDGES, ROT, FLIP, rot, flip, popcount, OPS, segRow, item, ITEM_PLAN, cellKey, unambiguous, predict };

  // ------------------------------------------------------------------ view

  const NS = 'http://www.w3.org/2000/svg';
  function cellSvg(cell) {
    const svg = root.document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 60 76');
    svg.setAttribute('class', 'mx-cell');
    const P = (i) => [10 + (i % 3) * 20, 10 + Math.floor(i / 3) * 20];
    for (let i = 0; i < 9; i++) {
      const c = root.document.createElementNS(NS, 'circle');
      const [x, y] = P(i);
      c.setAttribute('cx', x);
      c.setAttribute('cy', y);
      c.setAttribute('r', 1.3);
      c.setAttribute('class', 'mx-pt');
      svg.appendChild(c);
    }
    EDGES.forEach(([a, b], k) => {
      if (!(cell.seg & (1 << k))) return;
      const l = root.document.createElementNS(NS, 'line');
      const [x1, y1] = P(a);
      const [x2, y2] = P(b);
      Object.entries({ x1, y1, x2, y2, class: 'mx-seg' }).forEach(([k2, v]) => l.setAttribute(k2, v));
      svg.appendChild(l);
    });
    for (let i = 0; i < cell.dots; i++) {
      const c = root.document.createElementNS(NS, 'circle');
      c.setAttribute('cx', 10 + i * 8);
      c.setAttribute('cy', 68);
      c.setAttribute('r', 2.6);
      c.setAttribute('class', 'mx-dot');
      svg.appendChild(c);
    }
    return svg;
  }

  WW.games.register({
    id: 'dx-matrix',
    name: 'Held-out matrices',
    kind: 'diagnostic',
    headline: (s) => `${s.correct}/${s.items}`,
    mount(container, ctx) {
      const { h, clear } = ctx.ui;
      const T = ctx.timing;
      const S = WW.stats;
      const ac = new AbortController();
      const signal = ac.signal;
      const keyMap = {};
      for (let i = 1; i <= 8; i++) {
        keyMap['Digit' + i] = i - 1;
        keyMap['Numpad' + i] = i - 1;
      }

      async function show(it, label, practice) {
        clear(container);
        const grid = h(
          'div.mx-grid',
          it.cells.map((row, i) => row.map((cell, j) => (i === 2 && j === 2 ? h('div.mx-missing', '?') : h('div.mx-slot', cellSvg(cell)))))
        );
        const opts = it.options.map((cell, i) => h('button.mx-choice', { type: 'button' }, cellSvg(cell), h('span', String(i + 1))));
        container.appendChild(
          h('div.center', h('p.label', label), grid, h('p.muted', 'Which piece completes the pattern? Press 1–8 or tap.'), h('div.mx-options', opts))
        );
        const onset = await T.onNextFrame();
        const r = await T.awaitChoice({ keyMap, buttons: opts.map((el, i) => ({ el, value: i })), since: onset, signal });
        if (r.aborted) return null;
        const ok = r.value === it.correctIndex;
        if (practice) {
          opts[it.correctIndex].classList.add('right');
          if (!ok) opts[r.value].classList.add('wrong');
          await T.sleep(2200);
        }
        return { ok, choice: r.value, rt: r.rt, input: r.input };
      }

      (async () => {
        if (
          !(await WW.screens.intro(container, {
            kicker: 'Diagnostics · untrained probe',
            title: 'Matrices',
            body: [
              'Each row of three pieces follows the same hidden rules: about the lines, the dots, or both. Work out the rules from the first two rows and pick the piece that completes the third.',
              'No time limit, but each item is timed.',
            ],
            kv: [['Takes', 'about 6 minutes'], ['Items', `1 practice + ${ITEM_PLAN.length}`]],
            button: 'Practice',
            signal,
          }))
        )
          return;
        const f = await WW.dx.form(ctx, 'dx-matrix');
        if (!(await show(item(f.rng.fork('practice'), { seg: 'const', dots: 1 }), 'Practice', true))) return;
        if (!(await WW.screens.intro(container, { title: 'Ready', body: [`${ITEM_PLAN.length} items, no feedback.`], button: 'Go', signal }))) return;

        const res = [];
        for (let i = 0; i < ITEM_PLAN.length; i++) {
          const it = item(f.rng.fork('item' + i), ITEM_PLAN[i]);
          const r = await show(it, `Item ${i + 1} / ${ITEM_PLAN.length}`, false);
          if (!r) return;
          const rules = (ITEM_PLAN[i].seg === 'const' ? 0 : 1) + (ITEM_PLAN[i].dots === null ? 0 : 1);
          res.push(Object.assign({ rules }, r));
          ctx.session.trial({
            condition: ITEM_PLAN[i].seg + (ITEM_PLAN[i].dots === null ? '' : '+dots'),
            stimulus: { plan: ITEM_PLAN[i], correctIndex: it.correctIndex },
            response: r.choice,
            correct: r.ok,
            rt: r.rt,
            level: rules,
            input: r.input,
          });
        }
        const correct = res.filter((r) => r.ok).length;
        const summary = {
          form: f.index,
          items: res.length,
          correct,
          oneRule: res.filter((r) => r.rules === 1 && r.ok).length,
          twoRule: res.filter((r) => r.rules === 2 && r.ok).length,
          medianTimeMs: S.round(S.median(res.map((r) => r.rt))),
        };
        await WW.dx.finish(
          ctx,
          container,
          signal,
          {
            headline: `${correct} / ${res.length}`,
            kv: [
              ['Correct', `${correct} of ${res.length}`],
              ['One-rule items', `${summary.oneRule} of ${res.filter((r) => r.rules === 1).length}`],
              ['Two-rule items', `${summary.twoRule} of ${res.filter((r) => r.rules === 2).length}`],
              ['Median time per item', `${(summary.medianTimeMs / 1000).toFixed(1)} s`],
              ['Form', `#${f.index + 1}`],
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
