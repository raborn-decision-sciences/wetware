/* Heist Ledger (RAM / GYRO / ALU): memorise, conceal, compute.
 *
 * A Devil's-Plan-style hybrid (structure only, no show content): a 5x5
 * vault lattice of numbered nodes is visible for a few seconds, then the
 * cameras cut and the numbers vanish. Calls come in ("a 3-node path summing
 * to 17"); trace a connected path you believe matches before a rival crew
 * does. Visuospatial WM (Corsi-like; Milner 1971) + arithmetic under time
 * pressure. No direct training literature for the hybrid. Grade C/X.
 * Level drives study time, path length and rival speed (60% calls won).
 */
(function (root) {
  'use strict';
  const WW = root.WW;

  const N = 5;
  const CALLS = 8;
  const CONF_RATE = 1 / 3;

  const params = (level) => {
    const L = Math.max(0, level);
    return {
      studyMs: Math.round(Math.max(4000, 12000 - L * 700)),
      k: L >= 7 ? 4 : 3,
      rivalMs: Math.round(Math.max(7000, 26000 - L * 1600)),
    };
  };

  const nbrs = (i) => {
    const r = Math.floor(i / N);
    const c = i % N;
    const out = [];
    if (r > 0) out.push(i - N);
    if (r < N - 1) out.push(i + N);
    if (c > 0) out.push(i - 1);
    if (c < N - 1) out.push(i + 1);
    return out;
  };

  /** Every simple orthogonal path of k nodes (each path once, as an ordered list from its lower end). */
  function paths(k) {
    const out = [];
    const walk = (p) => {
      if (p.length === k) {
        if (p[0] < p[k - 1]) out.push(p.slice());
        return;
      }
      for (const n of nbrs(p[p.length - 1])) if (!p.includes(n)) (p.push(n), walk(p), p.pop());
    };
    for (let i = 0; i < N * N; i++) walk([i]);
    return out;
  }

  /** Is `sel` a connected chain (each node adjacent to the previous)? */
  const isChain = (sel) => sel.every((n, i) => i === 0 || nbrs(sel[i - 1]).includes(n));

  /** Pick a call: target sum from a random free path; null if no free path left. */
  function call(rng, values, locked, k) {
    const free = paths(k).filter((p) => p.every((n) => !locked.has(n)));
    if (!free.length) return null;
    const p = rng.pick(free);
    const target = p.reduce((a, n) => a + values[n], 0);
    const matching = free.filter((q) => q.reduce((a, n) => a + values[n], 0) === target);
    return { target, path: p, solutions: matching.length };
  }

  WW.logic = WW.logic || {};
  WW.logic.heistLedger = { params, nbrs, paths, isChain, call, N };

  WW.games.register({
    id: 'heist-ledger',
    name: 'Heist Ledger',
    headline: (s) => `${s.callsWon}/${s.calls} calls · recall ${Math.round(s.recallAccuracy * 100)}%`,
    tune(sessions) {
      const v = sessions.slice(0, 3).map((s) => s.summary && s.summary.level).filter(Number.isFinite);
      return v.length ? WW.stats.clamp01(WW.stats.mean(v) / 12) : null;
    },
    mount(container, ctx) {
      const { h, clear } = ctx.ui;
      const T = ctx.timing;
      const S = WW.stats;
      const ac = new AbortController();
      const signal = ac.signal;
      const rng = ctx.rng;

      let nodes, msg, rivalBar, callEl, grid;
      function screen() {
        clear(container);
        msg = h('p.label', '');
        callEl = h('p.hl-call', '');
        nodes = [...Array(N * N).keys()].map((i) => h('button.hl-node', { type: 'button', dataset: { i: String(i) } }, ''));
        grid = h('div.hl-grid', nodes);
        rivalBar = h('div.meter.hl-rival', h('i'));
        container.appendChild(h('div.center', { style: { userSelect: 'none', touchAction: 'manipulation' } }, msg, callEl, grid, h('p.muted.small', 'Rival crew'), rivalBar));
      }
      const paint = (values, locked, shown, sel) =>
        nodes.forEach((b, i) => {
          b.textContent = shown || locked.has(i) ? String(values[i]) : '';
          b.className = 'hl-node' + (locked.has(i) ? ' locked' + (locked.get(i) === 'rival' ? ' rival' : '') : '') + (sel && sel.includes(i) ? ' sel' : '');
        });

      /** Play one call. Returns record or null. */
      function playCall(values, locked, c, p, idx) {
        return new Promise((resolve) => {
          const sel = [];
          const t0 = T.now();
          const rivalAt = p.rivalMs * rng.float(0.75, 1.3);
          callEl.textContent = `Call ${idx + 1} / ${CALLS}: a ${p.k}-node path that sums to ${c.target}`;
          let wrong = 0;
          let finished = false;
          const tick = setInterval(() => {
            const f = (T.now() - t0) / rivalAt;
            rivalBar.firstChild.style.width = Math.min(100, f * 100) + '%';
            if (f >= 1) end({ won: false, rival: true });
          }, 100);
          const onClick = async (e) => {
            const b = e.target.closest('button.hl-node');
            if (!b || finished) return;
            const i = Number(b.dataset.i);
            if (locked.has(i)) return;
            const at = sel.indexOf(i);
            if (at >= 0) sel.splice(at); // tap a selected node to cut the path back to it
            else if (!sel.length || nbrs(sel[sel.length - 1]).includes(i)) sel.push(i);
            else return ctx.audio.sfx('tick');
            paint(values, locked, false, sel);
            if (sel.length === p.k) {
              const claim = sel.slice();
              const sum = claim.reduce((a, n) => a + values[n], 0);
              const ok = sum === c.target;
              let confidence = null;
              if (WW.confidence.shouldProbe(rng, CONF_RATE)) {
                finished = true; // freeze the rival while the player rates
                clearInterval(tick);
                const conf = await WW.confidence.ask(container.querySelector('.center'), { prompt: 'How sure are you this path hits the target?', signal });
                if (!conf) return end(null);
                confidence = conf.confidence;
              }
              if (ok) return end({ won: true, claim, confidence, wrong });
              wrong++;
              ctx.audio.sfx('error');
              // Show what the claim actually summed to, briefly, then hide again.
              claim.forEach((n) => (nodes[n].textContent = String(values[n])));
              msg.textContent = `That path sums to ${sum}.`;
              sel.length = 0;
              if (confidence !== null) return end({ won: false, rival: false, wrongClaim: true, confidence, wrong });
              setTimeout(() => {
                if (!finished) {
                  paint(values, locked, false, sel);
                  msg.textContent = '';
                }
              }, 1400);
            }
          };
          const onAbort = () => end(null);
          grid.addEventListener('click', onClick);
          signal.addEventListener('abort', onAbort);
          function end(v) {
            finished = true;
            clearInterval(tick);
            grid.removeEventListener('click', onClick);
            signal.removeEventListener('abort', onAbort);
            resolve(v && Object.assign({ ms: T.now() - t0, wrong: v.wrong || 0 }, v));
          }
        });
      }

      (async () => {
        const saved = await ctx.loadState('progress', { stair: null, sessions: 0 });
        const st = saved.stair ? WW.Staircase.fromJSON(saved.stair) : new WW.Staircase({ rule: 'weighted', target: 0.6, start: 0, step: 0.5, min: 0, max: 12 });
        const level = st.value();
        const p = params(level);
        if (
          !(await WW.screens.intro(container, {
            kicker: 'RAM · GYRO · ALU · heist',
            title: 'Heist Ledger',
            body: [
              `You get ${Math.round(p.studyMs / 1000)} seconds with the vault lattice before the cameras cut and the numbers go dark. Memorise as much as you can: where the big ones are, local clusters, the sums of neighbours.`,
              `Then the calls come in: "a ${p.k}-node path that sums to 17". Tap ${p.k} connected nodes (up, down, left, right) to claim it before the rival crew's bar fills. Tap a picked node to back up.`,
            ],
            kv: [['Session', `${CALLS} calls, about 4 min`], ['Level', `${S.round(level, 1)}: ${p.k}-node paths, rival ~${Math.round(p.rivalMs / 1000)} s`]],
            button: 'Case the vault',
            signal,
          }))
        )
          return;
        screen();
        const values = [...Array(N * N)].map(() => rng.int(1, 9));
        const locked = new Map();
        msg.textContent = 'Memorise';
        callEl.textContent = '';
        paint(values, locked, true);
        const t0 = T.now();
        const clock = setInterval(() => (msg.textContent = `Memorise · ${Math.max(0, Math.ceil((p.studyMs - (T.now() - t0)) / 1000))} s`), 200);
        await T.sleep(p.studyMs);
        clearInterval(clock);
        if (signal.aborted) return;
        ctx.audio.sfx('klaxon');
        msg.textContent = 'Cameras cut.';
        paint(values, locked, false);
        await T.sleep(900);

        const recs = [];
        for (let i = 0; i < CALLS; i++) {
          const c = call(rng, values, locked, p.k);
          if (!c) break;
          msg.textContent = '';
          rivalBar.firstChild.style.width = '0%';
          const r = await playCall(values, locked, c, p, i);
          if (!r) return;
          if (r.won) {
            r.claim.forEach((n) => locked.set(n, 'you'));
            ctx.audio.sfx('correct');
            msg.textContent = 'Claimed.';
          } else if (r.rival) {
            c.path.forEach((n) => locked.set(n, 'rival'));
            ctx.audio.sfx('error');
            msg.textContent = 'The rival crew got there first.';
          }
          paint(values, locked, false);
          recs.push(Object.assign({ target: c.target, solutions: c.solutions }, r));
          ctx.session.trial({ condition: `call-k${p.k}`, stimulus: { target: c.target, solutions: c.solutions }, response: r.claim || null, correct: !!r.won, rt: r.ms, level: S.round(level, 2), confidence: r.confidence, wrongClaims: r.wrong });
          await T.sleep(1200);
        }

        // Spatial recall probe: three never-revealed nodes.
        const hidden = [...Array(N * N).keys()].filter((i) => !locked.has(i));
        const probes = rng.sample(hidden, Math.min(3, hidden.length));
        let recallOk = 0;
        for (const n of probes) {
          paint(values, locked, false, [n]);
          callEl.textContent = 'Last thing: what number was in the highlighted node? (1–9)';
          msg.textContent = 'Debrief';
          const keyMap = {};
          for (let d = 1; d <= 9; d++) (keyMap['Digit' + d] = d), (keyMap['Numpad' + d] = d);
          const r = await T.awaitChoice({ keyMap, signal });
          if (r.aborted) return;
          const ok = r.value === values[n];
          if (ok) recallOk++;
          nodes[n].textContent = String(values[n]);
          ctx.session.trial({ condition: 'recall', stimulus: { node: n, value: values[n] }, response: r.value, correct: ok, rt: r.rt, level: S.round(level, 2) });
          await T.sleep(700);
        }

        const won = recs.filter((r) => r.won).length;
        const outcomeOk = won / Math.max(1, recs.length) >= 0.6;
        st.update(outcomeOk);
        const pairs = recs.filter((r) => r.confidence != null).map((r) => [r.confidence, !!r.won]);
        const summary = {
          level: S.round(level, 2),
          nextLevel: S.round(st.value(), 2),
          calls: recs.length,
          callsWon: won,
          rivalWins: recs.filter((r) => r.rival).length,
          wrongClaims: recs.reduce((a, r) => a + (r.wrong || 0), 0),
          medianWinMs: S.round(S.median(recs.filter((r) => r.won).map((r) => r.ms))),
          recallAccuracy: probes.length ? S.round(recallOk / probes.length, 3) : 0,
          studyMs: p.studyMs,
          pathLength: p.k,
          confidencePairs: pairs,
        };
        const choice = await WW.screens.results(container, {
          headline: `${won} / ${recs.length} CALLS`,
          tone: outcomeOk ? 'good' : 'warn',
          kv: [
            ['Calls won', `${won} of ${recs.length} (rival took ${summary.rivalWins})`],
            ['Wrong claims', summary.wrongClaims],
            ['Debrief recall', `${recallOk} of ${probes.length}`],
            ['Level', `${summary.level} → ${summary.nextLevel}`],
          ],
          notes: ['Winning 60%+ of calls raises the level (less study time, faster rival, longer paths). It carries over only if you log the session.'],
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
