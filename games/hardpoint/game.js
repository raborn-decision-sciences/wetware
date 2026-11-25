/* Hardpoint (GYRO): Shepard-Metzler mental rotation.
 *
 * Two salvaged cyberware housings, each a chain of cubes. Is the right one
 * the same part rotated, or its mirror-image counterfeit? (Shepard &
 * Metzler 1971). Shapes are random 3-bend polycubes, checked to be chiral
 * so the mirror is never just a rotation. Rotations are in the picture
 * plane or (at higher levels) in depth; angle range and cube count grow
 * with level (weighted staircase, 80%). Measures accuracy and the RT-angle
 * slope (mental rotation rate). Evidence: spatial skills are malleable and
 * transfer within the spatial domain (Uttal et al. 2013). Grade A.
 */
(function (root) {
  'use strict';
  const WW = root.WW;

  const TRIALS = 32;
  const DEADLINE = 8000;
  const ANGLES = [0, 40, 80, 120, 160];
  const CONF_RATE = 1 / 6;

  // ---------------------------------------------------------- 3D maths
  const mul = (A, B) => A.map((r) => [0, 1, 2].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
  const apply = (M, v) => [0, 1, 2].map((i) => M[i][0] * v[0] + M[i][1] * v[1] + M[i][2] * v[2]);
  const rx = (a) => [[1, 0, 0], [0, Math.cos(a), -Math.sin(a)], [0, Math.sin(a), Math.cos(a)]];
  const ry = (a) => [[Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)]];
  const rz = (a) => [[Math.cos(a), -Math.sin(a), 0], [Math.sin(a), Math.cos(a), 0], [0, 0, 1]];
  const deg = (d) => (d * Math.PI) / 180;

  /** The 24 proper rotations of the cube (signed permutation matrices, det +1). */
  const ROTATIONS = (() => {
    const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    const out = [];
    for (const p of perms)
      for (let s = 0; s < 8; s++) {
        const M = [0, 1, 2].map((i) => [0, 1, 2].map((j) => (j === p[i] ? (s & (1 << i) ? -1 : 1) : 0)));
        const det =
          M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
        if (det === 1) out.push(M);
      }
    return out;
  })();

  const canon = (cubes) => {
    const mins = [0, 1, 2].map((k) => Math.min(...cubes.map((c) => c[k])));
    return cubes
      .map((c) => c.map((v, k) => v - mins[k]).join(','))
      .sort()
      .join(';');
  };
  const mirror = (cubes) => cubes.map(([x, y, z]) => [-x, y, z]);

  /** True if no rotation of the mirror image equals the shape. */
  function chiral(cubes) {
    const target = canon(cubes);
    const m = mirror(cubes);
    return !ROTATIONS.some((R) => canon(m.map((c) => apply(R, c))) === target);
  }

  /** Random 4-arm polycube with 3 perpendicular bends spanning all three axes. */
  function shape(rng, nCubes) {
    const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    const armSplits = { 7: [[2, 2, 2, 1], [1, 2, 2, 2], [2, 1, 2, 2]], 8: [[2, 2, 2, 2], [3, 2, 2, 1], [1, 2, 2, 3]], 10: [[3, 2, 3, 2], [2, 3, 2, 3], [3, 3, 2, 2]] };
    for (let attempt = 0; attempt < 500; attempt++) {
      const arms = rng.pick(armSplits[nCubes]);
      const cubes = [[0, 0, 0]];
      const seen = new Set(['0,0,0']);
      let prev = null;
      const axes = new Set();
      let ok = true;
      for (const len of arms) {
        const choices = dirs.filter((d) => !prev || d.reduce((a, v, k) => a + v * prev[k], 0) === 0);
        const d = rng.pick(choices);
        axes.add(d.findIndex((v) => v !== 0));
        for (let i = 0; i < len && ok; i++) {
          const last = cubes[cubes.length - 1];
          const c = [last[0] + d[0], last[1] + d[1], last[2] + d[2]];
          const k = c.join(',');
          if (seen.has(k)) ok = false;
          seen.add(k);
          cubes.push(c);
        }
        prev = d;
      }
      // cubes has 1 + sum(arms) entries; trim the seed so the count is exact.
      if (!ok || axes.size < 3) continue;
      const out = cubes.slice(cubes.length - nCubes);
      if (chiral(out)) return out;
    }
    throw new Error('hardpoint: could not build a chiral shape');
  }

  /** Level -> trial parameters. */
  function params(level) {
    const L = Math.max(0, level);
    return {
      maxAngleIdx: Math.min(4, 2 + Math.floor(L / 2)),
      depth: L >= 6,
      cubes: L >= 10 ? 10 : L >= 4 ? 8 : 7,
    };
  }

  function makeTrial(rng, level) {
    const p = params(level);
    const cubes = shape(rng, p.cubes);
    const angle = ANGLES[rng.int(0, p.maxAngleIdx)];
    const axis = p.depth && rng.chance(0.5) ? 'depth' : 'picture';
    const isMirror = rng.chance(0.5);
    // Random base orientation: one of the 24 cube rotations, then a small continuous tilt.
    const base = mul(rz(deg(rng.float(-20, 20))), rng.pick(ROTATIONS));
    return { cubes, angle, axis, mirror: isMirror, base, level };
  }

  WW.logic = WW.logic || {};
  WW.logic.hardpoint = { ROTATIONS, canon, mirror, chiral, shape, params, makeTrial, apply, mul };

  // ------------------------------------------------------------ render
  const VIEW = mul(rx(deg(-22)), ry(deg(28)));
  const FACES = [
    { n: [1, 0, 0], v: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
    { n: [-1, 0, 0], v: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
    { n: [0, 1, 0], v: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
    { n: [0, -1, 0], v: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
    { n: [0, 0, 1], v: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
    { n: [0, 0, -1], v: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
  ];
  const LIGHT = (() => {
    const l = [0.4, 0.75, 0.55];
    const m = Math.hypot(...l);
    return l.map((x) => x / m);
  })();

  /** Draw cubes with object rotation O, then camera rotation C (applied after VIEW). */
  function draw(canvas, cubes, O, C) {
    const g = canvas.getContext('2d');
    const n = canvas.width;
    g.fillStyle = '#0b0b12';
    g.fillRect(0, 0, n, n);
    const set = new Set(cubes.map((c) => c.join(',')));
    const centre = [0, 1, 2].map((k) => cubes.reduce((a, c) => a + c[k] + 0.5, 0) / cubes.length);
    const M = mul(C, mul(VIEW, O));
    const radius = Math.max(...cubes.map((c) => Math.hypot(c[0] + 0.5 - centre[0], c[1] + 0.5 - centre[1], c[2] + 0.5 - centre[2]))) + 0.5;
    const scale = (n * 0.47) / radius;
    const polys = [];
    for (const c of cubes) {
      for (const f of FACES) {
        if (set.has([c[0] + f.n[0], c[1] + f.n[1], c[2] + f.n[2]].join(','))) continue; // hidden inner face
        const nn = apply(M, f.n);
        if (nn[2] <= 0) continue; // back face
        const pts = f.v.map((v) => apply(M, [c[0] + v[0] - centre[0], c[1] + v[1] - centre[1], c[2] + v[2] - centre[2]]));
        const depth = pts.reduce((a, p) => a + p[2], 0) / 4;
        const shade = 0.3 + 0.7 * Math.max(0, nn[0] * LIGHT[0] + nn[1] * LIGHT[1] + nn[2] * LIGHT[2]);
        polys.push({ pts, depth, shade });
      }
    }
    polys.sort((a, b) => a.depth - b.depth);
    for (const p of polys) {
      const v = Math.round(60 + 170 * p.shade);
      g.fillStyle = `rgb(${v},${Math.round(v * 0.97)},${Math.round(v * 0.92)})`;
      g.strokeStyle = '#0b0b12';
      g.lineWidth = Math.max(1, n / 300);
      g.beginPath();
      p.pts.forEach((q, i) => {
        const x = n / 2 + q[0] * scale;
        const y = n / 2 - q[1] * scale;
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      });
      g.closePath();
      g.fill();
      g.stroke();
    }
  }

  /** Least-squares slope (ms per degree) of y on x. */
  function slope(xs, ys) {
    const n = xs.length;
    if (n < 3) return null;
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    let sxy = 0, sxx = 0;
    for (let i = 0; i < n; i++) {
      sxy += (xs[i] - mx) * (ys[i] - my);
      sxx += (xs[i] - mx) ** 2;
    }
    return sxx ? sxy / sxx : null;
  }
  WW.logic.hardpoint.slope = slope;
  WW.logic.hardpoint.draw = draw;
  WW.logic.hardpoint.rz = rz;
  WW.logic.hardpoint.ry = ry;
  WW.logic.hardpoint.deg = deg;

  WW.games.register({
    id: 'hardpoint',
    name: 'Hardpoint',
    headline: (s) => `${Math.round(s.accuracy * 100)}% · level ${s.level}` + (s.degPerSec ? ` · ${s.degPerSec}°/s` : ''),
    /** GYRO tune from level (/16). */
    tune(sessions) {
      const v = sessions.slice(0, 3).map((s) => s.summary && s.summary.level).filter(Number.isFinite);
      return v.length ? WW.stats.clamp01(WW.stats.mean(v) / 16) : null;
    },
    mount(container, ctx) {
      const { h, clear } = ctx.ui;
      const T = ctx.timing;
      const S = WW.stats;
      const ac = new AbortController();
      const signal = ac.signal;
      const rng = ctx.rng;
      const SIZE = Math.floor(Math.min(root.innerWidth * 0.44, root.innerHeight * 0.5, 320));
      const dpr = Math.min(2, root.devicePixelRatio || 1);

      let left, right, msg, sameBtn, mirBtn;
      function screen() {
        clear(container);
        const mk = () => {
          const c = h('canvas.hp-canvas.stim');
          c.width = c.height = Math.round(SIZE * dpr);
          c.style.width = c.style.height = SIZE + 'px';
          return c;
        };
        left = mk();
        right = mk();
        msg = h('p.label', '');
        sameBtn = h('button.btn.hp-key', { type: 'button' }, h('kbd', 'F'), ' same part');
        mirBtn = h('button.btn.hp-key', { type: 'button' }, h('kbd', 'J'), ' mirror fake');
        container.appendChild(h('div.center', { style: { userSelect: 'none', touchAction: 'manipulation' } }, msg, h('div.row', { style: { justifyContent: 'center' } }, left, right), h('div.row', { style: { justifyContent: 'center' } }, sameBtn, mirBtn)));
      }
      const blank = (c) => {
        const g = c.getContext('2d');
        g.fillStyle = '#0b0b12';
        g.fillRect(0, 0, c.width, c.height);
      };

      async function trial(t, practice, probe) {
        blank(left);
        blank(right);
        msg.textContent = practice ? 'Practice' : '';
        await T.sleep(400);
        if (signal.aborted) return null;
        const I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
        const cam = t.axis === 'picture' ? rz(deg(t.angle)) : ry(deg(t.angle));
        const rightCubes = t.mirror ? mirror(t.cubes) : t.cubes;
        const onset = await T.onNextFrame(() => {
          draw(left, t.cubes, t.base, I);
          draw(right, rightCubes, t.base, cam);
        });
        const r = await T.awaitChoice({ keyMap: { KeyF: false, KeyJ: true }, buttons: [{ el: sameBtn, value: false }, { el: mirBtn, value: true }], timeoutMs: DEADLINE, since: onset, signal });
        if (r.aborted) return null;
        const ok = !r.timeout && r.value === t.mirror;
        const rec = { ok, rt: r.timeout ? null : r.rt, timeout: !!r.timeout, choice: r.timeout ? null : r.value, input: r.input };
        if (probe && !r.timeout) {
          const c = await WW.confidence.ask(container.querySelector('.center'), { prompt: 'How sure are you?', signal });
          if (!c) return null;
          rec.confidence = c.confidence;
        }
        ctx.audio.sfx(ok ? 'correct' : 'error');
        msg.textContent = r.timeout ? 'Too slow' : ok ? (t.mirror ? 'Fake spotted.' : 'Genuine part.') : t.mirror ? 'That was a mirror fake.' : 'That was the same part.';
        await T.sleep(ok ? 450 : 1200);
        return rec;
      }

      (async () => {
        const saved = await ctx.loadState('progress', { stair: null, sessions: 0 });
        const st = saved.stair ? WW.Staircase.fromJSON(saved.stair) : new WW.Staircase({ rule: 'weighted', target: 0.8, start: 0, step: 0.5, min: 0, max: 16 });
        if (
          !(await WW.screens.intro(container, {
            kicker: 'GYRO · spatial',
            title: 'Hardpoint',
            body: [
              'Two salvaged housings sit on the bench. The right one is either the same part turned around, or a mirror-image counterfeit that can never be turned to match.',
              'Rotate it in your head. F = same part, J = mirror fake. Accuracy first, then speed.',
            ],
            kv: [['Session', `${TRIALS} parts, about 4 min`], ['Level', `${S.round(st.value(), 1)} (adapts: wider angles, depth rotations, longer parts)`]],
            button: saved.sessions ? 'Start' : 'Practice',
            signal,
          }))
        )
          return;
        screen();
        if (!saved.sessions) for (let i = 0; i < 4; i++) if ((await trial(makeTrial(rng, 0), true, false)) === null) return;
        const recs = [];
        const startLevel = S.round(st.value(), 2);
        for (let i = 0; i < TRIALS; i++) {
          const level = st.value();
          const t = makeTrial(rng, level);
          const r = await trial(t, false, WW.confidence.shouldProbe(rng, CONF_RATE));
          if (r === null) return;
          st.update(r.ok);
          recs.push(Object.assign({ angle: t.angle, axis: t.axis, mirror: t.mirror }, r));
          ctx.session.trial({
            condition: `${t.mirror ? 'mirror' : 'same'}-${t.axis}`,
            stimulus: { angle: t.angle, axis: t.axis, mirror: t.mirror, cubes: t.cubes.length },
            response: r.choice === null ? null : r.choice ? 'mirror' : 'same',
            correct: r.ok,
            rt: r.rt,
            level: S.round(level, 2),
            confidence: r.confidence,
            input: r.input,
          });
        }
        const good = recs.filter((r) => r.ok && !r.mirror);
        const b = slope(good.map((r) => r.angle), good.map((r) => r.rt));
        const pairs = recs.filter((r) => r.confidence != null).map((r) => [r.confidence, r.ok]);
        const summary = {
          trials: recs.length,
          accuracy: S.round(recs.filter((r) => r.ok).length / recs.length, 3),
          medianRt: S.round(S.median(recs.filter((r) => r.ok).map((r) => r.rt))),
          msPerDeg: b != null ? S.round(b, 2) : null,
          degPerSec: b && b > 0 ? Math.round(1000 / b) : null,
          startLevel,
          level: S.round(st.value(), 2),
          confidencePairs: pairs,
        };
        const choice = await WW.screens.results(container, {
          headline: `${Math.round(summary.accuracy * 100)}%`,
          tone: summary.accuracy < 0.7 ? 'warn' : 'good',
          kv: [
            ['Accuracy', `${Math.round(summary.accuracy * 100)}%`],
            ['Median RT (correct)', `${summary.medianRt} ms`],
            ['Rotation rate', summary.degPerSec ? `${summary.degPerSec}°/s (${summary.msPerDeg} ms per degree, same-part trials)` : 'not enough angle spread yet'],
            ['Level', `${startLevel} → ${summary.level}`],
          ],
          notes: ['RT rising with angle is the signature of mental rotation; a flatter slope means faster rotation. Level carries over only if you log the session.'],
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
