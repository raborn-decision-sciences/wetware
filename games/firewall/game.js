/* Firewall (FIREWALL / OPTICS): flanker + stop-signal.
 *
 * Each packet is a row of five arrows; respond to the CENTRE arrow
 * (Eriksen & Eriksen 1974), ignoring the flankers. On 25% of packets a
 * stop signal (klaxon + red border) follows after a delay (SSD); then
 * withhold the response (Logan & Cowan 1984). SSD tracks ±50 ms to hold
 * stopping near 50%; SSRT by the integration method with go omissions
 * replaced by the response deadline (Verbruggen et al. 2019 consensus).
 * Training pressure: the go deadline adapts (weighted staircase, 85%).
 * Evidence: near transfer only (Kassai et al. 2019; Enge et al. 2014). Grade C.
 */
(function (root) {
  'use strict';
  const WW = root.WW;

  const BLOCK_TRIALS = 64;
  const BLOCKS = 2;
  const STOP_RATE = 0.25;
  const SSD_STEP = 50;
  const SSD_BOUNDS = [50, 1000];
  const CONF_RATE = 1 / 8;

  /** Balanced block: 25% stop, half congruent, half each direction, no stop-stop runs. */
  function makeBlock(rng, n = BLOCK_TRIALS) {
    const items = [];
    const nStop = Math.round(n * STOP_RATE);
    for (let i = 0; i < n; i++) items.push({ stop: i < nStop, congruent: i % 2 === 0, dir: i % 4 < 2 ? 'L' : 'R' });
    // Re-balance congruency/direction within stop and go separately.
    const fix = (arr) => arr.forEach((t, k) => ((t.congruent = k % 2 === 0), (t.dir = k % 4 < 2 ? 'L' : 'R')));
    fix(items.filter((t) => t.stop));
    fix(items.filter((t) => !t.stop));
    return WW.seq.arrange(rng, items, (a, b) => a.stop && b.stop);
  }

  function ssdStep(ssd, stopped) {
    const next = stopped ? ssd + SSD_STEP : ssd - SSD_STEP;
    return Math.min(SSD_BOUNDS[1], Math.max(SSD_BOUNDS[0], next));
  }

  /**
   * SSRT, integration method with replacement of go omissions.
   * goRts: RTs on all go trials (omissions passed as null -> replaced by maxRt).
   * Returns null when p(respond|signal) is outside (0.1, 0.9): unreliable.
   */
  function ssrt(goRts, pRespond, meanSsd, maxRt) {
    if (!(pRespond > 0.1 && pRespond < 0.9) || !goRts.length) return null;
    const rts = goRts.map((r) => (r == null ? maxRt : r)).sort((a, b) => a - b);
    const idx = Math.min(rts.length - 1, Math.max(0, Math.ceil(pRespond * rts.length) - 1));
    return rts[idx] - meanSsd;
  }

  WW.logic = WW.logic || {};
  WW.logic.firewall = { makeBlock, ssdStep, ssrt, STOP_RATE };

  const NS = 'http://www.w3.org/2000/svg';
  function arrow(dir) {
    const svg = root.document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 40 40');
    svg.setAttribute('class', 'fw-arrow');
    const p = root.document.createElementNS(NS, 'polygon');
    p.setAttribute('points', dir === 'R' ? '6,14 22,14 22,6 36,20 22,34 22,26 6,26' : '34,14 18,14 18,6 4,20 18,34 18,26 34,26');
    svg.appendChild(p);
    return svg;
  }

  WW.games.register({
    id: 'firewall',
    name: 'Firewall',
    headline: (s) => (s.ssrt != null ? `SSRT ${Math.round(s.ssrt)} ms` : 'SSRT n/a') + ` · go ${Math.round(s.goAccuracy * 100)}%`,
    /** FIREWALL/OPTICS tune from SSRT (median of last five): 350 ms -> 0, 150 ms -> 1. */
    tune(sessions) {
      const v = sessions.slice(0, 5).map((s) => s.summary && s.summary.ssrt).filter(Number.isFinite);
      return v.length ? WW.stats.clamp01((350 - WW.stats.median(v)) / 200) : null;
    },
    mount(container, ctx) {
      const { h, clear } = ctx.ui;
      const T = ctx.timing;
      const S = WW.stats;
      const ac = new AbortController();
      const signal = ac.signal;
      const rng = ctx.rng;
      const keyMap = { KeyF: 'L', ArrowLeft: 'L', KeyJ: 'R', ArrowRight: 'R' };

      let lane, msg, leftBtn, rightBtn, stage;
      function screen() {
        clear(container);
        msg = h('p.label', '');
        lane = h('div.fw-lane.stim');
        leftBtn = h('button.btn.fw-key', { type: 'button' }, h('kbd', 'F'), ' ◀ left');
        rightBtn = h('button.btn.fw-key', { type: 'button' }, 'right ▶ ', h('kbd', 'J'));
        stage = h('div.fw-stage.stim', lane);
        container.appendChild(h('div.center', { style: { userSelect: 'none', touchAction: 'manipulation' } }, msg, stage, h('div.row', { style: { justifyContent: 'center' } }, leftBtn, rightBtn)));
      }

      function packet(t) {
        const flank = t.congruent ? t.dir : t.dir === 'L' ? 'R' : 'L';
        WW.ui.clear(lane);
        [flank, flank, t.dir, flank, flank].forEach((d) => lane.appendChild(arrow(d)));
      }

      /** One trial. Returns record or null if aborted. */
      async function trial(t, st, practice, probe) {
        WW.ui.clear(lane);
        lane.textContent = '+';
        await T.sleep(300 + rng.int(0, 200));
        if (signal.aborted) return null;
        const deadline = st.deadline.value();
        const onset = await T.onNextFrame(() => packet(t));
        let stopShown = false;
        let stopTimer = null;
        if (t.stop) {
          stopTimer = setTimeout(() => {
            stopShown = true;
            stage.classList.add('stop');
            ctx.audio.sfx('klaxon');
          }, st.ssd);
        }
        const r = await T.awaitChoice({ keyMap, buttons: [{ el: leftBtn, value: 'L' }, { el: rightBtn, value: 'R' }], timeoutMs: deadline, since: onset, signal });
        clearTimeout(stopTimer);
        if (r.aborted) return null;
        WW.ui.clear(lane);
        const responded = !r.timeout;
        const rec = { stop: t.stop, congruent: t.congruent, dir: t.dir, responded, rt: responded ? r.rt : null, ssd: t.stop ? st.ssd : null, deadline, input: r.input };
        if (t.stop) {
          rec.correct = !responded;
          rec.signalSeen = stopShown;
          if (!practice) st.ssd = ssdStep(st.ssd, !responded);
        } else {
          rec.correct = responded && r.value === t.dir;
          rec.choice = responded ? r.value : null;
          if (!practice) st.deadline.update(rec.correct);
        }
        // Confidence before feedback, on a sample of go trials with a response.
        if (probe && !t.stop && responded) {
          const c = await WW.confidence.ask(container.querySelector('.center'), { prompt: 'Was that the right direction?', signal });
          if (!c) return null;
          rec.confidence = c.confidence;
        }
        // Feedback.
        if (t.stop) {
          ctx.audio.sfx(rec.correct ? 'tick' : 'error');
          msg.textContent = rec.correct ? 'Blocked.' : 'Leak: you fired after the klaxon.';
        } else if (!responded) {
          msg.textContent = 'Too slow';
          ctx.audio.sfx('error');
        } else if (!rec.correct) {
          msg.textContent = 'Wrong way';
          ctx.audio.sfx('error');
        } else msg.textContent = '';
        await T.sleep(t.stop || !rec.correct ? 450 : 150);
        stage.classList.remove('stop');
        msg.textContent = '';
        return rec;
      }

      (async () => {
        const saved = await ctx.loadState('progress', { deadline: null, ssd: 250, sessions: 0 });
        const st = {
          ssd: saved.ssd,
          deadline: saved.deadline
            ? WW.Staircase.fromJSON(saved.deadline)
            : new WW.Staircase({ rule: 'weighted', target: 0.85, start: 1000, step: 0.03, scale: 'log', harderIs: 'down', min: 350, max: 1500 }),
        };
        if (
          !(await WW.screens.intro(container, {
            kicker: 'FIREWALL · inhibitory control',
            title: 'Firewall',
            body: [
              'Packets arrive as a row of arrows. Route each one by its CENTRE arrow: F (or ←) for left, J (or →) for right. Ignore the arrows around it.',
              'Sometimes the klaxon sounds and the border turns red just after a packet arrives: then don’t respond at all.',
              'Don’t wait for the klaxon. Respond as fast as you can; sometimes you won’t be able to stop, and that’s expected.',
            ],
            kv: [['Session', `${BLOCKS} × ${BLOCK_TRIALS} packets, about 5 min`], ['Response window', `${Math.round(st.deadline.value())} ms (adapts)`]],
            legend: WW.screens.legend([{ key: 'F', label: 'left' }, { key: 'J', label: 'right' }]),
            button: saved.sessions ? 'Start' : 'Practice',
            signal,
          }))
        )
          return;
        ctx.audio.unlock();
        screen();
        if (!saved.sessions) {
          const prac = makeBlock(rng.fork('practice'), 12);
          for (const t of prac) if ((await trial(t, st, true, false)) === null) return;
          msg.textContent = 'Now for real.';
          await T.sleep(1200);
        }

        const recs = [];
        for (let b = 0; b < BLOCKS; b++) {
          msg.textContent = `Block ${b + 1} / ${BLOCKS}`;
          await T.sleep(1200);
          for (const t of makeBlock(rng)) {
            const probe = !t.stop && WW.confidence.shouldProbe(rng, CONF_RATE);
            const r = await trial(t, st, false, probe);
            if (r === null) return;
            r.block = b + 1;
            recs.push(r);
            ctx.session.trial({
              condition: (r.stop ? 'stop' : 'go') + '-' + (r.congruent ? 'congruent' : 'incongruent'),
              stimulus: { dir: r.dir, congruent: r.congruent, stop: r.stop, ssd: r.ssd, block: r.block },
              response: r.responded ? r.choice || 'press' : null,
              correct: r.correct,
              rt: r.rt,
              level: S.round(r.deadline),
              confidence: r.confidence,
              input: r.input,
            });
          }
          if (b < BLOCKS - 1) {
            const ok = await WW.screens.intro(container, { title: 'Rest', body: ['Short break. Same rules.'], button: 'Continue', signal });
            if (!ok) return;
            screen();
          }
        }

        const go = recs.filter((r) => !r.stop);
        const stops = recs.filter((r) => r.stop);
        const goCorrectRts = go.filter((r) => r.correct).map((r) => r.rt);
        const pRespond = stops.filter((r) => r.responded).length / stops.length;
        const meanSsd = S.mean(stops.map((r) => r.ssd));
        const maxRt = Math.max(...go.map((r) => r.deadline));
        const ssrtVal = ssrt(go.map((r) => (r.responded ? r.rt : null)), pRespond, meanSsd, maxRt);
        const med = (cong) => S.median(go.filter((r) => r.correct && r.congruent === cong).map((r) => r.rt));
        const pairs = recs.filter((r) => r.confidence != null).map((r) => [r.confidence, r.correct]);
        const summary = {
          trials: recs.length,
          goAccuracy: S.round(go.filter((r) => r.correct).length / go.length, 3),
          goOmissions: go.filter((r) => !r.responded).length,
          goMeanRt: S.round(S.mean(goCorrectRts)),
          pRespondSignal: S.round(pRespond, 3),
          meanSsd: S.round(meanSsd),
          ssrt: S.round(ssrtVal),
          flankerEffect: S.round(med(false) - med(true)),
          deadline: S.round(st.deadline.value()),
          confidencePairs: pairs,
        };
        const choice = await WW.screens.results(container, {
          headline: summary.ssrt != null ? `SSRT ${Math.round(summary.ssrt)} MS` : 'SSRT N/A',
          tone: summary.ssrt == null || summary.goAccuracy < 0.8 ? 'warn' : 'good',
          kv: [
            ['Stop-signal RT', summary.ssrt != null ? `${summary.ssrt} ms` : 'not estimable this run'],
            ['Stopped successfully', `${Math.round((1 - pRespond) * 100)}% (target ~50%)`],
            ['Go accuracy · mean RT', `${Math.round(summary.goAccuracy * 100)}% · ${summary.goMeanRt} ms`],
            ['Flanker effect', `${summary.flankerEffect} ms (incongruent − congruent)`],
            ['Response window next time', `${summary.deadline} ms`],
            pairs.length ? ['Confidence checks', `${pairs.length}`] : null,
          ],
          notes: [
            'Lower SSRT = faster braking. SSRT is only estimated when stopping lands between 10% and 90%.',
            'Your response window and stop-signal delay carry over only if you log the session.',
          ],
          signal,
        });
        if (choice === 'save') {
          await ctx.saveState('progress', { deadline: st.deadline.toJSON(), ssd: st.ssd, sessions: saved.sessions + 1 });
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
