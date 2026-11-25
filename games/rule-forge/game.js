/* Rule Forge (SCHEDULER / INFERENCE): hypothesis testing and set shifting.
 *
 * Part 1, Probe: a hidden firewall rule accepts some number triples. You
 * see one accepted example, test triples of your own (up to 10), then name
 * the rule from six candidates that ALL fit the example, so only testing
 * tells them apart (Wason 1960 number-triple task; Klayman & Ha 1987 on
 * positive-test strategy). Logged: how many probes actually split the
 * remaining candidates (informative probes).
 * Part 2, Sort: sort cards by a hidden dimension (colour, shape, count);
 * the rule switches without warning after a run of correct sorts
 * (Wisconsin-style; Grant & Berg 1948). Logged: perseverative errors.
 * Inductive-reasoning training: Klauer & Phye (2008). Grade B/C.
 */
(function (root) {
  'use strict';
  const WW = root.WW;

  const MAXN = 30;
  const PROBES = 10;
  const PUZZLES = 3;
  const CARDS = 36;

  const mult5 = (x) => x % 5 === 0;
  const RULES = [
    { id: 'asc', name: 'Each number is bigger than the one before', tier: 1, f: ([a, b, c]) => a < b && b < c },
    { id: 'desc', name: 'Each number is smaller than the one before', tier: 1, f: ([a, b, c]) => a > b && b > c },
    { id: 'even', name: 'All even', tier: 1, f: (t) => t.every((x) => x % 2 === 0) },
    { id: 'odd', name: 'All odd', tier: 1, f: (t) => t.every((x) => x % 2 === 1) },
    { id: 'step2', name: 'Goes up by exactly 2 each time', tier: 1, f: ([a, b, c]) => b === a + 2 && c === b + 2 },
    { id: 'sum30', name: 'Adds up to more than 30', tier: 1, f: (t) => t[0] + t[1] + t[2] > 30 },
    { id: 'firstLast', name: 'First is smaller than last', tier: 1, f: ([a, , c]) => a < c },
    { id: 'distinct', name: 'All three different', tier: 1, f: ([a, b, c]) => a !== b && b !== c && a !== c },
    { id: 'midMax', name: 'Middle is the largest', tier: 1, f: ([a, b, c]) => b > a && b > c },
    { id: 'lastMax', name: 'Last is the largest', tier: 1, f: ([a, b, c]) => c > a && c > b },
    { id: 'has5', name: 'Contains a multiple of 5', tier: 1, f: (t) => t.some(mult5) },
    { id: 'small', name: 'All 10 or under', tier: 1, f: (t) => t.every((x) => x <= 10) },
    { id: 'sumab', name: 'First plus second equals third', tier: 2, f: ([a, b, c]) => a + b === c },
    { id: 'double', name: 'Each number doubles', tier: 2, f: ([a, b, c]) => b === 2 * a && c === 2 * b },
    { id: 'ascEven', name: 'Increasing AND all even', tier: 2, f: (t) => t[0] < t[1] && t[1] < t[2] && t.every((x) => x % 2 === 0) },
    { id: 'sumEven', name: 'Sum is even', tier: 2, f: (t) => (t[0] + t[1] + t[2]) % 2 === 0 },
    { id: 'oneEven', name: 'Exactly one even number', tier: 2, f: (t) => t.filter((x) => x % 2 === 0).length === 1 },
    { id: 'firstLast5', name: 'First smaller than last AND contains a multiple of 5', tier: 2, f: (t) => t[0] < t[2] && t.some(mult5) },
  ];
  const byId = Object.fromEntries(RULES.map((r) => [r.id, r]));

  /** All triples in 1..MAXN (27k): fine for search. */
  const ALL = (() => {
    const out = [];
    for (let a = 1; a <= MAXN; a++) for (let b = 1; b <= MAXN; b++) for (let c = 1; c <= MAXN; c++) out.push([a, b, c]);
    return out;
  })();

  /**
   * A puzzle: target rule, one accepted example that as many other rules as
   * possible also accept, and six candidates (target + five that fit the example).
   */
  function puzzle(rng, tier) {
    for (let attempt = 0; attempt < 50; attempt++) {
      const target = rng.pick(RULES.filter((r) => r.tier <= tier && (tier === 1 || r.tier === 2 || rng.chance(0.4))));
      let best = null;
      for (let k = 0; k < 400; k++) {
        const t = rng.pick(ALL);
        if (!target.f(t)) continue;
        const fits = RULES.filter((r) => r !== target && r.f(t));
        if (!best || fits.length > best.fits.length) best = { t, fits };
      }
      if (!best || best.fits.length < 5) continue;
      const others = rng.sample(best.fits, 5);
      // Every candidate must be distinguishable from the target by some triple.
      if (!others.every((o) => ALL.some((t) => o.f(t) !== target.f(t)))) continue;
      return { target: target.id, example: best.t, candidates: rng.shuffle([target, ...others]).map((r) => r.id) };
    }
    throw new Error('rule forge: no puzzle');
  }

  /** Is a probe informative given the candidates still consistent with all earlier results? */
  function informative(candidates, history, probe) {
    const alive = candidates.filter((id) => history.every((hst) => byId[id].f(hst.t) === hst.accepted));
    const verdicts = new Set(alive.map((id) => byId[id].f(probe)));
    return verdicts.size > 1;
  }

  // ---------------------------------------------------------------- sort
  const COLORS = ['#05d9e8', '#ff2a6d', '#ffb347', '#e8e4dc'];
  const COLOR_NAMES = ['cyan', 'magenta', 'amber', 'white'];
  const SHAPES = ['circle', 'triangle', 'square', 'star'];
  const KEYS = [0, 1, 2, 3].map((k) => ({ color: k, shape: k, count: k + 1 }));
  const DIMS = ['color', 'shape', 'count'];

  /** Which key card matches the stimulus on a dimension. */
  const matchKey = (card, dim) => KEYS.findIndex((k) => k[dim] === card[dim]);

  function makeCard(rng) {
    return { color: rng.int(0, 3), shape: rng.int(0, 3), count: rng.int(1, 4) };
  }

  WW.logic = WW.logic || {};
  WW.logic.ruleForge = { RULES, puzzle, informative, byId, KEYS, matchKey, makeCard, DIMS };

  const NS = 'http://www.w3.org/2000/svg';
  let patternSeq = 0;
  function cardSvg(card) {
    const svg = root.document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 60 84');
    svg.setAttribute('class', 'rf-card');
    let col = COLORS[card.color];
    // Colour-blind aid: each colour also gets its own texture (solid, stripes, dots, cross-hatch).
    let defs = '';
    if (WW.prefs && WW.prefs.get('cvdAid', false) && card.color > 0) {
      const id = 'rfp' + ++patternSeq;
      const mark = ['', '<path d="M0 6 L6 0" stroke="#0b0b12" stroke-width="1.6"/>', '<circle cx="3" cy="3" r="1.3" fill="#0b0b12"/>', '<path d="M0 0 L6 6 M6 0 L0 6" stroke="#0b0b12" stroke-width="1.1"/>'][card.color];
      defs = `<defs><pattern id="${id}" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="${col}"/>${mark}</pattern></defs>`;
      col = `url(#${id})`;
    }
    const pos = { 1: [[30, 42]], 2: [[30, 26], [30, 58]], 3: [[30, 18], [30, 42], [30, 66]], 4: [[18, 28], [42, 28], [18, 56], [42, 56]] }[card.count];
    let html = defs + '<rect x="1" y="1" width="58" height="82" rx="5" fill="#0b0b12" stroke="#3d3849"/>';
    for (const [x, y] of pos) {
      const r = 8;
      if (SHAPES[card.shape] === 'circle') html += `<circle cx="${x}" cy="${y}" r="${r}" fill="${col}"/>`;
      else if (SHAPES[card.shape] === 'square') html += `<rect x="${x - r * 0.85}" y="${y - r * 0.85}" width="${r * 1.7}" height="${r * 1.7}" fill="${col}"/>`;
      else if (SHAPES[card.shape] === 'triangle') html += `<polygon points="${x},${y - r} ${x + r},${y + r * 0.8} ${x - r},${y + r * 0.8}" fill="${col}"/>`;
      else {
        const pts = [];
        for (let k = 0; k < 10; k++) {
          const a = -Math.PI / 2 + (k * Math.PI) / 5;
          const rr = k % 2 ? r * 0.45 : r;
          pts.push(`${(x + rr * Math.cos(a)).toFixed(1)},${(y + rr * Math.sin(a)).toFixed(1)}`);
        }
        html += `<polygon points="${pts.join(' ')}" fill="${col}"/>`;
      }
    }
    svg.innerHTML = html;
    return svg;
  }

  WW.games.register({
    id: 'rule-forge',
    name: 'Rule Forge',
    headline: (s) => `${s.puzzlesSolved}/${s.puzzles} rules · ${s.categories} sort switches · ${s.perseverative} perseverative`,
    tune(sessions) {
      const s = sessions[0] && sessions[0].summary;
      if (!s) return null;
      const a = WW.stats.clamp01((s.tier - 1 + s.puzzlesSolved / s.puzzles) / 2);
      const b = WW.stats.clamp01(s.categories / 6);
      return (a + b) / 2;
    },
    mount(container, ctx) {
      const { h, clear } = ctx.ui;
      const T = ctx.timing;
      const S = WW.stats;
      const ac = new AbortController();
      const signal = ac.signal;
      const rng = ctx.rng;

      /** One probe puzzle. Returns record or null. */
      async function runPuzzle(pz, idx, tier) {
        const history = [];
        let informativeCount = 0;
        const t0 = T.now();
        for (;;) {
          clear(container);
          const ins = [0, 1, 2].map(() => h('input.rf-num', { type: 'text', inputmode: 'numeric', autocomplete: 'off', maxlength: '2', 'aria-label': 'number' }));
          const test = h('button.btn.primary', { type: 'button', disabled: history.length >= PROBES }, `Probe (${PROBES - history.length} left)`);
          const declare = h('button.btn', { type: 'button' }, 'I know the rule →');
          const log = h(
            'ul.rf-log',
            h('li.ok', h('span', `${pz.example.join(' · ')}`), h('span', 'ACCEPTED (example)')),
            history.map((x) => h('li', { class: x.accepted ? 'ok' : 'no' }, h('span', x.t.join(' · ')), h('span', x.accepted ? 'ACCEPTED' : 'rejected')))
          );
          const err = h('p.muted.small', `Whole numbers 1–${MAXN}. Enter moves to the next box; Enter on the last one probes.`);
          container.appendChild(h('div.center', h('p.label', `Rule ${idx + 1} / ${PUZZLES} · tier ${tier}`), h('p', 'Probe the firewall with three numbers. Which triples get through?'), log, h('div.row', { style: { justifyContent: 'center' } }, ins), h('div.row', { style: { justifyContent: 'center' } }, test, declare), err));
          if (history.length < PROBES) ins[0].focus();
          const action = await new Promise((resolve) => {
            const onKey = (e) => {
              if (e.code !== 'Enter' && e.code !== 'NumpadEnter') return;
              e.preventDefault();
              const i = ins.indexOf(root.document.activeElement);
              if (i >= 0 && i < 2) ins[i + 1].focus();
              else if (!test.disabled) done('probe');
            };
            const done = (v) => {
              root.removeEventListener('keydown', onKey, true);
              resolve(v);
            };
            root.addEventListener('keydown', onKey, true);
            test.addEventListener('click', () => done('probe'));
            declare.addEventListener('click', () => done('declare'));
            signal.addEventListener('abort', () => done(null));
          });
          if (!action) return null;
          if (action === 'declare') break;
          const t = ins.map((x) => Number(x.value));
          if (!t.every((x) => Number.isInteger(x) && x >= 1 && x <= MAXN)) {
            ctx.audio.sfx('error');
            continue;
          }
          const accepted = byId[pz.target].f(t);
          const inf = informative(pz.candidates, [{ t: pz.example, accepted: true }, ...history], t);
          if (inf) informativeCount++;
          history.push({ t, accepted });
          ctx.audio.sfx(accepted ? 'tick' : 'error');
          ctx.session.trial({ condition: 'probe', stimulus: { target: pz.target, probe: t }, response: accepted ? 'accepted' : 'rejected', correct: null, rt: null, level: tier, informative: inf });
          if (history.length >= PROBES) break;
        }
        // Declare.
        clear(container);
        const opts = pz.candidates.map((id, i) => h('button.btn.rf-cand', { type: 'button' }, h('kbd', String(i + 1)), ' ' + byId[id].name));
        container.appendChild(h('div.center', h('p.label', 'Name the rule'), h('ul.rf-log', h('li.ok', h('span', pz.example.join(' · ')), h('span', 'ACCEPTED')), history.map((x) => h('li', { class: x.accepted ? 'ok' : 'no' }, h('span', x.t.join(' · ')), h('span', x.accepted ? 'ACCEPTED' : 'rejected')))), h('div.rf-cands', opts)));
        const keyMap = {};
        opts.forEach((_, i) => (keyMap['Digit' + (i + 1)] = i));
        const r = await T.awaitChoice({ keyMap, buttons: opts.map((el, i) => ({ el, value: i })), signal });
        if (r.aborted) return null;
        const chosen = pz.candidates[r.value];
        const ok = chosen === pz.target;
        let confidence = null;
        if (WW.confidence.shouldProbe(rng, 1 / 2)) {
          const c = await WW.confidence.ask(container.querySelector('.center'), { prompt: 'How sure are you that’s the rule?', signal });
          if (!c) return null;
          confidence = c.confidence;
        }
        opts[pz.candidates.indexOf(pz.target)].classList.add('right');
        if (!ok) opts[r.value].classList.add('wrong');
        ctx.audio.sfx(ok ? 'correct' : 'error');
        ctx.session.trial({ condition: 'declare', stimulus: { target: pz.target, candidates: pz.candidates, example: pz.example }, response: chosen, correct: ok, rt: T.now() - t0, level: tier, confidence, probes: history.length });
        await T.sleep(ok ? 1200 : 2400);
        return { ok, probes: history.length, informative: informativeCount, accepted: history.filter((x) => x.accepted).length, confidence };
      }

      /** Card sort. Returns stats or null. */
      async function runSort(criterion) {
        clear(container);
        const keyBtns = KEYS.map((k, i) => h('button.rf-keycard', { type: 'button' }, cardSvg(k), h('kbd', String(i + 1))));
        const slot = h('div.rf-slot');
        const msg = h('p.label', '');
        container.appendChild(h('div.center', { style: { userSelect: 'none' } }, h('p', 'Sort each card onto one of the four key cards (1–4). The firewall says right or wrong. The rule changes without warning.'), h('div.row', { style: { justifyContent: 'center' } }, keyBtns), slot, msg));
        let dimIdx = rng.int(0, 2);
        let prevDim = null;
        let streak = 0;
        let categories = 0;
        let errors = 0;
        let perseverative = 0;
        let failToMaintain = 0;
        for (let i = 0; i < CARDS; i++) {
          let card;
          do card = makeCard(rng);
          while (KEYS.some((k) => k.color === card.color && k.shape === card.shape && k.count === card.count));
          WW.ui.clear(slot);
          slot.appendChild(cardSvg(card));
          msg.textContent = `Card ${i + 1} / ${CARDS}`;
          const onset = await T.onNextFrame();
          const r = await T.awaitChoice({ keyMap: { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 }, buttons: keyBtns.map((el, k) => ({ el, value: k })), since: onset, signal });
          if (r.aborted) return null;
          const dim = DIMS[dimIdx];
          const ok = r.value === matchKey(card, dim);
          const persev = !ok && prevDim !== null && r.value === matchKey(card, prevDim);
          if (ok) streak++;
          else {
            errors++;
            if (persev) perseverative++;
            if (streak >= 3) failToMaintain++;
            streak = 0;
          }
          ctx.session.trial({ condition: 'sort-' + dim, stimulus: card, response: r.value, correct: ok, rt: r.rt, level: criterion, perseverative: persev, input: r.input });
          msg.textContent = ok ? 'RIGHT' : 'WRONG';
          ctx.audio.sfx(ok ? 'tick' : 'error');
          await T.sleep(450);
          if (streak >= criterion) {
            categories++;
            prevDim = dim;
            dimIdx = (dimIdx + 1 + rng.int(0, 1)) % 3;
            streak = 0;
          }
        }
        return { categories, errors, perseverative, failToMaintain, criterion };
      }

      (async () => {
        const saved = await ctx.loadState('progress', { tier: 1, wins: 0, criterion: 6, sessions: 0 });
        if (
          !(await WW.screens.intro(container, {
            kicker: 'SCHEDULER · INFERENCE',
            title: 'Rule Forge',
            body: [
              'A rival sysadmin runs a firewall with a hidden rule. Part 1: probe it with number triples and name the rule. The example fits several rules, so test like a scientist: try triples you expect to be REJECTED.',
              'Part 2: sort cards by a hidden feature. The sysadmin changes the rule without telling you. Notice, let go, adapt.',
            ],
            kv: [['Session', `${PUZZLES} rules + ${CARDS} cards, about 6 min`], ['Tier', `${saved.tier} (rules get trickier as you crack them)`]],
            button: 'Start',
            signal,
          }))
        )
          return;
        const res = [];
        for (let i = 0; i < PUZZLES; i++) {
          const r = await runPuzzle(puzzle(rng, saved.tier), i, saved.tier);
          if (!r) return;
          res.push(r);
        }
        if (!(await WW.screens.intro(container, { title: 'Part 2', body: ['Card sort. Keys 1–4 or tap a key card.'], button: 'Go', signal }))) return;
        const sort = await runSort(saved.criterion);
        if (!sort) return;
        const solved = res.filter((r) => r.ok).length;
        const totalProbes = res.reduce((a, r) => a + r.probes, 0);
        const pairs = res.filter((r) => r.confidence != null).map((r) => [r.confidence, r.ok]);
        const summary = {
          tier: saved.tier,
          puzzles: res.length,
          puzzlesSolved: solved,
          probes: totalProbes,
          informativeRate: totalProbes ? S.round(res.reduce((a, r) => a + r.informative, 0) / totalProbes, 3) : null,
          acceptedRate: totalProbes ? S.round(res.reduce((a, r) => a + r.accepted, 0) / totalProbes, 3) : null,
          categories: sort.categories,
          sortErrors: sort.errors,
          perseverative: sort.perseverative,
          failToMaintain: sort.failToMaintain,
          criterion: sort.criterion,
          confidencePairs: pairs,
        };
        const nextTier = solved === PUZZLES ? Math.min(2, saved.tier + 1) : solved === 0 ? 1 : saved.tier;
        const nextCrit = sort.categories >= 4 ? Math.max(3, saved.criterion - 1) : sort.categories <= 1 ? Math.min(6, saved.criterion + 1) : saved.criterion;
        const choice = await WW.screens.results(container, {
          headline: `${solved} / ${res.length} RULES`,
          kv: [
            ['Rules cracked', `${solved} of ${res.length} (tier ${saved.tier})`],
            ['Probes that split candidates', summary.informativeRate != null ? `${Math.round(summary.informativeRate * 100)}% of ${totalProbes}` : '—'],
            ['Probes that were accepted', summary.acceptedRate != null ? `${Math.round(summary.acceptedRate * 100)}% (lots of yeses = mostly confirming)` : '—'],
            ['Sort: switches caught', `${sort.categories}`],
            ['Sort: perseverative errors', `${sort.perseverative} of ${sort.errors} errors`],
          ],
          notes: ['Informative probes are ones where the remaining candidate rules disagree; confirming probes rarely are. Tier and sort speed carry over only if you log the session.'],
          signal,
        });
        if (choice === 'save') {
          await ctx.saveState('progress', { tier: nextTier, criterion: nextCrit, sessions: saved.sessions + 1 });
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
