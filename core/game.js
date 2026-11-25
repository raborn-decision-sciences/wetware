/* Wetware core: the game interface, sessions and mounting.
 *
 * A game registers a definition:
 *
 *   WW.games.register({
 *     id: 'packet-echo',          // matches the catalog id
 *     name: 'Packet Echo',
 *     mount(container, ctx) {     // build UI, run the game
 *       ...
 *       return { stop() {...} };  // optional teardown (called on abort)
 *     },
 *   });
 *
 * ctx gives the game everything it may touch:
 *   ctx.rng            seeded rng for this session (seed is logged)
 *   ctx.session        WW.Session: ctx.session.trial({...}) per trial
 *   ctx.store          persistent store (getState/setState for staircases)
 *   ctx.env            { refreshHz, frameMs, jitterMs, ... } measured at load
 *   ctx.audio, ctx.ui, ctx.timing
 *   ctx.finish(summary) save the session and hand control back to the host
 *   ctx.abort()        leave without saving
 *
 * Trial rows should use the documented CSV fields where they apply:
 *   condition, stimulus, response, correct, rt, level, confidence
 * plus any game-specific fields (kept in the JSON export).
 */
(function (root) {
  'use strict';
  const WW = (root.WW = root.WW || {});

  /**
   * Key layout (Display settings): 'standard', or 'left' to put key groups that sit under one hand
   * under the right hand instead (for a mouse in the left hand). Two-handed pairs such as F / J,
   * and keys whose side carries meaning (left/right answers, positions), never move: swapping them
   * would change what the task measures.
   */
  WW.keyLayout = () => (WW.prefs && WW.prefs.get('leftHandKeys', false) ? 'left' : 'standard');

  const registry = new Map();

  WW.games = {
    register(def) {
      if (!def || !def.id || typeof def.mount !== 'function') throw new Error('game needs id and mount()');
      registry.set(def.id, def);
      return def;
    },
    get: (id) => registry.get(id),
    list: () => [...registry.values()],
    has: (id) => registry.has(id),
  };

  function makeId() {
    const rand = WW.rng ? WW.rng.randomSeed().toString(36) : Math.random().toString(36).slice(2);
    return 'ses_' + Date.now().toString(36) + '_' + rand;
  }

  class Session {
    constructor({ game, seed, config, env, now }) {
      this.id = makeId();
      this.game = game;
      this.seed = seed;
      this.config = config || {};
      this.env = env || {};
      this.startedAt = Date.now();
      this.endedAt = null;
      this.trials = [];
      this._now = now || (() => Date.now());
      this.inputs = new Set();
      // Times the page was hidden mid-run: timed data from such runs is suspect.
      this.hiddenCount = 0;
    }

    /** Log one trial. Returns the stored row. */
    trial(row) {
      const r = Object.assign({ trial: this.trials.length + 1, ts: this._now() }, row);
      if (r.input) this.inputs.add(r.input);
      this.trials.push(r);
      return r;
    }

    record(summary) {
      this.endedAt = Date.now();
      return {
        id: this.id,
        game: this.game,
        seed: this.seed,
        startedAt: this.startedAt,
        endedAt: this.endedAt,
        durationMs: this.endedAt - this.startedAt,
        config: this.config,
        // cvdAid: letters/patterns on colour-coded pieces were shown; keyLayout: 'left' when one-hand key
        // groups sat under the right hand (Display settings). Logged so data stays interpretable.
        env: Object.assign({}, this.env, { inputs: [...this.inputs], hiddenCount: this.hiddenCount, cvdAid: !!(WW.prefs && WW.prefs.get('cvdAid', false)), keyLayout: WW.keyLayout() }),
        trialCount: this.trials.length,
        summary: summary || {},
        quality: qualityOf(this.trials, this.hiddenCount),
      };
    }
  }

  /**
   * Careless-responding check (stored as session.quality). A session is flagged
   * when it has many anticipations (responses faster than 150 ms: no one
   * perceives and responds that fast), was hidden twice or more mid-run, or
   * shows key-mashing: 15+ identical responses in a row that were mostly wrong.
   * Flagged sessions stay in the log and the exports; trends leave them out.
   */
  function qualityOf(trials, hiddenCount) {
    const rts = trials.map((t) => t.rt).filter((x) => Number.isFinite(x) && x > 0);
    const fast = rts.filter((x) => x < 150).length;
    const fastShare = rts.length ? fast / rts.length : 0;
    let run = 0;
    let best = { len: 0, correct: 0 };
    let runCorrect = 0;
    let prev;
    for (const t of trials) {
      const r = t.response;
      const key = r === null || r === undefined || r === '' ? null : typeof r === 'object' ? JSON.stringify(r) : String(r);
      if (key !== null && key === prev) {
        run++;
        runCorrect += t.correct === true ? 1 : 0;
      } else {
        run = key === null ? 0 : 1;
        runCorrect = key !== null && t.correct === true ? 1 : 0;
      }
      prev = key;
      if (run > best.len) best = { len: run, correct: runCorrect };
    }
    const reasons = [];
    if (rts.length >= 10 && fastShare > 0.1) reasons.push(`${Math.round(fastShare * 100)}% of responses under 150 ms`);
    if (hiddenCount >= 2) reasons.push(`tab hidden ${hiddenCount}× mid-run`);
    if (best.len >= 15 && best.correct / best.len < 0.6) reasons.push(`${best.len} identical responses in a row, mostly wrong`);
    return { fastShare: Math.round(fastShare * 1000) / 1000, maxRun: best.len, hidden: hiddenCount, flagged: reasons.length > 0, reasons };
  }

  /** Environment facts logged with every session. Measured once per page. */
  let envPromise = null;
  function environment() {
    if (!envPromise) {
      envPromise = WW.timing.measureRefresh(90).then((r) => {
        // Measured while hidden: let the next caller try again.
        if (!r.hz) setTimeout(() => (envPromise = null), 0);
        return r;
      }).then((r) => ({
        refreshHz: r.hz,
        frameMs: r.frameMs,
        jitterMs: r.jitterMs,
        userAgent: root.navigator ? root.navigator.userAgent : 'node',
        viewport: root.innerWidth ? root.innerWidth + 'x' + root.innerHeight : null,
        dpr: root.devicePixelRatio || 1,
        // Build and engine group (core/build.js): sessions are compared across these groups.
        platform: WW.platform ? WW.platform() : null,
      }));
    }
    return envPromise;
  }

  /**
   * Mount a registered game into a container.
   * opts: { store, seed, config, onExit(result) }
   * onExit receives { saved: bool, session, summary } or { saved: false, aborted: true }.
   */
  async function mount(id, container, opts) {
    const def = registry.get(id);
    if (!def) throw new Error('unknown game: ' + id);
    const o = Object.assign({ seed: WW.rng.randomSeed(), config: {}, onExit: () => {} }, opts || {});
    const env = await environment();
    const session = new Session({ game: id, seed: o.seed, config: o.config, env });
    let controller = null;
    let exited = false;
    const onVisibility = () => {
      if (root.document.hidden) session.hiddenCount++;
    };
    root.document.addEventListener('visibilitychange', onVisibility);

    const exit = (result) => {
      if (exited) return;
      exited = true;
      root.document.removeEventListener('visibilitychange', onVisibility);
      try {
        controller && controller.stop && controller.stop();
      } catch (e) {
        console.error(e);
      }
      WW.ui.clear(container);
      o.onExit(result);
    };

    const ctx = {
      rng: WW.rng.create(o.seed),
      session,
      store: o.store,
      env,
      audio: WW.audio,
      ui: WW.ui,
      timing: WW.timing,
      prefs: WW.prefs,
      /** Durable per-game state (e.g. staircases), namespaced by game id. */
      async loadState(key, fallback) {
        if (!o.store) return fallback;
        try {
          const v = await o.store.getState(id + '.' + key);
          return v === undefined ? fallback : v;
        } catch (_) {
          return fallback;
        }
      },
      async saveState(key, value) {
        if (!o.store) return;
        try {
          await o.store.setState(id + '.' + key, value);
        } catch (e) {
          console.error('[wetware] failed to save state', e);
        }
      },
      async finish(summary) {
        const rec = session.record(summary);
        let saved = false;
        if (o.store) {
          // Today's check-in travels with the session (PLAN §6: context logging).
          if (WW.context) {
            try {
              const ctxNow = WW.context.forSession(await o.store.getState('checkins'), rec.startedAt);
              if (ctxNow) rec.context = ctxNow;
            } catch (_) {
              /* context is optional */
            }
          }
          try {
            await o.store.saveSession(rec, session.trials);
            saved = true;
          } catch (e) {
            console.error('[wetware] failed to save session', e);
          }
        }
        exit({ saved, session: rec, summary: rec.summary });
      },
      abort() {
        exit({ saved: false, aborted: true });
      },
    };

    WW.ui.clear(container);
    controller = def.mount(container, ctx) || null;
    return { abort: ctx.abort, session };
  }

  WW.Session = Session;
  WW.qualityOf = qualityOf;
  WW.environment = environment;
  WW.mountGame = mount;
})(globalThis);
