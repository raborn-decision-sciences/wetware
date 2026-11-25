/* Relay (COMPILER): Tower-of-London planning.
 *
 * Three data blocks on three stacks of height 3, 2 and 1 (Shallice 1982).
 * Rearrange them into the target configuration in the minimum number of
 * moves; plan first, the clock separates planning time (until your first
 * move) from execution. Problems are chosen by their BFS minimum (2-12
 * moves); at high levels the target hides once you start (plan it whole).
 * Three blocks top out at 8 moves, so 9-12-move problems add a fourth block
 * and taller stacks (4, 3 and 1), as extended Tower-of-London versions do.
 * A planning measure; training transfer is not established (Ward & Allport
 * 1997). Grade C.
 */
(function (root) {
  'use strict';
  const WW = root.WW;

  const CAPS = [3, 2, 1];
  const PROBLEMS = 10;
  const BLIND_LEVEL = 7;
  const MAX_MOVES = 12;
  const FOUR_FROM = 9; // problems this long use the four-block board

  const key = (s) => s.map((p) => p.join('')).join('|');
  const parse = (k) => k.split('|').map((p) => (p ? p.split('') : []));
  const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms(a.filter((_, j) => j !== i)).map((p) => [x, ...p])));

  /** All legal states of the balls on three stacks with the given capacities. */
  function statesFor(balls, caps) {
    const out = [];
    for (const p of perms(balls))
      for (let a = 0; a <= caps[0]; a++)
        for (let b = 0; b <= caps[1]; b++) {
          const c = balls.length - a - b;
          if (c < 0 || c > caps[2]) continue;
          out.push(key([p.slice(0, a), p.slice(a, a + b), p.slice(a + b)]));
        }
    return out;
  }
  const STATES = statesFor(['R', 'G', 'B'], CAPS);
  const BOARD4 = { caps: [4, 3, 1], states: statesFor(['R', 'G', 'B', 'Y'], [4, 3, 1]) };

  function moves(k, caps = CAPS) {
    const s = parse(k);
    const out = [];
    for (let f = 0; f < 3; f++)
      for (let t = 0; t < 3; t++) {
        if (f === t || !s[f].length || s[t].length >= caps[t]) continue;
        const n = s.map((p) => p.slice());
        n[t].push(n[f].pop());
        out.push({ from: f, to: t, state: key(n) });
      }
    return out;
  }

  /** Shortest distance between two states (BFS). */
  function distance(a, b, caps = CAPS) {
    if (a === b) return 0;
    const seen = new Set([a]);
    let frontier = [a];
    for (let d = 1; frontier.length; d++) {
      const next = [];
      for (const s of frontier)
        for (const m of moves(s, caps)) {
          if (m.state === b) return d;
          if (!seen.has(m.state)) (seen.add(m.state), next.push(m.state));
        }
      frontier = next;
    }
    return Infinity;
  }

  /** A start/goal pair whose minimum solution is exactly `target` moves (2-12): { start, goal, min, caps }. */
  function problem(rng, target) {
    const t = Math.max(2, Math.min(MAX_MOVES, Math.round(target)));
    const board = t >= FOUR_FROM ? BOARD4 : { caps: CAPS, states: STATES };
    for (let i = 0; i < 2000; i++) {
      const a = rng.pick(board.states);
      const b = rng.pick(board.states);
      if (distance(a, b, board.caps) === t) return { start: a, goal: b, min: t, caps: board.caps };
    }
    throw new Error('relay: no problem at ' + t);
  }

  WW.logic = WW.logic || {};
  WW.logic.relay = { STATES, BOARD4, statesFor, moves, distance, problem, key, parse, CAPS, MAX_MOVES, FOUR_FROM };

  const COLOR = { R: '#ff2a6d', G: '#5fd3a6', B: '#05d9e8', Y: '#ffb347' };

  WW.games.register({
    id: 'relay',
    name: 'Relay',
    headline: (s) => `${s.perfect}/${s.problems} optimal · level ${s.level}`,
    tune(sessions) {
      const v = sessions.slice(0, 3).map((s) => s.summary && s.summary.level).filter(Number.isFinite);
      return v.length ? WW.stats.clamp01((WW.stats.mean(v) - 2) / (MAX_MOVES - 2)) : null;
    },
    mount(container, ctx) {
      const { h, clear } = ctx.ui;
      const T = ctx.timing;
      const S = WW.stats;
      const ac = new AbortController();
      const signal = ac.signal;
      const rng = ctx.rng;

      function stackEl(state, caps, small, held) {
        return h(
          'div.rl-stacks' + (small ? '.small' : ''),
          state.map((peg, i) =>
            h(
              'div.rl-peg',
              { dataset: { i: String(i) }, style: { height: `${caps[i] * (small ? 22 : 46) + 14}px` } },
              peg.map((b, j) => h('div.rl-ball', { class: 'rl-ball' + (held && held.peg === i && j === peg.length - 1 ? ' held' : ''), style: { background: COLOR[b] } }, WW.prefs.get('cvdAid', false) ? b : null)),
              small ? null : h('kbd', String(i + 1))
            )
          )
        );
      }

      /** Play one problem. Resolves record or null. */
      function play(pz, idx, blind) {
        return new Promise((resolve) => {
          let state = parse(pz.start);
          const goal = parse(pz.goal);
          let held = null;
          let movesMade = 0;
          let firstMove = null;
          const t0 = T.now();
          const limit = pz.min * 2 + 2;
          const render = () => {
            clear(container);
            const showGoal = !(blind && firstMove !== null);
            container.appendChild(
              h(
                'div.center',
                { style: { userSelect: 'none' } },
                h('p.label', `Relay ${idx + 1} / ${PROBLEMS} · minimum ${pz.min} moves${blind ? ' · BLIND' : ''}`),
                h('p.muted.small', 'Target'),
                showGoal ? stackEl(goal, pz.caps, true) : h('div.rl-hidden', 'target hidden: you planned it, now run it'),
                stackEl(state, pz.caps, false, held),
                h('p', `Moves: ${movesMade}` + (held ? ' · pick a stack to drop on' : '')),
                h('div.row', { style: { justifyContent: 'center' } }, resetBtn),
                h('p.muted.small', 'Click a stack (or press 1–3) to lift its top block, then a stack to drop it.')
              )
            );
            container.querySelectorAll('.rl-stacks:not(.small) .rl-peg').forEach((el) => el.addEventListener('click', () => act(Number(el.dataset.i))));
          };
          const resetBtn = h('button.btn', { type: 'button', on: { click: () => ((state = parse(pz.start)), (held = null), render()) } }, 'Reset');
          const act = (i) => {
            if (held === null) {
              if (!state[i].length) return;
              if (firstMove === null) firstMove = T.now();
              held = { peg: i };
            } else if (held.peg === i) held = null;
            else if (state[i].length < pz.caps[i]) {
              state[i].push(state[held.peg].pop());
              held = null;
              movesMade++;
              ctx.audio.sfx('tick');
              if (key(state) === pz.goal) return finish(true);
              if (movesMade >= limit) return finish(false);
            } else return ctx.audio.sfx('error');
            render();
          };
          const onKey = (e) => {
            const m = /^(?:Digit|Numpad)([1-3])$/.exec(e.code);
            if (!m) return;
            e.preventDefault();
            act(Number(m[1]) - 1);
          };
          const onAbort = () => finish(null);
          root.addEventListener('keydown', onKey, true);
          signal.addEventListener('abort', onAbort);
          render();
          function finish(solved) {
            root.removeEventListener('keydown', onKey, true);
            signal.removeEventListener('abort', onAbort);
            if (solved === null) return resolve(null);
            const end = T.now();
            resolve({ solved, moves: movesMade, min: pz.min, planMs: (firstMove || end) - t0, execMs: end - (firstMove || end), perfect: solved && movesMade === pz.min });
          }
        });
      }

      (async () => {
        const saved = await ctx.loadState('progress', { level: 3, sessions: 0 });
        let level = saved.level;
        if (
          !(await WW.screens.intro(container, {
            kicker: 'COMPILER · planning',
            title: 'Relay',
            body: [
              'Reroute three data blocks across the relay stacks (they hold 3, 2 and 1) until they match the target, in as few moves as possible.',
              'Plan the whole route before your first move: the clock tracks planning and running separately. At higher levels the target goes dark once you start, and past 8-move problems a fourth block and taller stacks come in.',
            ],
            kv: [['Session', `${PROBLEMS} relays, about 4 min`], ['Level', `${level}-move problems`]],
            button: 'Start',
            signal,
          }))
        )
          return;
        const recs = [];
        for (let i = 0; i < PROBLEMS; i++) {
          const pz = problem(rng, level);
          const blind = level >= BLIND_LEVEL;
          const r = await play(pz, i, blind);
          if (!r) return;
          recs.push(Object.assign({ level, blind }, r));
          ctx.session.trial({ condition: `min${pz.min}${blind ? '-blind' : ''}`, stimulus: { start: pz.start, goal: pz.goal, min: pz.min }, response: r.moves, correct: r.perfect, rt: r.planMs + r.execMs, level, planMs: S.round(r.planMs), execMs: S.round(r.execMs) });
          clear(container);
          container.appendChild(h('div.center', h('p.big', { style: { color: r.perfect ? 'var(--good)' : r.solved ? 'var(--amber)' : 'var(--magenta)' } }, r.perfect ? 'OPTIMAL' : r.solved ? `+${r.moves - r.min} MOVES` : 'ROUTE LOST')));
          ctx.audio.sfx(r.perfect ? 'correct' : r.solved ? 'tick' : 'error');
          await T.sleep(900);
          level = r.perfect ? Math.min(MAX_MOVES, level + 0.5) : r.solved ? level : Math.max(2, level - 1);
        }
        const summary = {
          problems: recs.length,
          perfect: recs.filter((r) => r.perfect).length,
          solved: recs.filter((r) => r.solved).length,
          excessMoves: recs.filter((r) => r.solved).reduce((a, r) => a + r.moves - r.min, 0),
          medianPlanMs: S.round(S.median(recs.map((r) => r.planMs))),
          medianExecMs: S.round(S.median(recs.map((r) => r.execMs))),
          startLevel: saved.level,
          level,
        };
        const choice = await WW.screens.results(container, {
          headline: `${summary.perfect} / ${summary.problems}`,
          kv: [
            ['Optimal solutions', `${summary.perfect} of ${summary.problems} (${summary.solved} solved)`],
            ['Excess moves', summary.excessMoves],
            ['Median planning · running', `${(summary.medianPlanMs / 1000).toFixed(1)} s · ${(summary.medianExecMs / 1000).toFixed(1)} s`],
            ['Level', `${saved.level} → ${level}`],
          ],
          notes: ['Longer planning with fewer excess moves is the goal. Level carries over only if you log the session.'],
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
