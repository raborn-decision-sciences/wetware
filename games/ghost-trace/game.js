/* Ghost Trace (OPTICS): multiple-object tracking.
 *
 * Some daemons are tagged, then they blend into a swarm of identical
 * decoys and drift for six seconds. Click the tagged ones. Pylyshyn &
 * Storm (1988). Level drives the number of targets (3-6) and their speed
 * (weighted staircase, 70% all-correct trials). Evidence: MOT is a core
 * component of action-game attention gains (Bediou et al. 2018); training
 * effects are mostly near transfer. Grade B.
 */
(function (root) {
  'use strict';
  const WW = root.WW;

  const TRIALS = 16;
  const CUE_MS = 2000;
  const TRACK_MS = 6000;
  const R = 0.028; // object radius, field fraction
  const CONF_RATE = 1 / 4;

  const params = (level) => {
    const L = Math.max(0, level);
    const band = Math.floor(L / 5);
    const n = Math.min(6, 3 + band);
    return { targets: n, objects: n * 2 + 2, speed: 0.15 * Math.pow(1.12, L - band * 5) * (band >= 3 ? Math.pow(1.12, band - 3) : 1) };
  };

  /** Non-overlapping objects with random headings at a fixed speed. */
  function spawn(rng, count, speed) {
    const objs = [];
    while (objs.length < count) {
      const p = { x: rng.float(R * 2, 1 - R * 2), y: rng.float(R * 2, 1 - R * 2) };
      if (objs.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < R * 3)) continue;
      const a = rng.float(0, Math.PI * 2);
      objs.push({ x: p.x, y: p.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed });
    }
    return objs;
  }

  /** Advance dt seconds: wall bounces; overlapping pairs that approach swap velocities. */
  function step(objs, dt) {
    for (const o of objs) {
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      if (o.x < R) (o.x = R), (o.vx = Math.abs(o.vx));
      if (o.x > 1 - R) (o.x = 1 - R), (o.vx = -Math.abs(o.vx));
      if (o.y < R) (o.y = R), (o.vy = Math.abs(o.vy));
      if (o.y > 1 - R) (o.y = 1 - R), (o.vy = -Math.abs(o.vy));
    }
    for (let i = 0; i < objs.length; i++)
      for (let j = i + 1; j < objs.length; j++) {
        const a = objs[i];
        const b = objs[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        if (dx * dx + dy * dy < 4 * R * R && (b.vx - a.vx) * dx + (b.vy - a.vy) * dy < 0) {
          [a.vx, b.vx] = [b.vx, a.vx];
          [a.vy, b.vy] = [b.vy, a.vy];
        }
      }
  }

  WW.logic = WW.logic || {};
  WW.logic.ghostTrace = { params, spawn, step, R };

  WW.games.register({
    id: 'ghost-trace',
    name: 'Ghost Trace',
    headline: (s) => `${Math.round(s.targetAccuracy * 100)}% tagged · level ${s.level}`,
    /** OPTICS tune from level (/19). */
    tune(sessions) {
      const v = sessions.slice(0, 3).map((s) => s.summary && s.summary.level).filter(Number.isFinite);
      return v.length ? WW.stats.clamp01(WW.stats.mean(v) / 19) : null;
    },
    mount(container, ctx) {
      const { h, clear } = ctx.ui;
      const T = ctx.timing;
      const S = WW.stats;
      const ac = new AbortController();
      const signal = ac.signal;
      const rng = ctx.rng;
      const size = Math.floor(Math.min(root.innerWidth * 0.92, root.innerHeight * 0.66, 560));
      const dpr = Math.min(2, root.devicePixelRatio || 1);
      let canvas, g, msg;

      function screen() {
        clear(container);
        canvas = h('canvas.gt-canvas.stim');
        canvas.width = canvas.height = Math.round(size * dpr);
        canvas.style.width = canvas.style.height = size + 'px';
        g = canvas.getContext('2d');
        msg = h('p.label', '');
        container.appendChild(h('div.center', { style: { userSelect: 'none', touchAction: 'none' } }, msg, canvas));
      }
      function draw(objs, opts) {
        const o = opts || {};
        const n = canvas.width;
        g.fillStyle = '#0b0b12';
        g.fillRect(0, 0, n, n);
        objs.forEach((p, i) => {
          g.beginPath();
          g.arc(p.x * n, p.y * n, R * n, 0, Math.PI * 2);
          g.fillStyle = o.cue && o.cue.has(i) ? '#05d9e8' : '#e8e4dc';
          g.fill();
          const ring = o.rings && o.rings[i];
          if (ring) {
            g.lineWidth = 3 * dpr;
            g.strokeStyle = ring;
            g.beginPath();
            g.arc(p.x * n, p.y * n, R * n + 4 * dpr, 0, Math.PI * 2);
            g.stroke();
          }
        });
      }

      async function trial(level, probe) {
        const p = params(level);
        const objs = spawn(rng, p.objects, p.speed);
        const targets = new Set(rng.sample([...objs.keys()], p.targets));
        msg.textContent = `Tag ${p.targets} daemons`;
        draw(objs, { cue: targets });
        await T.sleep(CUE_MS);
        if (signal.aborted) return null;
        msg.textContent = 'Track them';
        // Animate with real frame time so speed is display-independent.
        await new Promise((resolve) => {
          let last = null;
          const t0 = T.now();
          const frame = (t) => {
            if (signal.aborted) return resolve();
            if (last !== null) step(objs, Math.min(0.05, (t - last) / 1000));
            last = t;
            draw(objs);
            if (T.now() - t0 < TRACK_MS) root.requestAnimationFrame(frame);
            else resolve();
          };
          root.requestAnimationFrame(frame);
        });
        if (signal.aborted) return null;
        msg.textContent = `Click the ${p.targets} tagged daemons`;
        const picks = new Set();
        const rings = {};
        const t0 = T.now();
        let input = null;
        await new Promise((resolve) => {
          const onDown = (e) => {
            e.preventDefault();
            input = input || e.pointerType || 'pointer';
            const rect = canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width;
            const y = (e.clientY - rect.top) / rect.height;
            let best = -1;
            let bd = Infinity;
            objs.forEach((o, i) => {
              const d = Math.hypot(o.x - x, o.y - y);
              if (d < bd) (bd = d), (best = i);
            });
            if (best < 0 || bd > R * 2.2) return;
            if (picks.has(best)) {
              picks.delete(best);
              delete rings[best];
            } else if (picks.size < p.targets) {
              picks.add(best);
              rings[best] = '#ffb347';
            }
            draw(objs, { rings });
            if (picks.size === p.targets) finish();
          };
          const onAbort = () => finish();
          canvas.addEventListener('pointerdown', onDown);
          signal.addEventListener('abort', onAbort);
          function finish() {
            canvas.removeEventListener('pointerdown', onDown);
            signal.removeEventListener('abort', onAbort);
            resolve();
          }
        });
        if (signal.aborted) return null;
        const hits = [...picks].filter((i) => targets.has(i)).length;
        const rec = { level, targets: p.targets, objects: p.objects, speed: p.speed, hits, ok: hits === p.targets, rt: T.now() - t0, input };
        if (probe) {
          const c = await WW.confidence.ask(container.querySelector('.center'), { prompt: `How sure are you that all ${p.targets} were right?`, signal });
          if (!c) return null;
          rec.confidence = c.confidence;
        }
        const reveal = {};
        objs.forEach((_, i) => {
          if (picks.has(i)) reveal[i] = targets.has(i) ? '#5fd3a6' : '#ff2a6d';
          else if (targets.has(i)) reveal[i] = '#05d9e8';
        });
        draw(objs, { rings: reveal });
        msg.textContent = rec.ok ? 'All ghosts traced.' : `${hits} of ${p.targets}`;
        ctx.audio.sfx(rec.ok ? 'correct' : 'error');
        await T.sleep(1200);
        return rec;
      }

      (async () => {
        const saved = await ctx.loadState('progress', { stair: null, sessions: 0 });
        const st = saved.stair ? WW.Staircase.fromJSON(saved.stair) : new WW.Staircase({ rule: 'weighted', target: 0.7, start: 0, step: 0.6, min: 0, max: 19 });
        const p0 = params(st.value());
        if (
          !(await WW.screens.intro(container, {
            kicker: 'OPTICS · attention',
            title: 'Ghost Trace',
            body: [
              'Some daemons light up cyan. Then they go dark and blend into the swarm. Keep your eyes on the tagged ones while everything drifts.',
              'When the swarm stops, click every tagged daemon. Click again to unpick.',
            ],
            kv: [['Session', `${TRIALS} traces, about 4 min`], ['Now', `${p0.targets} targets among ${p0.objects} (adapts: speed, then more targets)`]],
            button: 'Start',
            signal,
          }))
        )
          return;
        screen();
        const recs = [];
        const startLevel = S.round(st.value(), 2);
        for (let i = 0; i < TRIALS; i++) {
          const level = st.value();
          const r = await trial(level, WW.confidence.shouldProbe(rng, CONF_RATE));
          if (r === null) return;
          st.update(r.ok);
          recs.push(r);
          ctx.session.trial({ condition: `track-${r.targets}`, stimulus: { targets: r.targets, objects: r.objects, speed: S.round(r.speed, 3) }, response: r.hits, correct: r.ok, rt: r.rt, level: S.round(level, 2), confidence: r.confidence, input: r.input });
        }
        const pairs = recs.filter((r) => r.confidence != null).map((r) => [r.confidence, r.ok]);
        const summary = {
          trials: recs.length,
          trialAccuracy: S.round(recs.filter((r) => r.ok).length / recs.length, 3),
          targetAccuracy: S.round(recs.reduce((a, r) => a + r.hits, 0) / recs.reduce((a, r) => a + r.targets, 0), 3),
          startLevel,
          level: S.round(st.value(), 2),
          targetsNow: params(st.value()).targets,
          confidencePairs: pairs,
        };
        const choice = await WW.screens.results(container, {
          headline: `${Math.round(summary.targetAccuracy * 100)}%`,
          kv: [
            ['Targets tracked', `${Math.round(summary.targetAccuracy * 100)}%`],
            ['Perfect traces', `${Math.round(summary.trialAccuracy * 100)}%`],
            ['Level', `${startLevel} → ${summary.level} (${summary.targetsNow} targets next time)`],
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
