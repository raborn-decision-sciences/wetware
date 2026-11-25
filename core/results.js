/* Wetware core: the Results view under Rig (replaces the Trends rows).
 *
 * Two tabs:
 *  - Your results: "At a glance" (every task with a status icon), then one card per task in plain
 *    words: what it measures, a verdict, a gauge (no change in the middle, better to the right), a
 *    sentence in everyday units, and a chart of every session with the estimated true level.
 *  - Technical report: definitions, the models, and every result on one standardized scale.
 *
 * Everything shown comes from the shipped analyses (core/trends.js, core/reliable.js,
 * core/study.js). The verdicts restate their 89% intervals: "clear" when the interval excludes
 * zero. The chart lines are the smoothed level (core/bayes.js levelPath), display only.
 * Mocked up and approved in docs/mockups/charts.html.
 */
(function (root) {
  'use strict';
  const WW = (root.WW = root.WW || {});
  const C = () => WW.catalog;

  // ------------------------------------------------------------------ copy

  // Training modules, in everyday words: what the game works on.
  const MODULE_PLAIN = {
    'packet-echo': 'Working memory: spotting when something repeats from a few steps back.',
    firewall: 'Self-control: ignoring distractions, and stopping a response when the alarm sounds.',
    'context-switch': 'Switching: changing quickly between two sets of rules.',
    flashpoint: 'Visual speed: taking in what flashed, and where, in a split second.',
    safehouse: 'Memory: remembering lists by placing them along a mental route.',
    'cipher-matrix': 'Reasoning: finding the rule in a pattern of symbols.',
    fence: 'Number sense: quick mental arithmetic and estimating amounts.',
    hardpoint: 'Spatial: turning shapes in your mind to tell a match from a mirror image.',
    'heist-ledger': 'Memory and numbers: remembering a grid, then finding paths that add up.',
    'rule-forge': 'Flexible thinking: working out a hidden rule, then adjusting when it changes.',
    checksum: 'Logic: number puzzles where rows and boxes must add up.',
    'buffer-overflow': 'Working memory: holding items in mind while doing something else.',
    'ghost-trace': 'Attention: following several moving targets at once.',
    bookie: 'Self-knowledge: judging how sure you should be of your own answers.',
    'black-market': 'Strategy: bidding against rivals and remembering what they did.',
    lockpick: 'Problem solving: finding patterns that open locks, and reusing them.',
    trace: 'Mental tracking: following a short program step by step in your head.',
    relay: 'Planning: working out a sequence of moves before you make them.',
    'night-watch': 'Staying alert: spotting a rare change during a long, quiet watch.',
    'lexicon-breach': 'Word finding: producing words quickly by letter or category.',
    'id-spoof': 'Memory for people: matching faces with names.',
    informant: 'Judging chances: updating how likely something is as clues come in.',
    'double-cross': 'Learning from feedback: telling bad luck from a real change.',
    'burn-in': 'Habit learning: picking up a repeating pattern without trying to.',
    pulse: 'Timing: holding a time interval and keeping a steady beat.',
    'dead-switch': 'Remembering to remember: acting at the right moment without a reminder.',
    wiretap: 'Memory: remembering what you hear by placing each point along a mental route.',
  };

  // Check-up measures: what each measures, the unit amounts are written in, and words for
  // [better, worse].
  const MEASURE_PLAIN = {
    'dx-choice-rt:medianRt': { what: 'Reaction speed: how quickly you pick the right key.', unit: 'ms', words: ['faster', 'slower'] },
    'dx-corsi:fwdSpan': { what: 'Spatial memory: the longest sequence of blocks you can tap back.', unit: 'blocks', words: ['longer', 'shorter'] },
    'dx-corsi:bwdSpan': { what: 'Spatial memory, in reverse: tapping the sequence back to front.', unit: 'blocks', words: ['longer', 'shorter'] },
    'dx-digit-span:fwdSpan': { what: 'Number memory: the longest string of digits you can repeat.', unit: 'digits', words: ['longer', 'shorter'] },
    'dx-digit-span:bwdSpan': { what: 'Number memory, in reverse: repeating digits back to front.', unit: 'digits', words: ['longer', 'shorter'] },
    'dx-stroop:interference': { what: 'Focus under conflict: how much a clashing colour word slows you down.', unit: 'ms', words: ['less slowdown', 'more slowdown'] },
    'dx-stroop-spatial:interference': { what: 'Focus under conflict: how much a clashing direction word slows you down.', unit: 'ms', words: ['less slowdown', 'more slowdown'] },
    'dx-trails:diffMs': { what: 'Switching: the extra time it takes to alternate between numbers and letters.', unit: 'ms', words: ['faster', 'slower'] },
    'dx-paper-folding:score': { what: 'Spatial reasoning: picturing where holes end up in folded paper.', unit: 'points', words: ['higher', 'lower'] },
    'dx-matrix:correct': { what: 'Pattern reasoning: puzzles you never practise.', unit: 'correct', words: ['more', 'fewer'] },
    'dx-sart:commissions': { what: 'Steady attention: slips where you pressed but should have held back.', unit: 'slips', words: ['fewer', 'more'] },
  };

  const SPLIT_PLAIN = {
    sleep: { name: 'Sleep', low: 'after 6 hours or less', high: 'after 7 hours or more' },
    mood: { name: 'Mood', low: 'on low-mood days (1–2)', high: 'on other days (3–5)' },
    stress: { name: 'Stress', low: 'on calm days (1–2)', high: 'on more stressed days (3–5)' },
    caffeine: { name: 'Caffeine', low: 'with no caffeine', high: 'with some caffeine' },
  };

  // ------------------------------------------------------------------ text helpers

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const minus = (s) => String(s).replace(/^-/, '−');
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const signed = (x, d = 0) => {
    const v = Number(x.toFixed(d));
    return (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toFixed(d);
  };
  const pctChance = (p) => (p > 0.99 ? 'over 99%' : p < 0.01 ? 'under 1%' : Math.round(p * 100) + '%');
  const fmtP = (p) => (p > 0.995 ? '>0.99' : p < 0.005 ? '<0.01' : p.toFixed(2));
  const fmtDay = (t) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const isoDay = (t) => new Date(t).toISOString().slice(0, 10);

  /** An amount in a unit, always positive: "31 ms", "4.2 s", "0.6 digits", "12 points". */
  function amount(x, unit) {
    const a = Math.abs(x);
    if (unit === 'ms') return a >= 2000 ? (a / 1000).toFixed(1) + ' s' : Math.round(a) + ' ms';
    if (unit === 'tune') return Math.round(a) + (Math.round(a) === 1 ? ' point' : ' points');
    return (a < 10 ? a.toFixed(1) : String(Math.round(a))) + ' ' + unit;
  }
  /** A change, positive = better, in words: "31 ms faster". */
  const change = (x, unit, words) => `${amount(x, unit)} ${x >= 0 ? words[0] : words[1]}`;
  /** The likely range in words: "between 12 ms slower and 85 ms faster". */
  function rangeWords(lo, hi, unit, words) {
    if (lo >= 0) return `between ${amount(lo, unit)} and ${change(hi, unit, words)}`;
    if (hi <= 0) return `between ${amount(hi, unit)} and ${change(lo, unit, words)}`;
    return `between ${change(lo, unit, words)} and ${change(hi, unit, words)}`;
  }
  /** A raw value as people read it. */
  function rawFmt(unit, ref) {
    if (unit === 'ms') {
      const sec = Math.abs(ref) >= 2000;
      return (v, tick) => (sec ? (v / 1000).toFixed(tick ? 0 : 1) + ' s' : Math.round(v) + ' ms');
    }
    return (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  }
  function niceTicks(lo, hi, n = 5) {
    const span = hi - lo || 1;
    const raw = span / n;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw);
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.abs(v) < 1e-12 ? 0 : v);
    return out;
  }
  /** Verdict from an 89% interval with better = positive. cls: up | down | '' (none). */
  const verdictOf = (lo, hi, [up, none, down]) => (lo > 0 ? { text: up, cls: 'up' } : hi < 0 ? { text: down, cls: 'down' } : { text: none, cls: '' });
  const SHORT = { 'Clear improvement': 'Improved', 'No clear change yet': 'No clear change', 'Clear decline': 'Declined', 'No clear difference yet': 'No clear difference', 'Other groups helped more': 'Others helped more' };
  const shortOf = (t) => SHORT[t] || t.replace(/^Group (\w) helped more$/, '$1 helped more');

  // Status icons: the shape and the label carry the status; colour only repeats it.
  const ICON = {
    up: '<svg class="icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2 L14.5 13.5 H1.5 Z" fill="var(--good)"/></svg>',
    down: '<svg class="icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 14 L1.5 2.5 H14.5 Z" fill="var(--amber)"/></svg>',
    '': '<svg class="icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5" fill="none" stroke="var(--dim)" stroke-width="2"/></svg>',
    wait: '<svg class="icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5" fill="none" stroke="var(--dim)" stroke-width="1.5" stroke-dasharray="2 2.2"/></svg>',
  };
  const icon = (cls) => ICON[cls || ''];

  function dom(html) {
    const t = root.document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstChild;
  }

  // ------------------------------------------------------------------ analyses

  const DAY = 864e5;
  let memo = { key: '', A: null };

  function analyse(sessions, study, now = Date.now()) {
    const Cat = C();
    let last = 0;
    let flaggedN = 0;
    for (const s of sessions) {
      if (s.startedAt > last) last = s.startedAt;
      if (s.quality && s.quality.flagged) flaggedN++;
    }
    const key = [sessions.length, last, flaggedN, study ? [study.startAt, study.endedAt || 0, study.order.join('')].join(',') : '-', new Date(now).toDateString()].join('|');
    if (memo.key === key) return memo.A;

    const A = { training: [], trainingWaiting: [], flagged: 0, pooled: false, diagnostics: [], dxWaiting: [], study: null, context: [], any: false };
    // Practice games.
    const mods = [];
    const series = [];
    for (const m of Cat.MODULES.filter((x) => Cat.isOnline(x.id))) {
      const ss = sessions.filter((s) => s.game === m.id);
      if (!ss.length) continue;
      const ser = WW.trends.series(ss, WW.games.get(m.id));
      A.flagged += ser.flagged;
      if (!ser.points.length) continue;
      mods.push(m);
      series.push(ser);
    }
    const changes = WW.trends.changeAll(series);
    series.forEach((ser, k) => {
      if (changes[k]) A.training.push({ mod: mods[k], ser, ch: changes[k] });
      else A.trainingWaiting.push({ mod: mods[k], n: ser.points.length });
    });
    A.pooled = changes.some((c) => c && c.pooled);
    A.context = WW.trends.contextEffects(series);
    // Check-up tests: estimates from the run after the run-in (docs/SIMULATION.md, rounds 3–4).
    const runsByProbe = {};
    for (const d of Cat.PROBES) {
      const runs = sessions.filter((s) => s.game === d.id && !(s.quality && s.quality.flagged)).sort((x, y) => x.startedAt - y.startedAt);
      runsByProbe[d.id] = runs.map((s) => ({ startedAt: s.startedAt, summary: s.summary }));
      if (runs.length < Cat.RUNIN + 1) {
        if (runs.length) A.dxWaiting.push({ d, n: runs.length, need: Cat.RUNIN + 1 });
        continue;
      }
      const ms = WW.reliable.MEASURES[d.id] || [];
      for (const r of WW.reliable.change(d.id, runs)) {
        // Measures whose noise has no published data need more runs (simulation round 5).
        const m = ms.find((x) => x.key === r.key);
        const need = (m && m.minRuns) || Cat.RUNIN + 1;
        if (runs.length < need) A.dxWaiting.push({ d, n: runs.length, need, key: r.key, label: ms.length > 1 ? r.label : null });
        else A.diagnostics.push({ d, r, runs });
      }
    }
    // The study.
    if (study) {
      const S = WW.study;
      const res = S.analyse(study, runsByProbe, now);
      const off = S.offArmCounts(study, sessions).slice(0, res.periodsDone);
      A.study = { study, res, runsByProbe, off, offN: off.reduce((a, x) => a + x, 0) };
    }
    A.any = A.training.length + A.trainingWaiting.length + A.diagnostics.length + A.dxWaiting.length > 0 || !!(A.study && A.study.res.rows.length);
    memo = { key, A };
    return A;
  }

  /**
   * Every result with its verdict and gauge position: the one place verdicts are decided, used by
   * the cards, the glance and the test profiles (tools/profiles/run.js). Gauge units: tune points
   * (practice), SEMs better = positive (check-ups, study), within-module SDs (context).
   * kind: train | dx | study | ctx | wait. est: the model's own estimate in its own units.
   */
  function rows(A) {
    const out = [];
    for (const { mod, ch } of A.training)
      out.push({
        key: 'train:' + mod.id,
        kind: 'train',
        id: mod.id,
        verdict: verdictOf(ch.lo, ch.hi, ['Clear improvement', 'No clear change yet', 'Clear decline']),
        mean: ch.mean * 100,
        lo: ch.lo * 100,
        hi: ch.hi * 100,
        n: ch.n,
        p: ch.pImproved,
        est: { mean: ch.mean, lo: ch.lo, hi: ch.hi },
      });
    for (const w of A.trainingWaiting) out.push({ key: 'train:' + w.mod.id, kind: 'wait', id: w.mod.id, verdict: { cls: 'wait' }, n: w.n });
    if (A.study)
      for (const r of A.study.res.rows)
        out.push({
          key: `study:${r.probe}:${r.key}`,
          kind: 'study',
          id: r.probe,
          measure: r.key,
          arm: r.arm,
          verdict: verdictOf(r.lo / r.S, r.hi / r.S, [`Group ${r.arm} helped more`, 'No clear difference yet', 'Other groups helped more']),
          mean: r.mean / r.S,
          lo: r.lo / r.S,
          hi: r.hi / r.S,
          n: r.n,
          p: r.pSpecific,
          est: { mean: r.mean, lo: r.lo, hi: r.hi },
          S: r.S,
        });
    for (const { d, r } of A.diagnostics) {
      const dir = r.better === 'lower' ? -1 : 1;
      const lo = Math.min(dir * r.lo, dir * r.hi) / r.sem;
      const hi = Math.max(dir * r.lo, dir * r.hi) / r.sem;
      out.push({
        key: `dx:${d.id}:${r.key}`,
        kind: 'dx',
        id: d.id,
        measure: r.key,
        verdict: verdictOf(lo, hi, ['Clear improvement', 'No clear change yet', 'Clear decline']),
        mean: (dir * r.mean) / r.sem,
        lo,
        hi,
        n: r.n,
        p: r.pImproved,
        est: { mean: r.mean, lo: r.lo, hi: r.hi },
        better: r.better,
        S: r.sem,
      });
    }
    for (const w of A.dxWaiting) out.push({ key: 'dx:' + w.d.id + (w.key ? ':' + w.key : ''), kind: 'wait', id: w.d.id, measure: w.key || null, verdict: { cls: 'wait' }, n: w.n });
    for (const r of A.context.filter((x) => x.enough))
      out.push({
        key: 'ctx:' + r.field,
        kind: 'ctx',
        id: r.field,
        verdict: r.clear ? { text: r.diff < 0 ? 'Clearly lower' : 'Clearly higher', cls: r.diff < 0 ? 'down' : 'up' } : { text: 'No clear difference', cls: '' },
        mean: r.diff,
        lo: r.ci[0],
        hi: r.ci[1],
        n: r.n,
        est: { mean: r.diff, lo: r.ci[0], hi: r.ci[1] },
      });
    return out;
  }
  // The verdict and gauge fields a card takes from its row.
  const fromRow = (x) => ({ verdict: x.verdict, mean: x.mean, lo: x.lo, hi: x.hi });

  /** Runs of one measure as chart points, with the run-in marked. */
  function measurePoints(runs, key) {
    const Cat = C();
    return runs
      .filter((r) => r.summary && Number.isFinite(r.summary[key]))
      .sort((a, b) => a.startedAt - b.startedAt)
      .map((r, i) => ({ t: r.startedAt, y: r.summary[key], hollow: i < Cat.RUNIN }));
  }

  // ------------------------------------------------------------------ view state

  // Kept across hub re-renders: which tab, which charts are open.
  const ui = { tab: 'res', open: new Set() };

  // ------------------------------------------------------------------ the card

  /**
   * c: { key, title, what, verdict, mean, lo, hi (gauge units, better = positive), span (the
   * section's shared scale), labels: [left, mid, right], says (html), foot (html), chart(el) }
   */
  function card(c) {
    const span = c.span || Math.max(Math.abs(c.lo), Math.abs(c.hi), 1e-9) * 1.15;
    const pos = (v) => Math.max(0, Math.min(100, 50 + (v / span) * 50));
    const el = dom(`<article class="r-card" id="r-${esc(c.key.replace(/[^a-z0-9]+/gi, '-'))}">
      <div class="r-head"><h3>${esc(c.title)}</h3><span class="r-verdict ${c.verdict.cls}">${icon(c.verdict.cls)}${esc(c.verdict.text)}</span></div>
      <p class="r-what">${esc(c.what)}</p>
      <div class="r-gauge" role="img" aria-label="${esc(c.aria || '')}">
        <span class="track"></span><span class="zero"></span>
        <span class="range" style="left:${pos(c.lo)}%;width:${pos(c.hi) - pos(c.lo)}%"></span>
        <span class="dot" style="left:${pos(c.mean)}%"></span>
      </div>
      <div class="r-gauge-labels"><span>${esc(c.labels[0])}</span><span>${esc(c.labels[1])}</span><span>${esc(c.labels[2])}</span></div>
      <p class="r-says">${c.says}</p>
      <div class="r-foot"><span>${c.foot || ''}</span>${c.chart ? '<button type="button" class="r-toggle" aria-expanded="false">Show chart</button>' : ''}</div>
    </article>`);
    if (c.chart) {
      const btn = el.querySelector('.r-toggle');
      const det = root.document.createElement('div');
      det.className = 'r-detail';
      det.hidden = true;
      el.appendChild(det);
      let built = false;
      const toggle = (open) => {
        det.hidden = !open;
        btn.textContent = open ? 'Hide chart' : 'Show chart';
        btn.setAttribute('aria-expanded', String(open));
        if (open) ui.open.add(c.key);
        else ui.open.delete(c.key);
        if (open && !built) {
          built = true;
          c.chart(det);
        }
      };
      btn.addEventListener('click', () => toggle(det.hidden));
      if (ui.open.has(c.key)) root.queueMicrotask(() => toggle(true));
    }
    return el;
  }

  const spanOf = (rows) => Math.max(1e-9, ...rows.flatMap((r) => [Math.abs(r.lo), Math.abs(r.hi)])) * 1.1;

  // ------------------------------------------------------------------ level chart

  /**
   * Every session or run (dots) and the smoothed true level with its 89% band.
   * pts: [{ t, y, hollow }]; path: [{ t, mean, lo, hi }]; shade: [{ from, to, label, own }].
   */
  function levelChart(host, { pts, path, fmtY, yName, shade = [], keys = ['dot', 'level'], dotLabel = 'session', ownLabel = '' }) {
    const doc = root.document;
    const box = doc.createElement('div');
    box.className = 'r-chart';
    host.appendChild(box);
    const tip = doc.createElement('div');
    tip.className = 'r-tip';
    // The level at time t, from the path (interpolated when long series were thinned).
    const at = (t) => {
      let i = 0;
      while (i < path.length - 1 && path[i + 1].t <= t) i++;
      const a = path[i];
      const b = path[Math.min(i + 1, path.length - 1)];
      const f = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 0;
      const mix = (k) => a[k] + f * (b[k] - a[k]);
      return { t, mean: mix('mean'), lo: mix('lo'), hi: mix('hi') };
    };
    function draw() {
      const W = Math.max(260, box.clientWidth || host.clientWidth || 600);
      const H = W < 480 ? 220 : 250;
      const m = { l: 60, r: 14, t: shade.length ? 26 : 12, b: 30 };
      let t0 = Math.min(...pts.map((p) => p.t));
      let t1 = Math.max(...pts.map((p) => p.t));
      for (const s of shade) {
        t0 = Math.min(t0, s.from);
        t1 = Math.max(t1, Math.min(s.to, t1 + 3 * DAY));
      }
      const tp = (t1 - t0) * 0.03 || DAY;
      t0 -= tp;
      t1 += tp;
      const ys = pts.map((p) => p.y).concat(path.flatMap((p) => [p.lo, p.hi]));
      let y0 = Math.min(...ys);
      let y1 = Math.max(...ys);
      const yp = (y1 - y0) * 0.08 || 1;
      const yt = niceTicks(y0 - yp, y1 + yp, 4);
      y0 = Math.min(y0 - yp, yt[0]);
      y1 = Math.max(y1 + yp, yt[yt.length - 1]);
      const X = (t) => m.l + ((t - t0) / (t1 - t0)) * (W - m.l - m.r);
      const Y = (v) => m.t + (1 - (v - y0) / (y1 - y0)) * (H - m.t - m.b);
      const days = (t1 - t0) / DAY;
      const every = [1, 2, 3, 7, 14, 21, 28, 56, 91, 182].find((k) => days / k <= (W - m.l - m.r) / 100) || 365;
      const first = new Date(t0);
      first.setHours(0, 0, 0, 0);
      const xt = [];
      for (let t = first.getTime() + DAY; t < t1; t += every * DAY) if (t > t0) xt.push(t);
      const sh = shade
        .map((s) => {
          const a = X(Math.max(s.from, t0));
          const b = X(Math.min(s.to, t1));
          if (b <= a) return '';
          return `<rect x="${a}" y="${m.t}" width="${b - a}" height="${H - m.t - m.b}" fill="var(--cyan)" opacity="${s.own ? 0.09 : 0}"/>
            <line x1="${a}" x2="${a}" y1="${m.t - 18}" y2="${H - m.b}" stroke="var(--line-hot)" stroke-dasharray="2 3"/>
            <text x="${a + 5}" y="${m.t - 7}" font-size="13" fill="${s.own ? 'var(--cyan)' : 'var(--dim)'}">${esc(s.label)}</text>`;
        })
        .join('');
      const band =
        path.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)},${Y(p.hi).toFixed(1)}`).join('') +
        path
          .slice()
          .reverse()
          .map((p) => `L${X(p.t).toFixed(1)},${Y(p.lo).toFixed(1)}`)
          .join('') +
        'Z';
      const line = path.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)},${Y(p.mean).toFixed(1)}`).join('');
      const dots = pts
        .map((p) =>
          p.hollow
            ? `<circle cx="${X(p.t)}" cy="${Y(p.y)}" r="4" fill="var(--panel)" stroke="var(--dim)" stroke-width="1.5"/>`
            : `<circle cx="${X(p.t)}" cy="${Y(p.y)}" r="4" fill="var(--text)" opacity="0.6"/>`
        )
        .join('');
      box.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(yName)} over time, with the estimated true level and its likely range">
        ${sh}
        ${yt.map((v) => `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${m.l - 8}" y="${Y(v) + 4}" font-size="12" text-anchor="end" fill="var(--dim)">${esc(minus(fmtY(v, true)))}</text>`).join('')}
        ${xt.map((t) => `<text x="${X(t)}" y="${H - 9}" font-size="12" text-anchor="middle" fill="var(--dim)">${esc(fmtDay(t))}</text>`).join('')}
        <line x1="${m.l}" x2="${W - m.r}" y1="${H - m.b}" y2="${H - m.b}" stroke="var(--line-hot)"/>
        <path d="${band}" fill="var(--cyan)" opacity="0.16"/>
        <path d="${line}" fill="none" stroke="var(--cyan)" stroke-width="2" stroke-linejoin="round"/>
        ${dots}
        <g class="hov" style="display:none">
          <line class="hx" y1="${m.t}" y2="${H - m.b}" stroke="var(--dim)" stroke-dasharray="2 2"/>
          <circle class="hm" r="5" fill="var(--cyan)" stroke="var(--panel)" stroke-width="2"/>
          <circle class="hd" r="6" fill="none" stroke="var(--text)" stroke-width="1.5"/>
        </g>
        <rect x="${m.l}" y="0" width="${W - m.l - m.r}" height="${H}" fill="transparent"/>
      </svg>`;
      box.appendChild(tip);
      const svg = box.querySelector('svg');
      const g = svg.querySelector('.hov');
      const move = (ev) => {
        const rect = svg.getBoundingClientRect();
        const px = ev.clientX - rect.left;
        let k = 0;
        for (let i = 1; i < pts.length; i++) if (Math.abs(X(pts[i].t) - px) < Math.abs(X(pts[k].t) - px)) k = i;
        const p = pts[k];
        const q = at(p.t);
        g.style.display = '';
        for (const a of ['x1', 'x2']) g.querySelector('.hx').setAttribute(a, X(p.t));
        g.querySelector('.hm').setAttribute('cx', X(q.t));
        g.querySelector('.hm').setAttribute('cy', Y(q.mean));
        g.querySelector('.hd').setAttribute('cx', X(p.t));
        g.querySelector('.hd').setAttribute('cy', Y(p.y));
        tip.innerHTML = `<b>${esc(new Date(p.t).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }))}</b>${p.hollow ? ' <span>(warm-up)</span>' : ''}<br>
          <span>This ${esc(dotLabel)}:</span> <b>${esc(minus(fmtY(p.y)))}</b><br>
          <span>Estimated true level:</span> <b>${esc(minus(fmtY(q.mean)))}</b><br><span>likely ${esc(minus(fmtY(q.lo)))} to ${esc(minus(fmtY(q.hi)))}</span>`;
        tip.style.display = 'block';
        const tw = tip.offsetWidth;
        let left = X(p.t) + 14;
        if (left + tw > W) left = X(p.t) - 14 - tw;
        tip.style.left = Math.max(0, left) + 'px';
        tip.style.top = Math.max(0, Math.min(Y(q.mean), Y(p.y)) - 84) + 'px';
      };
      svg.addEventListener('pointermove', move);
      svg.addEventListener('pointerdown', move);
      svg.addEventListener('pointerleave', () => {
        g.style.display = 'none';
        tip.style.display = 'none';
      });
    }
    draw();
    if (root.ResizeObserver) {
      let last = box.clientWidth;
      new root.ResizeObserver(() => {
        if (box.isConnected && Math.abs(box.clientWidth - last) > 4) {
          last = box.clientWidth;
          draw();
        }
      }).observe(box);
    }
    const sw = {
      dot: `<svg width="10" height="10"><circle cx="5" cy="5" r="4" fill="var(--text)" opacity="0.6"/></svg>one ${esc(dotLabel)}`,
      hollow: '<svg width="10" height="10"><circle cx="5" cy="5" r="4" fill="none" stroke="var(--dim)" stroke-width="1.5"/></svg>warm-up run',
      level: '<svg width="24" height="12"><rect x="0" y="1" width="24" height="10" fill="var(--cyan)" opacity="0.16"/><line x1="0" x2="24" y1="6" y2="6" stroke="var(--cyan)" stroke-width="2"/></svg>estimated true level (band: likely range)',
      own: `<svg width="14" height="12"><rect width="14" height="12" fill="var(--cyan)" opacity="0.16"/></svg>${esc(ownLabel)}`,
    };
    host.appendChild(dom(`<div class="r-key">${keys.map((k) => `<span>${sw[k]}</span>`).join('')}</div>`));
  }

  // ------------------------------------------------------------------ "Your results"

  function section(title, lede, cards, extra) {
    const s = dom(`<section class="r-section"><h2>${esc(title)}</h2>${lede ? `<p class="r-lede">${lede}</p>` : ''}</section>`);
    if (cards.length) {
      const wrap = root.document.createElement('div');
      wrap.className = 'r-cards';
      for (const c of cards) wrap.appendChild(c);
      s.appendChild(wrap);
    }
    if (extra) s.appendChild(dom(`<p class="r-note">${extra}</p>`));
    return s;
  }

  function resultsPane(A) {
    const Cat = C();
    const pane = root.document.createElement('div');
    const RW = new Map(rows(A).map((x) => [x.key, x]));
    const glance = [];
    const track = (group, c) => {
      glance.push({ group, name: c.title, verdict: c.verdict, short: shortOf(c.verdict.text), id: 'r-' + c.key.replace(/[^a-z0-9]+/gi, '-') });
      return card(c);
    };
    const waiting = (group, name, text) => glance.push({ group, name, verdict: { cls: 'wait' }, short: text, id: null });

    pane.appendChild(dom('<h2 class="r-details-head">Details</h2>'));
    pane.appendChild(
      dom(`<div class="r-howto"><h3>How to read these results</h3><ul>
        <li>Scores bounce around from day to day. Each result estimates your <b>true level</b>, the part that isn’t day-to-day luck, and how far it has moved.</li>
        <li>The <b>gauge</b> shows that change. The dot is the best estimate and the bar is the <b>likely range</b>. The middle line means no change; right is better. Gauges in the same section share a scale, so you can compare them.</li>
        <li>A clear verdict needs the whole likely range on one side of the line. Otherwise it says “no clear change yet”, which usually means “keep going”.</li>
      </ul></div>`)
    );

    // Practice games.
    const G1 = 'Practice games';
    const tSpan = spanOf(A.training.map(({ ch }) => ({ lo: ch.lo * 100, hi: ch.hi * 100 })));
    const tCards = A.training.map(({ mod, ser, ch }) => {
      const pts = (x) => x * 100;
      const words = ['higher', 'lower'];
      return track(G1, {
        key: 'train:' + mod.id,
        title: mod.name,
        what: MODULE_PLAIN[mod.id] || mod.tagline,
        ...fromRow(RW.get('train:' + mod.id)),
        span: tSpan,
        labels: ['← worse', 'no change', 'better →'],
        aria: `Change ${signed(pts(ch.mean))} points, likely ${signed(pts(ch.lo))} to ${signed(pts(ch.hi))}`,
        says: `Your score went from <b>${Math.round(pts(ch.first))}</b> to <b>${Math.round(pts(ch.latest))}</b> (out of 100). Allowing for day-to-day ups and downs, your true level is about <b>${esc(change(pts(ch.mean), 'tune', words))}</b> than when you started, likely ${esc(rangeWords(pts(ch.lo), pts(ch.hi), 'tune', words))}.`,
        foot: `${ch.n} sessions · chance it went up: ${pctChance(ch.pImproved)}`,
        chart: (el) => {
          el.appendChild(dom('<p class="r-cap">Score (0–100) for each session. Higher is better.</p>'));
          levelChart(el, { pts: ser.points.map((p) => ({ t: p.t, y: pts(p.v) })), path: ch.path().map((p) => ({ t: p.t, mean: pts(p.mean), lo: pts(p.lo), hi: pts(p.hi) })), fmtY: (v) => String(Math.round(v)), yName: 'Score' });
        },
      });
    });
    for (const w of A.trainingWaiting) waiting(G1, w.mod.name, `${w.n} of ${WW.trends.MIN_N} sessions`);
    const tNotes = [];
    if (A.trainingWaiting.length) tNotes.push(`Not enough sessions yet for ${A.trainingWaiting.map((w) => esc(w.mod.name)).join(', ')} (a result needs ${WW.trends.MIN_N}).`);
    if (A.flagged) tNotes.push(`${A.flagged} session${A.flagged === 1 ? ' was' : 's were'} left out because ${A.flagged === 1 ? 'it' : 'they'} looked rushed or interrupted.`);
    if (tCards.length || tNotes.length)
      pane.appendChild(section(G1, 'How your score in each game has changed since your first session. Getting better at a game includes learning the game itself; the <b>check-up tests</b> show whether it carries over.', tCards, tNotes.join(' ')));

    // The study.
    if (A.study) {
      const { study, res, runsByProbe, offN } = A.study;
      const G2 = `Your experiment (${res.periodsDone} of 6 periods)`;
      const S = WW.study;
      const bnd = S.boundaries(study);
      const arm = (id) => S.ARMS.find((a) => a.id === id);
      const order = S.ARMS.map((a) => a.id);
      const rows = res.rows.slice().sort((a, b) => order.indexOf(a.arm) - order.indexOf(b.arm));
      const sSpan = spanOf(rows.map((r) => ({ lo: r.lo / r.S, hi: r.hi / r.S })));
      const sCards = rows.map((r) => {
        const d = Cat.PROBES.find((x) => x.id === r.probe);
        const pm = MEASURE_PLAIN[`${r.probe}:${r.key}`] || { what: r.label, unit: r.unit || 'units', words: ['better', 'worse'] };
        const words = ['more', 'less'];
        return track(G2, {
          key: `study:${r.probe}:${r.key}`,
          title: `${d.name}${(WW.reliable.MEASURES[r.probe] || []).length > 1 ? ': ' + r.label : ''}`,
          what: `${pm.what} Linked to group ${r.arm} (${arm(r.arm).name}).`,
          ...fromRow(RW.get(`study:${r.probe}:${r.key}`)),
          span: sSpan,
          labels: ['← other groups helped more', 'same', `group ${r.arm} helped more →`],
          aria: `Difference per period ${signed(r.mean / r.S, 1)} SEM`,
          says: `In each period spent on group ${r.arm} games, this test improved by about <b>${esc(change(r.mean, pm.unit, words))}</b> than in a period on other games, likely ${esc(rangeWords(r.lo, r.hi, pm.unit, words))}.`,
          foot: `${r.n} test runs · chance group ${r.arm} helped more: ${pctChance(r.pSpecific)}`,
          chart: (el) => {
            const dx = WW.reliable.change(r.probe, runsByProbe[r.probe]).find((x) => x.key === r.key);
            const pts = measurePoints(runsByProbe[r.probe], r.key);
            if (!dx || pts.length < 2) return el.appendChild(dom('<p class="r-cap">Not enough runs to draw yet.</p>'));
            const shade = study.order.map((a, i) => ({ from: bnd[i], to: bnd[i + 1], label: `Period ${i + 1}: ${a}`, own: a === r.arm })).filter((s) => s.from <= Date.now());
            el.appendChild(dom(`<p class="r-cap">${esc(cap(r.label))} for each test run. ${r.better === 'lower' ? 'Lower' : 'Higher'} is better. Shaded: periods spent on group ${r.arm} games.</p>`));
            levelChart(el, { pts, path: dx.path(), fmtY: rawFmt(r.unit, pts[0].y), yName: r.label, shade, keys: ['dot', 'hollow', 'level', 'own'], dotLabel: 'test run', ownLabel: `group ${r.arm} period` });
          },
        });
      });
      const groups = S.ARMS.map((a) => `${a.id}: ${esc(a.name)}`).join(' · ');
      const rz = res.randomization;
      const final = rz
        ? ` <b>Final check:</b> across all the tests together, ${Math.round(rz.p * rz.orders)} of the ${rz.orders} orders the draw could have picked ${Math.round(rz.p * rz.orders) === 1 ? 'gives' : 'give'} a result at least this strong (yours included). The fewer, the less likely it is chance; 1 of ${rz.orders} is the strongest possible.`
        : ' A final check across all the tests runs after the sixth period.';
      if (!sCards.length) waiting(G2, 'All linked tests', 'from the end of period 2');
      pane.appendChild(
        section(
          G2,
          `You train one group of games at a time, each group twice, in a random order (${groups}). If a group’s training carries over, the check-up tests linked to it should improve more during that group’s periods. This experiment can only spot <b>fairly large</b> effects, so “no clear difference” is common even when training helps a little.${final}`,
          sCards,
          [
            sCards.length ? '' : 'Results appear once each kind of period has been completed, so from the end of period 2.',
            offN ? `${offN} practice session${offN === 1 ? '' : 's'} in finished periods ${offN === 1 ? 'was a game' : 'were games'} from another group, which blurs the comparison a little.` : '',
          ]
            .filter(Boolean)
            .join(' ')
        )
      );
    }

    // Check-up tests.
    const G3 = 'Check-up tests';
    const zOf = ({ r }) => {
      const dir = r.better === 'lower' ? -1 : 1;
      return { mean: (dir * r.mean) / r.sem, lo: Math.min(dir * r.lo, dir * r.hi) / r.sem, hi: Math.max(dir * r.lo, dir * r.hi) / r.sem };
    };
    const dSpan = spanOf(A.diagnostics.map(zOf));
    const dCards = A.diagnostics.map((x) => {
      const { d, r, runs } = x;
      const pm = MEASURE_PLAIN[`${d.id}:${r.key}`] || { what: r.label, unit: r.unit || 'units', words: ['better', 'worse'] };
      const dir = r.better === 'lower' ? -1 : 1;
      const lo = Math.min(dir * r.lo, dir * r.hi);
      const hi = Math.max(dir * r.lo, dir * r.hi);
      const fmt = rawFmt(r.unit, r.first);
      return track(G3, {
        key: `dx:${d.id}:${r.key}`,
        title: `${d.name}${(WW.reliable.MEASURES[d.id] || []).length > 1 ? ': ' + r.label : ''}`,
        what: pm.what,
        ...fromRow(RW.get(`dx:${d.id}:${r.key}`)),
        span: dSpan,
        labels: ['← worse', 'no change', 'better →'],
        aria: `Change: ${change(dir * r.mean, pm.unit, pm.words)}`,
        says: `First run <b>${esc(fmt(r.first))}</b>, latest <b>${esc(fmt(r.latest))}</b>. Allowing for run-to-run noise and for getting used to the test, your true level is about <b>${esc(change(dir * r.mean, pm.unit, pm.words))}</b> than at the start, likely ${esc(rangeWords(lo, hi, pm.unit, pm.words))}.`,
        foot: `${r.n} runs · chance it improved: ${pctChance(r.pImproved)}`,
        chart: (el) => {
          el.appendChild(dom(`<p class="r-cap">${esc(cap(r.label))} for each test run. ${r.better === 'lower' ? 'Lower' : 'Higher'} is better. The first ${Cat.RUNIN} runs are warm-ups; the line allows for getting used to the test, so they can sit off it.</p>`));
          levelChart(el, { pts: measurePoints(runs, r.key), path: r.path(), fmtY: fmt, yName: r.label, keys: ['dot', 'hollow', 'level'], dotLabel: 'test run' });
        },
      });
    });
    const wName = (w) => w.d.name + (w.label ? ': ' + w.label : '');
    for (const w of A.dxWaiting) waiting(G3, wName(w), `${w.need > Cat.RUNIN + 1 ? 'needs more runs' : 'warm-up'}: ${w.n} of ${w.need} runs`);
    const warm = A.dxWaiting.filter((w) => w.need <= Cat.RUNIN + 1);
    const more = A.dxWaiting.filter((w) => w.need > Cat.RUNIN + 1);
    const dNote =
      (warm.length ? `Still warming up: ${warm.map((w) => esc(wName(w))).join(', ')}. A result appears after the ${Cat.RUNIN} warm-up runs and one more, because before that getting used to a test and real change can’t be told apart. ` : '') +
      (more.length ? `Needs more runs: ${more.map((w) => esc(`${wName(w)} (${w.n} of ${w.need})`)).join(', ')}. Nobody has published how much ${more.length > 1 ? 'these vary' : 'this varies'} from one run to the next, so the app learns that from your own runs first.` : '');
    if (dCards.length || dNote)
      pane.appendChild(section(G3, 'Short tests you never practise, repeated every few weeks. They show whether training carries over to things you didn’t train on.', dCards, dNote));

    // Sleep, mood…
    const G4 = 'Sleep, mood and your scores';
    const ctx = A.context.filter((r) => r.enough);
    const cSpan = spanOf(ctx.map((r) => ({ lo: r.ci[0], hi: r.ci[1] })));
    const cCards = ctx.map((r) => {
      const ps = SPLIT_PLAIN[r.field] || { name: r.label, low: r.lowLabel, high: r.highLabel };
      const x = (v) => Math.abs(v).toFixed(1);
      const [a, b] = r.ci;
      const likely = a >= 0 || b <= 0 ? `likely between ${x(Math.min(Math.abs(a), Math.abs(b)))} and ${x(Math.max(Math.abs(a), Math.abs(b)))} times` : `likely anywhere from ${x(a)} times lower to ${x(b)} times higher`;
      return track(G4, {
        key: 'ctx:' + r.field,
        title: ps.name,
        what: `Scores ${ps.low} compared with ${ps.high}, across all games.`,
        ...fromRow(RW.get('ctx:' + r.field)),
        span: cSpan,
        labels: ['← lower', 'same', 'higher →'],
        aria: `${signed(r.diff, 2)} times the usual spread`,
        says: `Scores ${esc(ps.low)} were <b>${r.diff < 0 ? 'lower' : 'higher'}</b> by about <b>${x(r.diff)} times</b> your usual day-to-day spread (${likely}).`,
        foot: `${r.n[0]} sessions ${esc(ps.low)} · ${r.n[1]} ${esc(ps.high)}`,
      });
    });
    if (A.training.length || cCards.length)
      pane.appendChild(
        section(
          G4,
          'From your daily check-ins. These compare days; they can’t say what caused a difference.',
          cCards,
          cCards.length ? '' : 'Needs at least 5 sessions on each side of a comparison, for example 5 after short sleep and 5 after normal sleep. Check in on the Ops tab.'
        )
      );

    pane.prepend(glancePanel(glance));
    return pane;
  }

  function glancePanel(items) {
    const groups = [...new Set(items.map((x) => x.group))];
    const count = (xs) => {
      const n = (c) => xs.filter((x) => x.verdict.cls === c).length;
      const parts = [];
      if (n('up')) parts.push(`${n('up')} ▲`);
      if (n('down')) parts.push(`${n('down')} ▼`);
      if (n('')) parts.push(`${n('')} ○`);
      return parts.join(' · ');
    };
    const row = (x) =>
      x.id
        ? `<li><a class="g-row" href="#${x.id}">${icon(x.verdict.cls)}<span>${esc(x.name)}</span><span class="st ${x.verdict.cls}">${esc(x.short)}</span></a></li>`
        : `<li><span class="g-row wait">${icon('wait')}<span>${esc(x.name)}</span><span class="st">${esc(x.short)}</span></span></li>`;
    const el = dom(`<section class="r-glance" aria-label="At a glance">
      <h2>At a glance</h2>
      <div class="r-legend"><span>${icon('up')}clear improvement</span><span>${icon('')}no clear change yet</span><span>${icon('down')}clear decline</span>${
        items.some((x) => x.verdict.cls === 'wait') ? `<span>${icon('wait')}not enough data yet</span>` : ''
      }<span>Tap a task for details.</span></div>
      <div class="r-glance-grid">${groups
        .map((g) => {
          const xs = items.filter((x) => x.group === g);
          return `<div class="g-group"><h3>${esc(g)}<small>${esc(count(xs))}</small></h3><ul>${xs.map(row).join('')}</ul></div>`;
        })
        .join('')}</div>
    </section>`);
    el.addEventListener('click', (ev) => {
      const a = ev.target.closest('a.g-row');
      if (!a) return;
      ev.preventDefault();
      const target = root.document.getElementById(a.getAttribute('href').slice(1));
      if (!target) return;
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      target.classList.add('flash');
      setTimeout(() => target.classList.remove('flash'), 1400);
    });
    return el;
  }

  // ------------------------------------------------------------------ "Technical report"

  /** Rows on one shared axis: posterior mean and 89% interval. rows: [{ name, sub, mean, lo, hi, num }] */
  function forest(rows, axisLabel) {
    let lo = 0;
    let hi = 0;
    for (const r of rows) {
      lo = Math.min(lo, r.lo);
      hi = Math.max(hi, r.hi);
    }
    const pad = (hi - lo) * 0.06 || 1;
    lo -= pad;
    hi += pad;
    const ticks = niceTicks(lo, hi, 5);
    const x = (v) => ((v - lo) / (hi - lo)) * 100;
    const grid = ticks.map((t) => `<span class="fg${t === 0 ? ' z' : ''}" style="left:${x(t)}%"></span>`).join('');
    return dom(`<ul class="r-forest">${rows
      .map(
        (r) => `<li><span class="f-name">${esc(r.name)}${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</span>
          <span class="f-plot">${grid}<span class="f-ci" style="left:${x(r.lo)}%;width:${x(r.hi) - x(r.lo)}%"></span><span class="f-dot" style="left:${x(r.mean)}%"></span></span>
          <span class="f-num">${r.num}</span></li>`
      )
      .join('')}<li class="f-axis"><span></span><span class="f-plot">${ticks.map((t) => `<span class="f-tick${t === 0 ? ' z' : ''}" style="left:${x(t)}%">${esc(minus(String(t)))}</span>`).join('')}</span><span class="f-num">${esc(axisLabel)}</span></li></ul>`);
  }

  function techPane(A) {
    const Cat = C();
    const R = WW.reliable;
    const pane = root.document.createElement('div');
    pane.className = 'r-tech';
    pane.appendChild(
      dom(`<div><h2>Technical report</h2>
        <p>The models behind the results tab. Derivations: <code>docs/RELIABLE_CHANGE.md</code>, <code>docs/STUDY.md</code>. The simulation study that chose the defaults: <code>docs/SIMULATION.md</code>.</p>
        <h3>Terms used on the results tab</h3>
        <dl>
          <dt>True level</dt><dd>The latent level in a local-level (random walk plus linear trend) state-space model; observed scores are true level plus noise.</dd>
          <dt>Likely range</dt><dd>89% central credible interval of the posterior, mixed over a grid of noise and drift values.</dd>
          <dt>Chance it improved</dt><dd>Posterior probability that the change is in the better direction.</dd>
          <dt>Clear improvement / decline</dt><dd>The 89% interval excludes zero. Otherwise “no clear change yet”.</dd>
          <dt>Gauges</dt><dd>One symmetric scale per section. Practice games: tune points. Check-up tests and the experiment: SEMs, better = right (the sentences stay in raw units). Sleep, mood…: within-module SDs.</dd>
          <dt>Usual spread</dt><dd>Within-module SD of session scores (the context comparisons are in these units).</dd>
          <dt>Warm-up runs</dt><dd>The first ${Cat.RUNIN} runs of each check-up test (run-in). Estimates appear from run ${Cat.RUNIN + 1}; for measures with no published retest data (backward Corsi, the spatial Stroop), from run 15.</dd>
          <dt>Chart lines</dt><dd>Smoothed posterior of the level at each session given all sessions (the same filter with a fixed copy of the level at that session), mixed over the same grid weights; series longer than 80 are evaluated at 80 points. In the experiment charts the line is the check-up model’s level, for reading; the result itself comes from the phase-slope model.</dd>
        </dl>
        <h3>Models</h3>
        <dl>
          <dt>Practice games</dt><dd>Local level plus linear trend on each module’s 0–1 tune score; trend prior SD 1 tune scale per 30 days. ${
            A.pooled ? 'The noise/drift grid prior is pooled across modules (NPMLE by EM).' : 'The noise/drift grid prior is flat; it is pooled across modules (NPMLE by EM) once 3 modules have 5+ sessions.'
          } ${A.flagged} session(s) flagged as careless are excluded. Simulation round 2.</dd>
          <dt>Check-up tests</dt><dd>Local level plus linear trend (prior SD 10 SEMs per 30 days). Noise prior centred on the published retest SEM, worth ${R.NU0} runs, scaled to our test length; the item tests use Lord’s binomial error plus half-normal overdispersion (scale 0.5 SEM). Practice offset SD 1 SEM, fading as exp(−k). Simulation round 4.</dd>
          <dt>Experiment</dt><dd>Local level plus two phase slopes (own-arm and other-arm gain per period, flat priors). Headline: randomization test over the 24 possible orders, after period 6. Simulation round 1: the combined test found an arm-specific gain of 1 SEM per period about 70% of the time and 0.5 SEM about 30%.</dd>
          <dt>Sleep, mood…</dt><dd>Scores z-scored within module and pooled; difference of means with a percentile bootstrap 89% interval (2,000 resamples); needs 5+ sessions per side.</dd>
        </dl></div>`)
    );
    pane.appendChild(dom('<h2>All results on one scale</h2>'));
    pane.appendChild(dom('<p>Posterior mean [89% interval]. Check-up tests and the experiment are in SEMs of each measure, signed so that better is positive, so measures in ms and in items can be compared.</p>'));

    if (A.training.length) {
      pane.appendChild(dom('<h3>Practice games: change in tune points (0–100)</h3>'));
      pane.appendChild(
        forest(
          A.training.map(({ mod, ch }) => ({
            name: mod.name,
            sub: `n = ${ch.n}${ch.pooled ? ', pooled prior' : ''}`,
            mean: ch.mean * 100,
            lo: ch.lo * 100,
            hi: ch.hi * 100,
            num: `<b>${signed(ch.mean * 100, 1)}</b> [${signed(ch.lo * 100, 1)}, ${signed(ch.hi * 100, 1)}]<small>P(up) ${fmtP(ch.pImproved)} · noise SD ${(ch.noise * 100).toFixed(1)}</small>`,
          })),
          'tune points'
        )
      );
    }

    if (A.study) {
      const { res, off, offN } = A.study;
      const rz = res.randomization;
      pane.appendChild(dom('<h3>Experiment: own − other gain per period, SEMs</h3>'));
      pane.appendChild(
        dom(
          `<p>${res.periodsDone} of 6 periods complete. ${
            rz ? `Randomization test: statistic ${rz.stat.toFixed(2)}, p = ${rz.p.toFixed(3)} (${rz.orders} orders; smallest possible ${(1 / rz.orders).toFixed(3)}).` : 'Randomization test: after period 6 (smallest possible p = 1/24 ≈ 0.042).'
          }${offN ? ` Off-arm training sessions in completed periods: ${off.map((x, k) => `period ${k + 1}: ${x}`).filter((_, k) => off[k]).join(', ')}.` : ''}</p>`
        )
      );
      if (res.rows.length)
        pane.appendChild(
          forest(
            res.rows.map((r) => ({
              name: Cat.PROBES.find((d) => d.id === r.probe).name,
              sub: `${r.label} · arm ${r.arm} · n = ${r.n}`,
              mean: r.mean / r.S,
              lo: r.lo / r.S,
              hi: r.hi / r.S,
              num: `<b>${signed(r.mean / r.S, 2)}</b> [${signed(r.lo / r.S, 2)}, ${signed(r.hi / r.S, 2)}]<small>P(&gt;0) ${fmtP(r.pSpecific)} · own ${signed(r.own.mean / r.S, 2)}, other ${signed(r.other.mean / r.S, 2)} · SEM ${r.S.toFixed(r.S < 10 ? 2 : 0)}</small>`,
            })),
            'SEMs per period'
          )
        );
    }

    if (A.diagnostics.length) {
      pane.appendChild(dom('<h3>Check-up tests: change since the first run, SEMs</h3>'));
      pane.appendChild(
        forest(
          A.diagnostics.map(({ d, r, runs }) => {
            const dir = r.better === 'lower' ? -1 : 1;
            const z = (v) => (dir * v) / r.sem;
            const lo = Math.min(z(r.lo), z(r.hi));
            const hi = Math.max(z(r.lo), z(r.hi));
            const f = (v) => (v < 10 ? v.toFixed(2) : String(Math.round(v)));
            const noise = r.noise != null ? ` · noise ${f(r.noise)} (prior ${f(r.noisePrior)})` : r.extra != null ? ` · extra noise ${f(r.extra)}` : '';
            return {
              name: d.name,
              sub: `${r.label} · n = ${r.n} · ${isoDay(runs[0].startedAt)} to ${isoDay(runs[runs.length - 1].startedAt)}`,
              mean: z(r.mean),
              lo,
              hi,
              num: `<b>${signed(z(r.mean), 2)}</b> [${signed(lo, 2)}, ${signed(hi, 2)}]<small>P(better) ${fmtP(r.pImproved)} · SEM ${f(r.sem)}${noise} · ${esc(r.source)}</small>`,
            };
          }),
          'SEMs (better = positive)'
        )
      );
    }

    const ctx = A.context.filter((r) => r.enough);
    if (ctx.length) {
      pane.appendChild(dom('<h3>Context: low side minus high side, within-module SDs</h3>'));
      pane.appendChild(
        forest(
          ctx.map((r) => ({
            name: r.label,
            sub: `${r.lowLabel} vs ${r.highLabel} · n = ${r.n[0]} vs ${r.n[1]}`,
            mean: r.diff,
            lo: r.ci[0],
            hi: r.ci[1],
            num: `<b>${signed(r.diff, 2)}</b> [${signed(r.ci[0], 2)}, ${signed(r.ci[1], 2)}]<small>percentile bootstrap</small>`,
          })),
          'SD'
        )
      );
    }
    return pane;
  }

  // ------------------------------------------------------------------ the view

  /** The Results section for the hub. ctx: { sessions, study }. */
  function view({ sessions, study }) {
    const A = analyse(sessions, study);
    const sec = dom(`<section class="section results"><h2>Results</h2>
      <div class="r-tabs" role="tablist" aria-label="Results views">
        <button type="button" role="tab" data-tab="res">Your results</button>
        <button type="button" role="tab" data-tab="tech">Technical report</button>
      </div>
      <div class="r-pane" data-pane="res" role="tabpanel"></div>
      <div class="r-pane" data-pane="tech" role="tabpanel"></div>
    </section>`);
    if (!A.any) {
      sec.querySelector('.r-tabs').remove();
      sec.querySelector('[data-pane="tech"]').remove();
      sec.querySelector('[data-pane="res"]').appendChild(dom('<p class="muted">No results yet. They build up here as you play the practice games and run the check-up tests.</p>'));
      return sec;
    }
    const panes = { res: sec.querySelector('[data-pane="res"]'), tech: sec.querySelector('[data-pane="tech"]') };
    const built = { res: false, tech: false };
    const show = (id) => {
      ui.tab = id;
      for (const b of sec.querySelectorAll('.r-tabs button')) b.setAttribute('aria-selected', String(b.dataset.tab === id));
      for (const [k, p] of Object.entries(panes)) p.hidden = k !== id;
      if (!built[id]) {
        built[id] = true;
        panes[id].appendChild(id === 'res' ? resultsPane(A) : techPane(A));
      }
    };
    sec.querySelector('.r-tabs').addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-tab]');
      if (b) show(b.dataset.tab);
    });
    show(ui.tab);
    return sec;
  }

  WW.results = { view, analyse, rows, MODULE_PLAIN, MEASURE_PLAIN, SPLIT_PLAIN, _text: { amount, change, rangeWords, verdictOf, shortOf } };
})(globalThis);
