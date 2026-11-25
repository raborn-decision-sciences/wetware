/* Wetware core: rain (Street Glass's rain mod and Vex's "Rain for any skin").
 *
 *   WW.rain.mount(decorEl, style) -> { stop() }      style: 'depth' | 'awning'
 *
 * Mounted by core/skins.js into .ww-decor, so it sits behind the hub and is removed
 * while a game runs. It is a simulation, not a looping animation: drops are born above
 * the window and die below it, so there is no loop point to jump at.
 *  - depth:  fine streaks in three parallax layers, gusts, splashes and ripples on the street.
 *  - awning: never falls over a panel. It splashes on panel tops and drips off their
 *            bottom edges. A fainter half-density depth layer behind keeps the rain
 *            going down the gaps to the bottom of the window.
 * Idles while html.ww-running is set; draws one still frame under reduced motion.
 * Spire stays dry (core/skins.js doesn't mount it there).
 */
(function (root) {
  'use strict';
  const WW = (root.WW = root.WW || {});

  const RAIN = '205,228,255';
  const rand = (a, b) => a + (b - a) * Math.random();
  const STYLES = [
    ['depth', 'Depth'],
    ['awning', 'Awning'],
  ];

  function still(doc) {
    return doc.documentElement.classList.contains('reduce-motion') || doc.defaultView.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function mount(el, style) {
    const fx = FX[style] || FX.depth;
    const doc = el.ownerDocument;
    const win = doc.defaultView;
    const cv = doc.createElement('canvas');
    cv.className = 'ww-rain';
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
    el.appendChild(cv);
    const st = { cv, ctx: cv.getContext('2d'), doc, win, w: 0, h: 0, dpr: 1, t: 0 };
    st.resize = () => {
      const dpr = Math.min(2, win.devicePixelRatio || 1);
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w === st.w && h === st.h && dpr === st.dpr) return false;
      Object.assign(st, { w, h, dpr });
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      st.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return true;
    };
    st.resize();
    const s = fx.init(st);

    let raf = 0;
    let timer = 0;
    let last = 0;
    let stopped = false;
    const draw = () => {
      st.ctx.clearRect(0, 0, st.w, st.h);
      fx.draw(st, s);
    };
    const settle = () => {
      for (let i = 0; i < 90; i++) {
        st.t += 1 / 60;
        fx.step(st, s, 1 / 60);
      }
      draw();
    };
    const onResize = () => {
      if (st.resize()) {
        fx.resize(st, s);
        settle();
      }
    };
    const stop = () => {
      stopped = true;
      win.cancelAnimationFrame(raf);
      win.clearTimeout(timer);
      win.removeEventListener('resize', onResize);
      cv.remove();
    };
    const frame = (t) => {
      if (stopped) return;
      if (!cv.isConnected) return stop();
      // A game is running (the decor is hidden) or the tab is hidden: idle cheaply.
      if (doc.documentElement.classList.contains('ww-running') || doc.hidden) {
        last = 0;
        timer = win.setTimeout(() => (raf = win.requestAnimationFrame(frame)), 400);
        return;
      }
      raf = win.requestAnimationFrame(frame);
      if (st.resize()) fx.resize(st, s);
      const dt = last ? Math.min(0.05, (t - last) / 1000) : 1 / 60;
      last = t;
      st.t += dt;
      fx.step(st, s, dt);
      draw();
    };
    if (still(doc)) {
      settle();
      win.addEventListener('resize', onResize);
    } else raf = win.requestAnimationFrame(frame);
    return { stop, state: s };
  }

  /* ---- falling streaks ---- */

  // Wind as the horizontal slope of a falling drop (dx per dy), with slow gusts.
  const slopeAt = (t) => 0.13 + 0.05 * Math.sin(t * 0.31) + 0.03 * Math.sin(t * 1.17 + 1);

  // Density is per pixel of area, so any window size looks alike.
  function makeLayers(st, specs) {
    return specs.map((L) => {
      const drops = [];
      for (let i = 0, n = Math.round(st.w * st.h * L.dens); i < n; i++) drops.push(newDrop(st, L, rand(-0.1, 1) * st.h));
      return { L, drops };
    });
  }
  function newDrop(st, L, y) {
    const sl = slopeAt(st.t);
    return { x: rand(-st.h * sl, st.w), y: y == null ? rand(-160, -10) : y, len: rand(L.len[0], L.len[1]), v: rand(L.v[0], L.v[1]), a: L.a * rand(0.6, 1.15), ground: st.h * rand(0.86, 1.0) };
  }
  // On resize keep every drop already falling; only top up or trim to the new density.
  function refit(st, layers) {
    for (const Lr of layers) {
      const n = Math.round(st.w * st.h * Lr.L.dens);
      while (Lr.drops.length < n) Lr.drops.push(newDrop(st, Lr.L));
      Lr.drops.length = Math.min(Lr.drops.length, n);
    }
  }
  // A sheet of heavier rain swinging back and forth across the window (continuous: never wraps).
  function gust(st, x) {
    const front = st.w * (0.5 + 0.8 * Math.sin(st.t * 0.21));
    const d = (x - front) / 260;
    return 0.75 + 0.55 * Math.exp(-d * d);
  }
  // hit(drop, previousY, layer) -> true when the drop landed somewhere (it is then replaced).
  function stepLayers(st, layers, dt, hit) {
    const sl = slopeAt(st.t);
    for (const { L, drops } of layers) {
      for (let i = 0; i < drops.length; i++) {
        const d = drops[i];
        const py = d.y;
        d.y += d.v * dt;
        d.x += d.v * dt * sl;
        if ((hit && hit(d, py, L)) || d.y - d.len > st.h) drops[i] = newDrop(st, L);
      }
    }
  }
  function drawStreaks(st, layers) {
    const c = st.ctx;
    const sl = slopeAt(st.t);
    c.lineCap = 'round';
    for (const { L, drops } of layers) {
      c.lineWidth = L.w;
      for (const d of drops) {
        if (d.y < 0) continue;
        const tx = d.x - sl * d.len;
        const ty = d.y - d.len;
        const grad = c.createLinearGradient(tx, ty, d.x, d.y);
        grad.addColorStop(0, `rgba(${RAIN},0)`);
        grad.addColorStop(1, `rgba(${RAIN},${(d.a * gust(st, d.x)).toFixed(3)})`);
        c.strokeStyle = grad;
        c.beginPath();
        c.moveTo(tx, ty);
        c.lineTo(d.x, d.y);
        c.stroke();
      }
    }
  }

  /* ---- splashes and ripples ---- */

  function splash(s, x, y, n, power) {
    for (let i = 0; i < n; i++) s.parts.push({ x, y, vx: rand(-1, 1) * 95 * power, vy: -rand(70, 170) * power, life: rand(0.18, 0.34), age: 0 });
  }
  function ripple(s, x, y) {
    s.ripples.push({ x, y, size: rand(6, 12), life: 0.5, age: 0 });
  }
  function stepParts(s, dt) {
    for (const p of s.parts) {
      p.age += dt;
      p.vy += 1100 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    s.parts = s.parts.filter((p) => p.age < p.life);
    for (const r of s.ripples) r.age += dt;
    s.ripples = s.ripples.filter((r) => r.age < r.life);
  }
  function drawParts(st, s) {
    const c = st.ctx;
    for (const p of s.parts) {
      c.fillStyle = `rgba(${RAIN},${(0.45 * (1 - p.age / p.life)).toFixed(3)})`;
      c.fillRect(p.x - 0.6, p.y - 0.6, 1.3, 1.3);
    }
    c.lineWidth = 1;
    for (const r of s.ripples) {
      const k = r.age / r.life;
      c.strokeStyle = `rgba(${RAIN},${(0.22 * (1 - k)).toFixed(3)})`;
      c.beginPath();
      c.ellipse(r.x, r.y, 1 + r.size * k, (1 + r.size * k) * 0.28, 0, 0, Math.PI * 2);
      c.stroke();
    }
  }
  // Street-level landing for layers that splash: a few droplets and a ripple.
  const onGround = (s) => (d, py, L) => {
    if (!L.splash || py >= d.ground || d.y < d.ground) return false;
    splash(s, d.x, d.ground, 2 + ((Math.random() * 2) | 0), 0.8);
    ripple(s, d.x, d.ground);
    return true;
  };

  /* ---- depth ---- */

  const DEPTH = [
    { dens: 0.00021, len: [6, 12], w: 0.7, a: 0.1, v: [620, 780] },
    { dens: 0.00007, len: [14, 26], w: 1, a: 0.15, v: [980, 1220] },
    { dens: 0.000018, len: [32, 60], w: 1.5, a: 0.24, v: [1450, 1850], splash: true },
  ];
  const depth = {
    init: (st) => ({ layers: makeLayers(st, DEPTH), parts: [], ripples: [] }),
    resize: (st, s) => refit(st, s.layers),
    step(st, s, dt) {
      stepLayers(st, s.layers, dt, onGround(s));
      stepParts(s, dt);
    },
    draw(st, s) {
      drawStreaks(st, s.layers);
      drawParts(st, s);
    },
  };

  /* ---- awning ---- */

  const SURF = '.wrap .panel, .wrap .tabs';
  const AWN = [
    { dens: 0.00012, len: [10, 20], w: 0.9, a: 0.13, v: [900, 1100] },
    { dens: 0.000028, len: [26, 50], w: 1.4, a: 0.22, v: [1350, 1700], splash: true },
  ];
  // Behind the awning rain: depth at half density that never lands on a panel. It falls on
  // behind them and shows again in every gap below, all the way to the street.
  const BACK = DEPTH.map((L) => Object.assign({}, L, { dens: L.dens / 2 }));

  function surfaces(st) {
    const out = [];
    for (const e of st.doc.querySelectorAll(SURF)) {
      // Only the outermost surface, so nested panels don't punch holes in the clip.
      if (e.parentElement && e.parentElement.closest(SURF)) continue;
      const r = e.getBoundingClientRect();
      if (r.width < 40 || r.bottom < 0 || r.top > st.h) continue;
      out.push({ l: r.left, t: r.top, r: r.right, b: r.bottom });
    }
    return out;
  }
  const inside = (surf, x, y) => surf.some((q) => x >= q.l && x <= q.r && y >= q.t && y <= q.b);

  const awning = {
    init: (st) => ({ back: makeLayers(st, BACK), layers: makeLayers(st, AWN), parts: [], ripples: [], drips: [], surf: surfaces(st) }),
    resize(st, s) {
      refit(st, s.back);
      refit(st, s.layers);
    },
    step(st, s, dt) {
      s.surf = surfaces(st);
      const ground = onGround(s);
      // The back layer never touches the panels; it splashes only on open street.
      stepLayers(st, s.back, dt, (d, py, L) => !inside(s.surf, d.x, d.ground) && ground(d, py, L));
      stepLayers(st, s.layers, dt, (d, py, L) => {
        for (const q of s.surf) {
          if (py < q.t && d.y >= q.t && d.x >= q.l && d.x <= q.r) {
            if (L.splash || Math.random() < 0.3) splash(s, d.x, q.t - 1, L.splash ? 3 : 1, L.splash ? 0.9 : 0.5);
            return true;
          }
        }
        // Drops born in a panel's shadow fall through unseen.
        return !inside(s.surf, d.x, d.y) && ground(d, py, L);
      });
      // Water gathers along panel bottoms and lets go.
      for (const q of s.surf) {
        if (q.b >= st.h - 4) continue;
        if (Math.random() < (q.r - q.l) * 0.000055 * dt * 60) s.drips.push({ x: rand(q.l + 6, q.r - 6), y: q.b + 1, top: q.b + 1, hang: rand(0.5, 1.6), age: 0, vy: 0 });
      }
      for (const D of s.drips) {
        D.age += dt;
        if (D.age < D.hang) continue;
        const py = D.y;
        D.vy += 1400 * dt;
        D.y += D.vy * dt;
        const q = s.surf.find((q) => py < q.t && D.y >= q.t && D.x >= q.l && D.x <= q.r);
        if (q || D.y >= st.h - 2) {
          splash(s, D.x, q ? q.t - 1 : st.h - 2, 2, 0.55);
          D.done = true;
        }
      }
      s.drips = s.drips.filter((D) => !D.done && D.age < 6);
      stepParts(s, dt);
    },
    draw(st, s) {
      const c = st.ctx;
      c.save();
      c.beginPath();
      c.rect(0, 0, st.w, st.h);
      for (const q of s.surf) c.rect(q.l, q.t, q.r - q.l, q.b - q.t);
      c.clip('evenodd');
      drawStreaks(st, s.back);
      drawStreaks(st, s.layers);
      for (const D of s.drips) {
        if (D.age < D.hang) {
          // A bead swelling under the edge.
          const k = D.age / D.hang;
          c.fillStyle = `rgba(${RAIN},${(0.2 + 0.3 * k).toFixed(3)})`;
          c.beginPath();
          c.ellipse(D.x, D.top + 1 + k * 1.5, 1 + k * 1.2, 1 + k * 2, 0, 0, Math.PI * 2);
          c.fill();
        } else {
          c.strokeStyle = `rgba(${RAIN},0.4)`;
          c.lineWidth = 1.6;
          c.beginPath();
          c.moveTo(D.x, D.y - Math.min(18, D.vy * 0.02));
          c.lineTo(D.x, D.y);
          c.stroke();
        }
      }
      drawParts(st, s);
      c.restore();
    },
  };

  const FX = { depth, awning };
  WW.rain = { mount, STYLES, has: (id) => Object.prototype.hasOwnProperty.call(FX, id) };
})(globalThis);
