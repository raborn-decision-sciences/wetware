/* Safehouse (COLD STORAGE): method of loci + spaced retrieval.
 *
 * Your safehouse has 48 fixed stash points along one route over two floors
 * (four rooms each); or use your own route through a place you know well.
 * Each session you stash a list of objects, one per stash point,
 * making a vivid image of the object AT the place (Bower 1970; Roediger
 * 1980). After a short filler task you walk the route and recall what is
 * at each point. The list becomes a "dead drop" that comes back for
 * recall 1, 3 and 7 days later: expanding retrieval practice (Roediger &
 * Karpicke 2006; Cepeda et al. 2006). List length adapts to recall.
 * Evidence: mnemonic training reliably improves memory (Verhaeghen et al.
 * 1992; Dresler et al. 2017; ACTIVE memory arm). Grade A for the skill.
 */
(function (root) {
  'use strict';
  const WW = root.WW;

  const DAY = 864e5;
  const DROP_OFFSETS = [1, 3, 7]; // days after stashing
  const MAX_DROPS_PER_SESSION = 2;
  const FILLER_MS = 30000;

  // Route: 48 stash points over two floors, 24 per floor, four rooms each, in walking order.
  // Coordinates in a 200x140 map. The ground-floor route zigzags through each room and
  // leaves it next to the following one, so the walk never cuts across a room; the stairs
  // go up from the bunk room and the upper floor walks the same footprint in reverse.
  const FLOOR_COORDS = [
    [12, 16], [12, 52], [40, 58], [46, 30], [70, 56], [88, 26],
    [112, 16], [146, 14], [184, 16], [186, 44], [150, 52], [176, 60],
    [186, 84], [186, 124], [152, 128], [150, 92], [116, 88], [112, 124],
    [86, 124], [86, 86], [52, 84], [52, 124], [16, 124], [16, 88],
  ];
  const FLOORS = [
    {
      name: 'GROUND FLOOR',
      rooms: [{ name: 'ENTRY', x: 0, y: 0 }, { name: 'WORKSHOP', x: 100, y: 0 }, { name: 'KITCHEN', x: 100, y: 70 }, { name: 'BUNK', x: 0, y: 70 }],
      coords: FLOOR_COORDS,
      names: [
        'steel door', 'coat hook', 'shoe rack', 'fuse box', 'mirror', 'umbrella stand',
        'workbench', 'soldering iron', 'server rack', 'terminal', 'window blinds', 'tool wall',
        'fridge', 'sink', 'stove', 'noodle shelf', 'water filter', 'trash chute',
        'bunk', 'pillow', 'locker', 'med kit', 'lamp', 'floor safe',
      ],
    },
    {
      name: 'UPPER FLOOR',
      rooms: [{ name: 'ROOF HATCH', x: 0, y: 0 }, { name: 'COMMS', x: 100, y: 0 }, { name: 'LAB', x: 100, y: 70 }, { name: 'LANDING', x: 0, y: 70 }],
      coords: FLOOR_COORDS.slice().reverse(),
      names: [
        'stair rail', 'skylight', 'bike hook', 'intercom', 'laundry basket', 'potted fern',
        'centrifuge', 'fume hood', 'microscope', 'chalkboard', 'specimen jar', 'lab stool',
        'antenna coil', 'headset', 'map table', 'pager rack', 'cable spool', 'radio desk',
        'water tank', 'satellite dish', 'pigeon coop', 'vent fan', 'neon sign', 'fire escape',
      ],
    },
  ];
  const PER_FLOOR = 24;
  const LOCI = FLOORS.flatMap((f, fl) => f.names.map((name, k) => ({ i: fl * PER_FLOOR + k, name, x: f.coords[k][0], y: f.coords[k][1], floor: fl })));

  // Your own route: names of real places along a walk you know, in order.
  const OWN_MIN = 10;
  const OWN_MAX = 60;
  /** Clean a typed route: one point per line, trimmed, no blanks or repeats, at most OWN_MAX. */
  function parseRoute(text) {
    const seen = new Set();
    const out = [];
    for (const line of String(text || '').split(/\r?\n/)) {
      const name = line.trim().replace(/\s+/g, ' ').slice(0, 40);
      const key = name.toLowerCase();
      if (!name || seen.has(key)) continue;
      seen.add(key);
      out.push(name);
    }
    return out.slice(0, OWN_MAX);
  }
  /** The palace in use: { kind: 'stock' | 'own', loci }. An own route shorter than OWN_MIN falls back to stock. */
  function palaceOf(state) {
    const p = state && state.palace;
    if (p && p.kind === 'own' && Array.isArray(p.names) && p.names.length >= OWN_MIN) return { kind: 'own', loci: p.names.map((name, i) => ({ i, name, own: true })) };
    return { kind: 'stock', loci: LOCI };
  }

  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
  function lev(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++)
      for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }
  /** Lenient match: plurals and small typos count (1 edit from 5 letters, 2 from 9). */
  function matches(typed, word) {
    const t = norm(typed);
    const w = norm(word);
    if (!t) return false;
    if (t === w || t === w + 's' || t === w + 'es' || t + 's' === w) return true;
    const tol = w.length >= 9 ? 2 : w.length >= 5 ? 1 : 0;
    return tol > 0 && lev(t, w) <= tol;
  }

  /** Word pool minus anything that overlaps a locus name (the stock route's and any extra names). */
  function pool(extraNames) {
    const lociWords = new Set([...LOCI, ...(extraNames || []).map((name) => ({ name }))].flatMap((l) => l.name.toLowerCase().split(/\s+/)));
    return (WW.safehouseWords || []).filter((w) => !lociWords.has(w));
  }

  /** Pick n words, avoiding recently used ones where possible. */
  function pickWords(rng, n, recent, extraNames) {
    const avoid = new Set(recent || []);
    const all = pool(extraNames);
    const fresh = all.filter((w) => !avoid.has(w));
    const src = fresh.length >= n ? fresh : all;
    return rng.sample(src, n);
  }

  /** List-length rule after immediate recall; capped by the palace size. */
  function nextLength(len, acc, cap = LOCI.length) {
    const next = acc >= 0.9 ? len + 2 : acc >= 0.75 ? len + 1 : acc < 0.5 ? len - 1 : len;
    return Math.max(5, Math.min(cap, next));
  }

  /** Drops due now (stage < 3 and due time passed), oldest first. */
  function dueDrops(drops, now) {
    return (drops || []).filter((d) => d.stage < DROP_OFFSETS.length && d.nextDue <= now).sort((a, b) => a.nextDue - b.nextDue);
  }

  function scheduleNext(drop, now) {
    drop.stage++;
    drop.nextDue = drop.stage < DROP_OFFSETS.length ? drop.createdAt + DROP_OFFSETS[drop.stage] * DAY : null;
    drop.lastRecalled = now;
    return drop;
  }

  /** The loci a stored list was made on (older drops have no names: they are stock). */
  function lociOfItems(items, kind) {
    if (kind === 'own') return items.map((it) => ({ i: it.locus, name: it.name, own: true }));
    return LOCI;
  }
  const nameAt = (loci, it) => it.name || (loci[it.locus] && loci[it.locus].name) || LOCI[it.locus].name;

  WW.logic = WW.logic || {};
  WW.logic.safehouse = { where, LOCI, FLOORS, PER_FLOOR, OWN_MIN, OWN_MAX, parseRoute, palaceOf, matches, lev, pickWords, nextLength, dueDrops, scheduleNext, DROP_OFFSETS, pool };

  // ------------------------------------------------------------------ where you are on the route
  const NS = 'http://www.w3.org/2000/svg';
  /** Floor plan of the active stash point's floor (stock), or a strip of nearby names (own route). */
  function where(loci, active, upTo) {
    const h = WW.ui.h;
    const n = Math.min(upTo || loci.length, loci.length);
    if (loci[0] && loci[0].own) {
      const from = Math.max(0, active - 2);
      const to = Math.min(n - 1, active + 2);
      const rows = [];
      for (let i = from; i <= to; i++) rows.push(h('li', { class: i === active ? 'on' : '' }, h('span.n', String(i + 1)), h('span', loci[i].name)));
      return h('ol.sh-strip', { 'aria-label': 'your route' }, rows);
    }
    const fl = LOCI[active] ? LOCI[active].floor : 0;
    const F = FLOORS[fl];
    const svg = root.document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '-2 -2 204 144');
    svg.setAttribute('class', 'sh-map');
    let html = '';
    for (const r of F.rooms) html += `<rect x="${r.x + 1}" y="${r.y + 1}" width="98" height="68" rx="3" class="sh-room"/><text x="${r.x + 50}" y="${r.y + 37}" class="sh-roomname">${r.name}</text>`;
    const shown = LOCI.filter((l) => l.floor === fl && l.i < n);
    html += `<polyline class="sh-route" points="${shown.map((l) => `${l.x},${l.y}`).join(' ')}"/>`;
    for (const l of shown) {
      const on = l.i === active;
      html += `<circle cx="${l.x}" cy="${l.y}" r="${on ? 5.5 : 3.6}" class="sh-locus${on ? ' on' : ''}"/>`;
      html += `<text x="${l.x}" y="${l.y + 1.3}" class="sh-num${on ? ' on' : ''}">${l.i + 1}</text>`;
      if (on) html += `<text x="${Math.min(170, Math.max(30, l.x))}" y="${l.y > 70 ? l.y - 9 : l.y + 13}" class="sh-label">${l.name}</text>`;
    }
    svg.innerHTML = html;
    return h('div.sh-where', n > PER_FLOOR ? h('p.muted.small', F.name) : null, svg);
  }

  WW.games.register({
    id: 'safehouse',
    // Untimed: skins may restyle the floor plan when flavour is on (PLAN §6.1).
    flavour: true,
    name: 'Safehouse',
    headline: (s) => `${s.recalled}/${s.listLength} recalled` + (s.palace === 'own' ? ' · own route' : '') + (s.dropRecalls && s.dropRecalls.length ? ` · ${s.dropRecalls.length} dead drop(s)` : ''),
    /** COLD STORAGE tune: items recalled immediately, 4 -> 0, 48 (every stock stash point) -> 1. */
    tune(sessions) {
      const v = sessions.slice(0, 3).map((s) => s.summary && s.summary.recalled).filter(Number.isFinite);
      return v.length ? WW.stats.clamp01((WW.stats.mean(v) - 4) / 44) : null;
    },
    /** Dead drops waiting for recall (the hub prioritises these in the contract). */
    async dueCount(store) {
      const st = await store.getState('safehouse.progress');
      return st ? dueDrops(st.drops, Date.now()).length : 0;
    },
    mount(container, ctx) {
      const { h, clear } = ctx.ui;
      const T = ctx.timing;
      const S = WW.stats;
      const ac = new AbortController();
      const signal = ac.signal;
      const rng = ctx.rng;

      /** Ask for one typed word; resolves string (maybe '') or null if aborted. */
      function askWord(input, button) {
        return new Promise((resolve) => {
          const done = (v) => {
            root.removeEventListener('keydown', onKey, true);
            resolve(v);
          };
          const onKey = (e) => {
            if (e.code === 'Enter' || e.code === 'NumpadEnter') {
              e.preventDefault();
              done(input.value);
            }
          };
          root.addEventListener('keydown', onKey, true);
          button.addEventListener('click', () => done(input.value));
          signal.addEventListener('abort', () => done(null));
          input.focus();
        });
      }

      /** Walk the route recalling items at loci. Returns [{locus, name, word, typed, ok, rt}] or null. */
      async function recall(items, title, loci) {
        const out = [];
        for (const it of items) {
          clear(container);
          const name = nameAt(loci, it);
          const input = h('input.sh-input', { type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, 'aria-label': 'object stashed here' });
          const btn = h('button.btn.primary', { type: 'button' }, 'Next');
          container.appendChild(
            h('div.center', h('p.label', `${title} · stash point ${it.locus + 1} / ${items.length}`), where(loci, it.locus, items.length), h('p', `What did you leave at the ${name}?`), h('div.row', { style: { justifyContent: 'center' } }, input, btn), h('p.muted.small', 'Enter with nothing typed to skip.'))
          );
          const t0 = T.now();
          const typed = await askWord(input, btn);
          if (typed === null) return null;
          const ok = matches(typed, it.word);
          out.push({ locus: it.locus, name, word: it.word, typed, ok, rt: T.now() - t0 });
        }
        return out;
      }

      function review(res, title) {
        clear(container);
        const right = res.filter((r) => r.ok).length;
        const list = h(
          'ul.sh-review',
          res.map((r) => h('li', { class: r.ok ? 'ok' : 'miss' }, h('span', `${r.locus + 1}. ${r.name}`), h('span', r.ok ? r.word : `${r.word}${r.typed ? ` (you: ${r.typed})` : ''}`)))
        );
        const btn = h('button.btn.primary', { type: 'button' }, 'Continue');
        container.appendChild(h('div.center', h('p.label', title), h('p.big', `${right} / ${res.length}`), list, btn));
        return WW.screens.waitForButton(btn, signal);
      }

      /** Walk a stretch of the route once, point by point, to learn it. */
      async function tour(loci, label, total) {
        for (let k = 0; k < loci.length; k++) {
          const l = loci[k];
          clear(container);
          const btn = h('button.btn.primary', { type: 'button' }, k === loci.length - 1 ? 'Done' : 'Next');
          container.appendChild(h('div.center', h('p.label', `${label} · ${k + 1} / ${loci.length}`), where(l.own ? loci : LOCI, l.i, total), h('p', `Stash point ${l.i + 1}: the ${l.name}. Picture it: where it sits, what it looks like.`), btn));
          if (!(await WW.screens.waitForButton(btn, signal))) return false;
        }
        return true;
      }

      async function filler() {
        clear(container);
        let n = rng.int(300, 999);
        let correct = 0;
        const prompt = h('p.big', `${n} − 7 = ?`);
        const input = h('input.sh-input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', 'aria-label': 'answer' });
        const clock = h('p.label', '');
        container.appendChild(h('div.center', h('p.label', 'Scrub your short-term buffer: keep subtracting 7'), prompt, input, clock));
        input.focus();
        const end = T.now() + FILLER_MS;
        return new Promise((resolve) => {
          const tick = setInterval(() => {
            const left = Math.ceil((end - T.now()) / 1000);
            clock.textContent = `${left} s`;
            if (left <= 0) finish(true);
          }, 200);
          const onKey = (e) => {
            if (e.code !== 'Enter' && e.code !== 'NumpadEnter') return;
            e.preventDefault();
            if (Number(input.value) === n - 7) {
              correct++;
              n -= 7;
            } else ctx.audio.sfx('tick');
            input.value = '';
            prompt.textContent = `${n} − 7 = ?`;
          };
          const onAbort = () => finish(false);
          root.addEventListener('keydown', onKey, true);
          signal.addEventListener('abort', onAbort);
          function finish(ok) {
            clearInterval(tick);
            root.removeEventListener('keydown', onKey, true);
            signal.removeEventListener('abort', onAbort);
            resolve(ok ? correct : null);
          }
        });
      }

      /** Choose the safehouse or your own route. Saves at once (a setting, not a result). Resolves when closed. */
      function editPalace(state) {
        return new Promise((resolve) => {
          clear(container);
          let kind = palaceOf(state).kind;
          const own = (state.palace && state.palace.names) || [];
          const area = h('textarea.sh-route-edit', { rows: 12, spellcheck: false, 'aria-label': 'your route, one stash point per line', placeholder: 'front door\nkey bowl\ncoat hooks\nshoe rack\n…' });
          area.value = own.join('\n');
          const count = h('p.muted.small', '');
          const stockBtn = h('button.btn', { type: 'button' }, `Safehouse (${LOCI.length} points)`);
          const ownBtn = h('button.btn', { type: 'button' }, 'My own route');
          const ownBox = h('div.center', { style: { gap: '6px' } }, h('p.small', 'Walk through a place you know well: your home, a commute, a workplace. One stash point per line, in walking order. Pick fixed, distinct things (front door, key bowl, radiator), not things that move.'), area, count);
          const save = h('button.btn.primary', { type: 'button' }, 'Save');
          const cancel = h('button.btn', { type: 'button' }, 'Cancel');
          const refresh = () => {
            stockBtn.classList.toggle('primary', kind === 'stock');
            ownBtn.classList.toggle('primary', kind === 'own');
            ownBox.hidden = kind !== 'own';
            const n = parseRoute(area.value).length;
            count.textContent = `${n} stash point${n === 1 ? '' : 's'} (${OWN_MIN}–${OWN_MAX} needed)`;
            save.disabled = kind === 'own' && n < OWN_MIN;
          };
          stockBtn.addEventListener('click', () => ((kind = 'stock'), refresh()));
          ownBtn.addEventListener('click', () => ((kind = 'own'), refresh()));
          area.addEventListener('input', refresh);
          const close = (v) => {
            signal.removeEventListener('abort', onAbort);
            resolve(v);
          };
          const onAbort = () => close(false);
          signal.addEventListener('abort', onAbort);
          cancel.addEventListener('click', () => close(true));
          save.addEventListener('click', async () => {
            const names = parseRoute(area.value);
            const prev = state.palace || {};
            const same = prev.kind === kind && (kind === 'stock' || (prev.names || []).join('\n') === names.join('\n'));
            state.palace = kind === 'own' ? { kind, names, walked: same ? !!prev.walked : false } : { kind: 'stock', names: names.length ? names : prev.names || [] };
            state.listLength = Math.min(state.listLength, palaceOf(state).loci.length);
            await ctx.saveState('progress', state);
            close(true);
          });
          container.appendChild(
            h(
              'div.center.ww-chrome',
              h('p.label', 'COLD STORAGE · your memory palace'),
              h('p', 'Stash lists along the safehouse route, or along a route you already know by heart. Familiar places are what memory athletes use.'),
              h('div.row', { style: { justifyContent: 'center' } }, stockBtn, ownBtn),
              ownBox,
              h('div.row', { style: { justifyContent: 'center' } }, save, cancel),
              h('p.muted.small', 'Lists already stashed keep the places they were stashed at. Your route is saved with your data and goes with exports.')
            )
          );
          refresh();
        });
      }

      (async () => {
        const state = await ctx.loadState('progress', { listLength: 8, drops: [], recent: [], sessions: 0, toured: false });
        if (!state.touredFloors) state.touredFloors = state.toured ? [0] : [];
        const now = Date.now();
        const due = dueDrops(state.drops, now).slice(0, MAX_DROPS_PER_SESSION);
        // Intro, with a way into the palace editor.
        let P;
        for (;;) {
          P = palaceOf(state);
          const introAc = new AbortController();
          const onOuter = () => introAc.abort();
          signal.addEventListener('abort', onOuter);
          let editing = false;
          const change = h('button.btn', { type: 'button', on: { click: () => ((editing = true), introAc.abort()) } }, 'Change palace…');
          const started = await WW.screens.intro(container, {
            kicker: 'COLD STORAGE · long-term memory',
            title: 'Safehouse',
            body: [
              P.kind === 'own'
                ? `You're using your own route: ${P.loci.length} stash points, from the ${P.loci[0].name} to the ${P.loci[P.loci.length - 1].name}. You'll stash a list of objects, one per point, in route order.`
                : `Your safehouse has ${LOCI.length} stash points along one route over two floors. You'll stash a list of objects, one per point, in route order.`,
              'The trick: for each one, build a vivid, odd image of the object AT the place (a lobster clamped on the steel door, a melon jammed in the coat hook). Strange, active and sensory works best.',
              'After a short scrub you walk the route and say what is at each point. Each list comes back as a dead drop 1, 3 and 7 days later.',
            ],
            kv: [
              ['Palace', P.kind === 'own' ? `your own route (${P.loci.length} points)` : `the safehouse (${LOCI.length} points)`],
              ['This session', `${due.length ? `${due.length} dead drop(s) due, then ` : ''}${Math.min(state.listLength, P.loci.length)} objects`],
              ['Takes', 'about 6 minutes'],
            ],
            legend: h('div.row', { style: { justifyContent: 'center' } }, change),
            button: 'Start',
            signal: introAc.signal,
          });
          signal.removeEventListener('abort', onOuter);
          if (started) break;
          if (!editing || signal.aborted) return;
          if (!(await editPalace(state))) return;
        }

        // 1. Dead drops due.
        const dropRecalls = [];
        for (const d of due) {
          const loci = lociOfItems(d.items, d.palace);
          const res = await recall(d.items, `Dead drop from ${WW.ui.fmtDate(d.createdAt).slice(5, 10)} (day ${DROP_OFFSETS[d.stage]})`, loci);
          if (!res) return;
          const acc = res.filter((r) => r.ok).length / res.length;
          dropRecalls.push({ id: d.id, stage: d.stage, days: DROP_OFFSETS[d.stage], acc: S.round(acc, 3) });
          res.forEach((r) =>
            ctx.session.trial({ condition: `drop-day${DROP_OFFSETS[d.stage]}`, stimulus: { locus: r.locus, place: r.name, word: r.word, drop: d.id }, response: r.typed, correct: r.ok, rt: r.rt, level: d.items.length })
          );
          if (!(await review(res, `Dead drop · day ${DROP_OFFSETS[d.stage]}`))) return;
        }

        // 2. Learn the route: each stock floor the first time a list reaches it; your own route once after setting it.
        const n = Math.min(state.listLength, P.loci.length);
        if (P.kind === 'stock') {
          for (let fl = 0; fl * PER_FLOOR < n; fl++)
            if (!state.touredFloors.includes(fl) && !(await tour(LOCI.filter((l) => l.floor === fl), `Route tour · ${FLOORS[fl].name.toLowerCase()}`, Math.max(n, (fl + 1) * PER_FLOOR)))) return;
        } else if (!state.palace.walked && !(await tour(P.loci, 'Walk your route', P.loci.length))) return;

        // 3. Stash.
        const ownNames = P.kind === 'own' ? P.loci.map((l) => l.name) : [];
        const words = pickWords(rng, n, state.recent, ownNames);
        const items = words.map((word, i) => ({ locus: i, word, name: P.loci[i].name }));
        const study = [];
        for (const it of items) {
          clear(container);
          const note = h('input.sh-note', { type: 'text', autocomplete: 'off', placeholder: 'optional: 2–3 words for your image', 'aria-label': 'image note' });
          const btn = h('button.btn.primary', { type: 'button', disabled: true }, 'Stashed');
          container.appendChild(
            h('div.center', h('p.label', `Stash ${it.locus + 1} / ${n}`), where(P.loci, it.locus, n), h('p', `At the ${it.name}:`), h('p.big.sh-word', it.word.toUpperCase()), note, btn, h('p.muted.small', 'Take your time with the image. Enter when it’s locked in.'))
          );
          const t0 = T.now();
          setTimeout(() => (btn.disabled = false), 1500);
          const ok = await new Promise((resolve) => {
            const done = (v) => {
              root.removeEventListener('keydown', onKey, true);
              resolve(v);
            };
            const onKey = (e) => {
              if ((e.code === 'Enter' || e.code === 'NumpadEnter') && !btn.disabled) {
                e.preventDefault();
                done(true);
              }
            };
            root.addEventListener('keydown', onKey, true);
            btn.addEventListener('click', () => done(true));
            signal.addEventListener('abort', () => done(false));
            note.focus();
          });
          if (!ok) return;
          study.push({ ms: T.now() - t0, note: note.value.trim() });
        }

        // 4. Filler, then 5. recall.
        const fillerCorrect = await filler();
        if (fillerCorrect === null) return;
        const res = await recall(items, 'Walk the route', P.loci);
        if (!res) return;
        res.forEach((r, i) =>
          ctx.session.trial({ condition: 'immediate', stimulus: { locus: r.locus, place: r.name, word: r.word, studyMs: S.round(study[i].ms), note: study[i].note || null }, response: r.typed, correct: r.ok, rt: r.rt, level: n })
        );
        if (!(await review(res, 'Immediate recall'))) return;

        const recalled = res.filter((r) => r.ok).length;
        const acc = recalled / n;
        const next = nextLength(n, acc, P.loci.length);
        const summary = {
          listLength: n,
          recalled,
          accuracy: S.round(acc, 3),
          nextListLength: next,
          palace: P.kind,
          palaceSize: P.loci.length,
          studyMedianMs: S.round(S.median(study.map((s) => s.ms))),
          notesUsed: study.filter((s) => s.note).length,
          fillerCorrect,
          dropRecalls,
        };
        const choice = await WW.screens.results(container, {
          headline: `${recalled} / ${n}`,
          kv: [
            ['Immediate recall', `${recalled} of ${n} (${Math.round(acc * 100)}%)`],
            ['Next list', `${next} objects` + (next === P.loci.length ? ' (every stash point)' : '')],
            ...dropRecalls.map((d) => [`Dead drop, day ${d.days}`, `${Math.round(d.acc * 100)}%`]),
            ['Median study time', `${(summary.studyMedianMs / 1000).toFixed(1)} s per object`],
          ],
          notes: ['Log it to schedule this list as a dead drop (recall in 1, 3 and 7 days) and to keep your list length.'],
          signal,
        });
        if (choice !== 'save') return ctx.abort();
        const t = Date.now();
        for (const d of due) {
          const r = dropRecalls.find((x) => x.id === d.id);
          if (!r) continue;
          d.results.push({ days: r.days, acc: r.acc, at: t });
          scheduleNext(d, t);
        }
        state.drops = state.drops.filter((d) => d.stage < DROP_OFFSETS.length || t - (d.lastRecalled || 0) < 30 * DAY);
        state.drops.push({ id: ctx.session.id, createdAt: t, items, palace: P.kind, stage: 0, nextDue: t + DROP_OFFSETS[0] * DAY, results: [] });
        state.listLength = next;
        state.recent = [...words, ...state.recent].slice(0, 200);
        if (P.kind === 'stock') {
          for (let fl = 0; fl * PER_FLOOR < n; fl++) if (!state.touredFloors.includes(fl)) state.touredFloors.push(fl);
        } else state.palace.walked = true;
        state.toured = true;
        state.sessions++;
        await ctx.saveState('progress', state);
        ctx.finish(summary);
      })().catch((e) => console.error(e));

      return {
        stop() {
          ac.abort();
        },
      };
    },
  });
})(globalThis);
