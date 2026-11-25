/* Dead Man's Switch (CRON): prospective memory — remembering to act later.
 *
 * Ongoing task: packets (two-digit numbers) stream in; route each by parity
 * (F odd / J even). Two intentions run on top of it, with no reminders:
 *   - Event-based: any packet from port 7x (70–79) must be held with Space
 *     instead of routed. The cue is rare.
 *   - Time-based: ping the dead man's switch (P) once every interval. The
 *     clock is hidden; C shows it for a moment, and every check is logged,
 *     because when people check (more often as the deadline nears) is the
 *     strategic-monitoring signal (Einstein & McDaniel 2005; Harris & Wilkins 1982).
 * A short baseline block without intentions gives the ongoing-task cost of
 * holding them (Smith 2003). Level makes cues rarer and intervals longer.
 * Training evidence for prospective memory is modest: grade C (Hering et al. 2014).
 */
(function (root) {
  'use strict';
  const WW = root.WW;

  const BASELINE = 30;
  const PM_TRIALS = 140;
  const WINDOW = 5000; // a ping counts within ±5 s of each mark
  const MAX_LEVEL = 6;

  /** Level -> cue count and ping interval. */
  const params = (level) => ({ cues: Math.max(3, 7 - level), interval: 50 + level * 10, deadline: 1800 });

  const isCue = (n) => n >= 70 && n <= 79;

  /** Ongoing stream with `cues` cue packets spread through it (never in the first 15, never adjacent). */
  function makeStream(rng, n, cues) {
    const out = [];
    const slots = [];
    const gap = Math.floor((n - 15) / cues);
    for (let i = 0; i < cues; i++) slots.push(15 + i * gap + rng.int(0, Math.max(0, gap - 4)));
    for (let i = 0; i < n; i++) {
      let v;
      if (slots.includes(i)) v = rng.int(70, 79);
      else {
        do v = rng.int(10, 99);
        while (isCue(v) || (out[i - 1] && out[i - 1].n === v));
      }
      out.push({ n: v, cue: slots.includes(i) });
    }
    return out;
  }

  /** Score pings against marks at interval, 2*interval, ... within the block duration. */
  function scorePings(pings, interval, duration) {
    const marks = [];
    for (let t = interval * 1000; t <= duration + WINDOW / 2; t += interval * 1000) marks.push(t);
    const used = new Set();
    let hits = 0;
    const offsets = [];
    for (const m of marks) {
      const i = pings.findIndex((p, k) => !used.has(k) && Math.abs(p - m) <= WINDOW);
      if (i >= 0) {
        used.add(i);
        hits++;
        offsets.push(pings[i] - m);
      }
    }
    return { marks: marks.length, hits, falsePings: pings.length - used.size, offsets };
  }

  /** Share of clock checks made in the last quarter before a mark (monitoring that ramps up). */
  function lateCheckShare(checks, interval) {
    if (!checks.length) return null;
    const I = interval * 1000;
    const late = checks.filter((t) => t % I >= 0.75 * I).length;
    return late / checks.length;
  }

  function nextLevel(level, eventRate, pingRate) {
    const both = (eventRate + pingRate) / 2;
    if (both >= 0.85) return Math.min(MAX_LEVEL, level + 1);
    if (both < 0.5) return Math.max(0, level - 1);
    return level;
  }

  WW.logic = WW.logic || {};
  WW.logic.deadSwitch = { makeStream, scorePings, lateCheckShare, nextLevel, params, isCue };

  WW.games.register({
    id: 'dead-switch',
    name: 'Dead Man’s Switch',
    headline: (s) => `holds ${s.eventHits}/${s.eventCues} · pings ${s.pingHits}/${s.pingMarks}`,
    /**
     * CRON tune: (level + mean hit rate) / (MAX_LEVEL + 1), over recent sessions. The level carries
     * the skill (the staircase holds hit rates near its band), the hit rate places you within it.
     */
    tune(sessions) {
      const v = sessions
        .slice(0, 5)
        .map((s) => s.summary)
        .filter((x) => x && x.eventCues && x.pingMarks && Number.isFinite(x.level))
        .map((x) => (x.level + (x.eventHits / x.eventCues + x.pingHits / x.pingMarks) / 2) / (MAX_LEVEL + 1));
      return v.length ? WW.stats.clamp01(WW.stats.mean(v)) : null;
    },
    mount(container, ctx) {
      const { h, clear } = ctx.ui;
      const T = ctx.timing;
      const S = WW.stats;
      const ac = new AbortController();
      const signal = ac.signal;
      const rng = ctx.rng;

      let packet, msg, clockEl, fBtn, jBtn, sBtn, pBtn, cBtn;
      function screen() {
        clear(container);
        msg = h('p.label', '');
        packet = h('div.ds-packet.stim', '');
        clockEl = h('div.ds-clock', '');
        fBtn = h('button.btn', { type: 'button' }, h('kbd', 'F'), ' odd');
        jBtn = h('button.btn', { type: 'button' }, h('kbd', 'J'), ' even');
        sBtn = h('button.btn', { type: 'button' }, h('kbd', 'Space'), ' hold');
        pBtn = h('button.btn', { type: 'button' }, h('kbd', 'P'), ' ping');
        cBtn = h('button.btn', { type: 'button' }, h('kbd', 'C'), ' clock');
        container.appendChild(
          h(
            'div.center',
            { style: { userSelect: 'none', touchAction: 'manipulation' } },
            msg,
            packet,
            clockEl,
            h('div.row', { style: { justifyContent: 'center' } }, fBtn, jBtn, sBtn),
            h('div.row', { style: { justifyContent: 'center' } }, pBtn, cBtn)
          )
        );
      }

      // Pings and clock checks can happen at any moment, independent of packets.
      let blockStart = null;
      let interval = 60;
      const pings = [];
      const checks = [];
      let clockTimer = null;
      const fmt = (ms) => {
        const s = Math.max(0, Math.floor(ms / 1000));
        return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
      };
      function ping(input) {
        if (blockStart == null) return;
        const t = performance.now() - blockStart;
        pings.push(t);
        ctx.session.trial({ condition: 'ping', stimulus: { interval }, response: 'ping', rt: null, correct: null, input, level: null, elapsed: Math.round(t) });
        ctx.audio.sfx('ui');
      }
      function check(input) {
        if (blockStart == null) return;
        const t = performance.now() - blockStart;
        checks.push(t);
        ctx.session.trial({ condition: 'clock-check', stimulus: { interval }, response: 'clock', rt: null, correct: null, input, elapsed: Math.round(t) });
        clockEl.textContent = fmt(t);
        clearTimeout(clockTimer);
        clockTimer = setTimeout(() => (clockEl.textContent = ''), 1200);
      }
      const onKey = (e) => {
        if (e.repeat) return;
        if (e.code === 'KeyP') (e.preventDefault(), ping('keyboard'));
        else if (e.code === 'KeyC') (e.preventDefault(), check('keyboard'));
      };
      root.addEventListener('keydown', onKey, true);
      signal.addEventListener('abort', () => root.removeEventListener('keydown', onKey, true));

      async function run(stream, label, withPm, p, recs) {
        msg.textContent = label;
        await T.sleep(1500);
        msg.textContent = '';
        for (const t of stream) {
          if (signal.aborted) return false;
          packet.textContent = '';
          await T.sleep(250 + rng.int(0, 150));
          const onset = await T.onNextFrame(() => (packet.textContent = String(t.n)));
          const keyMap = withPm ? { KeyF: 0, KeyJ: 1, Space: 2 } : { KeyF: 0, KeyJ: 1 };
          const buttons = [{ el: fBtn, value: 0 }, { el: jBtn, value: 1 }].concat(withPm ? [{ el: sBtn, value: 2 }] : []);
          const r = await T.awaitChoice({ keyMap, buttons, timeoutMs: p.deadline, since: onset, signal });
          if (r.aborted) return false;
          const parity = t.n % 2 === 1 ? 0 : 1;
          const want = t.cue ? 2 : parity;
          const correct = !r.timeout && r.value === want;
          const rec = { n: t.n, cue: t.cue, choice: r.timeout ? null : r.value, correct, rt: r.timeout ? null : r.rt, block: label };
          recs.push(rec);
          ctx.session.trial({
            condition: !withPm ? 'baseline' : t.cue ? 'pm-cue' : 'pm-ongoing',
            stimulus: { n: t.n, cue: t.cue },
            response: rec.choice,
            correct,
            rt: rec.rt,
            level: p.level,
            input: r.input,
          });
          if (!t.cue && !correct) {
            ctx.audio.sfx('error');
            msg.textContent = r.timeout ? 'Too slow' : r.value === 2 ? 'Not a 7x packet' : 'Wrong';
            await T.sleep(450);
            msg.textContent = '';
          }
        }
        return true;
      }

      (async () => {
        const saved = await ctx.loadState('progress', { level: 0, sessions: 0 });
        const p = Object.assign({ level: saved.level }, params(saved.level));
        interval = p.interval;
        if (
          !(await WW.screens.intro(container, {
            kicker: 'CRON · prospective memory',
            title: 'Dead Man’s Switch',
            body: [
              'Route packets by parity: F for odd, J for even. That is the job.',
              `On top of it, two standing orders, with no reminders. 1. Any packet from port 7x (70 to 79): hold it with Space instead of routing it. 2. Every ${p.interval} seconds, ping the dead man’s switch with P.`,
              'The clock is hidden. C shows it for a moment; check as often as you like. Pings and checks work any time, between packets too.',
              'A short warm-up with no orders comes first.',
            ],
            kv: [
              ['Session', `${BASELINE} warm-up + ${PM_TRIALS} packets, about 4 min`],
              ['Orders this level', `${p.cues} port-7x packets · ping every ${p.interval} s`],
            ],
            button: 'Start',
            signal,
          }))
        )
          return;
        screen();
        const recs = [];
        if (!(await run(makeStream(rng.fork('base'), BASELINE, 0), 'Warm-up: route only', false, p, recs))) return;
        msg.textContent = `Orders live: hold 7x with Space · ping every ${p.interval} s`;
        await T.sleep(2500);
        blockStart = performance.now();
        if (!(await run(makeStream(rng, PM_TRIALS, p.cues), 'Orders live', true, p, recs))) return;
        const duration = performance.now() - blockStart;
        blockStart = null;

        const base = recs.filter((r) => r.block !== 'Orders live');
        const pm = recs.filter((r) => r.block === 'Orders live');
        const ongoing = pm.filter((r) => !r.cue);
        const cues = pm.filter((r) => r.cue);
        const ps = scorePings(pings, p.interval, duration);
        const medRt = (arr) => S.median(arr.filter((r) => r.correct && r.rt != null).map((r) => r.rt));
        const summary = {
          level: p.level,
          eventCues: cues.length,
          eventHits: cues.filter((r) => r.choice === 2).length,
          eventFalseHolds: ongoing.filter((r) => r.choice === 2).length,
          pingMarks: ps.marks,
          pingHits: ps.hits,
          falsePings: ps.falsePings,
          pingOffsetMs: ps.offsets.length ? S.round(S.median(ps.offsets.map(Math.abs))) : null,
          clockChecks: checks.length,
          lateCheckShare: lateCheckShare(checks, p.interval) == null ? null : S.round(lateCheckShare(checks, p.interval), 2),
          ongoingAccuracy: S.round(ongoing.filter((r) => r.correct).length / Math.max(1, ongoing.length), 3),
          baselineRt: S.round(medRt(base)),
          ongoingRt: S.round(medRt(ongoing)),
          pmCostRt: S.round(medRt(ongoing) - medRt(base)),
          durationS: Math.round(duration / 1000),
        };
        const eventRate = summary.eventCues ? summary.eventHits / summary.eventCues : 0;
        const pingRate = summary.pingMarks ? summary.pingHits / summary.pingMarks : 0;
        const next = nextLevel(p.level, eventRate, pingRate);
        const choice = await WW.screens.results(container, {
          headline: `${summary.eventHits}/${summary.eventCues} HELD · ${summary.pingHits}/${summary.pingMarks} PINGED`,
          tone: eventRate >= 0.5 && pingRate >= 0.5 ? 'good' : 'warn',
          kv: [
            ['Port 7x held', `${summary.eventHits} of ${summary.eventCues}${summary.eventFalseHolds ? ` · ${summary.eventFalseHolds} held by mistake` : ''}`],
            ['Switch pinged', `${summary.pingHits} of ${summary.pingMarks} marks${summary.falsePings ? ` · ${summary.falsePings} stray` : ''}${summary.pingOffsetMs != null ? ` · typically ${(summary.pingOffsetMs / 1000).toFixed(1)} s off` : ''}`],
            ['Clock checks', `${summary.clockChecks}${summary.lateCheckShare != null ? ` · ${Math.round(summary.lateCheckShare * 100)}% in the last quarter before a mark` : ''}`],
            ['Routing', `${Math.round(summary.ongoingAccuracy * 100)}% · cost of the orders ${summary.pmCostRt == null ? '—' : (summary.pmCostRt >= 0 ? '+' : '') + summary.pmCostRt + ' ms'}`],
            ['Level', `${p.level} → ${next}`],
          ],
          notes: ['Checking the clock more as a deadline nears is the efficient pattern. The cost line is how much slower routing got while you held the orders in mind.'],
          signal,
        });
        if (choice === 'save') {
          await ctx.saveState('progress', { level: next, sessions: saved.sessions + 1 });
          ctx.finish(summary);
        } else ctx.abort();
      })().catch((e) => console.error(e));

      return {
        stop() {
          ac.abort();
          clearTimeout(clockTimer);
        },
      };
    },
  });
})(globalThis);
