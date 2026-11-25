/* Wetware skins: the five rig skins and their decor (PLAN §6.1).
 * Styles live in core/skins/<id>.css; this file registers each skin and
 * builds the generated backgrounds (Street Glass's city, Neural Lace's
 * neuron field). Decor sits in .ww-decor and is removed while a game runs.
 */
(function (root) {
  'use strict';
  const WW = root.WW;
  if (!WW || !WW.skins) return;

  function prng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const NS = 'http://www.w3.org/2000/svg';

  /* ---- Street Glass: the city ---- */
  function buildCity(doc) {
    const svg = doc.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'city');
    svg.setAttribute('preserveAspectRatio', 'xMidYMax slice');
    svg.setAttribute('viewBox', '0 0 1100 900');
    const r = prng(7);
    const rr = (a, b) => a + (b - a) * r();
    // Flicker timing has its own generator, so the skyline itself stays the same.
    // Each light gets its own phase and period: nothing blinks in unison, so there is no beat.
    const rt = prng(99);
    const tm = (a, b) => `animation-delay:${(-rt() * b).toFixed(2)}s;animation-duration:${(a + rt() * (b - a)).toFixed(2)}s`;
    let s = `<defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#03050d"/><stop offset=".45" stop-color="#0a1230"/>
        <stop offset=".72" stop-color="#26113f"/><stop offset=".9" stop-color="#4b1949"/><stop offset="1" stop-color="#2a0f2e"/>
      </linearGradient>
      <linearGradient id="beam" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stop-color="#bfe9ff" stop-opacity=".22"/><stop offset="1" stop-color="#bfe9ff" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="haze" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ff5ac8" stop-opacity="0"/><stop offset="1" stop-color="#ff5ac8" stop-opacity=".22"/>
      </linearGradient>
      <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <filter id="far"><feGaussianBlur stdDeviation="1.2"/></filter>
      <filter id="bokeh"><feGaussianBlur stdDeviation="7"/></filter>
    </defs>
    <rect width="1100" height="900" fill="url(#sky)"/>
    <polygon points="540,150 300,-40 360,-40" fill="url(#beam)"/>
    <polygon points="560,150 820,-40 880,-40" fill="url(#beam)"/>`;
    const winColors = ['#7fe7ff', '#ffd27f', '#ffd27f', '#ff9ae3', '#eaf6ff'];
    function layer(base, minH, maxH, minW, maxW, fill, winP, winSize, extra) {
      let out = '';
      let x = -20;
      while (x < 1120) {
        const w = rr(minW, maxW);
        const h = rr(minH, maxH);
        const top = base - h;
        out += `<rect x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${w.toFixed(1)}" height="${(900 - top).toFixed(1)}" fill="${fill}"/>`;
        if (r() < 0.25) out += `<rect x="${(x + w / 2 - 1).toFixed(1)}" y="${(top - 18).toFixed(1)}" width="2" height="18" fill="${fill}"/><circle cx="${(x + w / 2).toFixed(1)}" cy="${(top - 19).toFixed(1)}" r="1.8" fill="#ff3b5c"/>`;
        for (let wy = top + 8; wy < base + 60; wy += winSize * 3) {
          for (let wx = x + 5; wx < x + w - 5; wx += winSize * 2.4) {
            if (r() < winP) {
              const flick = r() < 0.06;
              const fill = winColors[(r() * winColors.length) | 0];
              const o = rr(0.35, 0.9).toFixed(2);
              out += `<rect${flick ? ` class="win" style="--o:${o};${tm(7, 16)}"` : ''} x="${wx.toFixed(1)}" y="${wy.toFixed(1)}" width="${winSize}" height="${(winSize * 1.3).toFixed(1)}" fill="${fill}" opacity="${o}"/>`;
            }
          }
        }
        if (extra) out += extra(x, w, top);
        x += w + rr(2, 10);
      }
      return out;
    }
    s += `<g filter="url(#far)" opacity=".75">${layer(560, 60, 230, 22, 55, '#141b3d', 0.16, 2, null)}</g>`;
    // the Spire
    s += `<path d="M515 560 L522 175 L536 120 L550 175 L557 560 Z" fill="#0f1533"/><rect x="535" y="88" width="2" height="34" fill="#0f1533"/><circle cx="536" cy="88" r="2.6" fill="#ff3b5c" filter="url(#glow)"/>`;
    for (let y = 190; y < 560; y += 9) if (r() < 0.55) s += `<rect x="${(526 + r() * 18).toFixed(1)}" y="${y}" width="3" height="3" fill="#7fe7ff" opacity=".55"/>`;
    s += `<rect x="0" y="560" width="1100" height="340" fill="url(#haze)"/>`;
    const signs = ['#ff3fb4', '#2ef0ff', '#ffb000', '#9b5cff'];
    s += layer(700, 90, 280, 45, 95, '#090d20', 0.2, 3, (x, w, top) =>
      r() < 0.32 ? `<rect class="sign" style="${tm(5, 12)}" x="${(x + w - 12).toFixed(1)}" y="${(top + 30).toFixed(1)}" width="9" height="${rr(50, 110).toFixed(0)}" rx="2" fill="${signs[(r() * 4) | 0]}" filter="url(#glow)" opacity=".9"/>` : ''
    );
    // near buildings, both edges
    s += `<path d="M0 900 V170 H95 V230 H140 V900 Z" fill="#03050b"/><path d="M1100 900 V120 H1010 V200 H960 V900 Z" fill="#03050b"/>`;
    s += `<rect class="sign" style="${tm(5, 12)}" x="104" y="300" width="22" height="170" rx="3" fill="#ff3fb4" filter="url(#glow)"/><rect x="108" y="312" width="14" height="146" rx="2" fill="#ffd0ef" opacity=".55"/>`;
    s += `<rect class="sign" style="${tm(5, 12)}" x="975" y="260" width="110" height="26" rx="3" fill="#2ef0ff" filter="url(#glow)"/><rect x="981" y="266" width="98" height="14" rx="2" fill="#d8fbff" opacity=".5"/>`;
    s += `<rect class="sign" style="${tm(5, 12)}" x="978" y="560" width="18" height="120" rx="3" fill="#ffb000" filter="url(#glow)"/>`;
    // Vex's neon callsign, hung on the near-right building
    const look = WW.skins.look();
    if ((look.active || []).includes('neon') && look.callsign) {
      const name = String(look.callsign).replace(/[<>&"']/g, '').slice(0, 16);
      // Centre-right, low enough to sit among the mid-layer signs and stay in frame on narrow screens.
      const w = name.length * 17 + 24;
      s += `<g class="sign" style="${tm(5, 12)}" filter="url(#glow)"><rect x="${(760 - w / 2).toFixed(0)}" y="590" width="${w.toFixed(0)}" height="44" rx="4" fill="#12051a" stroke="#ff3fb4" stroke-width="2"/><text x="760" y="622" text-anchor="middle" font-family="VT323, monospace" font-size="30" letter-spacing="2" fill="#ffd0ef" stroke="#ff3fb4" stroke-width=".6">${name}</text></g>`;
    }
    // street glow and traffic bokeh
    s += `<rect x="0" y="800" width="1100" height="100" fill="#ff5ac8" opacity=".08"/>`;
    const bok = ['#ff3b5c', '#ffd27f', '#ffffff', '#7fe7ff', '#ff3fb4'];
    let bg = '';
    for (let i = 0; i < 46; i++) bg += `<circle cx="${rr(0, 1100).toFixed(0)}" cy="${rr(770, 890).toFixed(0)}" r="${rr(5, 16).toFixed(1)}" fill="${bok[(r() * bok.length) | 0]}" opacity="${rr(0.25, 0.6).toFixed(2)}"/>`;
    s += `<g filter="url(#bokeh)">${bg}</g>`;
    svg.innerHTML = s;
    return svg;
  }

  /* ---- Neural Lace: a grown field of neurons ---- */
  function buildLace(doc) {
    const svg = doc.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'lace');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    svg.setAttribute('viewBox', '0 0 1100 900');
    const r = prng(31);
    const rr = (a, b) => a + (b - a) * r();
    let s = `<defs>
      <radialGradient id="somaT"><stop offset="0" stop-color="#ffffff"/><stop offset=".25" stop-color="#62f5d2"/><stop offset="1" stop-color="#62f5d2" stop-opacity="0"/></radialGradient>
      <radialGradient id="somaP"><stop offset="0" stop-color="#ffffff"/><stop offset=".25" stop-color="#ff6fb5"/><stop offset="1" stop-color="#ff6fb5" stop-opacity="0"/></radialGradient>
      <linearGradient id="ax" x1="0" x2="1"><stop offset="0" stop-color="#62f5d2"/><stop offset="1" stop-color="#ff6fb5"/></linearGradient>
      <filter id="lblur"><feGaussianBlur stdDeviation="3.5"/></filter>
      <filter id="lglow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>`;
    function branch(x, y, ang, len, depth, w, col) {
      const ex = x + Math.cos(ang) * len;
      const ey = y + Math.sin(ang) * len;
      const bend = rr(-0.5, 0.5);
      const cx = (x + ex) / 2 + Math.cos(ang + Math.PI / 2) * len * bend * 0.4;
      const cy = (y + ey) / 2 + Math.sin(ang + Math.PI / 2) * len * bend * 0.4;
      let o = `<path d="M${x.toFixed(1)} ${y.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}" stroke="${col}" stroke-width="${w.toFixed(2)}" fill="none" stroke-linecap="round"/>`;
      if (depth > 0) {
        const k = r() < 0.7 ? 2 : 3;
        for (let i = 0; i < k; i++) o += branch(ex, ey, ang + rr(-0.7, 0.7), len * rr(0.5, 0.75), depth - 1, w * 0.62, col);
      }
      return o;
    }
    function neuron(x, y, size, pink) {
      const col = pink ? '#ff6fb5' : '#62f5d2';
      let o = '';
      const n = 5 + ((r() * 3) | 0);
      for (let i = 0; i < n; i++) o += branch(x, y, (i / n) * Math.PI * 2 + rr(-0.3, 0.3), size * rr(4, 7), 3, size * 0.32, col);
      o += `<circle class="soma" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(size * 2.6).toFixed(1)}" fill="url(#${pink ? 'somaP' : 'somaT'})" style="animation-delay:${(-r() * 6).toFixed(2)}s"/>`;
      o += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(size * 0.75).toFixed(1)}" fill="#fff" opacity=".85"/>`;
      return o;
    }
    let far = '';
    for (let i = 0; i < 16; i++) far += neuron(rr(0, 1100), rr(0, 900), rr(4, 7), r() < 0.4);
    s += `<g filter="url(#lblur)" opacity=".4">${far}</g>`;
    const somas = [
      [90, 140], [330, 70], [610, 210], [930, 110], [180, 520], [470, 600], [800, 470], [1030, 640], [300, 840], [700, 820],
    ];
    let axons = '';
    let sparks = '';
    const links = [[0, 1], [1, 2], [2, 3], [0, 4], [4, 5], [5, 2], [5, 6], [6, 3], [6, 7], [4, 8], [8, 9], [9, 6], [9, 7]];
    for (const [a, b] of links) {
      const [x1, y1] = somas[a];
      const [x2, y2] = somas[b];
      const d = `M${x1} ${y1} C${(x1 + rr(-160, 160)).toFixed(0)} ${(y1 + rr(-160, 160)).toFixed(0)} ${(x2 + rr(-160, 160)).toFixed(0)} ${(y2 + rr(-160, 160)).toFixed(0)} ${x2} ${y2}`;
      axons += `<path d="${d}" stroke="url(#ax)" stroke-width="1.6" fill="none" opacity=".4"/>`;
      sparks += `<path class="spark" d="${d}" stroke="#fff" stroke-width="3" style="animation-duration:${rr(3, 7).toFixed(1)}s;animation-delay:${(-r() * 7).toFixed(1)}s"/>`;
    }
    s += axons + `<g filter="url(#lglow)">${sparks}</g>`;
    let near = '';
    somas.forEach(([x, y], i) => (near += neuron(x, y, rr(5, 8), i % 3 === 1)));
    s += `<g opacity=".8">${near}</g>`;
    svg.innerHTML = s;
    return svg;
  }


  function hud(doc) {
    const el = doc.createElement('div');
    el.className = 'hud';
    const pad = (n) => String(n).padStart(2, '0');
    const now = new Date();
    const html = doc.documentElement;
    const wet = html.getAttribute('data-mod') === 'rain' || html.getAttribute('data-weather') === 'rain';
    el.innerHTML =
      '<div class="compass"><b>NW</b><b class="hd">N 352°</b><b>NE</b></div>' +
      '<span class="geo m" style="left: 7%; top: 47%">LOWLIGHT <small>0.4 km</small></span>' +
      '<span class="geo" style="left: 44%; top: 39%">THE SPIRE <small>3.1 km</small></span>' +
      '<span class="geo a" style="left: 76%; top: 55%">VEX <small>1.2 km</small></span>' +
      `<div class="telemetry"><span>${pad(now.getHours())}:${pad(now.getMinutes())}</span><span>3°C <i>${wet ? 'RAIN 60%' : 'CLEAR'}</i></span><span>NET <i>●●●○</i></span></div>`;
    return el;
  }

  const reg = WW.skins.register;
  reg({ id: 'phosphor', name: 'Phosphor', mods: [['', 'green'], ['amber', 'amber', 'amber']] });
  reg({ id: 'junk', name: 'Chop Shop' });
  reg({
    id: 'glass',
    name: 'Street Glass',
    mods: [['', 'clear'], ['rain', 'rain']],
    decor(el) {
      el.append(buildCity(el.ownerDocument), hud(el.ownerDocument));
    },
  });
  reg({ id: 'spire', name: 'Spire' });
  reg({
    id: 'lace',
    name: 'Neural Lace',
    decor(el) {
      el.append(buildLace(el.ownerDocument));
    },
  });
})(globalThis);
