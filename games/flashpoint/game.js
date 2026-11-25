/* Flashpoint (CLOCK / OPTICS): useful-field-of-view speed training.
 *
 * After the UFOV (Ball, Owsley et al.) and ACTIVE speed-of-processing
 * training (Ball et al. 2002; Rebok et al. 2014; Edwards et al. 2017).
 * A scene flashes for a few frames, then a noise mask:
 *   stage 1  identify the centre glyph (▲ or ■)
 *   stage 2  ...and locate a peripheral target (one of 8 directions)
 *   stage 3  ...with 40+ distractor triangles cluttering the field
 *   stage 4  two centre glyphs: same or different? plus stage 3's search
 *            (after UFOV subtest 4, Edwards et al. 2005)
 * Display duration adapts per stage (3-down-1-up on log duration, ~79%).
 * A stage unlocks when the previous one's session threshold is <= 60 ms.
 * Evidence: Grade A for older adults, B in general. Frame-limited: 60 Hz
 * displays bottom out at 16.7 ms.
 */
(function (root) {
  'use strict';
  const WW = root.WW;

  const TRIALS = 48;
  const MASK_MS = 400;
  const UNLOCK_MS = 60;
  const CONF_RATE = 1 / 4;
  const STAGES = 4;
  const GLYPHS = ['tri', 'sq'];
  // Direction k at angle k*45° (y down): 0 right, 1 down-right, 2 down, 3 down-left, 4 left, 5 up-left, 6 up, 7 up-right.
  // Direction pad: a 3x3 key block around S (left hand), or around K in the left-handed layout
  // (the same shape, moved under the right hand, so up-left stays up-left).
  const DIR_PADS = {
    standard: { keys: ['KeyD', 'KeyC', 'KeyX', 'KeyZ', 'KeyA', 'KeyQ', 'KeyW', 'KeyE'], labels: ['D', 'C', 'X', 'Z', 'A', 'Q', 'W', 'E'], hint: 'Q W E / A D / Z X C' },
    left: { keys: ['KeyL', 'Period', 'Comma', 'KeyM', 'KeyJ', 'KeyU', 'KeyI', 'KeyO'], labels: ['L', '.', ',', 'M', 'J', 'U', 'I', 'O'], hint: 'U I O / J L / M , .' },
  };
  const dirPad = (layout) => {
    const p = DIR_PADS[layout] || DIR_PADS.standard;
    return { map: Object.fromEntries(p.keys.map((k, i) => [k, i])), labels: p.labels, hint: p.hint };
  };
  const RADII = [0.24, 0.4]; // peripheral target distance, fraction of field size

  /** Trial spec for a stage. Distractors: positions in field-fraction coords. */
  function makeTrial(rng, stage) {
    const t = { glyph: rng.pick(GLYPHS), glyph2: null, dir: null, radius: null, distractors: [] };
    if (stage >= 4) t.glyph2 = rng.pick(GLYPHS);
    if (stage >= 2) {
      t.dir = rng.int(0, 7);
      t.radius = rng.pick(RADII);
    }
    if (stage >= 3) {
      const tp = targetPos(t);
      for (let ring = 0; ring < 4; ring++) {
        const r = 0.16 + ring * 0.09;
        for (let k = 0; k < 12; k++) {
          const a = ((k * 30 + (ring % 2) * 15) * Math.PI) / 180;
          const p = [0.5 + r * Math.cos(a), 0.5 + r * Math.sin(a)];
          if (Math.hypot(p[0] - tp[0], p[1] - tp[1]) < 0.07) continue;
          t.distractors.push(p);
        }
      }
    }
    return t;
  }

  function targetPos(t) {
    const a = (t.dir * 45 * Math.PI) / 180;
    return [0.5 + t.radius * Math.cos(a), 0.5 + t.radius * Math.sin(a)];
  }

  /** Threshold from the reversals made this session (falls back to current value). */
  function sessionThreshold(stair, reversalsBefore) {
    const r = stair.reversals.slice(reversalsBefore).slice(-6);
    if (r.length < 2) return stair.value();
    return Math.exp(r.reduce((a, b) => a + b, 0) / r.length);
  }

  WW.logic = WW.logic || {};
  /** The right centre answer: the glyph (stages 1-3) or same/diff (stage 4). */
  const centreAnswer = (t) => (t.glyph2 === null ? t.glyph : t.glyph === t.glyph2 ? 'same' : 'diff');

  WW.logic.flashpoint = { dirPad, DIR_PADS, makeTrial, targetPos, sessionThreshold, centreAnswer, RADII, UNLOCK_MS, STAGES };

  WW.games.register({
    id: 'flashpoint',
    name: 'Flashpoint',
    headline: (s) => `stage ${s.stage} · ${Math.round(s.thresholdMs)} ms`,
    /** CLOCK/OPTICS tune: stage progress plus threshold within stage (500 ms -> 0, 20 ms -> 1). */
    tune(sessions) {
      const s = sessions.find((x) => x.summary && Number.isFinite(x.summary.thresholdMs));
      if (!s) return null;
      const within = WW.stats.clamp01((500 - s.summary.thresholdMs) / 480);
      return WW.stats.clamp01((s.summary.stage - 1 + within) / STAGES);
    },
    mount(container, ctx) {
      const { h, clear } = ctx.ui;
      const T = ctx.timing;
      const S = WW.stats;
      const ac = new AbortController();
      const signal = ac.signal;
      const rng = ctx.rng;
      const frameMs = ctx.env.frameMs || 16.667;
      const css = getComputedStyle(root.document.documentElement);
      const INK = '#e8e4dc';
      const PLATE = '#0b0b12';
      const CYAN = css.getPropertyValue('--cyan').trim() || '#05d9e8';
      const MAG = css.getPropertyValue('--magenta').trim() || '#ff2a6d';

      let canvas, g, size, dpr, wrap, msg, triBtn, sqBtn, spokes;
      const pad = dirPad(WW.keyLayout());

      function screen(stage) {
        clear(container);
        size = Math.floor(Math.min(root.innerWidth * 0.92, root.innerHeight * 0.62, 560));
        dpr = Math.min(2, root.devicePixelRatio || 1);
        canvas = h('canvas.fp-canvas.stim');
        canvas.width = canvas.height = Math.round(size * dpr);
        canvas.style.width = canvas.style.height = size + 'px';
        g = canvas.getContext('2d');
        spokes = [];
        if (stage >= 2) {
          for (let k = 0; k < 8; k++) {
            const a = (k * 45 * Math.PI) / 180;
            const b = h('button.fp-spoke', { type: 'button', disabled: true, style: { left: (0.5 + 0.32 * Math.cos(a)) * 100 + '%', top: (0.5 + 0.32 * Math.sin(a)) * 100 + '%' } }, pad.labels[k]);
            spokes.push(b);
          }
        }
        wrap = h('div.fp-wrap', { style: { width: size + 'px', height: size + 'px' } }, canvas, spokes);
        msg = h('p.label', '');
        triBtn = h('button.btn.fp-key', { type: 'button' }, h('kbd', 'F'), stage >= 4 ? ' same' : ' ▲');
        sqBtn = h('button.btn.fp-key', { type: 'button' }, h('kbd', 'J'), stage >= 4 ? ' different' : ' ■');
        container.appendChild(h('div.center', { style: { userSelect: 'none', touchAction: 'manipulation', gap: '10px' } }, msg, wrap, h('div.row', { style: { justifyContent: 'center' } }, triBtn, sqBtn)));
      }

      const P = (x) => x * size * dpr;
      function clearField() {
        g.fillStyle = PLATE;
        g.fillRect(0, 0, P(1), P(1));
      }
      function centreBox() {
        g.strokeStyle = '#3d3849';
        g.lineWidth = dpr;
        g.strokeRect(P(0.42), P(0.42), P(0.16), P(0.16));
      }
      function glyph(kind, cx, cy, s, fill) {
        g.fillStyle = fill;
        g.beginPath();
        if (kind === 'tri') {
          g.moveTo(P(cx), P(cy - s / 2));
          g.lineTo(P(cx + s / 2), P(cy + s / 2));
          g.lineTo(P(cx - s / 2), P(cy + s / 2));
          g.closePath();
        } else g.rect(P(cx - s / 2.4), P(cy - s / 2.4), P(s / 1.2), P(s / 1.2));
        g.fill();
      }
      function fixation() {
        clearField();
        centreBox();
        g.strokeStyle = '#8c8fa3';
        g.lineWidth = 1.5 * dpr;
        g.beginPath();
        g.moveTo(P(0.485), P(0.5));
        g.lineTo(P(0.515), P(0.5));
        g.moveTo(P(0.5), P(0.485));
        g.lineTo(P(0.5), P(0.515));
        g.stroke();
      }
      function scene(t) {
        clearField();
        centreBox();
        if (t.glyph2 === null) glyph(t.glyph, 0.5, 0.5, 0.08, INK);
        else (glyph(t.glyph, 0.465, 0.5, 0.05, INK), glyph(t.glyph2, 0.535, 0.5, 0.05, INK));
        for (const [x, y] of t.distractors) {
          g.strokeStyle = INK;
          g.lineWidth = 1.5 * dpr;
          g.beginPath();
          g.moveTo(P(x), P(y - 0.022));
          g.lineTo(P(x + 0.022), P(y + 0.018));
          g.lineTo(P(x - 0.022), P(y + 0.018));
          g.closePath();
          g.stroke();
        }
        if (t.dir !== null) {
          const [x, y] = targetPos(t);
          g.strokeStyle = INK;
          g.fillStyle = INK;
          g.lineWidth = 2 * dpr;
          g.beginPath();
          g.arc(P(x), P(y), P(0.026), 0, Math.PI * 2);
          g.stroke();
          g.beginPath();
          g.arc(P(x), P(y), P(0.011), 0, Math.PI * 2);
          g.fill();
        }
      }
      function mask() {
        const cell = 0.025;
        for (let x = 0; x < 1; x += cell)
          for (let y = 0; y < 1; y += cell) {
            const v = Math.floor(rng.next() * 200) + 20;
            g.fillStyle = `rgb(${v},${v},${v})`;
            g.fillRect(P(x), P(y), P(cell) + 1, P(cell) + 1);
          }
      }
      function responseField(stage) {
        clearField();
        centreBox();
        g.fillStyle = '#8c8fa3';
        g.font = `${P(0.06)}px ui-monospace, monospace`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('?', P(0.5), P(0.5));
      }
      function showAnswer(t) {
        // Wipe the "?" first: two small glyphs don't cover it.
        g.fillStyle = PLATE;
        g.fillRect(P(0.425), P(0.425), P(0.15), P(0.15));
        if (t.glyph2 === null) glyph(t.glyph, 0.5, 0.5, 0.08, CYAN);
        else (glyph(t.glyph, 0.465, 0.5, 0.05, CYAN), glyph(t.glyph2, 0.535, 0.5, 0.05, CYAN));
        if (t.dir !== null) {
          const [x, y] = targetPos(t);
          g.strokeStyle = CYAN;
          g.lineWidth = 3 * dpr;
          g.beginPath();
          g.arc(P(x), P(y), P(0.035), 0, Math.PI * 2);
          g.stroke();
        }
      }

      async function trial(t, stage, ms, probe, practice) {
        fixation();
        msg.textContent = practice ? 'Practice' : '';
        await T.sleep(500);
        if (signal.aborted) return null;
        const frames = T.msToFrames(ms, frameMs);
        const shown = await T.present({ frames, onShow: () => scene(t), onHide: mask });
        await T.present({ frames: T.msToFrames(MASK_MS, frameMs) });
        if (signal.aborted) return null;
        responseField(stage);
        msg.textContent = stage >= 4 ? 'Centre shapes: same or different?' : stage >= 2 ? 'Centre shape?' : 'Which shape?';
        const [vf, vj] = stage >= 4 ? ['same', 'diff'] : ['tri', 'sq'];
        const c = await T.awaitChoice({ keyMap: { KeyF: vf, KeyJ: vj }, buttons: [{ el: triBtn, value: vf }, { el: sqBtn, value: vj }], signal });
        if (c.aborted) return null;
        let dirChoice = null;
        let input = c.input;
        if (stage >= 2) {
          msg.textContent = `Where was the target? (tap a spoke, or ${pad.hint})`;
          spokes.forEach((b) => (b.disabled = false));
          const d = await T.awaitChoice({ keyMap: pad.map, buttons: spokes.map((el, k) => ({ el, value: k })), signal });
          spokes.forEach((b) => (b.disabled = true));
          if (d.aborted) return null;
          dirChoice = d.value;
          input = input || d.input;
        }
        const centreOk = c.value === centreAnswer(t);
        const periphOk = stage < 2 || dirChoice === t.dir;
        const rec = { centreOk, periphOk, correct: centreOk && periphOk, glyphChoice: c.value, dirChoice, frames, displayMs: shown.actualMs, ms, input };
        if (probe) {
          const conf = await WW.confidence.ask(container.querySelector('.center'), { prompt: stage >= 2 ? 'How sure are you that BOTH answers were right?' : 'How sure are you of the shape?', signal });
          if (!conf) return null;
          rec.confidence = conf.confidence;
        }
        showAnswer(t);
        ctx.audio.sfx(rec.correct ? 'correct' : 'error');
        msg.textContent = rec.correct ? 'Locked.' : !centreOk ? 'Centre missed' : 'Wrong direction';
        await T.sleep(rec.correct ? 450 : 900);
        return rec;
      }

      async function chooseStage(saved) {
        clear(container);
        const btns = Array.from({ length: STAGES }, (_, i) => i + 1).map((s) => {
          const unlocked = s <= saved.unlocked;
          const thr = saved.best[s];
          return h(
            'button.btn' + (s === saved.unlocked ? '.primary' : ''),
            { type: 'button', disabled: !unlocked, dataset: { s: String(s) } },
            `Stage ${s}` + (unlocked ? (thr ? ` · best ${Math.round(thr)} ms` : '') : ' · locked')
          );
        });
        container.appendChild(
          h(
            'div.center',
            h('p.label', 'CLOCK · OPTICS · processing speed'),
            h('p.big.title', 'Flashpoint'),
            h('p', 'A scene flashes for a split second, then static. Report what you saw.'),
            WW.screens.kvList([
              ['Stage 1', 'Centre shape: ▲ (F) or ■ (J)'],
              ['Stage 2', '+ where the ringed target was (8 directions)'],
              ['Stage 3', '+ the target hides among triangles'],
              ['Stage 4', 'two centre shapes: same (F) or different (J), + stage 3'],
              ['Adapts', 'flash duration shrinks as you get it right'],
              ['Unlock', `next stage at a session threshold ≤ ${UNLOCK_MS} ms`],
              ['Display', ctx.env.refreshHz ? `${ctx.env.refreshHz} Hz: shortest flash ${Math.round(frameMs)} ms` : 'refresh rate unknown'],
            ]),
            h('div.row', { style: { justifyContent: 'center' } }, btns),
            h('p.muted.small', 'Keep your eyes on the centre box. Enter starts the highlighted stage.')
          )
        );
        return new Promise((resolve) => {
          const done = (v) => {
            root.removeEventListener('keydown', onKey, true);
            resolve(v);
          };
          const onKey = (e) => {
            if (e.code === 'Enter') {
              e.preventDefault();
              done(saved.unlocked);
            }
          };
          root.addEventListener('keydown', onKey, true);
          btns.forEach((b) => b.addEventListener('click', () => !b.disabled && done(Number(b.dataset.s))));
          signal.addEventListener('abort', () => done(null));
        });
      }

      (async () => {
        const saved = await ctx.loadState('progress', { unlocked: 1, stairs: {}, best: {}, sessions: 0 });
        const stage = await chooseStage(saved);
        if (!stage) return;
        ctx.audio.unlock();
        const st = saved.stairs[stage]
          ? WW.Staircase.fromJSON(saved.stairs[stage])
          : new WW.Staircase({ rule: 'updown', nDown: 3, start: 250, step: Math.log(1.25), scale: 'log', harderIs: 'down', min: 8, max: 750 });
        const revBefore = st.reversals.length;
        screen(stage);

        if (!saved.sessions || !saved.stairs[stage]) {
          for (let i = 0; i < 4; i++) if ((await trial(makeTrial(rng, stage), stage, 350, false, true)) === null) return;
        }
        const recs = [];
        for (let i = 0; i < TRIALS; i++) {
          const t = makeTrial(rng, stage);
          const ms = st.value();
          const r = await trial(t, stage, ms, WW.confidence.shouldProbe(rng, CONF_RATE), false);
          if (r === null) return;
          st.update(r.correct);
          recs.push(r);
          ctx.session.trial({
            condition: `stage${stage}`,
            stimulus: { glyph: t.glyph, glyph2: t.glyph2, dir: t.dir, radius: t.radius, distractors: t.distractors.length, frames: r.frames, displayMs: S.round(r.displayMs) },
            response: { glyph: r.glyphChoice, dir: r.dirChoice },
            correct: r.correct,
            rt: null,
            level: S.round(r.frames * frameMs),
            confidence: r.confidence,
            input: r.input,
          });
        }
        const thr = sessionThreshold(st, revBefore);
        const thrMs = Math.max(frameMs, T.msToFrames(thr, frameMs) * frameMs);
        const unlockNext = stage === saved.unlocked && stage < STAGES && thrMs <= UNLOCK_MS;
        const pairs = recs.filter((r) => r.confidence != null).map((r) => [r.confidence, r.correct]);
        const summary = {
          stage,
          trials: recs.length,
          accuracy: S.round(recs.filter((r) => r.correct).length / recs.length, 3),
          centreAccuracy: S.round(recs.filter((r) => r.centreOk).length / recs.length, 3),
          thresholdMs: S.round(thrMs),
          frameMs: S.round(frameMs, 2),
          atFloor: T.msToFrames(st.value(), frameMs) === 1,
          medianDisplayMs: S.round(S.median(recs.map((r) => r.displayMs))),
          confidencePairs: pairs,
        };
        const choice = await WW.screens.results(container, {
          headline: `${Math.round(thrMs)} MS`,
          kv: [
            ['Stage', stage],
            ['Threshold (~79% correct)', `${summary.thresholdMs} ms ≈ ${Math.round(thrMs / frameMs)} frame(s)`],
            ['Accuracy', `${Math.round(summary.accuracy * 100)}%` + (stage >= 2 ? ` (centre ${Math.round(summary.centreAccuracy * 100)}%)` : '')],
            ['Measured flash vs. requested', `${summary.medianDisplayMs} ms median`],
            unlockNext ? ['Unlocked', `Stage ${stage + 1}`] : null,
            summary.atFloor ? ['Note', 'You hit the display’s one-frame floor; a higher-refresh screen gives more headroom.'] : null,
          ],
          notes: ['Progress carries over only if you log the session.'],
          signal,
        });
        if (choice === 'save') {
          saved.stairs[stage] = st.toJSON();
          saved.best[stage] = Math.min(saved.best[stage] || Infinity, thrMs);
          if (unlockNext) saved.unlocked = stage + 1;
          saved.sessions++;
          await ctx.saveState('progress', saved);
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
