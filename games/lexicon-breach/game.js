/* Lexicon Breach (COLD STORAGE / SCHEDULER): verbal fluency.
 *
 * Crack a passphrase by pulling words out of memory under a constraint,
 * 60 seconds per lock. Four locks per session:
 *  1. Letter   words that start with a letter (phonemic fluency, the FAS
 *              task; Benton & Hamsher 1976).
 *  2. Category members of a category (semantic fluency). Scored for
 *              clustering and switching (Troyer, Moscovitch & Winocur 1997).
 *  3. Switch   alternate between two letters (switching fluency, after
 *              D-KEFS; Delis, Kaplan & Kramer 2001).
 *  4. Mask     words fitting a letter pattern, rarer as the level rises.
 * Standard scoring: no repeats, no variants of an earlier word (cat/cats,
 * run/running), no proper nouns. Each lock has its own level (1-12): meet
 * the quota to go up, fall well short to go down.
 * Evidence: fluency is a sensitive measure of retrieval and executive
 * control, but training gains are mostly task-specific. Grade C.
 *
 * Words are checked against the ENABLE list (data/enable.js, loaded on
 * demand) and the authored category lists. The game never displays a
 * dictionary word the player did not type; examples come only from the
 * curated category lists.
 */
(function (root) {
  'use strict';
  const WW = root.WW;

  const ROUND_MS = 60000;
  const MAX_LEVEL = 12;
  const TYPES = ['letter', 'category', 'switch', 'mask'];
  const LETTERS = [
    ['s', 'c', 'p', 'b', 't', 'm', 'f', 'a', 'd', 'r'],
    ['h', 'g', 'l', 'w', 'e', 'n', 'o'],
    ['i', 'u', 'v', 'j', 'k', 'y'],
  ];
  const IRREGULAR = { mice: 'mouse', geese: 'goose', lice: 'louse', oxen: 'ox', men: 'man', women: 'woman', children: 'child', people: 'person', dice: 'die', teeth: 'tooth', feet: 'foot' };

  // Script URL captured at load so the dictionary path works from the hub and the standalone page.
  const SCRIPT_SRC = root.document && root.document.currentScript ? root.document.currentScript.src : null;
  let lexiconPromise = null;
  function loadLexicon() {
    if (WW.lexicon) return Promise.resolve(WW.lexicon);
    if (!lexiconPromise) {
      lexiconPromise = new Promise((resolve, reject) => {
        const s = root.document.createElement('script');
        s.src = new URL('../../data/enable.js', SCRIPT_SRC || root.location.href).href;
        s.onload = () => (WW.lexicon ? resolve(WW.lexicon) : reject(new Error('lexicon did not register')));
        s.onerror = () => {
          lexiconPromise = null;
          reject(new Error('could not load data/enable.js'));
        };
        root.document.head.appendChild(s);
      });
    }
    return lexiconPromise;
  }

  /** Lowercase, drop hyphens/apostrophes, collapse spaces. */
  const normalize = (s) =>
    String(s || '')
      .toLowerCase()
      .replace(/[-'’]/g, '')
      .replace(/[^a-z ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  /** Crude inflectional stem for the "no variants" rule. */
  function stem(word) {
    let w = word.replace(/ /g, '');
    if (IRREGULAR[w]) w = IRREGULAR[w];
    const strip = (suf, add = '') => {
      if (w.endsWith(suf) && w.length - suf.length >= 3) {
        w = w.slice(0, -suf.length) + add;
        return true;
      }
      return false;
    };
    strip('ies', 'y') || strip('ing') || strip('ed') || strip('es') || (!w.endsWith('ss') && strip('s'));
    if (w.length > 3 && w.endsWith('e')) w = w.slice(0, -1);
    if (/([^aeiou])\1$/.test(w) && w.length > 3) w = w.slice(0, -1);
    return w;
  }

  /** Candidate singular keys for list lookup (spaces removed). */
  function singulars(word) {
    const k = word.replace(/ /g, '');
    const out = [k];
    if (IRREGULAR[k]) out.push(IRREGULAR[k]);
    for (const [man, base] of [['men', 'man'], ['women', 'woman']]) if (k.endsWith(man)) out.push(k.slice(0, -man.length) + base);
    if (k.endsWith('ies')) out.push(k.slice(0, -3) + 'y');
    if (k.endsWith('ves')) out.push(k.slice(0, -3) + 'f', k.slice(0, -3) + 'fe');
    if (k.endsWith('es')) out.push(k.slice(0, -2));
    if (k.endsWith('s')) out.push(k.slice(0, -1));
    return out;
  }

  /** Map(key -> subcategory) for a category, keys with spaces removed. */
  function catIndex(cat) {
    if (cat._index) return cat._index;
    const m = new Map();
    for (const [sub, list] of Object.entries(cat.subs)) for (const x of list) if (!m.has(x.replace(/ /g, ''))) m.set(x.replace(/ /g, ''), sub);
    Object.defineProperty(cat, '_index', { value: m, enumerable: false });
    return m;
  }

  /** Lock spec for a type at a level. */
  function spec(type, level, rng, lex, cats, recent) {
    const L = Math.max(1, Math.min(MAX_LEVEL, Math.round(level)));
    const tier = (L - 1) % 3;
    const minLen = 3 + Math.floor((L - 1) / 3);
    const avoid = (pool, used) => {
      const fresh = pool.filter((x) => !(used || []).includes(x));
      return fresh.length ? fresh : pool;
    };
    if (type === 'letter') {
      const letter = rng.pick(avoid(LETTERS[tier], recent.letters));
      return { type, level: L, letter, minLen, quota: 10, prompt: `${letter.toUpperCase()}…`, rule: `Words starting with ${letter.toUpperCase()}, ${minLen}+ letters` };
    }
    if (type === 'switch') {
      const [a, b] = rng.sample(avoid(LETTERS[tier], recent.letters), 2);
      return { type, level: L, letters: [a, b], minLen, quota: 8, prompt: `${a.toUpperCase()} ⇄ ${b.toUpperCase()}`, rule: `Alternate: ${a.toUpperCase()} word, ${b.toUpperCase()} word, ${a.toUpperCase()} word… ${minLen}+ letters` };
    }
    if (type === 'category') {
      const ctier = 1 + Math.floor((L - 1) / 4);
      const pool = cats.filter((c) => c.tier === ctier).map((c) => c.id);
      const id = rng.pick(avoid(pool, recent.cats));
      const cat = cats.find((c) => c.id === id);
      const quota = [0, 12, 10, 8][ctier] + ((L - 1) % 4) * 2;
      return { type, level: L, category: id, quota, prompt: cat.name.toUpperCase(), rule: 'Name as many as you can' };
    }
    // mask
    const m = mask(rng, L, lex);
    return { type, level: L, ...m, minLen: 4, quota: 8, rule: m.rule + ', 4+ letters' };
  }

  /** Words (4+ letters) in the dictionary matching a mask. */
  const maskTest = (m) => (w) => w.length >= 4 && (!m.start || w.startsWith(m.start)) && (!m.end || w.endsWith(m.end)) && (!m.contains || w.indexOf(m.contains, m.start ? m.start.length : 0) >= 0);
  function maskCount(m, list) {
    const t = maskTest(m);
    let n = 0;
    for (const w of list) if (t(w)) n++;
    return n;
  }
  const maskTarget = (L) => 1600 * Math.pow(0.7, L - 1);

  /** Pick a mask whose dictionary match count is near the level's target. */
  function mask(rng, L, lex) {
    const list = lex.list();
    const target = maskTarget(L);
    const starts = 'sbcdfghlmprtw'.split('');
    const ends = 'tdyknrlhepg'.split('');
    const bigrams = ['ar', 'or', 'er', 'an', 'in', 'on', 'en', 'al', 'el', 'il', 'ra', 're', 'ro', 'ri', 'la', 'le', 'li', 'lo', 'st', 'nt', 'nd', 'ck', 'ch', 'sh', 'th', 'ng', 'rn', 'rm', 'mp', 'ft', 'ld', 'lk', 'pl', 'br', 'cr', 'gr', 'tr', 'oo', 'ee', 'ea', 'ou', 'ai', 'oa', 'ow', 'aw', 'ight', 'ump', 'ank', 'ell', 'ust', 'ash', 'ip', 'ot', 'ug'];
    let best = null;
    for (let i = 0; i < 40; i++) {
      const kind = L <= 3 ? rng.pick(['startEnd', 'contains']) : rng.pick(['startEnd', 'contains', 'startContains']);
      const m = {};
      if (kind !== 'contains') m.start = rng.pick(starts);
      if (kind === 'startEnd') m.end = rng.pick(ends.filter((e) => e !== m.start));
      if (kind !== 'startEnd') m.contains = rng.pick(bigrams);
      const n = maskCount(m, list);
      if (n < 12) continue;
      const err = Math.abs(Math.log(n / target));
      if (!best || err < best.err) best = { m, n, err };
      if (err < 0.25) break;
    }
    const { m, n } = best;
    const up = (s) => s.toUpperCase();
    const prompt = m.contains ? `${m.start ? up(m.start) : ''}…${up(m.contains)}…` : `${up(m.start)}…${up(m.end)}`;
    const rule = [m.start && `starts with ${up(m.start)}`, m.contains && `contains ${up(m.contains)}${m.start ? ' (after the first letter)' : ''}`, m.end && `ends with ${up(m.end)}`].filter(Boolean).join(', ');
    return { mask: m, matches: n, prompt, rule: rule[0].toUpperCase() + rule.slice(1) };
  }

  /**
   * Judge one entry against a lock and the words accepted so far.
   * state: { accepted: [{word, stem, key}], turn } (turn: switch rounds only)
   * Returns { ok, pending?, reason?, word, sub?, key, stem }.
   */
  function judge(raw, lock, state, lex, cats) {
    const word = normalize(raw);
    const res = { ok: false, word, key: word.replace(/ /g, ''), stem: stem(word) };
    if (!word) return Object.assign(res, { reason: 'empty' });
    if (lock.type === 'category') {
      const cat = cats.find((c) => c.id === lock.category);
      const idx = catIndex(cat);
      const hit = singulars(word).find((k) => idx.has(k));
      if (hit) {
        res.key = hit;
        res.sub = idx.get(hit);
      }
      if (state.accepted.some((a) => a.key === res.key)) return Object.assign(res, { reason: 'repeat' });
      const v = state.accepted.find((a) => a.stem === res.stem);
      if (v) return Object.assign(res, { reason: 'variant', of: v.word });
      if (hit) return Object.assign(res, { ok: true });
      if (word.split(' ').every((t) => lex.has(t))) return Object.assign(res, { ok: true, pending: true });
      return Object.assign(res, { reason: 'unknown' });
    }
    if (word.includes(' ')) return Object.assign(res, { reason: 'one word' });
    if (state.accepted.some((a) => a.key === res.key)) return Object.assign(res, { reason: 'repeat' });
    if (word.length < lock.minLen) return Object.assign(res, { reason: 'short' });
    if (lock.type === 'letter' && !word.startsWith(lock.letter)) return Object.assign(res, { reason: 'rule' });
    if (lock.type === 'mask' && !maskTest(lock.mask)(word)) return Object.assign(res, { reason: 'rule' });
    if (lock.type === 'switch') {
      const want = lock.letters[state.turn % 2];
      const other = lock.letters[(state.turn + 1) % 2];
      if (!word.startsWith(want)) return Object.assign(res, { reason: word.startsWith(other) ? 'switch' : 'rule' });
    }
    if (!lex.has(word)) return Object.assign(res, { reason: 'unknown' });
    const v = state.accepted.find((a) => a.stem === res.stem);
    if (v) return Object.assign(res, { reason: 'variant', of: v.word });
    return Object.assign(res, { ok: true });
  }

  /** Troyer-style clusters: runs of the same label. Size counts from the second word. */
  function clusters(labels) {
    if (!labels.length) return { switches: 0, meanClusterSize: 0, runs: 0 };
    const runs = [];
    for (const l of labels) {
      if (runs.length && l !== null && runs[runs.length - 1].l === l) runs[runs.length - 1].n++;
      else runs.push({ l, n: 1 });
    }
    return { switches: runs.length - 1, runs: runs.length, meanClusterSize: WW.stats.round(WW.stats.mean(runs.map((r) => r.n - 1)), 2) };
  }

  /** Next level after a round. */
  function nextLevel(level, valid, quota) {
    if (valid >= quota) return Math.min(MAX_LEVEL, level + 1);
    if (valid < Math.ceil(quota * 0.6)) return Math.max(1, level - 1);
    return level;
  }

  const REASONS = {
    empty: '',
    repeat: 'already used',
    variant: 'variant of',
    short: 'too short',
    rule: "doesn't fit the lock",
    switch: 'wrong letter: alternate',
    unknown: 'not in the lexicon',
    'one word': 'one word only',
  };

  WW.logic = WW.logic || {};
  WW.logic.lexiconBreach = { normalize, stem, singulars, catIndex, spec, mask, maskTest, maskCount, maskTarget, judge, clusters, nextLevel, loadLexicon, TYPES, LETTERS, MAX_LEVEL };

  WW.games.register({
    id: 'lexicon-breach',
    name: 'Lexicon Breach',
    headline: (s) => `${s.totalValid} words · ${s.breached}/4 locks · L${s.meanLevel}`,
    /** COLD tune: mean lock level, 1 -> 0, 12 -> 1. */
    tune(sessions) {
      const s = sessions[0] && sessions[0].summary;
      return s && Number.isFinite(s.meanLevel) ? WW.stats.clamp01((s.meanLevel - 1) / (MAX_LEVEL - 1)) : null;
    },
    mount(container, ctx) {
      const { h, clear } = ctx.ui;
      const T = ctx.timing;
      const S = WW.stats;
      const ac = new AbortController();
      const signal = ac.signal;
      const rng = ctx.rng;
      const cats = WW.lexiconCategories;

      /** One 60 s lock. Resolves with the round record, or null if aborted. */
      function playLock(lock, index, lex) {
        return new Promise((resolve) => {
          clear(container);
          const state = { accepted: [], turn: 0 };
          const log = [];
          const input = h('input.lb-input', { type: 'text', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: false, 'aria-label': 'word', enterkeyhint: 'send' });
          const form = h('form.lb-form', input, h('button.btn.primary', { type: 'submit' }, 'Enter'));
          const fill = h('div.lb-fill');
          const bar = h('div.lb-bar', fill);
          const clock = h('span.lb-clock', '60');
          const count = h('span', `0 / ${lock.quota}`);
          const fb = h('p.lb-feedback', { 'aria-live': 'polite' }, '');
          const words = h('div.lb-words');
          const turnEl = lock.type === 'switch' ? h('p.lb-turn', '') : null;
          const setTurn = () => turnEl && (turnEl.textContent = `Next: ${lock.letters[state.turn % 2].toUpperCase()}`);
          setTurn();
          container.appendChild(
            h(
              'div.center.lb-stage',
              h('p.label', `Lock ${index + 1} / 4 · ${lock.type} · level ${lock.level}`),
              h('p', { class: 'lb-prompt' + (lock.prompt.length > 9 ? ' long' : '') }, lock.prompt),
              h('p.muted', lock.rule),
              turnEl,
              h('div.row.lb-status', h('span', 'Cracked ', count), clock),
              bar,
              form,
              fb,
              words
            )
          );
          input.focus();
          const t0 = T.now();
          let last = t0;
          let finished = false;
          const tick = setInterval(() => {
            const left = Math.max(0, ROUND_MS - (T.now() - t0));
            clock.textContent = String(Math.ceil(left / 1000));
            if (left <= 10000) clock.classList.add('warn');
            if (left <= 0) end(false);
          }, 200);
          const valid = () => state.accepted.length;
          function end(aborted) {
            if (finished) return;
            finished = true;
            clearInterval(tick);
            input.disabled = true;
            resolve(aborted ? null : { lock, accepted: state.accepted, log });
          }
          form.addEventListener('submit', (e) => {
            e.preventDefault();
            if (finished) return;
            const raw = input.value;
            input.value = '';
            const now = T.now();
            const r = judge(raw, lock, state, lex, cats);
            if (r.reason === 'empty') return;
            const entry = { word: r.word, ok: r.ok, pending: !!r.pending, reason: r.reason || null, t: Math.round(now - t0), sub: r.sub || null };
            log.push(entry);
            ctx.session.trial({ condition: lock.type, stimulus: { prompt: lock.prompt, rule: lock.rule }, response: r.word, correct: r.ok, rt: Math.round(now - last), level: lock.level, reason: r.reason || (r.pending ? 'pending' : null), t: entry.t });
            last = now;
            if (r.ok) {
              state.accepted.push({ word: r.word, key: r.key, stem: r.stem, sub: r.sub || null, pending: !!r.pending, t: entry.t });
              if (lock.type === 'switch') state.turn++;
              setTurn();
              words.appendChild(h('span', { class: 'lb-word' + (r.pending ? ' pending' : '') }, r.word));
              const confirmed = state.accepted.filter((a) => !a.pending).length;
              count.textContent = `${confirmed}${valid() > confirmed ? '+' + (valid() - confirmed) + '?' : ''} / ${lock.quota}`;
              fill.style.width = Math.min(100, (100 * valid()) / lock.quota) + '%';
              fb.textContent = r.pending ? `${r.word}: not on Rook's list, you'll confirm it after` : '';
              fb.className = 'lb-feedback';
              ctx.audio.sfx('tick');
            } else {
              fb.textContent = `${r.word}: ${REASONS[r.reason]}${r.of ? ' ' + r.of : ''}`;
              fb.className = 'lb-feedback bad';
              ctx.audio.sfx('error');
            }
          });
          signal.addEventListener('abort', () => end(true));
        });
      }

      /** Ask the player to confirm category words not on the list. */
      function review(rec) {
        const pending = rec.accepted.filter((a) => a.pending);
        if (!pending.length || signal.aborted) return Promise.resolve();
        const cat = cats.find((c) => c.id === rec.lock.category);
        return new Promise((resolve) => {
          clear(container);
          const toggles = pending.map((a) => {
            const b = h('button.btn.lb-toggle', { type: 'button', 'aria-pressed': 'false' }, a.word);
            b.addEventListener('click', () => b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'));
            return { a, b };
          });
          const done = h('button.btn.primary', { type: 'button' }, 'Done');
          container.appendChild(h('div.center', h('p.label', 'Verify'), h('p', `Rook can't vouch for these. Tap each one that really belongs under ${cat.name.toUpperCase()}.`), h('div.lb-words', toggles.map((x) => x.b)), done, h('p.muted.small', 'Be honest: untapped words do not count.')));
          done.focus();
          const finish = () => {
            for (const { a, b } of toggles) {
              a.confirmed = b.getAttribute('aria-pressed') === 'true';
              ctx.session.trial({ condition: 'category-verify', stimulus: { category: cat.id }, response: a.word, correct: a.confirmed, rt: null, level: rec.lock.level });
            }
            rec.accepted = rec.accepted.filter((a) => !a.pending || a.confirmed);
            resolve();
          };
          done.addEventListener('click', finish);
          signal.addEventListener('abort', resolve);
        });
      }

      (async () => {
        const saved = await ctx.loadState('progress', { levels: { letter: 1, category: 1, switch: 1, mask: 1 }, recent: { letters: [], cats: [] }, sessions: 0 });
        clear(container);
        container.appendChild(h('div.center', h('p.label', 'Decrypting lexicon…')));
        let lex;
        try {
          lex = await loadLexicon();
          lex.has('a'); // build the lookup set now, not mid-round
        } catch (e) {
          clear(container);
          container.appendChild(h('div.center', h('p', 'Could not load the word list (data/enable.js).'), h('p.muted', String(e.message))));
          return;
        }
        if (signal.aborted) return;
        const locks = TYPES.map((t) => spec(t, saved.levels[t], rng, lex, cats, saved.recent));
        if (
          !(await WW.screens.intro(container, {
            kicker: 'COLD STORAGE · SCHEDULER · verbal fluency',
            title: 'Lexicon Breach',
            body: [
              'Each lock wants words. Type as many as you can that fit its rule, pressing Enter after each one. You get 60 seconds per lock; hit the quota to breach it.',
              'No repeats, no variants of a word you already used (cat / cats, run / running), no names of people or places.',
              'Tip: work one cluster until it dries up, then jump. For a category, go farm animals, then sea creatures, then insects. For a letter, try sounds: ST-, STR-, SP-.',
            ],
            kv: [
              ['Locks', locks.map((l) => `${l.type} L${l.level}`).join(' · ')],
              ['Session', '4 × 60 s, about 6 min'],
            ],
            button: 'Jack in',
            signal,
          }))
        )
          return;
        ctx.audio.unlock();

        const rounds = [];
        for (let i = 0; i < locks.length; i++) {
          const lock = locks[i];
          clear(container);
          container.appendChild(h('div.center', h('p.label', `Lock ${i + 1} / 4`), h('p', { class: 'lb-prompt' + (lock.prompt.length > 9 ? ' long' : '') }, lock.prompt), h('p', lock.rule), lock.type === 'switch' ? h('p.muted', 'A wrong-letter word is a switch error and does not count.') : null));
          await T.sleep(2600);
          if (signal.aborted) return;
          const rec = await playLock(lock, i, lex);
          if (!rec) return;
          if (lock.type === 'category') await review(rec);
          if (signal.aborted) return;
          const n = rec.accepted.length;
          const breached = n >= lock.quota;
          const byReason = (r) => rec.log.filter((x) => x.reason === r).length;
          const round = {
            type: lock.type,
            level: lock.level,
            prompt: lock.prompt,
            quota: lock.quota,
            valid: n,
            breached,
            repeats: byReason('repeat'),
            variants: byReason('variant'),
            ruleBreaks: byReason('rule') + byReason('short') + byReason('one word'),
            switchErrors: byReason('switch'),
            unknown: byReason('unknown'),
            firstHalf: rec.accepted.filter((a) => a.t < ROUND_MS / 2).length,
          };
          if (lock.type === 'category') {
            Object.assign(round, { category: lock.category }, clusters(rec.accepted.map((a) => a.sub)));
          } else {
            Object.assign(round, clusters(rec.accepted.map((a) => a.word.slice(0, 2))));
          }
          if (lock.type === 'mask') round.matches = lock.matches;
          rounds.push(round);
          ctx.audio.sfx(breached ? 'correct' : 'error');

          // Round debrief.
          clear(container);
          const extra = [];
          if (lock.type === 'category') {
            const cat = cats.find((c) => c.id === lock.category);
            const used = new Set(rec.accepted.map((a) => a.sub));
            const untouched = Object.keys(cat.subs).filter((s) => !used.has(s));
            const said = new Set(rec.accepted.map((a) => a.key));
            const ex = untouched.slice(0, 3).map((s) => `${s}: ${rng.sample(cat.subs[s].filter((x) => !said.has(x.replace(/ /g, '')) && catIndex(cat).get(x.replace(/ /g, '')) === s), 3).join(', ')}`);
            extra.push(h('p.muted', `${round.runs} clusters, ${round.switches} switches.`));
            if (ex.length) extra.push(h('p.muted.small', 'Clusters you never opened: ', ex.join(' · ')));
          } else if (lock.type === 'mask') {
            extra.push(h('p.muted', `The lexicon holds ${lock.matches.toLocaleString()} matches.`));
          }
          if (round.switchErrors) extra.push(h('p.muted', `${round.switchErrors} switch error${round.switchErrors > 1 ? 's' : ''}.`));
          const next = h('button.btn.primary', { type: 'button' }, i < locks.length - 1 ? 'Next lock' : 'Results');
          container.appendChild(h('div.center', h('p.big', { style: { color: breached ? 'var(--good)' : 'var(--magenta)' } }, breached ? 'BREACHED' : 'LOCKED OUT'), h('p', `${n} of ${lock.quota} words`), extra, next));
          await T.sleep(700); // swallow a stray Enter from the last word
          if (signal.aborted) return;
          next.focus();
          const r = await T.awaitChoice({ keyMap: { Enter: true, NumpadEnter: true, Space: true }, buttons: [{ el: next, value: true }], signal });
          if (r.aborted) return;
        }

        const levels = {};
        for (const rd of rounds) levels[rd.type] = nextLevel(rd.level, rd.valid, rd.quota);
        const sum = (k) => rounds.reduce((a, r) => a + (r[k] || 0), 0);
        const cat = rounds.find((r) => r.type === 'category');
        const letter = rounds.find((r) => r.type === 'letter');
        const summary = {
          rounds,
          totalValid: sum('valid'),
          breached: rounds.filter((r) => r.breached).length,
          repeats: sum('repeats'),
          variants: sum('variants'),
          ruleBreaks: sum('ruleBreaks'),
          switchErrors: sum('switchErrors'),
          letterWords: letter ? letter.valid : null,
          categoryWords: cat ? cat.valid : null,
          categorySwitches: cat ? cat.switches : null,
          categoryMeanCluster: cat ? cat.meanClusterSize : null,
          levelsBefore: Object.fromEntries(rounds.map((r) => [r.type, r.level])),
          levels,
          meanLevel: S.round(S.mean(Object.values(levels)), 2), // levels after this session
        };
        const choice = await WW.screens.results(container, {
          headline: `${summary.totalValid} WORDS`,
          tone: summary.breached >= 2 ? 'good' : 'warn',
          kv: [
            ...rounds.map((r) => [`${r.type} ${r.prompt}`, `${r.valid}/${r.quota} ${r.breached ? '✔' : '✖'} · level ${r.level} → ${levels[r.type]}`]),
            ['Errors', `${summary.repeats} repeats · ${summary.variants} variants · ${summary.ruleBreaks} off-rule · ${summary.switchErrors} switch`],
          ],
          notes: ['Healthy adults typically find 12–18 words a minute for an easy letter and 18–25 for animals. Levels carry over only if you log the session.'],
          signal,
        });
        if (choice === 'save') {
          const recent = {
            letters: [...locks.flatMap((l) => l.letters || (l.letter ? [l.letter] : [])), ...(saved.recent.letters || [])].slice(0, 6),
            cats: [...locks.filter((l) => l.category).map((l) => l.category), ...(saved.recent.cats || [])].slice(0, 4),
          };
          await ctx.saveState('progress', { levels, recent, sessions: saved.sessions + 1 });
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
