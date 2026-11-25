/* Diagnostic: trail alternation (digital Trail Making, parts A and B).
 * Reitan (1958) style. Part A: tap 1-20 in order. Part B: alternate
 * numbers and letters, 1-A-2-B-...-10-J. Shortened to 20 targets per part
 * (the paper test uses 25) to fit a screen. Measures: completion times,
 * B - A (switching cost with motor speed removed), B / A, errors.
 * Layouts are parallel forms: generated per administration with the
 * path length held in a fixed band and no path segment crossing a circle.
 */
(function (root) {
  'use strict';
  const WW = root.WW;

  const W = 100;
  const H = 68;
  const R = 3.6;
  const N = 20;
  const MIN_DIST = 10.5;
  // Total path length for N = 20 (viewBox units): roughly the middle half of the
  // generator's unconstrained distribution (p10 ~400, p50 ~430, p90 ~460).
  const PATH_BAND = [415, 445];
  const CLEARANCE = R + 1.2; // path segments keep this far from other centres

  const labelsA = (n) => Array.from({ length: n }, (_, i) => String(i + 1));
  const labelsB = (n) => Array.from({ length: n }, (_, i) => (i % 2 === 0 ? String(i / 2 + 1) : String.fromCharCode(65 + (i - 1) / 2)));

  function segDist(p, a, b) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  }

  function pathLength(pts) {
    let s = 0;
    for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return s;
  }

  /**
   * Points in visiting order. Built as a constrained random walk so the
   * path length lands in `band` and no segment passes through a circle.
   */
  function layout(rng, n = N, band = PATH_BAND) {
    const m = R + 2;
    for (let attempt = 0; attempt < 4000; attempt++) {
      const pts = [];
      let fail = false;
      for (let i = 0; i < n && !fail; i++) {
        let placed = false;
        for (let k = 0; k < 60 && !placed; k++) {
          let p;
          if (i === 0) p = [rng.float(m, W - m), rng.float(m, H - m)];
          else {
            // Step 14-34 units from the previous point: local, like the paper test.
            const a = rng.float(0, Math.PI * 2);
            const d = rng.float(14, 34);
            p = [pts[i - 1][0] + Math.cos(a) * d, pts[i - 1][1] + Math.sin(a) * d];
            if (p[0] < m || p[0] > W - m || p[1] < m || p[1] > H - m) continue;
          }
          if (pts.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < MIN_DIST)) continue;
          // New segment must clear every earlier circle except its endpoints.
          if (i > 0 && pts.slice(0, -1).some((q) => segDist(q, pts[i - 1], p) < CLEARANCE)) continue;
          // And the new circle must not sit on any earlier segment.
          let onSeg = false;
          for (let j = 1; j < pts.length && !onSeg; j++) if (segDist(p, pts[j - 1], pts[j]) < CLEARANCE) onSeg = true;
          if (onSeg) continue;
          pts.push(p);
          placed = true;
        }
        if (!placed) fail = true;
      }
      if (fail) continue;
      const len = pathLength(pts) * (N - 1) / (n - 1);
      if (len >= band[0] && len <= band[1]) return pts;
    }
    throw new Error('trails: could not generate a layout');
  }

  WW.dxLogic = WW.dxLogic || {};
  WW.dxLogic.trails = { layout, pathLength, segDist, labelsA, labelsB, R, MIN_DIST, CLEARANCE, PATH_BAND, W, H };

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, attrs) => {
    const el = root.document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
    return el;
  };

  WW.games.register({
    id: 'dx-trails',
    name: 'Trail alternation',
    kind: 'diagnostic',
    headline: (s) => `B−A ${(s.diffMs / 1000).toFixed(1)} s`,
    mount(container, ctx) {
      const { h, clear } = ctx.ui;
      const T = ctx.timing;
      const S = WW.stats;
      const ac = new AbortController();
      const signal = ac.signal;

      /** One part. Resolves { timeMs, errors } or null if aborted. */
      function part(pts, labels, cond, practice) {
        clear(container);
        const msg = h('p.label', practice ? 'Practice' : '');
        const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'trails', role: 'img', 'aria-label': 'trail targets' });
        const lines = svgEl('g');
        svg.appendChild(lines);
        const nodes = pts.map((p, i) => {
          const g = svgEl('g', { class: 'node', tabindex: '-1' });
          g.appendChild(svgEl('circle', { cx: p[0], cy: p[1], r: R }));
          const t = svgEl('text', { x: p[0], y: p[1] + 1.25, 'text-anchor': 'middle' });
          t.textContent = labels[i];
          g.appendChild(t);
          svg.appendChild(g);
          return g;
        });
        nodes[0].classList.add('start');
        container.appendChild(h('div.center', { style: { touchAction: 'manipulation', userSelect: 'none' } }, msg, h('div.trails-wrap', svg)));

        return new Promise((resolve) => {
          let next = 0;
          let errors = 0;
          let t0 = null;
          let lastT = null;
          T.onNextFrame().then((t) => {
            t0 = t;
            lastT = t;
          });
          const onDown = (e) => {
            const g = e.target.closest('g.node');
            if (!g || t0 === null) return;
            e.preventDefault();
            const i = nodes.indexOf(g);
            if (i < next) return; // already done
            const ok = i === next;
            if (!practice) {
              ctx.session.trial({
                condition: cond,
                stimulus: labels[next],
                response: labels[i],
                correct: ok,
                rt: e.timeStamp - lastT,
                level: next + 1,
                input: e.pointerType || 'pointer',
              });
            }
            if (!ok) {
              errors++;
              g.classList.add('bad');
              setTimeout(() => g.classList.remove('bad'), 350);
              if (practice) msg.textContent = `Next is ${labels[next]}`;
              return;
            }
            lastT = e.timeStamp;
            g.classList.add('done');
            if (next > 0) lines.appendChild(svgEl('line', { x1: pts[next - 1][0], y1: pts[next - 1][1], x2: pts[next][0], y2: pts[next][1] }));
            next++;
            if (practice) msg.textContent = 'Practice';
            if (next === pts.length) finish({ timeMs: e.timeStamp - t0, errors });
          };
          const onAbort = () => finish(null);
          svg.addEventListener('pointerdown', onDown);
          signal.addEventListener('abort', onAbort);
          function finish(v) {
            svg.removeEventListener('pointerdown', onDown);
            signal.removeEventListener('abort', onAbort);
            resolve(v);
          }
        });
      }

      async function block(name, labelsFn, cond, rng) {
        const isB = cond === 'B';
        const go = await WW.screens.intro(container, {
          kicker: 'Diagnostics · untrained probe',
          title: `Trails ${name}`,
          body: isB
            ? ['Now alternate numbers and letters in order: 1 → A → 2 → B → 3 → C, and so on.', 'Same rules: as fast as you can, fix mistakes as you go.']
            : ['Tap the circles in order, 1 → 2 → 3 …, as fast as you can.', 'A wrong tap flashes red; just tap the right one. The clock runs until the last circle.'],
          kv: isB ? null : [['Takes', 'about 2 minutes'], ['Input', 'mouse or touch']],
          button: 'Practice',
          signal,
        });
        if (!go) return null;
        const p = await part(layout(rng.fork('practice' + cond), 8, [0, Infinity]), labelsFn(8), cond, true);
        if (!p) return null;
        if (!(await WW.screens.intro(container, { title: 'Ready', body: [`Trails ${name} for real: ${N} circles.`], button: 'Go', signal }))) return null;
        return part(layout(rng.fork('test' + cond)), labelsFn(N), cond, false);
      }

      (async () => {
        const f = await WW.dx.form(ctx, 'dx-trails');
        const a = await block('A', labelsA, 'A', f.rng);
        if (!a) return;
        const b = await block('B', labelsB, 'B', f.rng);
        if (!b) return;
        const summary = {
          form: f.index,
          timeAMs: S.round(a.timeMs),
          timeBMs: S.round(b.timeMs),
          diffMs: S.round(b.timeMs - a.timeMs),
          ratio: S.round(b.timeMs / a.timeMs, 3),
          errorsA: a.errors,
          errorsB: b.errors,
        };
        await WW.dx.finish(
          ctx,
          container,
          signal,
          {
            headline: `${(summary.diffMs / 1000).toFixed(1)} S`,
            kv: [
              ['Part A', `${(a.timeMs / 1000).toFixed(1)} s · ${a.errors} errors`],
              ['Part B', `${(b.timeMs / 1000).toFixed(1)} s · ${b.errors} errors`],
              ['B − A', `${(summary.diffMs / 1000).toFixed(1)} s`],
              ['B / A', summary.ratio],
              ['Form', `#${f.index + 1}`],
            ],
            notes: ['B − A isolates the cost of switching between sequences from plain visual search and motor speed.'],
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
