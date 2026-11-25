/* Burn-In (FIRMWARE): implicit sequence learning (serial reaction time).
 *
 * A target lights one of four slots; press its key (D F J K) as fast as you
 * can. Unannounced, most blocks follow a repeating 12-item sequence; two
 * blocks are random. Hands learn the sequence before awareness does: RTs in
 * sequence blocks drop below random ones (Nissen & Bullemer 1987). The
 * sequence is second-order conditional (each slot pair occurs once per cycle,
 * Reed & Johnson 1994), so it cannot be learned from simple frequencies, and
 * a fresh one is generated every session.
 * Learning score: RT(random block 5) - mean RT(sequence blocks 4 and 6).
 * Afterwards a generation test checks how much of it you can say out loud
 * (explicit knowledge: share of the sequence's triplets you reproduce).
 * A measure of procedural learning more than a trained skill: grade X.
 */
(function (root) {
  'use strict';
  const WW = root.WW;

  const KEYS = ['KeyD', 'KeyF', 'KeyJ', 'KeyK'];
  const LABELS = ['D', 'F', 'J', 'K'];
  const PER_BLOCK = 48; // 4 cycles of 12
  const PLAN = ['random', 'sequence', 'sequence', 'sequence', 'random', 'sequence'];
  const RSI = 250;
  const DEADLINE = 2000;

  /**
   * A random second-order-conditional sequence: an Eulerian circuit through all
   * 12 ordered pairs of distinct slots (each transition exactly once per cycle).
   */
  function socSequence(rng) {
    for (let attempt = 0; attempt < 200; attempt++) {
      const used = new Set();
      const seq = [rng.int(0, 3)];
      let ok = true;
      while (seq.length < 12) {
        const a = seq[seq.length - 1];
        const options = rng.shuffle([0, 1, 2, 3].filter((b) => b !== a && !used.has(a * 4 + b)));
        // Last step must also leave the closing pair (last -> first) unused.
        const pick = options.find((b) => seq.length < 11 || (b !== seq[0] && !used.has(b * 4 + seq[0])));
        if (pick === undefined) {
          ok = false;
          break;
        }
        used.add(a * 4 + pick);
        seq.push(pick);
      }
      if (ok && isSOC(seq)) return seq;
    }
    return [0, 1, 0, 3, 1, 2, 3, 0, 2, 1, 3, 2]; // Reed & Johnson's SOC1, as a fallback
  }

  /** Every ordered pair of distinct slots appears exactly once around the cycle. */
  function isSOC(seq) {
    if (seq.length !== 12) return false;
    const pairs = new Set();
    for (let i = 0; i < 12; i++) {
      const a = seq[i];
      const b = seq[(i + 1) % 12];
      if (a === b) return false;
      pairs.add(a * 4 + b);
    }
    return pairs.size === 12;
  }

  /** Random block with the same no-repeat rule (no slot twice in a row). */
  function randomBlock(rng, n) {
    const out = [rng.int(0, 3)];
    while (out.length < n) out.push(rng.pick([0, 1, 2, 3].filter((x) => x !== out[out.length - 1])));
    return out;
  }

  /** Share of the sequence's 12 cyclic triplets present in a generated list. */
  function tripletKnowledge(seq, generated) {
    const want = new Set();
    for (let i = 0; i < 12; i++) want.add(`${seq[i]}${seq[(i + 1) % 12]}${seq[(i + 2) % 12]}`);
    const got = new Set();
    for (let i = 0; i + 2 < generated.length; i++) {
      const t = `${generated[i]}${generated[i + 1]}${generated[i + 2]}`;
      if (want.has(t)) got.add(t);
    }
    return got.size / want.size;
  }

  WW.logic = WW.logic || {};
  WW.logic.burnIn = { socSequence, isSOC, randomBlock, tripletKnowledge, PLAN, PER_BLOCK };

  WW.games.register({
    id: 'burn-in',
    name: 'Burn-In',
    headline: (s) => `learning ${s.learningMs >= 0 ? '+' : ''}${s.learningMs} ms · aware ${Math.round(s.explicit * 100)}%`,
    /** Tune: implicit learning score, 0 ms -> 0, 80 ms -> 1. */
    tune(sessions) {
      const v = sessions.slice(0, 5).map((s) => s.summary && s.summary.learningMs).filter(Number.isFinite);
      return v.length ? WW.stats.clamp01(WW.stats.mean(v) / 80) : null;
    },
    mount(container, ctx) {
      const { h, clear } = ctx.ui;
      const T = ctx.timing;
      const S = WW.stats;
      const ac = new AbortController();
      const signal = ac.signal;
      const rng = ctx.rng;
      const keyMap = { KeyD: 0, KeyF: 1, KeyJ: 2, KeyK: 3 };

      let slots, msg;
      function screen() {
        clear(container);
        msg = h('p.label', '');
        slots = LABELS.map((l) => h('div.bi-slot.stim', h('kbd', l)));
        container.append(h('div.center', { style: { userSelect: 'none', touchAction: 'manipulation' } }, msg, h('div.bi-row', slots), h('p.muted.small', 'D F with the left hand, J K with the right. Press the lit slot’s key.')));
      }
      const light = (i) => slots.forEach((s, k) => s.classList.toggle('on', k === i));

      (async () => {
        const saved = await ctx.loadState('progress', { sessions: 0 });
        if (
          !(await WW.screens.intro(container, {
            kicker: 'FIRMWARE · procedural learning',
            title: 'Burn-In',
            body: [
              'A slot lights up. Press its key (D, F, J or K) as fast as you can without mistakes. Rest your fingers on all four.',
              'Six short blocks with a breather between them. Afterwards, one question about what you noticed.',
            ],
            kv: [['Session', `${PLAN.length} blocks of ${PER_BLOCK}, about 5 min`]],
            button: 'Start',
            signal,
          }))
        )
          return;
        const seq = socSequence(rng);
        const offset = rng.int(0, 11);
        screen();
        const blocks = [];
        for (let b = 0; b < PLAN.length; b++) {
          const kind = PLAN[b];
          const targets = kind === 'random' ? randomBlock(rng, PER_BLOCK) : Array.from({ length: PER_BLOCK }, (_, i) => seq[(i + offset) % 12]);
          msg.textContent = `Block ${b + 1} / ${PLAN.length}`;
          await T.sleep(1200);
          msg.textContent = '';
          const rts = [];
          let errors = 0;
          for (let i = 0; i < targets.length; i++) {
            if (signal.aborted) return;
            light(-1);
            await T.sleep(RSI);
            const target = targets[i];
            const onset = await T.onNextFrame(() => light(target));
            const buttons = slots.map((el, k) => ({ el, value: k }));
            // Errors don't advance: the target stays until the right key (first press is what is scored).
            let first = null;
            for (;;) {
              const r = await T.awaitChoice({ keyMap, buttons, timeoutMs: DEADLINE, since: onset, signal });
              if (r.aborted) return;
              if (first === null) first = r;
              if (r.timeout || r.value === target) break;
            }
            const correct = !first.timeout && first.value === target;
            if (!correct) errors++;
            else if (i >= 2) rts.push(first.rt); // the first two of a block warm up
            ctx.session.trial({
              condition: kind,
              stimulus: { slot: target, block: b + 1, pos: i },
              response: first.timeout ? null : first.value,
              correct,
              rt: first.timeout ? null : first.rt,
              level: null,
              input: first.input,
            });
          }
          blocks.push({ kind, rt: S.median(rts), errors });
          light(-1);
          if (b < PLAN.length - 1) {
            msg.textContent = `Block ${b + 1} done · median ${Math.round(S.median(rts))} ms · ${errors} slips`;
            await T.sleep(2200);
          }
        }

        // Awareness and generation.
        clear(container);
        const aware = await new Promise((resolve) => {
          const yes = h('button.btn', { type: 'button', on: { click: () => resolve(true) } }, 'Yes');
          const no = h('button.btn', { type: 'button', on: { click: () => resolve(false) } }, 'No');
          signal.addEventListener('abort', () => resolve(null));
          container.append(h('div.center.ww-chrome', h('p.big.title', 'One question'), h('p', 'Did the lit slots seem to follow a pattern at any point?'), h('div.row', yes, no)));
        });
        if (aware === null) return;
        clear(container);
        const generated = [];
        const shown = h('p.bi-gen', '');
        const doneBtn = h('button.btn.primary', { type: 'button' }, 'Done');
        container.append(
          h(
            'div.center.ww-chrome',
            h('p.big.title', 'Play it back'),
            h('p', 'Type the order the slots lit up in, as best you can: 24 key presses with D F J K. Guess if you have to.'),
            shown,
            doneBtn
          )
        );
        await new Promise((resolve) => {
          const onKey = (e) => {
            if (!(e.code in keyMap) || e.repeat) return;
            e.preventDefault();
            generated.push(keyMap[e.code]);
            shown.textContent = generated.map((x) => LABELS[x]).join(' ');
            if (generated.length >= 24) finish();
          };
          const finish = () => {
            root.removeEventListener('keydown', onKey, true);
            resolve();
          };
          root.addEventListener('keydown', onKey, true);
          doneBtn.addEventListener('click', finish);
          signal.addEventListener('abort', finish);
        });
        if (signal.aborted) return;

        const seqRt = S.mean([blocks[3].rt, blocks[5].rt]);
        const summary = {
          learningMs: S.round(blocks[4].rt - seqRt),
          randomRt: S.round(blocks[4].rt),
          sequenceRt: S.round(seqRt),
          firstBlockRt: S.round(blocks[0].rt),
          errorRate: S.round(blocks.reduce((a, b) => a + b.errors, 0) / (PER_BLOCK * PLAN.length), 3),
          noticed: aware,
          explicit: S.round(tripletKnowledge(seq, generated), 2),
          generated: generated.length,
          sequence: seq.map((x) => LABELS[x]).join(''),
        };
        ctx.session.trial({ condition: 'generation', stimulus: { sequence: summary.sequence }, response: generated.map((x) => LABELS[x]).join(''), correct: null, rt: null, explicit: summary.explicit, noticed: aware });
        const choice = await WW.screens.results(container, {
          headline: `${summary.learningMs >= 0 ? '+' : '−'}${Math.abs(summary.learningMs)} MS BURNED IN`,
          tone: summary.learningMs > 20 ? 'good' : 'warn',
          kv: [
            ['Random block 5 vs pattern blocks', `${summary.randomRt} ms vs ${summary.sequenceRt} ms`],
            ['Block 1 → block 6', `${summary.firstBlockRt} → ${S.round(blocks[5].rt)} ms`],
            ['Slips', `${Math.round(summary.errorRate * 100)}%`],
            ['Could you say it?', `${Math.round(summary.explicit * 100)}% of the pattern’s three-step chunks (random typing gets about 30%)`],
            ['The pattern was', summary.sequence],
          ],
          notes: ['Most blocks repeated a 12-step pattern; blocks 1 and 5 were random. Your hands getting faster on the pattern than on random, whether or not you could say it, is the burn-in.'],
          signal,
        });
        if (choice === 'save') {
          await ctx.saveState('progress', { sessions: saved.sessions + 1 });
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
