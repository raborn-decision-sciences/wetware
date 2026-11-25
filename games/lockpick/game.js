/* Lockpick (GYRO / COMPILER): permutation puzzle with saved macros.
 *
 * A mag-lock of two overlapping rings of pins sharing two pins. Turning a
 * ring cycles its pins. Scrambled, the pins must be returned to pattern:
 * left-only pins cyan, right-only pins magenta, the two shared pins amber.
 * The interesting part is algorithmic: find short move sequences
 * ("exploits") that shuffle just a few pins, save them as macros and reuse
 * them, which is chunking made visible (Chase & Simon 1973; Anderson 1982).
 * Optimal move counts come from a BFS over the lock's state space.
 * Original design (not a cube clone). Grade X.
 */
(function (root) {
  'use strict';
  const WW = root.WW;

  const LOCKS = 4;
  const LEVELS = [null, { n: 6, depth: 3 }, { n: 6, depth: 4 }, { n: 6, depth: 6 }, { n: 8, depth: 5 }, { n: 8, depth: 7 }, { n: 8, depth: 9 }, { n: 8, depth: 12 }, { n: 8, depth: 14 }, { n: 8, depth: 15 }];
  const MAX_LEVEL = LEVELS.length - 1;

  /**
   * Geometry for two rings of n pins each sharing two pins.
   * Returns { P, pos: [[x,y]], A: [indices in cyclic order], B: [...], target: [colors] }.
   */
  function geometry(n) {
    const cA = [0.36, 0.5];
    const cB = [0.64, 0.5];
    const r = 0.25;
    const half = Math.acos(0.14 / r); // angle of the shared points from A's centre (x = 0.5)
    const pos = [];
    const add = (p) => pos.push(p) - 1;
    const top = add([0.5, 0.5 - r * Math.sin(half)]);
    const bottom = add([0.5, 0.5 + r * Math.sin(half)]);
    // A's own pins on its outer arc, from bottom-shared round the left to top-shared.
    const A = [bottom];
    for (let k = 1; k <= n - 2; k++) {
      const a = half + ((2 * Math.PI - 2 * half) * k) / (n - 1);
      A.push(add([cA[0] + r * Math.cos(a), cA[1] + r * Math.sin(a)]));
    }
    A.push(top);
    // B's own pins on its outer arc, from top-shared round the right to bottom-shared.
    const B = [top];
    for (let k = 1; k <= n - 2; k++) {
      const a = Math.PI + half + ((2 * Math.PI - 2 * half) * k) / (n - 1);
      B.push(add([cB[0] + r * Math.cos(a), cB[1] + r * Math.sin(a)]));
    }
    B.push(bottom);
    const target = pos.map((_, i) => (i === top || i === bottom ? 'Y' : A.includes(i) ? 'C' : 'M'));
    return { P: pos.length, pos, A, B, target, shared: [top, bottom], cA, cB, r };
  }

  /** Turn a ring one step: dir +1 moves each pin to the next position in the ring's order. */
  function turn(state, ring, dir) {
    const out = state.slice();
    const k = ring.length;
    for (let i = 0; i < k; i++) out[ring[(i + dir + k) % k]] = state[ring[i]];
    return out;
  }

  const MOVES = ['A+', 'A-', 'B+', 'B-'];
  function apply(geo, state, m) {
    return turn(state, m[0] === 'A' ? geo.A : geo.B, m[1] === '+' ? 1 : -1);
  }

  /** BFS distances from the solved state to every reachable state (keyed by string). */
  const distCache = new Map();
  function distances(geo) {
    const key0 = geo.target.join('');
    if (distCache.has(key0 + geo.P)) return distCache.get(key0 + geo.P);
    const dist = new Map([[key0, 0]]);
    let frontier = [geo.target];
    for (let d = 1; frontier.length; d++) {
      const next = [];
      for (const s of frontier)
        for (const m of MOVES) {
          const t = apply(geo, s, m);
          const k = t.join('');
          if (!dist.has(k)) (dist.set(k, d), next.push(t));
        }
      frontier = next;
    }
    distCache.set(key0 + geo.P, dist);
    return dist;
  }

  /** A scrambled lock at (as close as possible to) the requested optimal distance. */
  function lock(rng, level) {
    const spec = LEVELS[Math.max(1, Math.min(MAX_LEVEL, level))];
    const geo = geometry(spec.n);
    const dist = distances(geo);
    let best = null;
    for (let attempt = 0; attempt < 200; attempt++) {
      let s = geo.target.slice();
      for (let i = 0; i < spec.depth * 2; i++) s = apply(geo, s, rng.pick(MOVES));
      const d = dist.get(s.join(''));
      if (d === spec.depth) return { geo, start: s, optimal: d, level };
      if (d > 0 && (!best || Math.abs(d - spec.depth) < Math.abs(best.optimal - spec.depth))) best = { geo, start: s, optimal: d, level };
    }
    // Deep scrambles rarely land exactly on the depth (few states sit near the far edge): draw one that does.
    const exact = [];
    for (const [k, d] of dist) if (d === spec.depth) exact.push(k);
    if (exact.length) return { geo, start: rng.pick(exact).split(''), optimal: spec.depth, level };
    return best;
  }

  WW.logic = WW.logic || {};
  WW.logic.lockpick = { geometry, turn, apply, distances, lock, MOVES, LEVELS, MAX_LEVEL };

  const FILL = { C: '#05d9e8', M: '#ff2a6d', Y: '#ffb347' };

  WW.games.register({
    id: 'lockpick',
    name: 'Lockpick',
    headline: (s) => `${s.opened}/${s.locks} opened · ${s.macroPlays} exploit runs · level ${s.level}`,
    tune(sessions) {
      const v = sessions.slice(0, 3).map((s) => s.summary && s.summary.level).filter(Number.isFinite);
      return v.length ? WW.stats.clamp01((WW.stats.mean(v) - 1) / (MAX_LEVEL - 1)) : null;
    },
    mount(container, ctx) {
      const { h, clear } = ctx.ui;
      const T = ctx.timing;
      const S = WW.stats;
      const ac = new AbortController();
      const signal = ac.signal;
      const rng = ctx.rng;
      const NS = 'http://www.w3.org/2000/svg';

      function svgLock(geo, state, small) {
        const svg = root.document.createElementNS(NS, 'svg');
        svg.setAttribute('viewBox', '0.05 0.18 0.9 0.64');
        svg.setAttribute('class', small ? 'lp-svg small' : 'lp-svg');
        let html = `<circle cx="${geo.cA[0]}" cy="${geo.cA[1]}" r="${geo.r}" class="lp-ring"/><circle cx="${geo.cB[0]}" cy="${geo.cB[1]}" r="${geo.r}" class="lp-ring"/>`;
        geo.pos.forEach(([x, y], i) => {
          const shared = geo.shared.includes(i);
          html += `<circle cx="${x.toFixed(4)}" cy="${y.toFixed(4)}" r="${shared ? 0.034 : 0.028}" fill="${FILL[state[i]]}" stroke="${shared ? '#e8e4dc' : '#0b0b12'}" stroke-width="0.006"/>`;
          // Colour-blind aid: the colour's letter on every peg.
          if (WW.prefs.get('cvdAid', false)) html += `<text x="${x.toFixed(4)}" y="${(y + 0.011).toFixed(4)}" text-anchor="middle" font-size="0.032" font-weight="700" fill="#0b0b12" font-family="ui-monospace, monospace">${state[i]}</text>`;
        });
        if (!small) html += `<text x="${geo.cA[0]}" y="${geo.cA[1] + 0.012}" class="lp-key">Q ↺ · W ↻</text><text x="${geo.cB[0]}" y="${geo.cB[1] + 0.012}" class="lp-key">O ↺ · P ↻</text>`;
        svg.innerHTML = html;
        return svg;
      }

      /** Play one lock. Resolves record or null. */
      function play(lk, idx, macros) {
        return new Promise((resolve) => {
          let state = lk.start.slice();
          let moves = 0;
          let macroPlays = 0;
          let recording = null;
          const limit = lk.optimal * 3 + 8;
          const t0 = T.now();
          const doMove = (m, fromMacro) => {
            state = apply(lk.geo, state, m);
            moves++;
            if (recording && !fromMacro) recording.push(m);
            ctx.audio.sfx('tick');
          };
          const check = () => {
            if (state.join('') === lk.geo.target.join('')) return finish(true);
            if (moves >= limit) return finish(false);
            render();
          };
          const render = () => {
            clear(container);
            const btn = (label, on) => h('button.btn', { type: 'button', on: { click: on } }, label);
            const ringBtns = h(
              'div.row',
              { style: { justifyContent: 'center' } },
              btn('Q ↺ left', () => (doMove('A-'), check())),
              btn('W ↻ left', () => (doMove('A+'), check())),
              btn('O ↺ right', () => (doMove('B-'), check())),
              btn('P ↻ right', () => (doMove('B+'), check()))
            );
            const macroRow = h(
              'div.row',
              { style: { justifyContent: 'center' } },
              recording ? btn(`■ Save exploit (${recording.length})`, () => {
                if (recording.length) macros.push({ name: 'X' + (macros.length + 1), seq: recording.slice(), uses: 0 });
                recording = null;
                render();
              }) : btn('● Record exploit', () => ((recording = []), render())),
              macros.map((mc, i) => btn(`${i + 1}: ${mc.name} (${mc.seq.join(' ')})`, () => {
                mc.uses++;
                macroPlays++;
                for (const m of mc.seq) doMove(m, true);
                check();
              }))
            );
            container.appendChild(
              h(
                'div.center',
                { style: { userSelect: 'none' } },
                h('p.label', `Lock ${idx + 1} / ${LOCKS} · optimal ${lk.optimal} moves · used ${moves} / ${limit}`),
                h('div.row', { style: { justifyContent: 'center', alignItems: 'center' } }, h('span.muted.small', 'pattern'), svgLock(lk.geo, lk.geo.target, true)),
                svgLock(lk.geo, state, false),
                ringBtns,
                macroRow,
                h('div.row', { style: { justifyContent: 'center' } }, btn('Give up', () => finish(false))),
                h('p.muted.small', 'Record a sequence that only disturbs a few pins, save it, then fire it with 1–9. Exploits stay for the rest of the session.')
              )
            );
          };
          const onKey = (e) => {
            const map = { KeyQ: 'A-', KeyW: 'A+', KeyO: 'B-', KeyP: 'B+' };
            if (map[e.code]) {
              e.preventDefault();
              doMove(map[e.code]);
              return check();
            }
            const m = /^Digit([1-9])$/.exec(e.code);
            if (m && macros[Number(m[1]) - 1]) {
              e.preventDefault();
              const mc = macros[Number(m[1]) - 1];
              mc.uses++;
              macroPlays++;
              for (const mv of mc.seq) doMove(mv, true);
              check();
            }
          };
          const onAbort = () => finish(null);
          root.addEventListener('keydown', onKey, true);
          signal.addEventListener('abort', onAbort);
          render();
          function finish(opened) {
            root.removeEventListener('keydown', onKey, true);
            signal.removeEventListener('abort', onAbort);
            resolve(opened === null ? null : { opened, moves, optimal: lk.optimal, macroPlays, ms: T.now() - t0 });
          }
        });
      }

      (async () => {
        const saved = await ctx.loadState('progress', { level: 1, sessions: 0 });
        let level = saved.level;
        if (
          !(await WW.screens.intro(container, {
            kicker: 'GYRO · COMPILER · algorithms',
            title: 'Lockpick',
            body: [
              'A corporate mag-lock: two rings of pins that share two pins. Turning a ring cycles all its pins one step. Return every pin to the pattern (left ring cyan, right ring magenta, the shared pair amber).',
              'Early locks fall to trial and error. Later ones need exploits: short move sequences that shuffle only a couple of pins. Record them, save them, reuse them.',
            ],
            kv: [['Session', `${LOCKS} locks, about 6 min`], ['Keys', 'Q/W turn left ring, O/P turn right ring, 1–9 fire saved exploits']],
            button: 'Start',
            signal,
          }))
        )
          return;
        const macros = [];
        const recs = [];
        for (let i = 0; i < LOCKS; i++) {
          const lk = lock(rng, level);
          const r = await play(lk, i, macros);
          if (!r) return;
          recs.push(Object.assign({ level }, r));
          ctx.session.trial({ condition: `level${level}`, stimulus: { optimal: r.optimal, pins: lk.geo.P }, response: r.moves, correct: r.opened, rt: r.ms, level, macroPlays: r.macroPlays });
          clear(container);
          container.appendChild(h('div.center', h('p.big', { style: { color: r.opened ? 'var(--good)' : 'var(--magenta)' } }, r.opened ? `OPEN · ${r.moves} MOVES` : 'LOCKOUT')));
          ctx.audio.sfx(r.opened ? 'unlock' : 'error');
          await T.sleep(1000);
          level = r.opened && r.moves <= r.optimal * 2 ? Math.min(MAX_LEVEL, level + 1) : r.opened ? level : Math.max(1, level - 1);
        }
        const summary = {
          locks: recs.length,
          opened: recs.filter((r) => r.opened).length,
          moveRatio: S.round(S.mean(recs.filter((r) => r.opened).map((r) => r.moves / r.optimal)), 2),
          macrosSaved: macros.length,
          macroPlays: recs.reduce((a, r) => a + r.macroPlays, 0),
          startLevel: saved.level,
          level,
        };
        const choice = await WW.screens.results(container, {
          headline: `${summary.opened} / ${summary.locks}`,
          kv: [
            ['Locks opened', `${summary.opened} of ${summary.locks}`],
            ['Moves vs optimal', summary.moveRatio ? `${summary.moveRatio}×` : '—'],
            ['Exploits saved · fired', `${summary.macrosSaved} · ${summary.macroPlays}`],
            ['Level', `${saved.level} → ${level}`],
          ],
          notes: ['Opening a lock within twice the optimal moves raises the level. Level carries over only if you log the session.'],
          signal,
        });
        if (choice === 'save') {
          await ctx.saveState('progress', { level, sessions: saved.sessions + 1 });
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
