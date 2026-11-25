/* Diagnostic: paper folding (spatial visualization).
 * Procedurally generated items in the style of Ekstrom et al.'s (1976)
 * Paper Folding test (VZ-2); the items are original, not the ETS kit.
 * A square is folded 1-3 times (halves or diagonals), a hole is punched,
 * and you pick the unfolded sheet from five options.
 * Scored correct - wrong/4 (the kit's guessing correction).
 *
 * Geometry: coordinates in [0,1]^2, y down. A fold keeps one side of a
 * line and reflects the other side onto it. A point q of the original
 * sheet ends up at F(q) = F_k(...F_1(q)); the holes are every q with
 * F(q) = punch, found by walking the folds backwards.
 */
(function (root) {
  'use strict';
  const WW = root.WW;

  const FOLDS = {
    L: { line: 'v', keep: (p) => p[0] > 0.5, refl: (p) => [1 - p[0], p[1]] },
    R: { line: 'v', keep: (p) => p[0] < 0.5, refl: (p) => [1 - p[0], p[1]] },
    T: { line: 'h', keep: (p) => p[1] > 0.5, refl: (p) => [p[0], 1 - p[1]] },
    B: { line: 'h', keep: (p) => p[1] < 0.5, refl: (p) => [p[0], 1 - p[1]] },
    // Diagonal y = x (top-left to bottom-right corner).
    DL: { line: 'd1', keep: (p) => p[1] < p[0], refl: (p) => [p[1], p[0]] }, // lower-left triangle folds up
    DU: { line: 'd1', keep: (p) => p[1] > p[0], refl: (p) => [p[1], p[0]] }, // upper-right triangle folds down
    // Diagonal x + y = 1 (top-right to bottom-left corner).
    AU: { line: 'd2', keep: (p) => p[0] + p[1] > 1, refl: (p) => [1 - p[1], 1 - p[0]] }, // upper-left folds down
    AL: { line: 'd2', keep: (p) => p[0] + p[1] < 1, refl: (p) => [1 - p[1], 1 - p[0]] }, // lower-right folds up
  };
  const FOLD_KEYS = Object.keys(FOLDS);

  function lineDist(line, p) {
    if (line === 'v') return Math.abs(p[0] - 0.5);
    if (line === 'h') return Math.abs(p[1] - 0.5);
    if (line === 'd1') return Math.abs(p[0] - p[1]) / Math.SQRT2;
    return Math.abs(p[0] + p[1] - 1) / Math.SQRT2;
  }

  /** Is p covered by paper after the first i folds? */
  function inRegion(folds, i, p) {
    if (i === 0) return p[0] > 0 && p[0] < 1 && p[1] > 0 && p[1] < 1;
    const f = FOLDS[folds[i - 1]];
    return f.keep(p) && (inRegion(folds, i - 1, p) || inRegion(folds, i - 1, f.refl(p)));
  }

  /** Every point of the unfolded sheet punched by a hole at p. */
  function holes(folds, p) {
    let S = [p];
    for (let i = folds.length; i >= 1; i--) {
      const f = FOLDS[folds[i - 1]];
      const next = [];
      for (const s of S) {
        if (inRegion(folds, i - 1, s)) next.push(s);
        const r = f.refl(s);
        if (!f.keep(r) && inRegion(folds, i - 1, r)) next.push(r);
      }
      S = next;
    }
    return S;
  }

  /** Each fold must fold some paper and leave some paper (>= 15% each). */
  function validFolds(folds) {
    const n = 30;
    for (let i = 1; i <= folds.length; i++) {
      const f = FOLDS[folds[i - 1]];
      let kept = 0;
      let moved = 0;
      for (let a = 0; a < n; a++)
        for (let b = 0; b < n; b++) {
          const c = [(a + 0.5) / n, (b + 0.5) / n];
          if (!inRegion(folds, i - 1, c)) continue;
          if (f.keep(c)) kept++;
          else moved++;
        }
      const total = kept + moved;
      if (!total || kept / total < 0.15 || moved / total < 0.15) return false;
    }
    return true;
  }

  const key = (set) =>
    set
      .map((p) => p.map((v) => v.toFixed(3)).join(','))
      .sort()
      .join(';');

  const minPairDist = (set) => {
    let m = Infinity;
    for (let i = 0; i < set.length; i++) for (let j = i + 1; j < set.length; j++) m = Math.min(m, Math.hypot(set[i][0] - set[j][0], set[i][1] - set[j][1]));
    return m;
  };

  /** One item with k folds: { folds, punch, answer, options, correctIndex }. */
  function item(rng, k) {
    for (let attempt = 0; attempt < 500; attempt++) {
      const folds = [];
      while (folds.length < k) {
        const f = rng.pick(FOLD_KEYS);
        if (folds.length && FOLDS[folds[folds.length - 1]].line === FOLDS[f].line) continue;
        folds.push(f);
      }
      if (!validFolds(folds)) continue;
      const lines = folds.map((f) => FOLDS[f].line);
      const cands = [];
      for (let a = 0; a < 10; a++)
        for (let b = 0; b < 10; b++) {
          const p = [(a + 0.5) / 10, (b + 0.5) / 10];
          if (!inRegion(folds, k, p)) continue;
          if (lines.some((l) => lineDist(l, p) < 0.07)) continue;
          const H = holes(folds, p);
          if (H.length < 2 || minPairDist(H) < 0.12) continue;
          if (H.some((q) => q[0] < 0.06 || q[0] > 0.94 || q[1] < 0.06 || q[1] > 0.94)) continue;
          cands.push({ p, H });
        }
      if (!cands.length) continue;
      // Prefer punches that go through every layer (2^k holes) on harder items.
      const full = cands.filter((c) => c.H.length === 1 << k);
      const pick = rng.pick(full.length && rng.chance(0.7) ? full : cands);
      const distractors = makeDistractors(rng, folds, pick.p, pick.H);
      if (distractors.length < 4) continue;
      const options = rng.shuffle([pick.H, ...distractors.slice(0, 4)]);
      return { folds, punch: pick.p, answer: pick.H, options, correctIndex: options.indexOf(pick.H) };
    }
    throw new Error('paper folding: could not generate item');
  }

  function makeDistractors(rng, folds, p, H) {
    const tf = (fn) => H.map(fn);
    const pool = [];
    // Forgot earlier unfolds: only the last fold undone.
    if (folds.length >= 2) {
      const last = FOLDS[folds[folds.length - 1]];
      const r = last.refl(p);
      pool.push(inRegion(folds, folds.length - 1, r) && !last.keep(r) ? [p, r] : [p]);
    }
    pool.push(tf((q) => [1 - q[0], q[1]])); // mirrored left-right
    pool.push(tf((q) => [q[0], 1 - q[1]])); // mirrored top-bottom
    pool.push(tf((q) => [q[1], q[0]])); // mirrored on diagonal
    pool.push(tf((q) => [1 - q[1], q[0]])); // rotated 90°
    if (H.length >= 2) {
      const drop = rng.int(0, H.length - 1);
      pool.push(H.filter((_, i) => i !== drop)); // one hole missing
      const moved = H.slice();
      moved[drop] = [1 - H[drop][0], 1 - H[drop][1]];
      pool.push(moved); // one hole misplaced
    }
    pool.push([p]); // never unfolded
    const seen = new Set([key(H)]);
    const out = [];
    for (const set of rng.shuffle(pool)) {
      if (!set.length || minPairDist(set) < 0.08) continue;
      const k = key(set);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(set);
    }
    // Fallback: random hole sets of the same size.
    let guard = 0;
    while (out.length < 4 && guard++ < 200) {
      const set = Array.from({ length: H.length }, () => [(rng.int(0, 9) + 0.5) / 10, (rng.int(0, 9) + 0.5) / 10]);
      const k = key(set);
      if (seen.has(k) || minPairDist(set) < 0.12) continue;
      seen.add(k);
      out.push(set);
    }
    return out;
  }

  // 16 items (doubled 2026-11-24 for reliability), same mix of one, two and three folds.
  const FOLD_COUNTS = [1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3];

  WW.dxLogic = WW.dxLogic || {};
  WW.dxLogic.paperFolding = { FOLDS, inRegion, holes, validFolds, item, key, FOLD_COUNTS };

  // ------------------------------------------------------------------ view

  const PLATE = '#0b0b12';
  const PAPER = '#e8e4dc';
  const LINE = '#ff2a6d';

  function drawPanel(canvas, folds, i, opts) {
    const css = 112;
    const dpr = Math.min(2, root.devicePixelRatio || 1);
    const n = Math.round(css * dpr);
    canvas.width = n;
    canvas.height = n;
    canvas.style.width = css + 'px';
    canvas.style.height = css + 'px';
    const g = canvas.getContext('2d');
    g.fillStyle = PLATE;
    g.fillRect(0, 0, n, n);
    const pad = 0.08;
    const S = n * (1 - 2 * pad);
    const O = n * pad;
    const img = g.getImageData(0, 0, n, n);
    const paper = [232, 228, 220];
    const moving = [125, 127, 146];
    const next = opts.nextFold ? FOLDS[opts.nextFold] : null;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const p = [(x + 0.5 - O) / S, (y + 0.5 - O) / S];
        if (p[0] <= 0 || p[0] >= 1 || p[1] <= 0 || p[1] >= 1) continue;
        if (!inRegion(folds, i, p)) continue;
        const c = next && !next.keep(p) ? moving : paper;
        const k = (y * n + x) * 4;
        img.data[k] = c[0];
        img.data[k + 1] = c[1];
        img.data[k + 2] = c[2];
        img.data[k + 3] = 255;
      }
    g.putImageData(img, 0, 0);
    const P = (p) => [O + p[0] * S, O + p[1] * S];
    if (next) {
      g.strokeStyle = LINE;
      g.lineWidth = 1.5 * dpr;
      g.setLineDash([4 * dpr, 3 * dpr]);
      const seg = { v: [[0.5, -0.02], [0.5, 1.02]], h: [[-0.02, 0.5], [1.02, 0.5]], d1: [[0, 0], [1, 1]], d2: [[1, 0], [0, 1]] }[next.line];
      g.beginPath();
      g.moveTo(...P(seg[0]));
      g.lineTo(...P(seg[1]));
      g.stroke();
      g.setLineDash([]);
      // Arrow from the moving part's centroid to its mirror image.
      let cx = 0;
      let cy = 0;
      let m = 0;
      for (let a = 0; a < 24; a++)
        for (let b = 0; b < 24; b++) {
          const c = [(a + 0.5) / 24, (b + 0.5) / 24];
          if (inRegion(folds, i, c) && !next.keep(c)) {
            cx += c[0];
            cy += c[1];
            m++;
          }
        }
      if (m) {
        const from = P([cx / m, cy / m]);
        const to = P(next.refl([cx / m, cy / m]));
        g.strokeStyle = LINE;
        g.fillStyle = LINE;
        g.lineWidth = 2 * dpr;
        g.beginPath();
        g.moveTo(...from);
        g.lineTo(...to);
        g.stroke();
        const ang = Math.atan2(to[1] - from[1], to[0] - from[0]);
        const hl = 7 * dpr;
        g.beginPath();
        g.moveTo(...to);
        g.lineTo(to[0] - hl * Math.cos(ang - 0.45), to[1] - hl * Math.sin(ang - 0.45));
        g.lineTo(to[0] - hl * Math.cos(ang + 0.45), to[1] - hl * Math.sin(ang + 0.45));
        g.closePath();
        g.fill();
      }
    }
    if (opts.punch) {
      const c = P(opts.punch);
      g.fillStyle = PLATE;
      g.strokeStyle = LINE;
      g.lineWidth = 2 * dpr;
      g.beginPath();
      g.arc(c[0], c[1], 0.055 * S, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
  }

  function optionSvg(set) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = root.document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '-0.08 -0.08 1.16 1.16');
    svg.setAttribute('class', 'pf-option');
    const rect = root.document.createElementNS(NS, 'rect');
    Object.entries({ x: 0, y: 0, width: 1, height: 1, fill: PAPER }).forEach(([k, v]) => rect.setAttribute(k, v));
    svg.appendChild(rect);
    for (const q of set) {
      const c = root.document.createElementNS(NS, 'circle');
      Object.entries({ cx: q[0], cy: q[1], r: 0.055, fill: PLATE }).forEach(([k, v]) => c.setAttribute(k, v));
      svg.appendChild(c);
    }
    return svg;
  }

  WW.games.register({
    id: 'dx-paper-folding',
    name: 'Paper folding',
    kind: 'diagnostic',
    headline: (s) => `${s.correct}/${s.items} · score ${s.score}`,
    mount(container, ctx) {
      const { h, clear } = ctx.ui;
      const T = ctx.timing;
      const S = WW.stats;
      const ac = new AbortController();
      const signal = ac.signal;
      const keyMap = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3, Numpad5: 4 };

      async function show(it, label, practice) {
        clear(container);
        const panels = [];
        for (let i = 0; i <= it.folds.length; i++) {
          const c = h('canvas.pf-panel');
          drawPanel(c, it.folds, i, i < it.folds.length ? { nextFold: it.folds[i] } : { punch: it.punch });
          panels.push(c);
        }
        const opts = it.options.map((set, i) => h('button.pf-choice', { type: 'button' }, optionSvg(set), h('span', String(i + 1))));
        container.appendChild(
          h(
            'div.center',
            h('p.label', label),
            h('div.pf-steps', panels.map((c, i) => [i ? h('span.pf-arrow', '→') : null, c])),
            h('p.muted', 'Which sheet results when it is unfolded? Press 1–5 or tap.'),
            h('div.pf-options', opts)
          )
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
            title: 'Paper folding',
            body: [
              'A square sheet is folded along the dashed line (the grey part flips over, following the arrow), sometimes more than once. Then a hole is punched through every layer.',
              'Pick how the sheet looks when completely unfolded. Accuracy counts; guessing is penalised a little.',
            ],
            kv: [['Takes', 'about 7 minutes'], ['Items', `1 practice + ${FOLD_COUNTS.length}`]],
            button: 'Practice',
            signal,
          }))
        )
          return;
        const f = await WW.dx.form(ctx, 'dx-paper-folding');
        const p = await show(item(f.rng.fork('practice'), 1), 'Practice', true);
        if (!p) return;
        if (!(await WW.screens.intro(container, { title: 'Ready', body: [`${FOLD_COUNTS.length} items, no feedback. Take your time.`], button: 'Go', signal }))) return;

        const res = [];
        for (let i = 0; i < FOLD_COUNTS.length; i++) {
          const it = item(f.rng.fork('item' + i), FOLD_COUNTS[i]);
          const r = await show(it, `Item ${i + 1} / ${FOLD_COUNTS.length}`, false);
          if (!r) return;
          res.push(r);
          ctx.session.trial({
            condition: `folds-${it.folds.length}`,
            stimulus: { folds: it.folds, punch: it.punch, correctIndex: it.correctIndex },
            response: r.choice,
            correct: r.ok,
            rt: r.rt,
            level: it.folds.length,
            input: r.input,
          });
        }
        const correct = res.filter((r) => r.ok).length;
        const wrong = res.length - correct;
        const summary = {
          form: f.index,
          items: res.length,
          correct,
          wrong,
          score: S.round(correct - wrong / 4, 2),
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
              ['Corrected score', `${summary.score} (correct − wrong/4)`],
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
