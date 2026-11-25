/* Double Cross (SCHEDULER / SOCKET): probabilistic reversal learning.
 *
 * Two contacts sell tips. One is usually right, the other usually wrong, but
 * never always: feedback is probabilistic (e.g. 80/20). Once you have settled
 * on the good contact (8 of your last 10 picks), the two quietly swap roles:
 * they double-cross you. You must notice from noisy feedback and switch.
 * Measures: reversals reached, perseverative errors (sticking with the old
 * contact after a reversal), win-stay and lose-shift rates (a single bad tip
 * from the good contact is not a reason to switch). Paradigm: Cools et al.
 * 2002; Izquierdo et al. 2017. Training evidence: little; grade X.
 */
(function (root) {
  'use strict';
  const WW = root.WW;

  const TRIALS = 100;
  const CRITERION = [8, 10]; // 8 of the last 10 picks on the good contact
  const MAX_LEVEL = 3;
  const CONTACTS = ['Kessler', 'Moth'];

  /** Level -> feedback reliability. */
  const params = (level) => ({ pGood: [0.85, 0.8, 0.75, 0.7][Math.min(level, MAX_LEVEL)], deadline: 3000 });

  /**
   * Run the task logic over a list of choices (0/1) and outcome draws (uniform 0..1).
   * Returns per-trial records; used both live and in tests.
   */
  function step(state, choice, u, p) {
    const good = state.good;
    const pickedGood = choice === good;
    const win = pickedGood ? u < p.pGood : u < 1 - p.pGood;
    state.recent.push(pickedGood ? 1 : 0);
    if (state.recent.length > CRITERION[1]) state.recent.shift();
    const rec = { good, choice, pickedGood, win, reversalIndex: state.reversals, sinceReversal: state.since };
    state.since++;
    if (state.recent.filter(Boolean).length >= CRITERION[0] && state.recent.length >= CRITERION[1]) {
      state.good = 1 - state.good;
      state.reversals++;
      state.recent = [];
      state.since = 0;
      rec.reversedAfter = true;
    }
    return rec;
  }

  /** Summary measures from trial records (in order). */
  function analyse(recs) {
    let winStay = 0;
    let wins = 0;
    let loseShift = 0;
    let losses = 0;
    for (let i = 1; i < recs.length; i++) {
      const prev = recs[i - 1];
      if (prev.choice == null || recs[i].choice == null) continue;
      if (prev.win) {
        wins++;
        if (recs[i].choice === prev.choice) winStay++;
      } else {
        losses++;
        if (recs[i].choice !== prev.choice) loseShift++;
      }
    }
    // Perseverative errors: after each reversal, picks of the old good contact before the first switch to the new one.
    let persev = 0;
    let reversals = 0;
    for (let i = 0; i < recs.length; i++) {
      if (!recs[i].reversedAfter) continue;
      reversals++;
      for (let j = i + 1; j < recs.length && recs[j].choice != null && !recs[j].pickedGood; j++) persev++;
    }
    const valid = recs.filter((r) => r.choice != null);
    return {
      reversals,
      perseverativePerReversal: reversals ? persev / reversals : null,
      winStay: wins ? winStay / wins : null,
      loseShift: losses ? loseShift / losses : null,
      goodPickRate: valid.length ? valid.filter((r) => r.pickedGood).length / valid.length : null,
    };
  }

  function nextLevel(level, reversals) {
    if (reversals >= 6) return Math.min(MAX_LEVEL, level + 1);
    if (reversals <= 2) return Math.max(0, level - 1);
    return level;
  }

  WW.logic = WW.logic || {};
  WW.logic.doubleCross = { params, step, analyse, nextLevel, CRITERION };

  WW.games.register({
    id: 'double-cross',
    name: 'Double Cross',
    headline: (s) => `${s.reversals} reversals · level ${s.level}`,
    /** Tune: reversals reached out of 8 (a strong session), scaled by level reliability. */
    tune(sessions) {
      const v = sessions.slice(0, 5).map((s) => s.summary).filter((x) => x && Number.isFinite(x.reversals)).map((x) => x.reversals / 8 * (0.7 + 0.1 * x.level));
      return v.length ? WW.stats.clamp01(WW.stats.mean(v)) : null;
    },
    mount(container, ctx) {
      const { h, clear } = ctx.ui;
      const T = ctx.timing;
      const S = WW.stats;
      const ac = new AbortController();
      const signal = ac.signal;
      const rng = ctx.rng;

      (async () => {
        const saved = await ctx.loadState('progress', { level: 0, sessions: 0 });
        const p = params(saved.level);
        if (
          !(await WW.screens.intro(container, {
            kicker: 'SCHEDULER · SOCKET · reversal learning',
            title: 'Double Cross',
            body: [
              'Two contacts sell you tips. Pick one each time (F for the left, J for the right; they swap sides at random). The tip pays or it doesn’t.',
              `One contact is usually right, the other usually wrong, but nobody is right every time: even the good one burns you now and then.`,
              'Once you have worked out who to trust, they may double-cross you and swap roles, without warning. Notice, and switch.',
            ],
            kv: [
              ['Session', `${TRIALS} tips, about 4 min`],
              ['Level', `${saved.level}: the good contact is right ${Math.round(p.pGood * 100)}% of the time`],
            ],
            button: 'Start',
            signal,
          }))
        )
          return;
        const msg = h('p.label', '');
        const left = h('button.btn.dc-card', { type: 'button' });
        const right = h('button.btn.dc-card', { type: 'button' });
        const fb = h('p.dc-fb.stim', '');
        const score = h('p.muted.small', '');
        clear(container);
        container.append(h('div.center', { style: { userSelect: 'none', touchAction: 'manipulation' } }, msg, h('div.row', { style: { justifyContent: 'center' } }, left, right), fb, score));
        const state = { good: rng.int(0, 1), recent: [], reversals: 0, since: 0 };
        const recs = [];
        let earned = 0;
        for (let i = 0; i < TRIALS; i++) {
          const swap = rng.chance(0.5);
          const sides = swap ? [1, 0] : [0, 1];
          left.textContent = '';
          right.textContent = '';
          left.append(h('kbd', 'F'), ' ', CONTACTS[sides[0]]);
          right.append(h('kbd', 'J'), ' ', CONTACTS[sides[1]]);
          fb.textContent = '';
          const onset = await T.onNextFrame(() => {});
          const r = await T.awaitChoice({ keyMap: { KeyF: 0, KeyJ: 1 }, buttons: [{ el: left, value: 0 }, { el: right, value: 1 }], timeoutMs: p.deadline, since: onset, signal });
          if (r.aborted) return;
          const choice = r.timeout ? null : sides[r.value];
          let rec;
          if (choice === null) {
            rec = { good: state.good, choice: null, pickedGood: false, win: false, reversalIndex: state.reversals, sinceReversal: state.since };
            fb.textContent = 'Too slow: no tip.';
          } else {
            rec = step(state, choice, rng.next(), p);
            earned += rec.win ? 1 : 0;
            fb.textContent = rec.win ? `${CONTACTS[choice]}’s tip paid.` : `${CONTACTS[choice]}’s tip was bad.`;
            fb.className = 'dc-fb stim ' + (rec.win ? 'win' : 'loss');
            ctx.audio.sfx(rec.win ? 'correct' : 'error');
          }
          rec.rt = r.timeout ? null : r.rt;
          recs.push(rec);
          ctx.session.trial({
            condition: rec.sinceReversal < 10 && rec.reversalIndex > 0 ? 'post-reversal' : 'stable',
            stimulus: { good: CONTACTS[rec.good], sides: sides.map((x) => CONTACTS[x]), reversal: rec.reversalIndex },
            response: choice === null ? null : CONTACTS[choice],
            correct: choice === null ? false : rec.pickedGood,
            rt: rec.rt,
            level: saved.level,
            win: rec.win,
            input: r.input,
          });
          score.textContent = `Tips that paid: ${earned} / ${i + 1}`;
          await T.sleep(700);
        }
        const a = analyse(recs);
        const summary = {
          level: saved.level,
          trials: recs.length,
          reversals: a.reversals,
          perseverativePerReversal: a.perseverativePerReversal == null ? null : S.round(a.perseverativePerReversal, 2),
          winStay: a.winStay == null ? null : S.round(a.winStay, 2),
          loseShift: a.loseShift == null ? null : S.round(a.loseShift, 2),
          goodPickRate: a.goodPickRate == null ? null : S.round(a.goodPickRate, 3),
          tipsPaid: earned,
        };
        const next = nextLevel(saved.level, summary.reversals);
        const pct = (x) => (x == null ? '—' : Math.round(x * 100) + '%');
        const choice = await WW.screens.results(container, {
          headline: `${summary.reversals} DOUBLE-CROSSES CAUGHT`,
          tone: summary.reversals >= 3 ? 'good' : 'warn',
          kv: [
            ['Tips that paid', `${earned} / ${recs.length}`],
            ['Stuck with the old contact', summary.perseverativePerReversal == null ? '—' : `${summary.perseverativePerReversal} picks per reversal`],
            ['Win → stay · loss → switch', `${pct(summary.winStay)} · ${pct(summary.loseShift)}`],
            ['Level', `${saved.level} → ${next}`],
          ],
          notes: ['Switching after every bad tip is as costly as never switching: even the good contact is wrong sometimes. The skill is telling bad luck from a double-cross.'],
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
        },
      };
    },
  });
})(globalThis);
