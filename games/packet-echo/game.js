/* Packet Echo (RAM): adaptive dual n-back.
 *
 * Kirchner (1958); Jaeggi et al. (2008) procedure: blocks of 20 + n trials,
 * stimulus 500 ms every 3000 ms, 6 targets per stream (2 shared). Position
 * on a 3x3 grid plus one of 8 synthesized sounds. Adaptation per block:
 * fewer than 3 errors in every stream -> n + 1; more than 5 in any -> n - 1.
 * Evidence: reliable near transfer (Soveri et al. 2017); far transfer small
 * or absent (Au et al. 2015; Melby-Lervåg et al. 2016). Grade B/C.
 */
(function (root) {
  'use strict';
  const WW = root.WW;

  const TRIAL_MS = 3000;
  const STIM_MS = 500;
  const BASE_LEN = 20;
  const MODES = {
    dual: { label: 'Dual', streams: ['pos', 'snd'] },
    pos: { label: 'Position only', streams: ['pos'] },
    snd: { label: 'Sound only', streams: ['snd'] },
  };

  /**
   * One block. Targets are placed exactly; non-targets never match n back,
   * so the only matches are the planned ones.
   * Returns [{ pos, snd, posMatch, sndMatch }] (pos/snd null when unused).
   */
  function makeBlock(rng, n, mode, opts) {
    const o = Object.assign({ length: BASE_LEN, targets: 6, both: 2 }, opts || {});
    const total = o.length + n;
    const slots = [];
    for (let i = n; i < total; i++) slots.push(i);
    const streams = MODES[mode].streams;
    const posT = new Set();
    const sndT = new Set();
    if (streams.length === 2) {
      const pick = rng.sample(slots, o.targets * 2 - o.both);
      pick.slice(0, o.both).forEach((i) => (posT.add(i), sndT.add(i)));
      pick.slice(o.both, o.targets).forEach((i) => posT.add(i));
      pick.slice(o.targets).forEach((i) => sndT.add(i));
    } else {
      const set = streams[0] === 'pos' ? posT : sndT;
      rng.sample(slots, o.targets).forEach((i) => set.add(i));
    }
    const out = [];
    for (let i = 0; i < total; i++) {
      const t = { pos: null, snd: null, posMatch: false, sndMatch: false };
      for (const s of streams) {
        const back = i >= n ? out[i - n][s] : null;
        const match = s === 'pos' ? posT.has(i) : sndT.has(i);
        const choices = [0, 1, 2, 3, 4, 5, 6, 7, 8].slice(0, s === 'pos' ? 9 : 8);
        t[s] = match ? back : rng.pick(choices.filter((v) => v !== back));
        t[s + 'Match'] = match;
      }
      out.push(t);
    }
    return out;
  }

  /** Per-stream signal-detection counts for a block. responses[i] = { pos: bool, snd: bool }. */
  function scoreBlock(trials, responses, mode, n) {
    const res = {};
    for (const s of MODES[mode].streams) {
      let hits = 0, misses = 0, fas = 0, crs = 0;
      for (let i = n; i < trials.length; i++) {
        const match = trials[i][s + 'Match'];
        const said = !!(responses[i] && responses[i][s]);
        if (match && said) hits++;
        else if (match) misses++;
        else if (said) fas++;
        else crs++;
      }
      res[s] = { hits, misses, fas, crs, errors: misses + fas, dprime: WW.stats.dprime(hits, misses, fas, crs) };
    }
    return res;
  }

  /** Jaeggi et al. (2008) block rule. */
  function nextN(n, streamScores) {
    const errs = Object.values(streamScores).map((s) => s.errors);
    if (errs.every((e) => e < 3)) return n + 1;
    if (errs.some((e) => e > 5)) return Math.max(1, n - 1);
    return n;
  }

  WW.logic = WW.logic || {};
  WW.logic.packetEcho = { makeBlock, scoreBlock, nextN, MODES };

  WW.games.register({
    id: 'packet-echo',
    name: 'Packet Echo',
    headline: (s) => `${s.meanN}-back mean · ${s.mode}`,
    /** RAM tune: mean n over the last five sessions, 1 -> 0, 10 -> 1 (n itself is unbounded). */
    tune(sessions) {
      const ns = sessions.slice(0, 5).map((s) => s.summary && s.summary.meanN).filter(Number.isFinite);
      return ns.length ? WW.stats.clamp01((WW.stats.mean(ns) - 1) / 9) : null;
    },
    mount(container, ctx) {
      const { h, clear } = ctx.ui;
      const T = ctx.timing;
      const S = WW.stats;
      const ac = new AbortController();
      const signal = ac.signal;
      const rng = ctx.rng;

      let cells, posBtn, sndBtn, status, meter;

      function board(mode) {
        clear(container);
        status = h('p.label', '');
        cells = Array.from({ length: 9 }, () => h('div.pe-cell.stim'));
        const streams = MODES[mode].streams;
        posBtn = streams.includes('pos') ? h('button.btn.pe-key', { type: 'button' }, h('kbd', 'A'), ' position match') : null;
        sndBtn = streams.includes('snd') ? h('button.btn.pe-key', { type: 'button' }, h('kbd', 'L'), ' sound match') : null;
        meter = h('div.meter.pe-meter', h('i'));
        container.appendChild(
          h('div.center', { style: { userSelect: 'none', touchAction: 'manipulation' } }, status, h('div.pe-grid', cells), h('div.row', { style: { justifyContent: 'center' } }, posBtn, sndBtn), meter)
        );
      }

      const pulse = (el, cls) => {
        if (!el) return;
        el.classList.remove('ok', 'bad');
        void el.offsetWidth;
        el.classList.add(cls);
        setTimeout(() => el.classList.remove(cls), 280);
      };

      /** Run one block; resolves { trials, responses, rts } or null if aborted. */
      function runBlock(trials, n, mode) {
        return new Promise((resolve) => {
          const responses = trials.map(() => ({ pos: false, snd: false }));
          const rts = trials.map(() => ({ pos: null, snd: null }));
          let i = -1;
          let onset = 0;
          let timer = null;
          const streams = MODES[mode].streams;
          const press = (s, t, input) => {
            if (i < 0 || !streams.includes(s) || responses[i][s]) return;
            responses[i][s] = true;
            rts[i][s] = t - onset;
            rts[i].input = input;
            const isMatch = i >= n && trials[i][s + 'Match'];
            pulse(s === 'pos' ? posBtn : sndBtn, isMatch ? 'ok' : 'bad');
            if (!isMatch) ctx.audio.sfx('tick');
          };
          const onKey = (e) => {
            if (e.repeat) return;
            if (e.code === 'KeyA') press('pos', e.timeStamp, 'keyboard');
            else if (e.code === 'KeyL') press('snd', e.timeStamp, 'keyboard');
            else return;
            e.preventDefault();
          };
          const onPos = (e) => (e.preventDefault(), press('pos', e.timeStamp, e.pointerType || 'pointer'));
          const onSnd = (e) => (e.preventDefault(), press('snd', e.timeStamp, e.pointerType || 'pointer'));
          root.addEventListener('keydown', onKey, true);
          posBtn && posBtn.addEventListener('pointerdown', onPos);
          sndBtn && sndBtn.addEventListener('pointerdown', onSnd);
          const cleanup = () => {
            clearTimeout(timer);
            root.removeEventListener('keydown', onKey, true);
            posBtn && posBtn.removeEventListener('pointerdown', onPos);
            sndBtn && sndBtn.removeEventListener('pointerdown', onSnd);
            signal.removeEventListener('abort', onAbort);
          };
          const onAbort = () => (cleanup(), resolve(null));
          signal.addEventListener('abort', onAbort);

          const t0 = T.now() + 300;
          const step = async () => {
            // Close the previous trial: flag missed matches.
            if (i >= n) for (const s of streams) if (trials[i][s + 'Match'] && !responses[i][s]) pulse(s === 'pos' ? posBtn : sndBtn, 'bad');
            i++;
            meter.firstChild.style.width = (i / trials.length) * 100 + '%';
            if (i >= trials.length) {
              cleanup();
              return resolve({ responses, rts });
            }
            const t = trials[i];
            onset = await T.onNextFrame(() => {
              if (t.pos !== null) cells[t.pos].classList.add('lit');
            });
            if (t.snd !== null) ctx.audio.voice(t.snd);
            setTimeout(() => t.pos !== null && cells[t.pos].classList.remove('lit'), STIM_MS);
            // Schedule against the block clock so delays don't accumulate.
            timer = setTimeout(step, Math.max(0, t0 + (i + 1) * TRIAL_MS - T.now()));
          };
          timer = setTimeout(step, 300);
        });
      }

      async function chooseMode(state) {
        clear(container);
        const pick = (m) =>
          h(
            'button.btn' + (m === state.lastMode ? '.primary' : ''),
            { type: 'button', dataset: { mode: m } },
            `${MODES[m].label} · ${state.n[m]}-back`
          );
        const btns = Object.keys(MODES).map(pick);
        container.appendChild(
          h(
            'div.center',
            h('p.label', 'RAM · working memory'),
            h('p.big.title', 'Packet Echo'),
            h('p', 'Packets arrive every 3 seconds: a square lights up and a tone plays. Flag a packet when it matches the one N steps back.'),
            h('p', 'Position matches the one N back: press A. Sound matches: press L. Both can match at once. Each stream is judged separately.'),
            WW.screens.kvList([
              ['Session', `${state.blocks} blocks · about ${Math.round((state.blocks * (BASE_LEN + state.n[state.lastMode]) * TRIAL_MS) / 60000)} min`],
              ['Adapts', 'N rises after a clean block (under 3 errors per stream), drops after a messy one (over 5)'],
            ]),
            h('p.label', 'Sounds'),
            h('div.voices', ctx.audio.voiceNames.map((nm, i) => h('button.btn', { type: 'button', on: { click: () => ctx.audio.voice(i) } }, nm))),
            h('p.label', 'Mode'),
            h('div.row', { style: { justifyContent: 'center' } }, btns),
            h('p.muted.small', 'Enter starts the highlighted mode.')
          )
        );
        return new Promise((resolve) => {
          const done = (m) => {
            root.removeEventListener('keydown', onKey, true);
            resolve(m);
          };
          const onKey = (e) => {
            if (e.code === 'Enter') {
              e.preventDefault();
              done(state.lastMode);
            }
          };
          root.addEventListener('keydown', onKey, true);
          btns.forEach((b) => b.addEventListener('click', () => done(b.dataset.mode)));
          signal.addEventListener('abort', () => done(null));
        });
      }

      (async () => {
        const state = await ctx.loadState('progress', { n: { dual: 2, pos: 2, snd: 2 }, lastMode: 'dual', blocks: 5 });
        ctx.audio.unlock();
        const mode = await chooseMode(state);
        if (!mode) return;
        const startN = state.n[mode];
        let n = startN;
        const blocks = [];
        board(mode);
        for (let b = 0; b < state.blocks; b++) {
          status.textContent = `Block ${b + 1} / ${state.blocks} · ${n}-back`;
          await T.sleep(1500);
          if (signal.aborted) return;
          const trials = makeBlock(rng, n, mode);
          const r = await runBlock(trials, n, mode);
          if (!r) return;
          const sc = scoreBlock(trials, r.responses, mode, n);
          trials.forEach((t, i) =>
            ctx.session.trial({
              condition: `${mode}-${n}back`,
              stimulus: { pos: t.pos, snd: t.snd, posMatch: t.posMatch, sndMatch: t.sndMatch, block: b + 1 },
              response: r.responses[i],
              correct: i < n ? null : MODES[mode].streams.every((s) => r.responses[i][s] === t[s + 'Match']),
              rt: r.rts[i].pos != null ? r.rts[i].pos : r.rts[i].snd,
              level: n,
              input: r.rts[i].input,
            })
          );
          const next = nextN(n, sc);
          blocks.push({ n, scores: sc, next });
          const errs = MODES[mode].streams.map((s) => `${s === 'pos' ? 'position' : 'sound'} ${sc[s].errors} err`).join(' · ');
          status.textContent = `${errs} → ${next > n ? 'N up' : next < n ? 'N down' : 'hold'} (${next}-back)`;
          ctx.audio.sfx(next > n ? 'correct' : next < n ? 'error' : 'tick');
          n = next;
          await T.sleep(2200);
        }

        const dp = (s) => S.round(S.mean(blocks.map((b) => b.scores[s] && b.scores[s].dprime).filter(Number.isFinite)), 2);
        const summary = {
          mode,
          blocks: blocks.length,
          startN,
          endN: n,
          meanN: S.round(S.mean(blocks.map((b) => b.n)), 2),
          maxN: Math.max(...blocks.map((b) => b.n)),
          dprimePos: MODES[mode].streams.includes('pos') ? dp('pos') : null,
          dprimeSnd: MODES[mode].streams.includes('snd') ? dp('snd') : null,
        };
        const choice = await WW.screens.results(container, {
          headline: `${summary.meanN}-BACK`,
          kv: [
            ['Mode', MODES[mode].label],
            ['Mean N · max N', `${summary.meanN} · ${summary.maxN}`],
            ['Next session starts at', `${n}-back`],
            summary.dprimePos != null ? ['d′ position', summary.dprimePos] : null,
            summary.dprimeSnd != null ? ['d′ sound', summary.dprimeSnd] : null,
          ],
          notes: ['Your N carries over only if you log the session.'],
          signal,
        });
        if (choice === 'save') {
          state.n[mode] = n;
          state.lastMode = mode;
          await ctx.saveState('progress', state);
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
