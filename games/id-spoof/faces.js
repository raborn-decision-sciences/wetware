/* ID Spoof: procedural portrait generator (original, no assets).
 *
 * A face is a plain object of parameters. Identity lives mostly in
 * continuous geometry (face shape, eye spacing, nose, mouth, brows) so a
 * player has to learn the face, not a checklist of accessories. Hair,
 * facial hair and cyberware come from small shared pools, and look-alike
 * lures (variant) keep all of them, changing only the geometry and a
 * little skin tone.
 *
 * WW.faces.generate(rng) -> params
 * WW.faces.variant(rng, params, amount 0-1) -> params (a look-alike)
 * WW.faces.svg(params, { id, size }) -> SVG markup (viewBox 200 x 240)
 */
(function (root) {
  'use strict';
  const WW = (root.WW = root.WW || {});

  // Continuous parameters and their ranges. variant() perturbs these only.
  const RANGES = {
    faceW: [0.8, 1.02],
    faceL: [0.9, 1.1],
    cheek: [0.9, 1.04],
    jaw: [0.66, 0.98],
    chin: [0.18, 0.46],
    eyeT: [0.44, 0.5],
    eyeSep: [0.33, 0.44],
    eyeW: [12.5, 18],
    eyeH: [4.2, 6.8],
    eyeTilt: [-6, 7],
    browGap: [7, 12],
    browArch: [0, 4.5],
    browThick: [1.8, 4.4],
    browTilt: [-3.5, 3.5],
    noseLen: [0.19, 0.27],
    noseW: [6.5, 12],
    mouthT: [0.3, 0.44],
    mouthW: [14, 23],
    lipUp: [1.4, 3.6],
    lipLow: [2.4, 5.2],
    smile: [-1.5, 2],
    earS: [0.85, 1.15],
    hairline: [0.15, 0.25],
    skin: [0, 1],
  };

  const SKIN = ['#3b2219', '#4f2d20', '#6b3e2a', '#8a5638', '#a0663f', '#b97a4f', '#c98e63', '#d9a47c', '#e5b894', '#efcfb0', '#f5dcc5'];
  const HAIR_NATURAL = [
    ['#0f0d0c', 5],
    ['#2a1a12', 5],
    ['#4a2e1c', 4],
    ['#6e4526', 3],
    ['#8f4a22', 1.5],
    ['#b5874e', 1.5],
    ['#d8b56f', 1.2],
    ['#8e8a86', 1],
    ['#d6d3cf', 0.6],
  ];
  const HAIR_DYED = ['#05d9e8', '#ff2a6d', '#9b5de5', '#c6f01e'];
  const EYES = [
    ['#3a2414', 6],
    ['#5a3a1e', 4],
    ['#7a6a3a', 1.5],
    ['#4d6b3a', 1],
    ['#3f6c8f', 1.5],
    ['#7a8a96', 1],
  ];
  const SHAVED = ['buzz', 'undercut', 'mohawk'];
  const STYLES = ['bald', 'buzz', 'crop', 'sidepart', 'undercut', 'mohawk', 'long', 'bob', 'curly', 'bun', 'locs'];
  const FACIAL = [
    ['none', 13],
    ['stubble', 3],
    ['beard', 2],
    ['mustache', 1],
    ['goatee', 1],
  ];
  const EXTRAS = [
    ['none', 10],
    ['eyeImplant', 1.6],
    ['cheekLed', 1.6],
    ['jawPlate', 1.2],
    ['visor', 1],
    ['piercings', 1.6],
    ['glasses', 1.6],
    ['tattoo', 1.4],
  ];

  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const weighted = (rng, items) => {
    const total = items.reduce((a, [, w]) => a + w, 0);
    let r = rng.next() * total;
    for (const [v, w] of items) if ((r -= w) <= 0) return v;
    return items[items.length - 1][0];
  };

  function hex(c) {
    const n = parseInt(c.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const toHex = (rgb) => '#' + rgb.map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, t) => toHex(hex(a).map((v, i) => v + (hex(b)[i] - v) * t));
  const shade = (c, f) => toHex(hex(c).map((v) => v * f));
  function skinColor(s) {
    const x = clamp(s, 0, 1) * (SKIN.length - 1);
    const i = Math.min(SKIN.length - 2, Math.floor(x));
    return mix(SKIN[i], SKIN[i + 1], x - i);
  }

  const lum = (c) => {
    const [r, g, b] = hex(c);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  };

  /** Small deterministic PRNG for render-time texture (svg() takes no rng). */
  function prng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /** Seed from the discrete cues only, so a mark and its look-alikes share hair texture and crest shape. */
  function cueSeed(p) {
    const s = [p.hair, p.hairColor, p.browColor, p.eyeColor, p.facial, p.extra, p.side, p.fringe].join('|');
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }
  /**
   * Stubble texture: a 24-unit tile of scattered dots. The old 6-unit tile
   * repeated often enough to read as knitting; at 24 the eye finds no grid.
   * Dots near an edge are drawn on the opposite edge too so seams don't show.
   */
  function dotTile(pid, color, rnd, n) {
    const S = 24;
    const out = [];
    for (let i = 0; i < n; i++) {
      const x = rnd() * S;
      const y = rnd() * S;
      const r = f1(0.32 + rnd() * 0.22);
      for (const dx of [-S, 0, S])
        for (const dy of [-S, 0, S]) {
          const X = x + dx;
          const Y = y + dy;
          if (X > -0.6 && X < S + 0.6 && Y > -0.6 && Y < S + 0.6) out.push(`<circle cx="${f1(X)}" cy="${f1(Y)}" r="${r}"/>`);
        }
    }
    return `<pattern id="${pid}" width="${S}" height="${S}" patternUnits="userSpaceOnUse"><g fill="${color}">${out.join('')}</g></pattern>`;
  }

  function generate(rng) {
    const p = {};
    for (const [k, [a, b]] of Object.entries(RANGES)) p[k] = rng.float(a, b);
    p.hair = rng.pick(STYLES);
    p.dyed = p.hair !== 'bald' && rng.chance(0.14);
    p.hairColor = p.dyed ? rng.pick(HAIR_DYED) : weighted(rng, HAIR_NATURAL);
    p.browColor = p.dyed ? weighted(rng, HAIR_NATURAL.slice(0, 5)) : p.hairColor;
    p.eyeColor = weighted(rng, EYES);
    p.facial = weighted(rng, FACIAL);
    p.extra = weighted(rng, EXTRAS);
    p.side = rng.chance(0.5) ? 1 : -1; // part / asymmetric extras
    p.fringe = rng.chance(0.5); // bob: straight bangs or swept
    return p;
  }

  /** A look-alike: same hair, facial hair, extras and eye colour; geometry nudged. */
  function variant(rng, p, amount) {
    const q = Object.assign({}, p);
    for (const [k, [a, b]] of Object.entries(RANGES)) {
      const spread = k === 'skin' ? 0.12 : 0.6;
      q[k] = clamp(p[k] + (b - a) * spread * amount * rng.float(-1, 1), a, b);
    }
    return q;
  }

  /**
   * A photo's pose: head roll (deg), turn (-1 left .. 1 right), and expression
   * (smile, brow raise). Not part of identity: the same face can be shown in
   * several poses. strength 0 gives a neutral, front-on pose.
   */
  function pose(rng, strength = 1) {
    const k = clamp(strength, 0, 1);
    if (!k) return { tilt: 0, turn: 0, smile: 0, brow: 0 };
    return { tilt: rng.float(-6, 6) * k, turn: rng.float(-0.7, 0.7) * k, smile: rng.float(-0.8, 2) * k, brow: rng.float(-0.5, 2) * k };
  }

  /** Monotone cubic interpolation (Fritsch-Carlson) through (xs, ys). */
  function monotone(xs, ys) {
    const n = xs.length;
    const d = [];
    const m = [];
    for (let i = 0; i < n - 1; i++) d[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
    m[0] = d[0];
    m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) {
        m[i] = m[i + 1] = 0;
        continue;
      }
      const a = m[i] / d[i];
      const b = m[i + 1] / d[i];
      const s = a * a + b * b;
      if (s > 9) {
        const t = 3 / Math.sqrt(s);
        m[i] = t * a * d[i];
        m[i + 1] = t * b * d[i];
      }
    }
    return (x) => {
      let i = 0;
      while (i < n - 2 && x > xs[i + 1]) i++;
      const h = xs[i + 1] - xs[i];
      const t = (x - xs[i]) / h;
      const t2 = t * t;
      const t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
    };
  }

  const f1 = (x) => Math.round(x * 10) / 10;
  const pt = (x, y) => `${f1(x)} ${f1(y)}`;

  /** Geometry derived from params and pose. */
  function layout(p, ps) {
    const cx = 100;
    const turn = ps.turn;
    const hw = 55 * p.faceW;
    const faceH = 146 * p.faceL;
    const top = 30 + (160 - faceH) * 0.35;
    const chin = top + faceH;
    const cw = hw * p.cheek;
    const jw = hw * p.jaw;
    const chw = hw * p.chin;
    const w = monotone([0, 0.02, 0.06, 0.14, 0.28, 0.42, 0.56, 0.72, 0.84, 0.94, 0.985, 1], [0, 0.34 * hw, 0.6 * hw, 0.84 * hw, 0.98 * hw, hw, cw, (cw + jw) / 2, jw, chw + (jw - chw) * 0.35, chw * 0.7, 0]);
    const wt = (t) => Math.max(0, w(clamp(t, 0, 1)));
    // Turning the head narrows the far side and widens the near side.
    const ws = (s, t) => wt(t) * (1 - s * turn * 0.09);
    const yt = (t) => top + t * faceH;
    const tOf = (y) => (y - top) / faceH;
    const eyeY = yt(p.eyeT);
    const sep = hw * p.eyeSep;
    const noseY = eyeY + p.noseLen * faceH;
    const mouthY = noseY + (chin - noseY) * p.mouthT;
    const fx = cx + turn * 7; // feature centre line
    return { cx, fx, turn, hw, faceH, top, chin, wt, ws, yt, tOf, eyeY, sep, noseY, mouthY, centerY: yt(0.42) };
  }

  /** Sampled outline from t0 to t1 on one side (s = +1 right, -1 left), optionally pushed out radially. */
  function side(L, s, t0, t1, n, push) {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const t = t0 + ((t1 - t0) * (1 - Math.cos(Math.PI * u))) / 2;
      let x = L.cx + s * L.ws(s, t);
      let y = L.yt(t);
      const v = push ? push(t) : 0;
      if (v) {
        const dx = x - L.cx;
        const dy = y - L.centerY;
        const len = Math.hypot(dx, dy) || 1;
        x += (dx / len) * v;
        y += (dy / len) * v;
      }
      out.push([x, y]);
    }
    return out;
  }

  const poly = (pts) => pts.map(([x, y]) => pt(x, y)).join(' L');

  function headPath(L) {
    return 'M' + poly([...side(L, 1, 0, 1, 48), ...side(L, -1, 0, 1, 48).reverse()]) + ' Z';
  }

  /** Hair cap over the skull, from the crown down to sideT at the sides, with a hairline at the forehead. */
  function capPath(L, o) {
    const sideT = o.sideT;
    const push = (t) => o.volTop + (o.volSide - o.volTop) * (t / sideT);
    const r = side(L, 1, 0, sideT, 22, push);
    const l = side(L, -1, 0, sideT, 22, push).reverse();
    const yHL = L.yt(o.hairT);
    const [xr] = r[r.length - 1];
    const [xl, yl] = l[0];
    const mx = L.fx + (o.shift || 0);
    const my = yHL + (o.dip || 0);
    let d = 'M' + poly(r);
    if (o.flat) {
      d += ` L${pt(xr, yHL - 8)} Q${pt(xr, yHL)} ${pt(xr - 9, yHL)} Q${pt(L.fx, yHL + 4)} ${pt(xl + 9, yHL)} Q${pt(xl, yHL)} ${pt(xl, yHL - 8)}`;
    } else {
      d += ` Q${pt(L.cx + L.ws(1, o.hairT) * 0.92, yHL)} ${pt(mx, my)} Q${pt(L.cx - L.ws(-1, o.hairT) * 0.92, yHL)} ${pt(xl, yl)}`;
    }
    return d + ' L' + poly(l) + ' Z';
  }

  function svg(p, opts) {
    const o = Object.assign({ id: 'f' + Math.floor(Math.random() * 1e9).toString(36), size: null, pose: null }, opts || {});
    const ps = Object.assign({ tilt: 0, turn: 0, smile: 0, brow: 0 }, o.pose || {});
    const id = o.id;
    const L = layout(p, ps);
    const { cx, fx, turn, hw, top, chin, eyeY, sep, noseY, mouthY } = L;
    const skin = skinColor(p.skin);
    const skinDark = shade(skin, 0.78);
    const line = shade(skin, 0.5);
    const hairC = p.hairColor;
    const hairDark = shade(hairC, 0.62);
    const lip = shade(mix(skin, '#a04848', 0.32), 0.86);
    const parts = [];
    const add = (s) => parts.push(s);
    const head = headPath(L);
    const hl = p.hairline;
    const rot = `rotate(${f1(ps.tilt)} ${cx} ${f1(chin + 14)})`;
    const seed = cueSeed(p);
    const lines = (ds, w = 1, op = 0.5, c = hairDark) => add(`<path d="${ds.join(' ')}" stroke="${c}" stroke-width="${w}" fill="none" stroke-linecap="round" opacity="${op}"/>`);

    add(`<defs>
<linearGradient id="${id}-sh" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#000" stop-opacity="0.24"/><stop offset="0.55" stop-color="#000" stop-opacity="0"/></linearGradient>
<linearGradient id="${id}-rim" x1="0" x2="1" y1="0" y2="0"><stop offset="0.6" stop-color="#05d9e8" stop-opacity="0"/><stop offset="1" stop-color="#05d9e8" stop-opacity="0.55"/></linearGradient>
<radialGradient id="${id}-bg" cx="0.5" cy="0.38" r="0.7"><stop offset="0" stop-color="#1b1a29"/><stop offset="1" stop-color="#0a0a10"/></radialGradient>
${SHAVED.includes(p.hair) ? dotTile(id + '-hd', hairC, prng(seed), 110) : ''}
${p.facial === 'stubble' || p.facial === 'beard' ? dotTile(id + '-bd', p.browColor, prng(seed ^ 0x5bd1e995), 125) : ''}
<filter id="${id}-sf" x="-0.1" y="-0.1" width="1.2" height="1.2"><feGaussianBlur stdDeviation="2.2"/></filter>
<radialGradient id="${id}-ns"><stop offset="0" stop-color="#000" stop-opacity="0.32"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
<linearGradient id="${id}-smg" gradientUnits="userSpaceOnUse" x1="0" y1="${f1(noseY + 2)}" x2="0" y2="${f1(mouthY + 2)}"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient>
<mask id="${id}-sm"><rect width="200" height="240" fill="url(#${id}-smg)"/></mask>
<clipPath id="${id}-head"><path d="${head}"/></clipPath>
</defs>`);
    add(`<rect width="200" height="240" fill="url(#${id}-bg)"/>`);

    // ---- back hair (rotates with the head)
    add(`<g transform="${rot}">`);
    if (p.hair === 'long') {
      const w0 = hw + 13;
      add(`<path d="M${pt(cx - w0, top + 30)} Q${pt(cx - w0 - 4, chin)} ${pt(cx - w0 + 6, chin + 38)} L${pt(cx + w0 - 6, chin + 38)} Q${pt(cx + w0 + 4, chin)} ${pt(cx + w0, top + 30)} Z" fill="${hairC}"/>`);
      const ds = [];
      for (const s of [-1, 1]) for (let k = 0; k < 3; k++) ds.push(`M${pt(cx + s * (w0 - 3 - k * 4), top + 44 + k * 6)} Q${pt(cx + s * (w0 + 1 - k * 4), chin - 6)} ${pt(cx + s * (w0 - 6 - k * 5), chin + 34)}`);
      lines(ds);
    } else if (p.hair === 'bob') {
      const w0 = hw + 10;
      const yb = L.yt(0.82);
      add(`<path d="M${pt(cx - hw * 0.5, top + 2)} C${pt(cx - w0 - 7, top + 10)} ${pt(cx - w0 - 5, yb - 18)} ${pt(cx - w0 + 2, yb)} Q${pt(cx - hw * 0.85, yb + 7)} ${pt(cx - hw * 0.7, yb)} L${pt(cx + hw * 0.7, yb)} Q${pt(cx + hw * 0.85, yb + 7)} ${pt(cx + w0 - 2, yb)} C${pt(cx + w0 + 5, yb - 18)} ${pt(cx + w0 + 7, top + 10)} ${pt(cx + hw * 0.5, top + 2)} Z" fill="${hairC}"/>`);
      const ds = [];
      for (const s of [-1, 1]) for (let k = 0; k < 2; k++) ds.push(`M${pt(cx + s * (w0 - 2 - k * 5), top + 40)} Q${pt(cx + s * (w0 + 2 - k * 5), yb - 14)} ${pt(cx + s * (w0 - 6 - k * 5), yb + 2)}`);
      lines(ds);
    } else if (p.hair === 'curly') {
      const circles = [];
      const rx = hw + 20;
      const ry = 52;
      const cyc = top + 36;
      for (let i = 0; i < 16; i++) {
        const a = Math.PI + (i / 15) * Math.PI;
        circles.push([cx + Math.cos(a) * rx, cyc + Math.sin(a) * ry, 17]);
      }
      for (const s of [-1, 1]) for (let j = 0; j < 3; j++) circles.push([cx + s * (rx - 2), cyc + 12 + j * 14, 15]);
      add(`<g fill="${hairC}" stroke="${hairDark}" stroke-width="1.2"><ellipse cx="${cx}" cy="${f1(cyc)}" rx="${f1(rx)}" ry="${f1(ry)}" stroke="none"/>${circles.map(([x, y, r]) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${r}"/>`).join('')}</g>`);
      add(`<ellipse cx="${cx}" cy="${f1(cyc)}" rx="${f1(rx - 4)}" ry="${f1(ry - 6)}" fill="${hairC}"/>`);
    } else if (p.hair === 'locs') {
      const strands = [];
      const ticks = [];
      for (let i = 0; i < 10; i++) {
        const x = cx - hw - 8 + (i / 9) * (2 * hw + 16);
        const len = chin + 30 - (Math.abs(i - 4.5) / 4.5) * 10;
        strands.push(`<rect x="${f1(x - 4.5)}" y="${f1(top + 10)}" width="9" height="${f1(len - top - 10)}" rx="4.5"/>`);
        for (let y = top + 40; y < len - 6; y += 8) ticks.push(`M${pt(x - 3, y)} l6 2`);
      }
      add(`<g fill="${hairC}">${strands.join('')}</g>`);
      lines(ticks, 1, 0.45);
    } else if (p.hair === 'bun') {
      add(`<circle cx="${cx}" cy="${f1(top - 8)}" r="15" fill="${hairC}"/>`);
      lines([`M${pt(cx - 9, top - 12)} Q${pt(cx, top - 20)} ${pt(cx + 9, top - 10)}`, `M${pt(cx - 11, top - 4)} Q${pt(cx, top - 14)} ${pt(cx + 11, top - 6)}`, `M${pt(cx - 6, top - 18)} Q${pt(cx + 2, top - 22)} ${pt(cx + 7, top - 17)}`]);
    }
    // neck, with a shadow under the jaw
    const nw = hw * 0.44;
    add(`<path d="M${pt(cx - nw, chin - 34)} L${pt(cx - nw - 2, 222)} L${pt(cx + nw + 2, 222)} L${pt(cx + nw, chin - 34)} Z" fill="${skinDark}"/>`);
    add(`<ellipse cx="${f1(cx - 2)}" cy="${f1(chin + 2)}" rx="${f1(nw * 1.3)}" ry="14" fill="url(#${id}-ns)"/>`);
    add('</g>');

    // ---- shoulders (do not rotate)
    add(`<path d="M0 240 L0 232 Q18 214 ${pt(cx - nw - 18, 214)} Q${pt(cx, 226)} ${pt(cx + nw + 18, 214)} Q182 214 200 232 L200 240 Z" fill="#1d1c27"/>`);
    add(`<path d="M${pt(cx - nw - 18, 214)} L${pt(cx - 6, 240)} M${pt(cx + nw + 18, 214)} L${pt(cx + 6, 240)}" stroke="#34313f" stroke-width="2" fill="none"/>`);

    add(`<g transform="${rot}">`);
    // ---- ears: the far ear shrinks as the head turns
    const earY = eyeY + 6;
    const tEar = L.tOf(earY);
    for (const s of [-1, 1]) {
      const vis = clamp(1 - s * turn * 0.8, 0.25, 1.4);
      const ex = cx + s * (L.ws(s, tEar) - 1);
      add(`<ellipse cx="${f1(ex + s * 3 * vis)}" cy="${f1(earY + 3)}" rx="${f1(6.5 * p.earS * vis)}" ry="${f1(13 * p.earS)}" fill="${skinDark}"/>`);
      if (vis > 0.5) add(`<path d="M${pt(ex + s * 4 * vis, earY - 4)} q${f1(s * 3 * vis)} 6 0 13" stroke="${line}" stroke-width="1.2" fill="none" opacity="0.6"/>`);
    }

    // ---- head, shading, facial hair
    add(`<path d="${head}" fill="${skin}"/>`);
    add(`<g clip-path="url(#${id}-head)">`);
    add(`<rect width="200" height="240" fill="url(#${id}-sh)"/>`);
    const eyeX = (s) => fx + s * sep * (1 - s * turn * 0.1);
    for (const s of [-1, 1]) add(`<ellipse cx="${f1(eyeX(s))}" cy="${f1(eyeY - p.eyeH * 0.7)}" rx="${f1(p.eyeW * 0.68)}" ry="${f1(p.eyeH * 1.5)}" fill="#000" opacity="0.06"/>`);
    add(`<ellipse cx="${f1(fx + sep * 1.15)}" cy="${f1(noseY - 7)}" rx="${f1(hw * 0.2)}" ry="6" fill="#fff" opacity="0.03"/>`);
    add(`<ellipse cx="${f1(fx + hw * 0.18)}" cy="${f1(L.yt(hl + 0.07))}" rx="${f1(hw * 0.34)}" ry="8" fill="#fff" opacity="0.03"/>`);
    add(`<ellipse cx="${cx}" cy="${f1(chin + 4)}" rx="${f1(hw * 0.5)}" ry="10" fill="#000" opacity="0.08"/>`);
    const fh = p.facial;
    if (fh === 'stubble' || fh === 'beard') {
      const t0 = L.tOf(noseY + 2);
      const r = side(L, 1, t0, 1, 16);
      const l = side(L, -1, t0, 1, 16).reverse();
      const d = `M${poly(r)} L${poly(l)} Q${pt(fx - sep * 0.6, mouthY - 8)} ${pt(fx, noseY + 5)} Q${pt(fx + sep * 0.6, mouthY - 8)} ${pt(r[0][0], r[0][1])} Z`;
      if (fh === 'beard') {
        add(`<path d="${d}" fill="${p.browColor}" opacity="0.94"/>`);
        add(`<path d="${d}" fill="url(#${id}-bd)" opacity="0.5"/>`);
      } else {
        add(`<g mask="url(#${id}-sm)"><path d="${d}" fill="${p.browColor}" opacity="0.1"/><path d="${d}" fill="url(#${id}-bd)" opacity="0.6"/></g>`);
      }
    }
    if (fh === 'goatee') add(`<ellipse cx="${f1(fx + turn * 2)}" cy="${f1(mouthY + (chin - mouthY) * 0.55)}" rx="${f1(p.mouthW * 0.45)}" ry="${f1((chin - mouthY) * 0.42)}" fill="${p.browColor}" opacity="0.92"/>`);
    add('</g>');
    add(`<path d="${head}" fill="none" stroke="url(#${id}-rim)" stroke-width="2.5"/>`);

    // ---- nose (shadow on the side away from the light)
    const nwd = p.noseW;
    const nx = fx + turn * 5;
    add(`<path d="M${pt(fx - 2, eyeY + 6)} Q${pt(nx - nwd * 0.5, (eyeY + noseY) / 2)} ${pt(nx - nwd * 0.75, noseY - 3)} L${pt(nx - nwd * 0.2, noseY - 4)} Q${pt(nx - 2, (eyeY + noseY) / 2 + 4)} ${pt(fx + 1, eyeY + 6)} Z" fill="#000" opacity="0.08"/>`);
    add(`<ellipse cx="${f1(nx)}" cy="${f1(noseY - 1)}" rx="${f1(nwd * 0.55)}" ry="4" fill="${skinDark}" opacity="0.55"/>`);
    add(`<ellipse cx="${f1(nx + nwd * 0.15)}" cy="${f1(noseY - 3)}" rx="${f1(nwd * 0.2)}" ry="1.6" fill="#fff" opacity="0.12"/>`);
    add(`<path d="M${pt(nx - nwd, noseY - 3)} Q${pt(nx - nwd - 1.5, noseY + 3)} ${pt(nx - nwd * 0.35, noseY + 2.4)} M${pt(nx + nwd, noseY - 3)} Q${pt(nx + nwd + 1.5, noseY + 3)} ${pt(nx + nwd * 0.35, noseY + 2.4)} M${pt(nx - nwd * 0.4, noseY + 2.6)} Q${pt(nx, noseY + 5)} ${pt(nx + nwd * 0.4, noseY + 2.6)}" stroke="${line}" stroke-width="1.4" fill="none" stroke-linecap="round"/>`);

    // ---- mouth
    const mx = fx + turn * 2.5;
    const mwL = p.mouthW * (1 + turn * 0.1);
    const mwR = p.mouthW * (1 - turn * 0.1);
    const cy = mouthY;
    const sm = p.smile + ps.smile;
    const lc = pt(mx - mwL, cy - sm);
    const rc = pt(mx + mwR, cy - sm);
    add(`<ellipse cx="${f1(mx)}" cy="${f1(cy + p.lipLow * 1.5 + 3)}" rx="${f1(p.mouthW * 0.45)}" ry="2.6" fill="#000" opacity="0.1"/>`);
    add(`<path d="M${lc} C${pt(mx - mwL * 0.5, cy - p.lipUp * 1.5)} ${pt(mx - 3, cy - p.lipUp * 1.5)} ${pt(mx, cy - p.lipUp)} C${pt(mx + 3, cy - p.lipUp * 1.5)} ${pt(mx + mwR * 0.5, cy - p.lipUp * 1.5)} ${rc} Q${pt(mx, cy + 1)} ${lc} Z" fill="${shade(lip, 0.9)}"/>`);
    add(`<path d="M${lc} Q${pt(mx, cy + 1)} ${rc} C${pt(mx + mwR * 0.6, cy + p.lipLow * 1.35)} ${pt(mx - mwL * 0.6, cy + p.lipLow * 1.35)} ${lc} Z" fill="${lip}"/>`);
    add(`<ellipse cx="${f1(mx + 2)}" cy="${f1(cy + p.lipLow * 0.7)}" rx="${f1(p.mouthW * 0.25)}" ry="1.2" fill="#fff" opacity="0.14"/>`);
    add(`<path d="M${lc} Q${pt(mx, cy + 1)} ${rc}" stroke="${shade(lip, 0.55)}" stroke-width="1.2" fill="none" stroke-linecap="round"/>`);
    if (sm > 1.5) for (const s of [-1, 1]) add(`<path d="M${pt(mx + s * (s < 0 ? mwL : mwR) + s * 1, cy - sm - 3)} q${f1(s * 2)} 3 0 6" stroke="${line}" stroke-width="1" fill="none" opacity="0.4"/>`);
    if (fh === 'mustache' || fh === 'goatee') {
      const yTop = cy - p.lipUp - 6;
      const yBot = cy - p.lipUp - 0.8;
      add(`<path d="M${pt(mx - mwL * 0.98, cy - sm - 0.5)} Q${pt(mx - mwL * 0.55, yTop)} ${pt(mx, yTop + 0.5)} Q${pt(mx + mwR * 0.55, yTop)} ${pt(mx + mwR * 0.98, cy - sm - 0.5)} Q${pt(mx + mwR * 0.5, yBot)} ${pt(mx, yBot)} Q${pt(mx - mwL * 0.5, yBot)} ${pt(mx - mwL * 0.98, cy - sm - 0.5)} Z" fill="${p.browColor}"/>`);
    }

    // ---- eyes and brows
    for (const s of [-1, 1]) {
      const ex = eyeX(s);
      const ew = (p.eyeW / 2) * (1 - s * turn * 0.18);
      const eh = p.eyeH;
      const tilt = -s * p.eyeTilt;
      const cid = `${id}-e${s > 0 ? 'r' : 'l'}`;
      const ix = ex + turn * ew * 0.35; // irises follow the turn
      const almond = `M${pt(ex - ew, eyeY)} Q${pt(ex, eyeY - eh * 1.35)} ${pt(ex + ew, eyeY)} Q${pt(ex, eyeY + eh * 0.95)} ${pt(ex - ew, eyeY)} Z`;
      add(`<g transform="rotate(${f1(tilt)} ${f1(ex)} ${f1(eyeY)})">`);
      add(`<clipPath id="${cid}"><path d="${almond}"/></clipPath>`);
      add(`<path d="${almond}" fill="#ece6dc"/>`);
      add(`<g clip-path="url(#${cid})"><circle cx="${f1(ix)}" cy="${f1(eyeY - eh * 0.15)}" r="${f1(eh * 0.95)}" fill="${p.eyeColor}"/><circle cx="${f1(ix)}" cy="${f1(eyeY - eh * 0.15)}" r="${f1(eh * 0.42)}" fill="#0a0a0a"/><circle cx="${f1(ix + eh * 0.3)}" cy="${f1(eyeY - eh * 0.45)}" r="${f1(eh * 0.2)}" fill="#fff" opacity="0.8"/><rect x="${f1(ex - ew)}" y="${f1(eyeY - eh * 1.4)}" width="${f1(ew * 2)}" height="${f1(eh * 0.6)}" fill="#000" opacity="0.12"/></g>`);
      add(`<path d="M${pt(ex - ew - 0.5, eyeY + 0.3)} Q${pt(ex, eyeY - eh * 1.4)} ${pt(ex + ew + 0.5, eyeY + 0.3)}" stroke="${shade(line, 0.7)}" stroke-width="1.7" fill="none" stroke-linecap="round"/>`);
      add(`<path d="M${pt(ex - ew * 0.7, eyeY + eh * 0.62)} Q${pt(ex, eyeY + eh * 1.05)} ${pt(ex + ew * 0.75, eyeY + eh * 0.55)}" stroke="${line}" stroke-width="0.8" fill="none" opacity="0.4"/>`);
      add(`<path d="M${pt(ex - ew * 0.8, eyeY - eh * 1.35 - 1.5)} Q${pt(ex, eyeY - eh * 1.9)} ${pt(ex + ew * 0.85, eyeY - eh * 1.3 - 1.5)}" stroke="${line}" stroke-width="0.9" fill="none" opacity="0.45"/>`);
      add('</g>');
      const by = eyeY - p.browGap - eh * 0.6 - ps.brow;
      const xin = ex - s * ew * 1.05;
      const xout = ex + s * ew * 1.25;
      add(`<path d="M${pt(xin, by + p.browTilt)} Q${pt(ex + s * ew * 0.2, by - p.browArch - 2 - ps.brow * 0.5)} ${pt(xout, by - p.browTilt * 0.4 + 1)}" stroke="${p.browColor}" stroke-width="${f1(p.browThick)}" fill="none" stroke-linecap="round"/>`);
    }

    // ---- front hair
    const cap = (o2, extra) => add(`<path d="${capPath(L, o2)}" fill="${hairC}"${extra || ''}/>`);
    // Shaved scalp: a tint plus scattered dots, thicker at the crown and fading
    // softly at the hairline and temples. Hair lighter than the skin shows as a
    // tint rather than dots, which is how pale stubble actually reads.
    const shaved = (o2, tint) => {
      const d = capPath(L, o2);
      const dotOp = 0.4 * clamp(0.35 + (lum(skin) - lum(hairC)) * 1.6, 0.3, 1);
      add(`<linearGradient id="${id}-sg" gradientUnits="userSpaceOnUse" x1="0" y1="${f1(top - 4)}" x2="0" y2="${f1(L.yt(o2.sideT))}"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#6a6a6a"/></linearGradient>`);
      add(`<mask id="${id}-sk"><path d="${d}" fill="url(#${id}-sg)" filter="url(#${id}-sf)"/></mask>`);
      add(`<g mask="url(#${id}-sk)"><path d="${d}" fill="${hairC}" opacity="${tint}"/><path d="${d}" fill="url(#${id}-hd)" opacity="${f1(dotOp * 100) / 100}"/></g>`);
    };
    const sheen = (lift = 0) => add(`<path d="M${pt(fx - hw * 0.35, top + 8 - lift)} Q${pt(fx + hw * 0.1, top - 4 - lift)} ${pt(fx + hw * 0.55, top + 10 - lift)}" stroke="#fff" stroke-width="4" fill="none" opacity="0.08" stroke-linecap="round"/>`);
    const yHL = L.yt(hl);
    switch (p.hair) {
      case 'buzz': {
        const o2 = { volTop: 1.2, volSide: 0.8, sideT: 0.4, hairT: hl + 0.02 };
        shaved(o2, 0.42);
        break;
      }
      case 'crop':
        cap({ volTop: 8, volSide: 2.5, sideT: 0.42, hairT: hl, dip: 2 });
        lines([-0.5, -0.15, 0.2, 0.5].map((k) => `M${pt(fx + k * hw, top - 2)} q${f1(k * 4)} 8 ${f1(k * 6)} ${f1(yHL - top - 2)}`), 1, 0.35);
        sheen(4);
        break;
      case 'sidepart':
        cap({ volTop: 11, volSide: 3, sideT: 0.42, hairT: hl, shift: p.side * 16, dip: 7 });
        lines([`M${pt(fx + p.side * 12, top - 6)} Q${pt(fx + p.side * 14, top + 10)} ${pt(fx + p.side * 16, yHL + 4)}`], 1.5, 0.8);
        lines([0.3, 0.55, 0.8].map((k) => `M${pt(fx + p.side * 13, top - 4 + k * 4)} Q${pt(fx - p.side * hw * k * 0.6, top - 6 + k * 6)} ${pt(fx - p.side * hw * k, yHL - 2 + k * 8)}`), 1, 0.4);
        sheen(8);
        break;
      case 'undercut': {
        const o2 = { volTop: 1.2, volSide: 0.8, sideT: 0.4, hairT: hl + 0.02 };
        shaved(o2, 0.22);
        add(`<path d="M${pt(fx - hw * 0.82, yHL + 3)} Q${pt(fx - hw * 0.98, top - 2)} ${pt(fx + p.side * 12, top - 12)} Q${pt(fx + hw * 0.98, top - 2)} ${pt(fx + hw * 0.82, yHL + 3)} Q${pt(fx + p.side * 10, yHL - 4)} ${pt(fx - hw * 0.82, yHL + 3)} Z" fill="${hairC}"/>`);
        lines([-0.5, 0, 0.5].map((k) => `M${pt(fx + k * hw * 0.9, yHL)} Q${pt(fx + k * hw * 0.5, top)} ${pt(fx + p.side * 12, top - 10)}`), 1, 0.4);
        break;
      }
      case 'mohawk': {
        const o2 = { volTop: 1, volSide: 0.6, sideT: 0.38, hairT: hl + 0.03 };
        shaved(o2, 0.2);
        // Crest: a band of thin tapered strands in two rows, the crown row
        // behind and taller, the hairline row in front and shorter. Strands
        // sit side by side across the band and fan out slightly, so the top
        // edge is ragged rather than one point. The crown row sits on the
        // skull's centre, not the feature line, so the crest leans when the
        // head turns.
        const rnd = prng(seed ^ 0x2545f491);
        const back = cx - turn * 4;
        const strands = [];
        const rows = [
          { c: back, by: top + 12, lo: 16, hi: 28 },
          { c: (back + fx) / 2, by: (top + 12 + yHL) / 2, lo: 9, hi: 18 },
          { c: fx, by: yHL + 3, lo: 1, hi: 8 },
        ];
        for (const row of rows) {
          for (let j = 0; j < 5; j++) {
            const off = (j - 2) * 4.3;
            const mid = 1 - ((j - 2) * (j - 2)) / 5;
            const bx = row.c + off + (rnd() - 0.5) * 1.5;
            const by = row.by + (rnd() - 0.5) * 3 + Math.abs(off) * 0.25;
            const ty = top - (row.lo + (row.hi - row.lo) * (0.35 * rnd() + 0.65 * mid));
            const tx = bx + off * 0.35 + (rnd() - 0.5) * 4 + p.side * 1.5;
            const w = 3.8 + rnd() * 1.4;
            const k = (by - ty) * 0.5;
            strands.push({ bx, by, tx, ty, d: `M${pt(bx - w, by)} Q${pt(bx - w * 1.1, by - k)} ${pt(tx, ty)} Q${pt(bx + w * 1.1, by - k)} ${pt(bx + w, by)} Q${pt(bx, by + 2.5)} ${pt(bx - w, by)} Z` });
          }
        }
        const all = strands.map((q) => q.d).join(' ');
        add(`<path d="${all}" transform="translate(0 1.5)" fill="#000" stroke="#000" stroke-width="3" opacity="0.22" filter="url(#${id}-sf)"/>`);
        add(`<clipPath id="${id}-mc"><path d="${all}"/></clipPath>`);
        add(`<linearGradient id="${id}-ms" gradientUnits="userSpaceOnUse" x1="${f1(fx - 14)}" x2="${f1(fx + 14)}" y1="0" y2="0"><stop offset="0" stop-color="#000" stop-opacity="0.38"/><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity="0.07"/></linearGradient>`);
        for (const q of strands) {
          add(`<path d="${q.d}" fill="${hairC}" stroke="${hairDark}" stroke-width="0.8" stroke-opacity="0.45"/>`);
          lines([`M${pt(q.bx, q.by - 1)} Q${pt(q.bx + (q.tx - q.bx) * 0.3, (q.by + q.ty) / 2)} ${pt(q.bx + (q.tx - q.bx) * 0.75, q.ty + (q.by - q.ty) * 0.25)}`], 0.8, 0.4);
        }
        const ridge = [12, 7, 2].map((i) => strands[i]).map((q) => pt(q.bx + 3, q.by - (q.by - q.ty) * 0.55)).join(' L');
        add(`<g clip-path="url(#${id}-mc)"><rect width="200" height="240" fill="url(#${id}-ms)"/><path d="M${ridge}" stroke="#fff" stroke-width="2.5" fill="none" opacity="0.1" stroke-linecap="round" stroke-linejoin="round"/></g>`);
        break;
      }
      case 'long':
        cap({ volTop: 9, volSide: 6, sideT: 0.5, hairT: hl, dip: 3 });
        lines([`M${pt(fx, top - 8)} L${pt(fx, yHL + 2)}`], 1.5, 0.7);
        lines([-1, 1].flatMap((s) => [0.4, 0.75].map((k) => `M${pt(fx + s * 3, top - 4)} Q${pt(fx + s * hw * k, top - 2)} ${pt(cx + s * (hw * 0.9 + k * 4), L.yt(0.5))}`)), 1, 0.4);
        sheen(6);
        break;
      case 'bob':
        if (p.fringe) {
          cap({ volTop: 9, volSide: 6, sideT: 0.5, hairT: Math.min(p.eyeT - 0.12, hl + 0.1), flat: true });
          const yf = L.yt(Math.min(p.eyeT - 0.12, hl + 0.1));
          lines([-0.6, -0.3, 0, 0.3, 0.6].map((k) => `M${pt(fx + k * hw, yf - 14)} l${f1(k * 2)} 12`), 1, 0.35);
        } else {
          cap({ volTop: 9, volSide: 6, sideT: 0.5, hairT: hl, shift: -p.side * hw * 0.5, dip: 12 });
          lines([0.2, 0.5, 0.8].map((k) => `M${pt(fx + p.side * 10, top - 4)} Q${pt(fx - p.side * hw * k * 0.5, top + 4)} ${pt(fx - p.side * hw * (0.4 + k * 0.4), yHL + 6 + k * 6)}`), 1, 0.4);
        }
        sheen(6);
        break;
      case 'curly':
        cap({ volTop: 14, volSide: 6, sideT: 0.42, hairT: hl, dip: -2 });
        break;
      case 'bun':
        cap({ volTop: 4, volSide: 2, sideT: 0.4, hairT: hl, dip: 3 });
        lines([-0.75, -0.4, 0, 0.4, 0.75].map((k) => `M${pt(fx + k * hw, yHL + 2 - Math.abs(k) * 2)} Q${pt(fx + k * hw * 0.9, top + 8)} ${pt(cx + k * 6, top - 1)}`), 1, 0.45);
        add(`<rect x="${f1(cx - 8)}" y="${f1(top - 2)}" width="16" height="4" rx="2" fill="${hairDark}"/>`);
        sheen(2);
        break;
      case 'locs':
        cap({ volTop: 7, volSide: 4, sideT: 0.44, hairT: hl, dip: 2 });
        lines([-0.6, -0.2, 0.2, 0.6].map((k) => `M${pt(fx + k * hw, top - 4)} L${pt(fx + k * hw * 1.1, yHL)}`), 1.2, 0.4);
        break;
      default:
        add(`<ellipse cx="${f1(fx + hw * 0.3)}" cy="${f1(top + 16)}" rx="${f1(hw * 0.35)}" ry="8" fill="#fff" opacity="0.08"/>`);
    }

    // ---- cyberware and accessories
    const s = p.side;
    const ex = eyeX(s);
    switch (p.extra) {
      case 'eyeImplant':
        add(`<circle cx="${f1(ex)}" cy="${f1(eyeY)}" r="${f1(p.eyeW * 0.78)}" fill="none" stroke="#05d9e8" stroke-width="1.6" opacity="0.85"/><circle cx="${f1(ex + turn * p.eyeW * 0.17)}" cy="${f1(eyeY - p.eyeH * 0.15)}" r="${f1(p.eyeH * 0.42)}" fill="#05d9e8"/><path d="M${pt(ex + s * p.eyeW * 0.78, eyeY)} l${f1(s * 9)} 0 l${f1(s * 3)} 5" stroke="#05d9e8" stroke-width="1.2" fill="none" opacity="0.8"/>`);
        break;
      case 'cheekLed': {
        const y0 = noseY - 6;
        const x0 = fx + s * (sep + 4);
        add(`<g stroke="#ff2a6d" stroke-width="1.8" stroke-linecap="round" opacity="0.9">${[0, 1, 2].map((i) => `<path d="M${pt(x0, y0 + i * 5)} l${f1(s * 10)} 0"/>`).join('')}</g>`);
        break;
      }
      case 'jawPlate': {
        const r = side(L, s, L.tOf(mouthY - 6), 0.9, 10);
        add(`<path d="M${poly(r)}" stroke="#a9b3bf" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.9"/><path d="M${poly(r.map(([x, y]) => [x - s * 0.5, y]))}" stroke="#e6edf3" stroke-width="1" fill="none" opacity="0.6"/>`);
        break;
      }
      case 'visor': {
        const y = yHL - 2;
        const x0 = cx - L.ws(-1, hl) - 4;
        const x1 = cx + L.ws(1, hl) + 4;
        add(`<rect x="${f1(x0)}" y="${f1(y - 5)}" width="${f1(x1 - x0)}" height="9" rx="4.5" fill="#05d9e8" opacity="0.55"/><rect x="${f1(x0)}" y="${f1(y - 5)}" width="${f1(x1 - x0)}" height="2" rx="1" fill="#fff" opacity="0.4"/>`);
        break;
      }
      case 'piercings':
        add(`<circle cx="${f1(nx + s * p.noseW * 0.75)}" cy="${f1(noseY + 1)}" r="2.2" fill="none" stroke="#d7dbe0" stroke-width="1.2"/><path d="M${pt(ex + s * p.eyeW * 0.45, eyeY - p.browGap - p.eyeH - 3 - ps.brow)} l${f1(s * 2)} 6" stroke="#d7dbe0" stroke-width="1.6" stroke-linecap="round"/>`);
        break;
      case 'glasses': {
        const r = p.eyeW * 0.85;
        for (const k of [-1, 1]) add(`<ellipse cx="${f1(eyeX(k))}" cy="${f1(eyeY)}" rx="${f1(r * (1 - k * turn * 0.18))}" ry="${f1(r)}" fill="#05d9e8" fill-opacity="0.06" stroke="#c9c6be" stroke-width="1.6"/>`);
        add(`<path d="M${pt(eyeX(-1) + r * (1 + turn * 0.18), eyeY - 1)} Q${pt(fx, eyeY - 5)} ${pt(eyeX(1) - r * (1 - turn * 0.18), eyeY - 1)}" stroke="#c9c6be" stroke-width="1.5" fill="none"/>`);
        break;
      }
      case 'tattoo': {
        const tx = cx + s * (L.ws(s, p.eyeT - 0.08) - 9);
        const ty = eyeY - 10;
        add(`<path d="M${pt(tx, ty)} l${f1(-s * 6)} 6 l0 8 M${pt(tx - s * 3, ty + 2)} l${f1(-s * 5)} 5" stroke="#9b5de5" stroke-width="1.4" fill="none" opacity="0.85"/>`);
        break;
      }
      default:
        break;
    }
    add('</g>');

    const sizeAttr = o.size ? ` width="${o.size}" height="${Math.round((o.size * 240) / 200)}"` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240"${sizeAttr} role="img" aria-label="portrait">${parts.join('')}</svg>`;
  }

  WW.faces = { generate, variant, pose, svg, RANGES, STYLES, skinColor };
})(globalThis);
