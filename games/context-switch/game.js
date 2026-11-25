/* Context Switch (SCHEDULER): cued task switching.
 *
 * A digit (1-9, not 5) appears in one of two shells. The shell's cue says
 * which rule owns the input: PARITY (odd F / even J) or MAGNITUDE (low F /
 * high J). Pure blocks of each rule, then a mixed block where the rule
 * switches on ~50% of trials (Rogers & Monsell 1995; Monsell 2003).
 * Measures: switch cost (switch - repeat, mixed block), mixing cost
 * (mixed repeats - pure), error costs. Training pressure: one level drives
 * a shorter cue-stimulus interval and a tighter response deadline
 * (weighted staircase, 85%). Transfer: Karbach & Kray (2009). Grade B.
 */
(function (root) {
  'use strict';
  const WW = root.WW;

  const DIGITS = [1, 2, 3, 4, 6, 7, 8, 9];
  const RULES = {
    parity: { name: 'PARITY', keys: ['odd', 'even'], key: (d) => (d % 2 === 1 ? 0 : 1) },
    magnitude: { name: 'MAGNITUDE', keys: ['low (<5)', 'high (>5)'], key: (d) => (d < 5 ? 0 : 1) },
  };
  const PURE_TRIALS = 16;
  const MIXED_TRIALS = 64;
  const CONF_RATE = 1 / 8;

  /** Level -> timing. Level 0: generous; ~20: elite. */
  const params = (level) => ({
    csi: Math.max(50, Math.round(800 * Math.pow(0.85, level))),
    deadline: Math.max(600, Math.round(2500 * Math.pow(0.93, level))),
  });

  const congruent = (d) => RULES.parity.key(d) === RULES.magnitude.key(d);

  /** Trial list. mixed: rule switches with probability pSwitch; never the same digit twice running. */
  function makeTrials(rng, n, rule, pSwitch = 0.5) {
    const out = [];
    let cur = rule === 'mixed' ? rng.pick(['parity', 'magnitude']) : rule;
    for (let i = 0; i < n; i++) {
      if (rule === 'mixed' && i > 0 && rng.chance(pSwitch)) cur = cur === 'parity' ? 'magnitude' : 'parity';
      const prev = out[i - 1];
      const digit = rng.pick(DIGITS.filter((d) => !prev || d !== prev.digit));
      out.push({ rule: cur, digit, switch: rule === 'mixed' && i > 0 ? cur !== prev.rule : null, congruent: congruent(digit) });
    }
    return out;
  }

  WW.logic = WW.logic || {};
  WW.logic.contextSwitch = { makeTrials, params, RULES, congruent, DIGITS };

  WW.games.register({
    id: 'context-switch',
    name: 'Context Switch',
    headline: (s) => (s.switchCostRt == null ? '' : `switch cost ${Math.round(s.switchCostRt)} ms · `) + `level ${s.level}`,
    /** SCHEDULER tune from the adaptive level: 0 -> 0, 20 -> 1. */
    tune(sessions) {
      const v = sessions.slice(0, 5).map((s) => s.summary && s.summary.level).filter(Number.isFinite);
      return v.length ? WW.stats.clamp01(WW.stats.mean(v) / 20) : null;
    },
    mount(container, ctx) {
      const { h, clear } = ctx.ui;
      const T = ctx.timing;
      const S = WW.stats;
      const ac = new AbortController();
      const signal = ac.signal;
      const rng = ctx.rng;
      const keyMap = { KeyF: 0, KeyJ: 1 };

      let shell, cueEl, digitEl, msg, fBtn, jBtn;
      function screen() {
        clear(container);
        msg = h('p.label', '');
        cueEl = h('div.cs-cue', '');
        digitEl = h('div.cs-digit.stim', '');
        shell = h('div.cs-shell.stim', cueEl, digitEl);
        fBtn = h('button.btn.cs-key', { type: 'button' }, h('kbd', 'F'), h('span.cs-map', ''));
        jBtn = h('button.btn.cs-key', { type: 'button' }, h('kbd', 'J'), h('span.cs-map', ''));
        container.appendChild(
          h(
            'div.center',
            { style: { userSelect: 'none', touchAction: 'manipulation' } },
            msg,
            shell,
            h('div.row', { style: { justifyContent: 'center' } }, fBtn, jBtn),
            h('p.muted.small', 'PARITY: F odd · J even'),
            h('p.muted.small', 'MAGNITUDE: F low · J high')
          )
        );
      }

      function setShell(rule) {
        shell.classList.remove('parity', 'magnitude');
        if (rule) shell.classList.add(rule);
        cueEl.textContent = rule ? `[ ${RULES[rule].name} ]` : '';
        fBtn.querySelector('.cs-map').textContent = rule ? ' ' + RULES[rule].keys[0] : '';
        jBtn.querySelector('.cs-map').textContent = rule ? ' ' + RULES[rule].keys[1] : '';
      }

      async function trial(t, level, practice, probe) {
        const p = params(level);
        setShell(null);
        digitEl.textContent = '';
        await T.sleep(400);
        if (signal.aborted) return null;
        setShell(t.rule);
        await T.sleep(p.csi);
        if (signal.aborted) return null;
        const onset = await T.onNextFrame(() => (digitEl.textContent = String(t.digit)));
        const r = await T.awaitChoice({ keyMap, buttons: [{ el: fBtn, value: 0 }, { el: jBtn, value: 1 }], timeoutMs: p.deadline, since: onset, signal });
        if (r.aborted) return null;
        digitEl.textContent = '';
        const correct = !r.timeout && r.value === RULES[t.rule].key(t.digit);
        const rec = Object.assign({}, t, { correct, rt: r.timeout ? null : r.rt, timeout: !!r.timeout, choice: r.timeout ? null : r.value, csi: p.csi, deadline: p.deadline, input: r.input });
        if (probe && !r.timeout) {
          const c = await WW.confidence.ask(container.querySelector('.center'), { prompt: 'Did you answer by the right rule, correctly?', signal });
          if (!c) return null;
          rec.confidence = c.confidence;
        }
        if (!correct) {
          ctx.audio.sfx('error');
          msg.textContent = r.timeout ? 'Too slow' : practice ? `${t.digit} under ${RULES[t.rule].name} is ${RULES[t.rule].keys[RULES[t.rule].key(t.digit)]}` : 'Wrong';
          await T.sleep(practice ? 1400 : 500);
          msg.textContent = '';
        }
        return rec;
      }

      async function block(label, trials, st, practice, recs) {
        msg.textContent = label;
        await T.sleep(1300);
        msg.textContent = '';
        for (const t of trials) {
          const probe = !practice && WW.confidence.shouldProbe(rng, CONF_RATE);
          const level = st.value();
          const r = await trial(t, level, practice, probe);
          if (r === null) return false;
          if (practice) continue;
          st.update(r.correct);
          r.level = level;
          r.block = label;
          recs.push(r);
          ctx.session.trial({
            condition: `${r.block === 'mixed' ? (r.switch ? 'switch' : 'repeat') : 'pure'}-${r.rule}`,
            stimulus: { digit: r.digit, rule: r.rule, switch: r.switch, congruent: r.congruent, csi: r.csi, block: r.block },
            response: r.choice,
            correct: r.correct,
            rt: r.rt,
            level: S.round(level, 2),
            confidence: r.confidence,
            input: r.input,
          });
        }
        return true;
      }

      (async () => {
        const saved = await ctx.loadState('progress', { stair: null, sessions: 0 });
        const st = saved.stair ? WW.Staircase.fromJSON(saved.stair) : new WW.Staircase({ rule: 'weighted', target: 0.85, start: 0, step: 0.25, min: 0, max: 20 });
        const p0 = params(st.value());
        if (
          !(await WW.screens.intro(container, {
            kicker: 'SCHEDULER · task switching',
            title: 'Context Switch',
            body: [
              'Two shells share one keyboard. The cue above the digit tells you which shell owns the input:',
              'PARITY: F = odd, J = even.   MAGNITUDE: F = low (under 5), J = high (over 5).',
              'Read the cue, then answer the digit by that rule. Fast and accurate. The cue appears a moment before the digit; use that moment.',
            ],
            kv: [
              ['Session', `${PURE_TRIALS} parity + ${PURE_TRIALS} magnitude + ${MIXED_TRIALS} mixed, about 4 min`],
              ['Cue lead · deadline', `${p0.csi} ms · ${p0.deadline} ms (adapts)`],
            ],
            button: saved.sessions ? 'Start' : 'Practice',
            signal,
          }))
        )
          return;
        screen();
        const recs = [];
        if (!saved.sessions) {
          if (!(await block('Practice: mixed', makeTrials(rng.fork('practice'), 12, 'mixed'), st, true, recs))) return;
        }
        const order = rng.shuffle(['parity', 'magnitude']);
        for (const rule of order) if (!(await block(rule, makeTrials(rng, PURE_TRIALS, rule), st, false, recs))) return;
        if (!(await block('mixed', makeTrials(rng, MIXED_TRIALS, 'mixed'), st, false, recs))) return;

        const ok = (r) => r.correct;
        const mixed = recs.filter((r) => r.block === 'mixed' && r.switch !== null);
        const sw = mixed.filter((r) => r.switch);
        const rep = mixed.filter((r) => !r.switch);
        const pure = recs.filter((r) => r.block !== 'mixed');
        const medRt = (arr) => S.median(arr.filter(ok).map((r) => r.rt));
        const errRate = (arr) => (arr.length ? arr.filter((r) => !r.correct).length / arr.length : null);
        const pairs = recs.filter((r) => r.confidence != null).map((r) => [r.confidence, r.correct]);
        const summary = {
          trials: recs.length,
          accuracy: S.round(recs.filter(ok).length / recs.length, 3),
          switchCostRt: S.round(medRt(sw) - medRt(rep)),
          switchCostErr: S.round(errRate(sw) - errRate(rep), 3),
          mixingCostRt: S.round(medRt(rep) - medRt(pure)),
          medianRtPure: S.round(medRt(pure)),
          level: S.round(st.value(), 2),
          csi: params(st.value()).csi,
          deadline: params(st.value()).deadline,
          confidencePairs: pairs,
        };
        const choice = await WW.screens.results(container, {
          headline: summary.switchCostRt == null ? 'NO VALID RTS' : `${summary.switchCostRt >= 0 ? '+' : '−'}${Math.abs(Math.round(summary.switchCostRt))} MS`,
          tone: summary.accuracy < 0.8 ? 'warn' : 'good',
          kv: [
            ['Switch cost', `${summary.switchCostRt} ms · ${Math.round(summary.switchCostErr * 100)} pts errors`],
            ['Mixing cost', `${summary.mixingCostRt} ms (mixed repeats − pure)`],
            ['Accuracy', `${Math.round(summary.accuracy * 100)}%`],
            ['Level', `${summary.level} → cue lead ${summary.csi} ms, deadline ${summary.deadline} ms`],
            pairs.length ? ['Confidence checks', `${pairs.length}`] : null,
          ],
          notes: ['Smaller costs mean cheaper reconfiguration between rules. The level carries over only if you log the session.'],
          signal,
        });
        if (choice === 'save') {
          await ctx.saveState('progress', { stair: st.toJSON(), sessions: saved.sessions + 1 });
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
