/* ID Spoof (COLD STORAGE): face-name association.
 *
 * A social-engineering job in three acts:
 *  1. Party       meet marks one at a time: face, name, job.
 *  2. Scrub       30 s of quick sums so the last faces are not just echoes.
 *  3. Checkpoint  marks come back in a different photo (new pose), mixed
 *                 with look-alike lures and strangers. Met or never seen?
 *                 If met: type the name, then the job.
 * Each session's marks come back as a dead drop 1, 3 and 7 days later.
 * Jobs are recalled far more easily than names even when the word is the
 * same (the baker/Baker paradox; McWeeny et al. 1987), so both are scored.
 * The intro teaches the classic face-name mnemonic: pick a distinctive
 * feature, turn the name into an image, link the two (McCarty 1980;
 * Yesavage 1983). Strategy training improves face-name recall in adults;
 * gains are mostly strategy-specific. Grade B (strategy).
 * Faces are procedural (faces.js); lures keep a mark's hair and extras so
 * only the face itself tells them apart.
 */
(function (root) {
  'use strict';
  const WW = root.WW;

  const DAY = 864e5;
  const DROP_OFFSETS = [1, 3, 7];
  const DROP_MARKS = 6; // marks recalled per dead drop
  const SCRUB_MS = 30000;
  const MAX_LEVEL = 10;

  /** Marks, view time and lure closeness for a level. */
  function params(level) {
    const L = Math.max(1, Math.min(MAX_LEVEL, Math.round(level)));
    return { level: L, marks: 5 + Math.ceil(L / 2), viewMs: 6000 - (L - 1) * 300, lureAmount: WW.stats.round(0.9 - (L - 1) * 0.07, 2) };
  }

  const norm = (s) =>
    String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/^(the|a|an)\s+/, '')
      .replace(/[^a-z]/g, '');
  function lev(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++)
      for (let j = 1; j <= b.length; j++) {
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1); // swapped letters
      }
    return d[a.length][b.length];
  }
  /** Lenient match: case and accents ignored; one typo (or swapped pair) from 5 letters, two from 9; a plural job counts. */
  function matches(typed, target) {
    const t = norm(typed);
    const w = norm(target);
    if (!t) return false;
    if (t === w || t === w + 's') return true;
    const tol = w.length >= 9 ? 2 : w.length >= 5 ? 1 : 0;
    return tol > 0 && lev(t, w) <= tol;
  }

  /**
   * Plan a session: marks (face, name, job, party pose, checkpoint pose),
   * lures (half look-alikes of marks, half strangers), and checkpoint order.
   */
  function plan(rng, level, recentNames) {
    const P = params(level);
    const avoid = new Set(recentNames || []);
    const pool = WW.idSpoofNames.filter((n) => !avoid.has(n));
    const names = [];
    for (const n of rng.shuffle(pool.length >= P.marks ? pool : WW.idSpoofNames)) {
      // Avoid two marks whose names start the same way.
      if (names.length < P.marks && !names.some((m) => m.slice(0, 2) === n.slice(0, 2))) names.push(n);
    }
    const jobs = rng.sample(WW.idSpoofJobs, P.marks);
    const marks = names.map((name, i) => ({ i, name, job: jobs[i], face: WW.faces.generate(rng), poseA: WW.faces.pose(rng, 0.5), poseB: WW.faces.pose(rng, 1) }));
    const nLures = Math.ceil(P.marks / 2);
    const nAlike = Math.ceil(nLures / 2);
    const lures = [];
    for (const m of rng.sample(marks, nAlike)) lures.push({ kind: 'lookalike', of: m.name, face: WW.faces.variant(rng, m.face, P.lureAmount), poseB: WW.faces.pose(rng, 1) });
    while (lures.length < nLures) lures.push({ kind: 'stranger', face: WW.faces.generate(rng), poseB: WW.faces.pose(rng, 1) });
    const order = rng.shuffle([...marks.map((m) => ({ type: 'mark', m })), ...lures.map((l) => ({ type: 'lure', l }))]);
    return { P, marks, lures, order };
  }

  /** Score checkpoint records: [{ type: 'mark'|'lure', said: bool, nameOk, jobOk }]. */
  function score(recs) {
    const marks = recs.filter((r) => r.type === 'mark');
    const lures = recs.filter((r) => r.type === 'lure');
    const hits = marks.filter((r) => r.said).length;
    const fas = lures.filter((r) => r.said).length;
    const n = marks.length;
    return {
      marks: n,
      lures: lures.length,
      hits,
      fas,
      hitRate: n ? hits / n : 0,
      faRate: lures.length ? fas / lures.length : 0,
      dprime: WW.stats.dprime(hits, n - hits, fas, lures.length - fas),
      names: marks.filter((r) => r.nameOk).length,
      jobs: marks.filter((r) => r.jobOk).length,
      nameRecall: n ? marks.filter((r) => r.nameOk).length / n : 0,
      jobRecall: n ? marks.filter((r) => r.jobOk).length / n : 0,
    };
  }

  function nextLevel(level, s) {
    if (s.nameRecall >= 0.75 && s.faRate <= 0.25) return Math.min(MAX_LEVEL, level + 1);
    if (s.nameRecall < 0.4) return Math.max(1, level - 1);
    return level;
  }

  const dueDrops = (drops, now) => (drops || []).filter((d) => d.stage < DROP_OFFSETS.length && d.nextDue <= now).sort((a, b) => a.nextDue - b.nextDue);
  function scheduleNext(drop, now) {
    drop.stage++;
    drop.nextDue = drop.stage < DROP_OFFSETS.length ? drop.createdAt + DROP_OFFSETS[drop.stage] * DAY : null;
    drop.lastRecalled = now;
    return drop;
  }

  WW.logic = WW.logic || {};
  WW.logic.idSpoof = { params, plan, score, nextLevel, matches, norm, dueDrops, scheduleNext, DROP_OFFSETS, MAX_LEVEL };

  WW.games.register({
    id: 'id-spoof',
    name: 'ID Spoof',
    headline: (s) => `names ${s.names}/${s.marks} · jobs ${s.jobs}/${s.marks} · L${s.level}` + (s.dropRecalls && s.dropRecalls.length ? ' · dead drop' : ''),
    /** COLD tune: level after the session, 1 -> 0, 10 -> 1. */
    tune(sessions) {
      const s = sessions[0] && sessions[0].summary;
      return s && Number.isFinite(s.levelAfter) ? WW.stats.clamp01((s.levelAfter - 1) / (MAX_LEVEL - 1)) : null;
    },
    async dueCount(store) {
      const st = await store.getState('id-spoof.progress');
      return st ? dueDrops(st.drops, Date.now()).length : 0;
    },
    mount(container, ctx) {
      const { h, clear } = ctx.ui;
      const T = ctx.timing;
      const S = WW.stats;
      const ac = new AbortController();
      const signal = ac.signal;
      const rng = ctx.rng;
      let uid = 0;
      const portrait = (face, pose) => {
        const wrap = h('div.is-face');
        wrap.innerHTML = WW.faces.svg(face, { id: 'is' + uid++, pose });
        return wrap;
      };

      /** Typed answer; resolves with text ('' on skip) or null on abort. */
      function ask(label, placeholder) {
        return new Promise((resolve) => {
          const input = h('input.is-input', { type: 'text', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: false, placeholder: placeholder || '', 'aria-label': label });
          const form = h('form.is-form', h('label.label', label), h('div.row', input, h('button.btn.primary', { type: 'submit' }, 'Enter')));
          slot.replaceChildren(form);
          input.focus();
          const t0 = T.now();
          const onAbort = () => resolve(null);
          form.addEventListener('submit', (e) => {
            e.preventDefault();
            signal.removeEventListener('abort', onAbort);
            resolve({ text: input.value.trim(), rt: Math.round(T.now() - t0) });
          });
          signal.addEventListener('abort', onAbort);
        });
      }
      let slot = null;

      async function party(marks, P) {
        for (let i = 0; i < marks.length; i++) {
          const m = marks[i];
          clear(container);
          container.appendChild(
            h('div.center.is-stage', h('p.label', `Party · ${i + 1} / ${marks.length}`), h('div.is-card', portrait(m.face, m.poseA), h('div.is-id', h('p.is-name', m.name), h('p.is-job', m.job))), h('div.is-timer', h('div.is-timer-fill', { style: { animationDuration: P.viewMs + 'ms' } })))
          );
          await T.sleep(P.viewMs);
          if (signal.aborted) return false;
          clear(container);
          await T.sleep(400);
          if (signal.aborted) return false;
        }
        return true;
      }

      async function scrub() {
        clear(container);
        const prob = h('p.is-sum');
        const input = h('input.is-input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', 'aria-label': 'sum' });
        const form = h('form.is-form', h('div.row', input, h('button.btn.primary', { type: 'submit' }, 'Enter')));
        const clock = h('p.muted', '');
        container.appendChild(h('div.center', h('p.label', 'Scrub your trail'), h('p', 'Quick sums while the guards rotate.'), prob, form, clock));
        let a = 0;
        let b = 0;
        let right = 0;
        let done = 0;
        const next = () => {
          a = rng.int(12, 89);
          b = rng.int(3, 9);
          prob.textContent = `${a} + ${b}`;
          input.value = '';
          input.focus();
        };
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          done++;
          if (Number(input.value) === a + b) right++;
          next();
        });
        next();
        const t0 = T.now();
        while (T.now() - t0 < SCRUB_MS) {
          clock.textContent = `${Math.ceil((SCRUB_MS - (T.now() - t0)) / 1000)} s`;
          await T.sleep(250);
          if (signal.aborted) return null;
        }
        return { done, right };
      }

      /** Checkpoint: recognition, then name and job for faces you say you met. */
      async function checkpoint(order, P) {
        const recs = [];
        for (let i = 0; i < order.length; i++) {
          const it = order[i];
          const face = it.type === 'mark' ? it.m.face : it.l.face;
          const pose = it.type === 'mark' ? it.m.poseB : it.l.poseB;
          clear(container);
          const met = h('button.btn.is-key', { type: 'button' }, h('kbd', 'F'), ' Met them');
          const never = h('button.btn.is-key', { type: 'button' }, h('kbd', 'J'), ' Never seen');
          slot = h('div.is-slot', h('div.row', { style: { justifyContent: 'center' } }, met, never));
          container.appendChild(h('div.center.is-stage', h('p.label', `Checkpoint · ${i + 1} / ${order.length}`), h('div.is-card', portrait(face, pose)), slot));
          const c = await T.awaitChoice({ keyMap: { KeyF: true, KeyJ: false }, buttons: [{ el: met, value: true }, { el: never, value: false }], signal });
          if (c.aborted) return null;
          const rec = { type: it.type, said: c.value, recogRt: Math.round(c.rt), name: null, job: null, nameOk: false, jobOk: false };
          if (it.type === 'lure') Object.assign(rec, { kind: it.l.kind, of: it.l.of || null });
          else Object.assign(rec, { mark: it.m.name });
          if (c.value) {
            await T.sleep(120); // let the F key go before the text box takes focus
            const n = await ask('Name?', 'first name');
            if (n === null) return null;
            const j = await ask('Job?', 'one word');
            if (j === null) return null;
            rec.name = n.text;
            rec.job = j.text;
            rec.nameRt = n.rt;
            if (it.type === 'mark') {
              rec.nameOk = matches(n.text, it.m.name);
              rec.jobOk = matches(j.text, it.m.job);
            }
          }
          recs.push(rec);
          ctx.session.trial({ condition: it.type === 'mark' ? 'mark' : 'lure-' + it.l.kind, stimulus: it.type === 'mark' ? { name: it.m.name, job: it.m.job } : { of: it.l.of || null }, response: { met: rec.said, name: rec.name, job: rec.job }, correct: it.type === 'mark' ? rec.said && rec.nameOk : !rec.said, rt: rec.recogRt, level: P.level, nameOk: rec.nameOk, jobOk: rec.jobOk });

          // Feedback.
          let msg;
          let ok;
          if (it.type === 'mark') {
            ok = rec.said && rec.nameOk;
            msg = !rec.said ? `Missed: that was ${it.m.name}, the ${it.m.job}.` : rec.nameOk && rec.jobOk ? `${it.m.name}, the ${it.m.job} ✔` : `It was ${it.m.name}, the ${it.m.job}. Name ${rec.nameOk ? '✔' : '✖'} · job ${rec.jobOk ? '✔' : '✖'}`;
          } else {
            ok = !rec.said;
            msg = rec.said ? (it.l.kind === 'lookalike' ? `Never met. A look-alike of ${it.l.of}.` : 'Never met. A stranger.') : it.l.kind === 'lookalike' ? `Right: a look-alike of ${it.l.of}.` : 'Right: a stranger.';
          }
          ctx.audio.sfx(ok ? 'correct' : 'error');
          slot.replaceChildren(h('p', { class: 'is-feedback ' + (ok ? 'good' : 'bad') }, msg));
          await T.sleep(ok ? 1100 : 2200);
          if (signal.aborted) return null;
        }
        return recs;
      }

      /** Dead drop: cued recall of an earlier session's marks in a new photo. */
      async function dropRecall(drop) {
        const items = drop.marks.slice(0, DROP_MARKS);
        const out = [];
        for (let i = 0; i < items.length; i++) {
          const m = items[i];
          clear(container);
          slot = h('div.is-slot');
          container.appendChild(h('div.center.is-stage', h('p.label', `Dead drop · day ${DROP_OFFSETS[drop.stage]} · ${i + 1} / ${items.length}`), h('div.is-card', portrait(m.face, WW.faces.pose(rng, 1))), slot));
          const n = await ask('Name?', 'first name');
          if (n === null) return null;
          const j = await ask('Job?', 'one word');
          if (j === null) return null;
          const nameOk = matches(n.text, m.name);
          const jobOk = matches(j.text, m.job);
          out.push({ nameOk, jobOk });
          ctx.session.trial({ condition: `drop-day${DROP_OFFSETS[drop.stage]}`, stimulus: { name: m.name, job: m.job, drop: drop.id }, response: { name: n.text, job: j.text }, correct: nameOk, rt: n.rt, level: items.length, jobOk });
          ctx.audio.sfx(nameOk ? 'correct' : 'error');
          slot.replaceChildren(h('p', { class: 'is-feedback ' + (nameOk ? 'good' : 'bad') }, nameOk && jobOk ? `${m.name}, the ${m.job} ✔` : `It was ${m.name}, the ${m.job}. Name ${nameOk ? '✔' : '✖'} · job ${jobOk ? '✔' : '✖'}`));
          await T.sleep(nameOk ? 1000 : 2000);
          if (signal.aborted) return null;
        }
        return { id: drop.id, days: DROP_OFFSETS[drop.stage], names: out.filter((x) => x.nameOk).length, jobs: out.filter((x) => x.jobOk).length, n: out.length };
      }

      (async () => {
        const state = await ctx.loadState('progress', { level: 1, sessions: 0, recentNames: [], drops: [] });
        const now = Date.now();
        const due = dueDrops(state.drops, now).slice(0, 1);
        const pl = plan(rng, state.level, state.recentNames);
        const P = pl.P;
        if (
          !(await WW.screens.intro(container, {
            kicker: 'COLD STORAGE · face-name memory',
            title: 'ID Spoof',
            body: [
              'Tonight’s job is a party in the Spire. Meet each mark: a face, a first name, a job. Later, at the checkpoint, they come back in a different photo, mixed with look-alikes and strangers.',
              'For each face: did you meet them? If so, type their name, then their job.',
              'The trick that works: find one feature that stands out (big ears, heavy brows), turn the name into a picture (Rosa → a rose), and stick the picture on the feature. A rose growing out of her ear.',
            ],
            kv: [
              ['This session', `${due.length ? 'a dead drop, then ' : ''}${P.marks} marks, ${(P.viewMs / 1000).toFixed(1)} s each`],
              ['Level', String(P.level)],
              ['Keys', 'F met / J never seen; type answers + Enter'],
            ],
            button: 'Work the room',
            signal,
          }))
        )
          return;
        ctx.audio.unlock();

        const dropRecalls = [];
        for (const d of due) {
          const r = await dropRecall(d);
          if (!r) return;
          dropRecalls.push(r);
        }
        if (!(await party(pl.marks, P))) return;
        const sc = await scrub();
        if (!sc) return;
        const recs = await checkpoint(pl.order, P);
        if (!recs) return;

        const s = score(recs);
        const levelAfter = nextLevel(P.level, s);
        const alike = recs.filter((r) => r.kind === 'lookalike');
        const summary = {
          level: P.level,
          levelAfter,
          marks: s.marks,
          names: s.names,
          jobs: s.jobs,
          nameRecall: S.round(s.nameRecall, 3),
          jobRecall: S.round(s.jobRecall, 3),
          hitRate: S.round(s.hitRate, 3),
          faRate: S.round(s.faRate, 3),
          dprime: S.round(s.dprime, 2),
          lookalikeFAs: alike.filter((r) => r.said).length,
          lookalikes: alike.length,
          viewMs: P.viewMs,
          lureAmount: P.lureAmount,
          scrub: sc,
          dropRecalls,
        };
        const choice = await WW.screens.results(container, {
          headline: `${s.names} / ${s.marks} NAMES`,
          tone: s.nameRecall >= 0.6 ? 'good' : 'warn',
          kv: [
            ['Names', `${s.names} of ${s.marks}`],
            ['Jobs', `${s.jobs} of ${s.marks}` + (s.jobs > s.names ? ' (jobs stick better than names: that’s normal)' : '')],
            ['Recognised', `${s.hits} of ${s.marks} marks · ${s.fas} of ${s.lures} lures wrongly “met” (${summary.lookalikeFAs} look-alike${summary.lookalikeFAs === 1 ? '' : 's'})`],
            ...dropRecalls.map((d) => [`Dead drop, day ${d.days}`, `names ${d.names}/${d.n} · jobs ${d.jobs}/${d.n}`]),
            ['Next session', `level ${levelAfter}`],
          ],
          notes: ['Log it to keep your level and to get these marks back as a dead drop in 1, 3 and 7 days.'],
          signal,
        });
        if (choice !== 'save') return ctx.abort();
        const t = Date.now();
        for (const d of due) {
          const r = dropRecalls.find((x) => x.id === d.id);
          if (!r) continue;
          d.results = d.results || [];
          d.results.push({ days: r.days, names: r.names, jobs: r.jobs, n: r.n, at: t });
          scheduleNext(d, t);
        }
        state.drops = state.drops.filter((d) => d.stage < DROP_OFFSETS.length || t - (d.lastRecalled || 0) < 30 * DAY);
        state.drops.push({ id: ctx.session.id, createdAt: t, stage: 0, nextDue: t + DROP_OFFSETS[0] * DAY, results: [], marks: rng.sample(pl.marks, Math.min(DROP_MARKS, pl.marks.length)).map((m) => ({ name: m.name, job: m.job, face: m.face })) });
        state.level = levelAfter;
        state.sessions++;
        state.recentNames = [...pl.marks.map((m) => m.name), ...state.recentNames].slice(0, 60);
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
