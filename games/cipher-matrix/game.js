/* Cipher Matrix (INFERENCE): procedurally generated matrix reasoning.
 *
 * 3x3 matrices of shape glyphs. Each attribute (shape, count, size, fill)
 * follows a rule across rows (Carpenter, Just & Shell 1990):
 *   const  same within a row, different across rows
 *   prog   ordered progression across the row
 *   dist3  each row is a different permutation of the same three values
 * Generated after Matzen et al. (2010); the 8 options are every on/off
 * combination of three attribute changes, so each wrong feature appears in
 * exactly half the options and "pick the odd one out" never works.
 * Vocabulary is disjoint from the held-out diagnostic (dx-matrix: lattice
 * segments + dot rows, set-operation rules). Level adapts (2-down-1-up).
 * Evidence: inductive-reasoning training works (Klauer & Phye 2008). Grade B.
 */
(function (root) {
  'use strict';
  const WW = root.WW;

  const ATTRS = {
    shape: { values: ['circle', 'square', 'triangle', 'diamond', 'hexagon'], ordinal: false },
    count: { values: [1, 2, 3], ordinal: true },
    size: { values: ['small', 'medium', 'large'], ordinal: true },
    fill: { values: ['empty', 'striped', 'solid'], ordinal: true },
  };
  const NAMES = Object.keys(ATTRS);
  const ITEMS = 12;
  const CONF_RATE = 1 / 3;

  /** Rules for a level (1-10): how many attributes vary and how many use dist3. */
  function plan(rng, level) {
    const L = Math.max(1, Math.min(10, Math.round(level)));
    const nVary = Math.min(4, Math.ceil(L / 2));
    const nDist = L <= 1 ? 0 : L === 2 ? 1 : L >= 9 ? nVary : Math.floor((L - 1) / 3);
    const vary = rng.sample(NAMES, nVary);
    const rules = {};
    for (const a of NAMES) rules[a] = 'fixed';
    vary.forEach((a, i) => {
      if (i < nDist) rules[a] = 'dist3';
      else rules[a] = ATTRS[a].ordinal && rng.chance(0.5) ? 'prog' : 'const';
    });
    return rules;
  }

  /** Build the 3x3 grid of cells ({shape, count, size, fill}) from rules. */
  function grid(rng, rules) {
    const cells = [0, 1, 2].map(() => [0, 1, 2].map(() => ({})));
    for (const a of NAMES) {
      const vals = ATTRS[a].values;
      const rule = rules[a];
      if (rule === 'fixed') {
        const v = rng.pick(vals);
        cells.forEach((row) => row.forEach((c) => (c[a] = v)));
      } else if (rule === 'const') {
        const three = rng.sample(vals, 3);
        cells.forEach((row, i) => row.forEach((c) => (c[a] = three[i])));
      } else if (rule === 'prog') {
        const order = rng.chance(0.5) ? vals.slice(0, 3) : vals.slice(0, 3).reverse();
        cells.forEach((row) => row.forEach((c, j) => (c[a] = order[j])));
      } else {
        // dist3: Latin square over three values; row orders all differ.
        const three = rng.sample(vals, 3);
        const shift = rng.chance(0.5) ? 1 : 2;
        const start = rng.int(0, 2);
        cells.forEach((row, i) => row.forEach((c, j) => (c[a] = three[(start + j + i * shift) % 3])));
      }
    }
    return cells;
  }

  const key = (c) => NAMES.map((a) => c[a]).join('|');

  /** 8 options: all on/off combinations of one alternative value in each of 3 attributes. */
  function options(rng, rules, cells) {
    const answer = cells[2][2];
    const varying = NAMES.filter((a) => rules[a] !== 'fixed');
    const picks = rng.shuffle(varying).slice(0, 3);
    for (const a of rng.shuffle(NAMES)) if (picks.length < 3 && !picks.includes(a)) picks.push(a);
    const alt = {};
    for (const a of picks) {
      // Prefer a value visible elsewhere in the bottom row or column (plausible lure).
      const seen = [cells[2][0][a], cells[2][1][a], cells[0][2][a], cells[1][2][a]].filter((v) => v !== answer[a]);
      alt[a] = seen.length ? rng.pick(seen) : rng.pick(ATTRS[a].values.filter((v) => v !== answer[a]));
    }
    const opts = [];
    for (let mask = 0; mask < 8; mask++) {
      const c = Object.assign({}, answer);
      picks.forEach((a, i) => {
        if (mask & (1 << i)) c[a] = alt[a];
      });
      opts.push(c);
    }
    const shuffled = rng.shuffle(opts);
    return { options: shuffled, correctIndex: shuffled.findIndex((c) => key(c) === key(answer)), changed: picks };
  }

  function item(rng, level) {
    const rules = plan(rng, level);
    const cells = grid(rng, rules);
    return Object.assign({ level: Math.round(level), rules, cells, answer: cells[2][2] }, options(rng, rules, cells));
  }

  WW.logic = WW.logic || {};
  WW.logic.cipherMatrix = { ATTRS, plan, grid, options, item, key };

  // ------------------------------------------------------------------ view

  const NS = 'http://www.w3.org/2000/svg';
  let patternSeq = 0;
  const SCALE = { small: 0.55, medium: 0.75, large: 1 };
  function shapePath(shape, cx, cy, r) {
    if (shape === 'circle') return { tag: 'circle', attrs: { cx, cy, r } };
    if (shape === 'square') return { tag: 'rect', attrs: { x: cx - r * 0.85, y: cy - r * 0.85, width: r * 1.7, height: r * 1.7 } };
    const pts = (n, rot) =>
      Array.from({ length: n }, (_, k) => {
        const a = rot + (k * 2 * Math.PI) / n;
        return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
      }).join(' ');
    if (shape === 'triangle') return { tag: 'polygon', attrs: { points: pts(3, -Math.PI / 2) } };
    if (shape === 'diamond') return { tag: 'polygon', attrs: { points: pts(4, -Math.PI / 2) } };
    return { tag: 'polygon', attrs: { points: pts(6, 0) } };
  }
  function cellSvg(c) {
    const svg = root.document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('class', 'cm-cell');
    const pid = 'cm-hatch-' + ++patternSeq;
    const defs = root.document.createElementNS(NS, 'defs');
    defs.innerHTML = `<pattern id="${pid}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#0b0b12"/><line x1="0" y1="0" x2="0" y2="6" stroke="#e8e4dc" stroke-width="2.6"/></pattern>`;
    svg.appendChild(defs);
    const r = 13 * SCALE[c.size];
    const xs = c.count === 1 ? [50] : c.count === 2 ? [32, 68] : [20, 50, 80];
    for (const x of xs) {
      const { tag, attrs } = shapePath(c.shape, x, 50, r);
      const el = root.document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      el.setAttribute('stroke', '#e8e4dc');
      el.setAttribute('stroke-width', '2.4');
      el.setAttribute('fill', c.fill === 'solid' ? '#e8e4dc' : c.fill === 'striped' ? `url(#${pid})` : 'none');
      svg.appendChild(el);
    }
    return svg;
  }

  WW.logic.cipherMatrix.cellSvg = cellSvg;

  WW.games.register({
    id: 'cipher-matrix',
    name: 'Cipher Matrix',
    headline: (s) => `${s.correct}/${s.items} · level ${s.level}`,
    /** INFERENCE tune from level (/10). */
    tune(sessions) {
      const v = sessions.slice(0, 3).map((s) => s.summary && s.summary.level).filter(Number.isFinite);
      return v.length ? WW.stats.clamp01(WW.stats.mean(v) / 10) : null;
    },
    mount(container, ctx) {
      const { h, clear } = ctx.ui;
      const T = ctx.timing;
      const S = WW.stats;
      const ac = new AbortController();
      const signal = ac.signal;
      const rng = ctx.rng;
      const keyMap = {};
      for (let i = 1; i <= 8; i++) {
        keyMap['Digit' + i] = i - 1;
        keyMap['Numpad' + i] = i - 1;
      }

      async function show(it, label, probe) {
        clear(container);
        const g = h('div.cm-grid', it.cells.map((row, i) => row.map((c, j) => (i === 2 && j === 2 ? h('div.cm-missing', '?') : h('div.cm-slot', cellSvg(c))))));
        const opts = it.options.map((c, i) => h('button.cm-choice', { type: 'button' }, cellSvg(c), h('span', String(i + 1))));
        const box = h('div.center', h('p.label', label), g, h('p.muted', 'Crack the cipher: which tile completes the lattice? 1–8 or tap.'), h('div.cm-options', opts));
        container.appendChild(box);
        const onset = await T.onNextFrame();
        const r = await T.awaitChoice({ keyMap, buttons: opts.map((el, i) => ({ el, value: i })), since: onset, signal });
        if (r.aborted) return null;
        const ok = r.value === it.correctIndex;
        let confidence = null;
        if (probe) {
          const c = await WW.confidence.ask(box, { prompt: 'How sure are you of that tile?', signal });
          if (!c) return null;
          confidence = c.confidence;
        }
        opts[it.correctIndex].classList.add('right');
        if (!ok) opts[r.value].classList.add('wrong');
        ctx.audio.sfx(ok ? 'correct' : 'error');
        await T.sleep(ok ? 700 : 1800);
        return { ok, choice: r.value, rt: r.rt, input: r.input, confidence };
      }

      (async () => {
        const saved = await ctx.loadState('progress', { stair: null, sessions: 0 });
        const st = saved.stair ? WW.Staircase.fromJSON(saved.stair) : new WW.Staircase({ rule: 'updown', nDown: 2, start: 1, step: 1, min: 1, max: 10, integer: true, fastMultiplier: 1 });
        if (
          !(await WW.screens.intro(container, {
            kicker: 'INFERENCE · reasoning',
            title: 'Cipher Matrix',
            body: [
              'Corporate ICE hides its keys in lattices. In every row, each feature (shape, how many, size, fill) obeys a hidden rule: the same across the row, stepping up or down, or cycling through three values.',
              'Work out the rules from the first two rows; pick the tile that completes the third. You’ll see the right answer after each one.',
            ],
            kv: [['Session', `${ITEMS} lattices, about 5 min`], ['Level', `${st.value()} (adapts: two right in a row → harder, one wrong → easier)`]],
            button: 'Start',
            signal,
          }))
        )
          return;
        const res = [];
        const startLevel = st.value();
        for (let i = 0; i < ITEMS; i++) {
          const level = st.value();
          const it = item(rng, level);
          const r = await show(it, `Lattice ${i + 1} / ${ITEMS} · level ${level}`, WW.confidence.shouldProbe(rng, CONF_RATE));
          if (!r) return;
          st.update(r.ok);
          res.push(Object.assign({ level }, r));
          ctx.session.trial({
            condition: Object.entries(it.rules).filter(([, v]) => v !== 'fixed').map(([a, v]) => `${a}:${v}`).join(',') || 'fixed',
            stimulus: { rules: it.rules, answer: it.answer, correctIndex: it.correctIndex },
            response: r.choice,
            correct: r.ok,
            rt: r.rt,
            level,
            confidence: r.confidence,
            input: r.input,
          });
        }
        const correct = res.filter((r) => r.ok).length;
        const pairs = res.filter((r) => r.confidence != null).map((r) => [r.confidence, r.ok]);
        const summary = {
          items: res.length,
          correct,
          startLevel,
          level: st.value(),
          meanLevel: S.round(S.mean(res.map((r) => r.level)), 2),
          medianTimeMs: S.round(S.median(res.map((r) => r.rt))),
          confidencePairs: pairs,
        };
        const choice = await WW.screens.results(container, {
          headline: `${correct} / ${res.length}`,
          kv: [
            ['Correct', `${correct} of ${res.length}`],
            ['Level', `${startLevel} → ${summary.level} (mean ${summary.meanLevel})`],
            ['Median time per lattice', `${(summary.medianTimeMs / 1000).toFixed(1)} s`],
            pairs.length ? ['Confidence checks', pairs.length] : null,
          ],
          notes: ['Higher levels add more varying features and more cycling rules. Level carries over only if you log the session.'],
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
