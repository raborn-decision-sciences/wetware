/* Wiretap (COLD STORAGE): the method of loci for what you hear.
 *
 * A short briefing on a real topic is spoken once, one point at a time. As each point plays you
 * stash it at the next point of your memory palace (Safehouse's route, or your own), tying what
 * you heard to the place with a vivid image. After a 30 s scrub you walk the route and answer a
 * question about the point left at each place (cued recall). Briefings come back as dead drops
 * 1, 3 and 7 days later (Roediger & Karpicke 2006; Cepeda et al. 2006). The number of points
 * adapts like Safehouse's list length.
 *
 * Why spoken: loci improve memory for passages heard, but not for text read, where reading and
 * imagery compete (Cornoldi & De Beni 1991; De Beni, Moè & Cornoldi 1997). Text on screen is a
 * fallback, logged as its own mode. Evidence for loci training: Dresler et al. 2017; Gross et
 * al. 2012 (multi-strategy training). Grade B: the strategy is well supported, its use on
 * prose less so.
 */
(function (root) {
  'use strict';
  const WW = root.WW;

  const MIN_FACTS = 4;
  const MAX_FACTS = 24;
  const START_FACTS = 6;
  const FILLER_MS = 30000;
  const MAX_DROPS_PER_SESSION = 2;
  const RECENT_BRIEFINGS = 50; // of 60: a briefing comes back only after most of the others

  /** Lower case, no accents or apostrophes, punctuation to spaces (keeping . / @ for numbers and signs), no leading article. */
  function norm(s) {
    return String(s || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[’'`]/g, '')
      .replace(/[^a-z0-9./@]+/g, ' ')
      .replace(/(^|\s)[./]+|[./]+(\s|$)/g, ' ')
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/^(the|a|an) /, '');
  }

  /**
   * Is the typed answer one of the accepted ones? Exact after norm(), or a plural, or a small typo
   * (1 edit from 5 letters, 2 from 9; never in numbers), or a short answer (up to 4 words) that
   * contains every word of an accepted answer.
   */
  function answerMatch(typed, accepted) {
    const t = norm(typed);
    if (!t) return false;
    const lev = WW.logic.safehouse.lev;
    const tw = t.split(' ');
    for (const raw of accepted) {
      const a = norm(raw);
      if (!a) continue;
      if (t === a || t === a + 's' || t === a + 'es' || t + 's' === a) return true;
      if (/^[a-z ]+$/.test(a)) {
        const tol = a.length >= 9 ? 2 : a.length >= 5 ? 1 : 0;
        if (tol && lev(t, a) <= tol) return true;
      }
      if (tw.length <= 4 && a.split(' ').every((w) => tw.includes(w) || tw.includes(w + 's'))) return true;
    }
    return false;
  }

  /** Points-per-session rule after recall (as Safehouse's list length), capped by the palace. */
  function nextFacts(n, acc, cap = MAX_FACTS) {
    const next = acc >= 0.9 ? n + 2 : acc >= 0.75 ? n + 1 : acc < 0.5 ? n - 1 : n;
    return Math.max(MIN_FACTS, Math.min(cap, MAX_FACTS, next));
  }

  /**
   * The next n facts: whole briefings in a shuffled order, skipping recently heard ones where
   * possible; the last briefing may be cut short. Returns { briefings: [ids], items: [{ b, k }] }.
   */
  function pickFacts(rng, n, recent) {
    const all = WW.wiretapBriefings || [];
    const avoid = new Set(recent || []);
    const fresh = rng.shuffle(all.filter((b) => !avoid.has(b.id)));
    const stale = rng.shuffle(all.filter((b) => avoid.has(b.id)));
    const items = [];
    const briefings = [];
    for (const b of [...fresh, ...stale]) {
      if (items.length >= n) break;
      briefings.push(b.id);
      for (let k = 0; k < b.facts.length && items.length < n; k++) items.push({ b: b.id, k });
    }
    return { briefings, items };
  }

  const briefing = (id) => (WW.wiretapBriefings || []).find((b) => b.id === id);
  const factOf = (it) => {
    const b = briefing(it.b);
    const f = b && b.facts[it.k];
    return f ? { say: f[0], q: f[1], a: f[2], title: b.title } : null;
  };

  WW.logic = WW.logic || {};
  WW.logic.wiretap = { norm, answerMatch, nextFacts, pickFacts, factOf, MIN_FACTS, MAX_FACTS, START_FACTS };

  WW.games.register({
    id: 'wiretap',
    name: 'Wiretap',
    headline: (s) => `${s.recalled}/${s.facts} recalled` + (s.mode === 'text' ? ' · on screen' : '') + (s.dropRecalls && s.dropRecalls.length ? ` · ${s.dropRecalls.length} dead drop(s)` : ''),
    /** COLD STORAGE tune: points recalled immediately, 2 -> 0, 24 -> 1. */
    tune(sessions) {
      const v = sessions.slice(0, 3).map((s) => s.summary && s.summary.recalled).filter(Number.isFinite);
      return v.length ? WW.stats.clamp01((WW.stats.mean(v) - 2) / 22) : null;
    },
    /** Dead drops waiting for recall (the hub prioritises these in the contract). */
    async dueCount(store) {
      const st = await store.getState('wiretap.progress');
      return st ? WW.logic.safehouse.dueDrops(st.drops, Date.now()).length : 0;
    },
    mount(container, ctx) {
      const { h, clear } = ctx.ui;
      const T = ctx.timing;
      const S = WW.stats;
      const SH = WW.logic.safehouse;
      const ac = new AbortController();
      const signal = ac.signal;
      const rng = ctx.rng;
      const synth = root.speechSynthesis && root.SpeechSynthesisUtterance ? root.speechSynthesis : null;

      async function pickVoice() {
        if (!synth) return null;
        let v = synth.getVoices();
        if (!v.length)
          await new Promise((resolve) => {
            const t = setTimeout(resolve, 1500);
            synth.addEventListener('voiceschanged', () => (clearTimeout(t), resolve()), { once: true });
          });
        v = synth.getVoices();
        return v.find((x) => /^en[-_]/i.test(x.lang) && x.localService) || v.find((x) => /^en/i.test(x.lang)) || null;
      }

      /** Speak a line; resolves when it ends (or a length-based guard fires), false if aborted. */
      function speak(text, voice) {
        return new Promise((resolve) => {
          const u = new root.SpeechSynthesisUtterance(text);
          if (voice) {
            u.voice = voice;
            u.lang = voice.lang;
          }
          u.rate = 0.95;
          let done = false;
          const fin = (ok) => {
            if (done) return;
            done = true;
            clearTimeout(guard);
            signal.removeEventListener('abort', onAbort);
            resolve(ok);
          };
          const onAbort = () => (synth.cancel(), fin(false));
          const guard = setTimeout(() => fin(true), 2500 + text.split(/\s+/).length * 700);
          u.onend = () => fin(true);
          u.onerror = () => fin(true);
          signal.addEventListener('abort', onAbort);
          synth.cancel();
          synth.speak(u);
        });
      }

      /** Resolve on Enter or a click once `btn` is enabled; false if aborted. */
      function waitEnabled(btn) {
        return new Promise((resolve) => {
          const done = (v) => {
            root.removeEventListener('keydown', onKey, true);
            signal.removeEventListener('abort', onAbort);
            resolve(v);
          };
          const onKey = (e) => {
            if ((e.code === 'Enter' || e.code === 'NumpadEnter') && !btn.disabled) {
              e.preventDefault();
              done(true);
            }
          };
          const onAbort = () => done(false);
          root.addEventListener('keydown', onKey, true);
          btn.addEventListener('click', () => !btn.disabled && done(true));
          signal.addEventListener('abort', onAbort);
        });
      }

      /** Typed answer; resolves string (maybe '') or null if aborted. */
      function askAnswer(input, button) {
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

      /** Walk the route answering a question at each stash point. Returns [{ ...item, q, a, say, typed, ok, rt }] or null. */
      async function recall(items, title, loci) {
        const out = [];
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          const f = factOf(it);
          if (!f) continue;
          clear(container);
          const input = h('input.sh-input.wt-input', { type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, 'aria-label': 'your answer' });
          const btn = h('button.btn.primary', { type: 'button' }, 'Next');
          container.appendChild(
            h(
              'div.center',
              h('p.label', `${title} · stash point ${it.locus + 1} / ${items.length}`),
              SH.where(loci, it.locus, items.length),
              h('p', `At the ${it.place}:`),
              h('p.wt-q', f.q),
              h('div.row', { style: { justifyContent: 'center' } }, input, btn),
              h('p.muted.small', 'Enter with nothing typed to skip.')
            )
          );
          const t0 = T.now();
          const typed = await askAnswer(input, btn);
          if (typed === null) return null;
          out.push(Object.assign({}, it, { q: f.q, a: f.a, say: f.say, typed, ok: answerMatch(typed, f.a), rt: T.now() - t0 }));
        }
        return out;
      }

      function review(res, title) {
        clear(container);
        const right = res.filter((r) => r.ok).length;
        const list = h(
          'ul.sh-review.wt-review',
          res.map((r) =>
            h(
              'li',
              { class: r.ok ? 'ok' : 'miss' },
              h('span', `${r.locus + 1}. ${r.place}`),
              h('span', r.ok ? r.typed : `${r.a[0]}${r.typed ? ` (you: ${r.typed})` : ''}`),
              h('small', r.say)
            )
          )
        );
        const btn = h('button.btn.primary', { type: 'button' }, 'Continue');
        container.appendChild(h('div.center', h('p.label', title), h('p.big', `${right} / ${res.length}`), list, btn));
        return WW.screens.waitForButton(btn, signal);
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

      (async () => {
        const state = await ctx.loadState('progress', { facts: START_FACTS, recent: [], drops: [], sessions: 0 });
        const P = SH.palaceOf(ctx.store ? await ctx.store.getState('safehouse.progress') : null);
        const cap = Math.min(MAX_FACTS, P.loci.length);
        const n = Math.min(state.facts, cap);
        const now = Date.now();
        const due = SH.dueDrops(state.drops, now).slice(0, MAX_DROPS_PER_SESSION);
        const voice = await pickVoice();
        if (signal.aborted) return;
        const canSpeak = !!(synth && voice);

        // Intro, with a switch between the voice and text on screen (a per-device preference).
        let mode;
        for (;;) {
          mode = canSpeak && !WW.prefs.get('wiretapText', false) ? 'speech' : 'text';
          const introAc = new AbortController();
          const onOuter = () => introAc.abort();
          signal.addEventListener('abort', onOuter);
          let toggled = false;
          const toggle = canSpeak ? h('button.btn', { type: 'button', on: { click: () => ((toggled = true), introAc.abort()) } }, mode === 'speech' ? 'Show text instead' : 'Use the voice') : null;
          const started = await WW.screens.intro(container, {
            kicker: 'COLD STORAGE · memory for what you hear',
            title: 'Wiretap',
            body: [
              'Rook has tapped a lecture feed. You get a short briefing, once, one point at a time. As each point plays, stash it at the next point of your memory palace: picture what you heard happening AT that place.',
              'After a short scrub you walk the route and answer a question about the point you left at each place. Each session comes back as a dead drop 1, 3 and 7 days later.',
              mode === 'speech'
                ? 'The briefing is spoken: placing what you hear along a route works well, while reading competes with the images you build.'
                : canSpeak
                  ? 'Text mode: each point shows on screen. The method works better with the voice, so sessions in this mode are logged separately.'
                  : 'No voice is available on this device, so each point shows on screen instead. The method works better heard; these sessions are logged as text mode.',
            ],
            kv: [
              ['Palace', P.kind === 'own' ? `your own route (${P.loci.length} points; change it in Safehouse)` : `the safehouse route (change it in Safehouse)`],
              ['This session', `${due.length ? `${due.length} dead drop(s) due, then ` : ''}${n} points`],
              ['Delivery', mode === 'speech' ? `spoken (${voice.name})` : 'on screen'],
              ['Takes', 'about 7 minutes'],
            ],
            legend: toggle ? h('div.row', { style: { justifyContent: 'center' } }, toggle) : null,
            button: 'Start',
            signal: introAc.signal,
          });
          signal.removeEventListener('abort', onOuter);
          if (started) break;
          if (!toggled || signal.aborted) return;
          WW.prefs.set('wiretapText', mode === 'speech');
        }

        // 1. Dead drops due.
        const dropRecalls = [];
        for (const d of due) {
          const loci = d.palace === 'own' ? d.items.map((it) => ({ i: it.locus, name: it.place, own: true })) : SH.LOCI;
          const res = await recall(d.items, `Dead drop from ${WW.ui.fmtDate(d.createdAt).slice(5, 10)} (day ${SH.DROP_OFFSETS[d.stage]})`, loci);
          if (!res) return;
          const acc = res.length ? res.filter((r) => r.ok).length / res.length : 0;
          dropRecalls.push({ id: d.id, stage: d.stage, days: SH.DROP_OFFSETS[d.stage], acc: S.round(acc, 3) });
          res.forEach((r) =>
            ctx.session.trial({ condition: `drop-day${SH.DROP_OFFSETS[d.stage]}`, stimulus: { briefing: r.b, fact: r.k, locus: r.locus, place: r.place, drop: d.id }, response: r.typed, correct: r.ok, rt: r.rt, level: d.items.length })
          );
          if (!(await review(res, `Dead drop · day ${SH.DROP_OFFSETS[d.stage]}`))) return;
        }

        // 2. Listen and stash.
        const pick = pickFacts(rng, n, state.recent);
        const items = pick.items.map((it, i) => Object.assign(it, { locus: i, place: P.loci[i].name }));
        const study = [];
        let lastTitle = null;
        for (const it of items) {
          const f = factOf(it);
          clear(container);
          const status = h('p.muted.small', mode === 'speech' ? 'Listening…' : '');
          const btn = h('button.btn.primary', { type: 'button', disabled: true }, 'Stashed');
          const text = mode === 'text' ? h('p.wt-say', f.say) : h('p.wt-say.wt-ear', { 'aria-hidden': 'true' }, '◖ ◗');
          container.appendChild(
            h(
              'div.center',
              h('p.label', `${f.title} · point ${it.locus + 1} / ${n}`),
              SH.where(P.loci, it.locus, n),
              h('p', `Stash it at the ${it.place}.`),
              text,
              btn,
              status
            )
          );
          const t0 = T.now();
          if (mode === 'speech') {
            if (f.title !== lastTitle && !(await speak(`Briefing: ${f.title}.`, voice))) return;
            if (!(await speak(f.say, voice))) return;
            status.textContent = 'Picture it at the place, then Enter.';
          } else await T.sleep(1500);
          lastTitle = f.title;
          btn.disabled = false;
          btn.focus({ preventScroll: true });
          if (!(await waitEnabled(btn))) return;
          study.push({ ms: T.now() - t0 });
        }

        // 3. Filler, then 4. recall.
        const fillerCorrect = await filler();
        if (fillerCorrect === null) return;
        const res = await recall(items, 'Walk the route', P.loci);
        if (!res) return;
        res.forEach((r, i) =>
          ctx.session.trial({ condition: 'immediate', stimulus: { briefing: r.b, fact: r.k, locus: r.locus, place: r.place, mode, studyMs: S.round(study[i].ms) }, response: r.typed, correct: r.ok, rt: r.rt, level: n })
        );
        if (!(await review(res, 'Immediate recall'))) return;

        const recalled = res.filter((r) => r.ok).length;
        const acc = recalled / n;
        const next = nextFacts(n, acc, cap);
        const summary = {
          facts: n,
          recalled,
          accuracy: S.round(acc, 3),
          nextFacts: next,
          mode,
          palace: P.kind,
          palaceSize: P.loci.length,
          briefings: pick.briefings,
          studyMedianMs: S.round(S.median(study.map((s) => s.ms))),
          fillerCorrect,
          dropRecalls,
        };
        const choice = await WW.screens.results(container, {
          headline: `${recalled} / ${n}`,
          kv: [
            ['Immediate recall', `${recalled} of ${n} (${Math.round(acc * 100)}%)`],
            ['Next session', `${next} points`],
            ...dropRecalls.map((d) => [`Dead drop, day ${d.days}`, `${Math.round(d.acc * 100)}%`]),
            ['Delivery', mode === 'speech' ? 'spoken' : 'on screen'],
          ],
          notes: ['Log it to schedule these points as a dead drop (recall in 1, 3 and 7 days) and to keep your session length.'],
          signal,
        });
        if (choice !== 'save') return ctx.abort();
        const t = Date.now();
        for (const d of due) {
          const r = dropRecalls.find((x) => x.id === d.id);
          if (!r) continue;
          d.results.push({ days: r.days, acc: r.acc, at: t });
          SH.scheduleNext(d, t);
        }
        state.drops = state.drops.filter((d) => d.stage < SH.DROP_OFFSETS.length || t - (d.lastRecalled || 0) < 30 * 864e5);
        state.drops.push({ id: ctx.session.id, createdAt: t, items: items.map(({ b, k, locus, place }) => ({ b, k, locus, place })), palace: P.kind, stage: 0, nextDue: t + SH.DROP_OFFSETS[0] * 864e5, results: [] });
        state.facts = next;
        state.recent = [...pick.briefings, ...state.recent.filter((id) => !pick.briefings.includes(id))].slice(0, RECENT_BRIEFINGS);
        state.sessions++;
        await ctx.saveState('progress', state);
        ctx.finish(summary);
      })().catch((e) => console.error(e));

      return {
        stop() {
          ac.abort();
          if (synth) synth.cancel();
        },
      };
    },
  });
})(globalThis);
