/* Night Watch (OPTICS): sustained attention, rare-target vigilance.
 *
 * A searchlight steps around the Spire perimeter one sector per tick. Now
 * and then it skips further than usual (a looped camera); press only for
 * the skip. This is a short Mackworth clock (Mackworth 1948): a rare
 * target to detect, the opposite response rule to the SART used in
 * Diagnostics, so the SART probe stays a transfer test rather than a
 * practised task (PLAN §6).
 * Knowledge of results reduces the vigilance decrement (Mackworth 1950),
 * so hits, false alarms and misses all get brief feedback. Thought probes
 * ask where attention was (on task / task-related / mind wandering /
 * blank; after Stawarczyk et al. 2011).
 * Level (1-10) sets the tick rate and how subtle the skip is.
 * Evidence: vigilance improves with practice and feedback, but transfer is
 * thin. Grade C.
 */
(function (root) {
  'use strict';
  const WW = root.WW;

  const SECTORS = 80;
  const SWEEP_MS = 360000; // 6 minutes of watch
  const TARGET_RATE = 0.06;
  const MIN_GAP = 8; // steps between skips
  const LEAD_IN = 10; // no skips in the first steps
  const MAX_LEVEL = 10;
  const PROBES = [0.3, 0.6, 0.9];
  const ANTICIPATION_MS = 150;
  const PROBE_OPTIONS = [
    ['on', 'On the sweep'],
    ['task', 'On how I was doing'],
    ['away', 'Somewhere else'],
    ['blank', 'Blank, zoned out'],
  ];

  /** Tick interval and skip size (extra fraction of a step) for a level. */
  function params(level) {
    const L = Math.max(1, Math.min(MAX_LEVEL, Math.round(level)));
    return { level: L, stepMs: 1000 - (L - 1) * 40, extra: WW.stats.round(1 - (L - 1) * 0.07, 2) };
  }

  /** Response window for a skip, in ms after its onset. */
  const windowMs = (stepMs) => Math.max(1600, stepMs * 2.2);

  /**
   * Plan a watch: which steps are skips and where the thought probes fall.
   * Returns { nSteps, targets: Set<step>, probes: [step] }.
   */
  function schedule(rng, stepMs, durationMs = SWEEP_MS) {
    const nSteps = Math.round(durationMs / stepMs);
    const nT = Math.round(nSteps * TARGET_RATE);
    const free = nSteps - LEAD_IN - 4 - nT * MIN_GAP;
    const picks = [];
    for (let i = 0; i < nT; i++) picks.push(rng.int(0, Math.max(0, free)));
    picks.sort((a, b) => a - b);
    const targets = new Set(picks.map((p, i) => LEAD_IN + p + i * MIN_GAP));
    const nearTarget = (s) => [...targets].some((t) => s - t >= -3 && s - t <= 6);
    const probes = PROBES.map((f) => {
      let s = Math.round(nSteps * f) + rng.int(-5, 5);
      while (nearTarget(s) && s < nSteps - 2) s++;
      return Math.min(nSteps - 2, s);
    });
    return { nSteps, targets, probes: [...new Set(probes)] };
  }

  /**
   * Score presses against skip onsets.
   * targets: [{ onset, void? }], presses: [t], nonTargets: count of plain steps.
   * Each skip is hit by the first press in [onset + 150 ms, onset + window];
   * later presses in the same window are ignored; any other press is a false alarm.
   */
  function score(targets, presses, nonTargets, win) {
    const live = targets.filter((t) => !t.void);
    const hitRts = [];
    const outcome = live.map(() => null);
    let fas = 0;
    for (const p of presses) {
      const i = live.findIndex((t) => p - t.onset >= ANTICIPATION_MS && p - t.onset <= win);
      if (i < 0) fas++;
      else if (outcome[i] === null) {
        outcome[i] = p - live[i].onset;
        hitRts.push(outcome[i]);
      }
    }
    const hits = hitRts.length;
    const misses = live.length - hits;
    const crs = Math.max(0, nonTargets - fas);
    const half = Math.ceil(live.length / 2);
    const rate = (xs) => (xs.length ? xs.filter((x) => x !== null).length / xs.length : null);
    return {
      targets: live.length,
      hits,
      misses,
      fas,
      hitRate: live.length ? hits / live.length : null,
      faRate: nonTargets ? fas / nonTargets : 0,
      dprime: WW.stats.dprime(hits, misses, fas, crs),
      hitRtMs: hitRts.length ? WW.stats.median(hitRts) : null,
      firstHalfHitRate: rate(outcome.slice(0, half)),
      secondHalfHitRate: rate(outcome.slice(half)),
      outcome,
    };
  }

  function nextLevel(level, s) {
    if (s.hitRate >= 0.85 && s.faRate <= 0.03) return Math.min(MAX_LEVEL, level + 1);
    if (s.hitRate < 0.6 || s.faRate > 0.1) return Math.max(1, level - 1);
    return level;
  }

  WW.logic = WW.logic || {};
  WW.logic.nightWatch = { params, windowMs, schedule, score, nextLevel, SECTORS, SWEEP_MS, MAX_LEVEL, PROBE_OPTIONS };

  WW.games.register({
    id: 'night-watch',
    name: 'Night Watch',
    headline: (s) => `d′ ${s.dprime} · ${s.hits}/${s.targets} loops · L${s.level}`,
    /** OPTICS tune: level after the session, 1 -> 0, 10 -> 1. */
    tune(sessions) {
      const s = sessions[0] && sessions[0].summary;
      return s && Number.isFinite(s.levelAfter) ? WW.stats.clamp01((s.levelAfter - 1) / (MAX_LEVEL - 1)) : null;
    },
    mount(container, ctx) {
      const { h, clear } = ctx.ui;
      const T = ctx.timing;
      const S = WW.stats;
      const ac = new AbortController();
      const signal = ac.signal;
      const rng = ctx.rng;
      const doc = root.document;

      function draw(canvas, angle, opts) {
        const o = opts || {};
        const g = canvas.getContext('2d');
        const n = canvas.width;
        const c = n / 2;
        const R = n * 0.42;
        g.fillStyle = '#07070c';
        g.fillRect(0, 0, n, n);
        g.strokeStyle = '#2a2734';
        g.lineWidth = Math.max(1, n / 300);
        for (let i = 0; i < SECTORS; i++) {
          const a = (i / SECTORS) * Math.PI * 2 - Math.PI / 2;
          const r0 = i % 10 === 0 ? R * 0.9 : R * 0.94;
          g.beginPath();
          g.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
          g.lineTo(c + Math.cos(a) * R, c + Math.sin(a) * R);
          g.stroke();
        }
        if (o.missAt != null) {
          const a = o.missAt - Math.PI / 2;
          g.strokeStyle = '#ff2a6d';
          g.lineWidth = n / 60;
          g.beginPath();
          g.arc(c, c, R * 1.04, a - 0.08, a + 0.08);
          g.stroke();
        }
        if (angle != null) {
          const a = angle - Math.PI / 2;
          // Beam from the centre plus a lamp on the ring.
          g.strokeStyle = 'rgba(5, 217, 232, 0.35)';
          g.lineWidth = n / 120;
          g.beginPath();
          g.moveTo(c, c);
          g.lineTo(c + Math.cos(a) * R * 0.86, c + Math.sin(a) * R * 0.86);
          g.stroke();
          g.fillStyle = '#05d9e8';
          g.beginPath();
          g.arc(c + Math.cos(a) * R, c + Math.sin(a) * R, n / 40, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = '#12111a';
        g.beginPath();
        g.arc(c, c, n * 0.06, 0, Math.PI * 2);
        g.fill();
        if (o.progress != null) {
          g.strokeStyle = '#3d3849';
          g.lineWidth = n / 150;
          g.beginPath();
          g.arc(c, c, n * 0.08, -Math.PI / 2, -Math.PI / 2 + o.progress * Math.PI * 2);
          g.stroke();
        }
      }

      function probe(n, of) {
        return new Promise((resolve) => {
          const overlay = h('div.nw-probe', h('p.label', `Check-in ${n} / ${of}`), h('p', 'Just before this, where was your attention?'));
          const btns = PROBE_OPTIONS.map(([v, label], i) => h('button.btn', { type: 'button' }, h('kbd', String(i + 1)), ' ' + label));
          overlay.appendChild(h('div.nw-probe-opts', btns));
          stageEl.appendChild(overlay);
          const keyMap = {};
          PROBE_OPTIONS.forEach(([v], i) => (keyMap['Digit' + (i + 1)] = v));
          T.awaitChoice({ keyMap, buttons: btns.map((el, i) => ({ el, value: PROBE_OPTIONS[i][0] })), signal }).then((r) => {
            overlay.remove();
            resolve(r);
          });
        });
      }

      let stageEl;

      (async () => {
        const saved = await ctx.loadState('progress', { level: 1, sessions: 0 });
        const P = params(saved.level);
        if (
          !(await WW.screens.intro(container, {
            kicker: 'OPTICS · sustained attention',
            title: 'Night Watch',
            body: [
              'Night shift on the Spire perimeter. A searchlight steps around the camera ring, one notch per tick.',
              'When someone loops a camera, the light skips: it jumps further than one notch. Press Space (or tap FLAG) when it skips. Only then.',
              'It is quiet and it is meant to be. Rook will check in three times to ask where your head was; answer honestly, there is no wrong answer.',
            ],
            kv: [
              ['Level', `${P.level} · tick ${P.stepMs} ms · skip +${Math.round(P.extra * 100)}% of a notch`],
              ['Session', 'about 6 minutes, no breaks'],
              ['Keys', 'Space to flag a skip; 1–4 at check-ins'],
            ],
            button: 'Start watch',
            signal,
          }))
        )
          return;
        ctx.audio.unlock();

        // Show one skip before starting so the target is unambiguous.
        clear(container);
        const size = Math.floor(Math.min(root.innerWidth * 0.86, root.innerHeight * 0.58, 440));
        const dpr = Math.min(2, root.devicePixelRatio || 1);
        const canvas = h('canvas.stim.nw-canvas');
        canvas.width = canvas.height = Math.round(size * dpr);
        canvas.style.width = canvas.style.height = size + 'px';
        const msg = h('p.nw-msg', '');
        const flag = h('button.btn.nw-flag', { type: 'button' }, h('kbd', 'Space'), ' FLAG');
        stageEl = h('div.center.nw-stage', h('p.label', 'Demo: watch for the skip'), canvas, msg, flag);
        container.appendChild(stageEl);
        const stepA = (Math.PI * 2) / SECTORS;
        let angle = 0;
        draw(canvas, angle);
        for (let i = 0; i < 9; i++) {
          await T.sleep(P.stepMs);
          if (signal.aborted) return;
          angle += stepA * (i === 5 ? 1 + P.extra : 1);
          draw(canvas, angle);
          if (i === 5) msg.textContent = '↑ that was a skip';
          if (i === 7) msg.textContent = '';
        }
        stageEl.querySelector('.label').textContent = 'Watch';
        await T.sleep(800);
        if (signal.aborted) return;

        // The watch.
        const plan = schedule(rng, P.stepMs);
        const win = windowMs(P.stepMs);
        const targets = []; // { step, onset, angle, void }
        const presses = [];
        const probes = [];
        let step = 0;
        let next = T.now() + P.stepMs;
        let paused = false;
        let pendingMiss = null;
        let msgTimer = null;
        const say = (text, cls) => {
          msg.textContent = text;
          msg.className = 'nw-msg' + (cls ? ' ' + cls : '');
          clearTimeout(msgTimer);
          msgTimer = setTimeout(() => (msg.textContent = ''), 600);
        };
        const onPress = (t) => {
          if (paused) return;
          presses.push(t);
          const live = targets.filter((x) => !x.void && !x.hit && t - x.onset >= ANTICIPATION_MS && t - x.onset <= win);
          if (live.length) {
            live[0].hit = true;
            say('LOOP FLAGGED', 'good');
            ctx.audio.sfx('correct');
          } else if (!targets.some((x) => x.hit && t - x.onset <= win)) {
            say('nothing there', 'bad');
            ctx.audio.sfx('error');
          }
        };
        const onKey = (e) => {
          if (e.code !== 'Space' || e.repeat) return;
          e.preventDefault();
          onPress(e.timeStamp);
        };
        const onPointer = (e) => {
          e.preventDefault();
          onPress(e.timeStamp);
        };
        root.addEventListener('keydown', onKey, true);
        flag.addEventListener('pointerdown', onPointer);
        canvas.addEventListener('pointerdown', onPointer);
        let hiddenAt = null;
        const onVis = () => {
          if (doc.hidden) hiddenAt = T.now();
          else if (hiddenAt !== null) {
            const gap = T.now() - hiddenAt;
            next += gap;
            for (const t of targets) if (!t.hit && T.now() - gap - t.onset <= win) t.void = true;
            hiddenAt = null;
          }
        };
        doc.addEventListener('visibilitychange', onVis);
        const cleanup = () => {
          root.removeEventListener('keydown', onKey, true);
          doc.removeEventListener('visibilitychange', onVis);
          clearTimeout(msgTimer);
        };

        const finished = await new Promise((resolve) => {
          const frame = (now) => {
            if (signal.aborted) return resolve(false);
            if (!paused && hiddenAt === null && now >= next) {
              step++;
              const isTarget = plan.targets.has(step);
              angle += stepA * (isTarget ? 1 + P.extra : 1);
              // Missed skips: show where it was once the window closes.
              const missed = targets.find((t) => !t.void && !t.hit && !t.shown && now - t.onset > win);
              if (missed) {
                missed.shown = true;
                pendingMiss = { at: missed.angle, until: now + 600 };
                say('missed a loop', 'bad');
              }
              const showMiss = pendingMiss && now < pendingMiss.until ? pendingMiss.at : null;
              draw(canvas, angle, { missAt: showMiss, progress: step / plan.nSteps });
              if (isTarget) targets.push({ step, onset: now, angle, hit: false });
              next += P.stepMs;
              if (plan.probes.includes(step)) {
                paused = true;
                probe(probes.length + 1, plan.probes.length).then((r) => {
                  if (r.aborted) return resolve(false);
                  probes.push({ step, answer: r.value, rt: Math.round(r.rt) });
                  ctx.session.trial({ condition: 'probe', stimulus: { step }, response: r.value, correct: null, rt: Math.round(r.rt), level: P.level });
                  next = T.now() + P.stepMs;
                  paused = false;
                  root.requestAnimationFrame(frame);
                });
                return;
              }
              if (step >= plan.nSteps) {
                // Let the last window close.
                return setTimeout(() => resolve(true), win);
              }
            }
            root.requestAnimationFrame(frame);
          };
          root.requestAnimationFrame(frame);
          signal.addEventListener('abort', () => resolve(false));
        });
        cleanup();
        if (!finished) return;

        const nonTargets = plan.nSteps - targets.length;
        const sc = score(targets, presses, nonTargets, win);
        targets.forEach((t) => ctx.session.trial({ condition: 'skip', stimulus: { step: t.step }, response: t.void ? 'void' : t.hit ? 'hit' : 'miss', correct: t.void ? null : t.hit, rt: null, level: P.level }));
        presses.forEach((p) => ctx.session.trial({ condition: 'press', stimulus: null, response: 'press', correct: targets.some((t) => !t.void && p - t.onset >= ANTICIPATION_MS && p - t.onset <= win), rt: null, level: P.level, t: Math.round(p) }));
        const away = probes.filter((p) => p.answer === 'away' || p.answer === 'blank').length;
        const levelAfter = nextLevel(P.level, sc);
        const summary = {
          level: P.level,
          levelAfter,
          stepMs: P.stepMs,
          extra: P.extra,
          steps: plan.nSteps,
          targets: sc.targets,
          hits: sc.hits,
          misses: sc.misses,
          fas: sc.fas,
          hitRate: S.round(sc.hitRate, 3),
          faRate: S.round(sc.faRate, 4),
          dprime: S.round(sc.dprime, 2),
          hitRtMs: sc.hitRtMs != null ? Math.round(sc.hitRtMs) : null,
          firstHalfHitRate: S.round(sc.firstHalfHitRate, 3),
          secondHalfHitRate: S.round(sc.secondHalfHitRate, 3),
          probes: probes.map((p) => p.answer),
          offTaskProbes: away,
          voided: targets.filter((t) => t.void).length,
        };
        const drop = sc.firstHalfHitRate != null && sc.secondHalfHitRate != null ? Math.round((sc.firstHalfHitRate - sc.secondHalfHitRate) * 100) : null;
        const choice = await WW.screens.results(container, {
          headline: `d′ ${summary.dprime}`,
          tone: sc.hitRate >= 0.75 ? 'good' : 'warn',
          kv: [
            ['Loops flagged', `${sc.hits} of ${sc.targets}` + (summary.hitRtMs ? ` · ${summary.hitRtMs} ms median` : '')],
            ['False flags', `${sc.fas} (${(sc.faRate * 100).toFixed(1)}% of ticks)`],
            ['First half → second half', `${Math.round(sc.firstHalfHitRate * 100)}% → ${Math.round(sc.secondHalfHitRate * 100)}%` + (drop > 0 ? ` (−${drop} pts)` : '')],
            ['Check-ins', probes.map((p) => PROBE_OPTIONS.find((o) => o[0] === p.answer)[1]).join(' · ') || '—'],
            ['Next watch', `level ${levelAfter}`],
          ],
          notes: [
            'A drop from the first half to the second is the vigilance decrement: normal, and the thing this trains against.',
            summary.voided ? `${summary.voided} skip(s) happened while the page was hidden and were not scored.` : null,
            'Level carries over only if you log the session.',
          ].filter(Boolean),
          signal,
        });
        if (choice === 'save') {
          await ctx.saveState('progress', { level: levelAfter, sessions: saved.sessions + 1 });
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
