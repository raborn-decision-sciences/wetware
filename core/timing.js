/* Wetware core: timing.
 *
 * - Reaction times use event.timeStamp, which modern browsers report on the
 *   same high-resolution clock as performance.now().
 * - Brief stimuli are frame-locked with requestAnimationFrame: durations are
 *   whole frames, and the measured refresh rate is logged with every session
 *   (60 Hz -> 16.7 ms floor). See Bridges et al. (2020) on browser timing.
 * - Browser RTs carry a constant per-device lag, so compare a person with
 *   themselves on the same device, not across devices.
 */
(function (root) {
  'use strict';
  const WW = (root.WW = root.WW || {});

  const now = () => root.performance.now();

  function median(xs) {
    if (!xs.length) return NaN;
    const a = xs.slice().sort((p, q) => p - q);
    const m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  /** Summarize frame intervals (ms) robustly: median interval + MAD jitter. */
  function estimateRefresh(intervals) {
    const clean = intervals.filter((d) => d > 2 && d < 100);
    const frameMs = median(clean);
    const jitterMs = median(clean.map((d) => Math.abs(d - frameMs)));
    return {
      hz: frameMs ? Math.round(1000 / frameMs) : null,
      frameMs: Number.isFinite(frameMs) ? +frameMs.toFixed(3) : null,
      jitterMs: Number.isFinite(jitterMs) ? +jitterMs.toFixed(3) : null,
      samples: clean.length,
    };
  }

  function nextFrame() {
    return new Promise((resolve) => root.requestAnimationFrame(resolve));
  }

  /**
   * Measure the display refresh rate over `frames` frames. Hidden tabs get
   * no animation frames, so give up after timeoutMs and report what we have
   * (hz null if too few samples) rather than block the caller forever.
   */
  function measureRefresh(frames = 90, timeoutMs = 3000) {
    if (typeof root.requestAnimationFrame !== 'function') return Promise.resolve(estimateRefresh([]));
    return new Promise((resolve) => {
      const intervals = [];
      let last = null;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve(estimateRefresh(intervals.length >= 10 ? intervals : []));
      };
      const timer = setTimeout(finish, timeoutMs);
      function tick(t) {
        if (done) return;
        if (last !== null) intervals.push(t - last);
        last = t;
        if (intervals.length >= frames) {
          clearTimeout(timer);
          finish();
        } else root.requestAnimationFrame(tick);
      }
      root.requestAnimationFrame(tick);
    });
  }

  function msToFrames(ms, frameMs) {
    return Math.max(1, Math.round(ms / (frameMs || 16.667)));
  }

  /**
   * Show a stimulus for a whole number of frames.
   * onShow(onsetTime) runs inside the first rAF callback, onHide() inside the
   * callback `frames` frames later. Resolves with measured onset/offset.
   */
  function present({ frames, onShow, onHide }) {
    return new Promise((resolve) => {
      let onset = null;
      let count = 0;
      function tick(t) {
        if (onset === null) {
          onset = t;
          onShow && onShow(t);
        } else {
          count++;
        }
        if (onset !== null && count >= frames) {
          onHide && onHide();
          resolve({ onset, offset: t, frames, actualMs: t - onset });
        } else {
          root.requestAnimationFrame(tick);
        }
      }
      root.requestAnimationFrame(tick);
    });
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Wait for a key press or a pointer press (touch/mouse).
   * opts.keys: array of KeyboardEvent.code values (e.g. ['Space']); empty = any.
   * opts.pointerTarget: element that accepts taps/clicks (optional).
   * opts.timeoutMs: resolve {timeout: true} after this long (optional).
   * opts.since: reference time for rt (defaults to call time).
   * opts.signal: AbortSignal to cancel (resolves {aborted: true}).
   */
  function awaitResponse(opts) {
    const o = Object.assign({ keys: [], pointerTarget: null, timeoutMs: null, since: now(), signal: null }, opts || {});
    return new Promise((resolve) => {
      let timer = null;
      const done = (result) => {
        root.removeEventListener('keydown', onKey, true);
        if (o.pointerTarget) o.pointerTarget.removeEventListener('pointerdown', onPointer);
        if (o.signal) o.signal.removeEventListener('abort', onAbort);
        if (timer) clearTimeout(timer);
        resolve(result);
      };
      function onKey(e) {
        if (e.repeat) return;
        if (o.keys.length && !o.keys.includes(e.code)) return;
        e.preventDefault();
        done({ key: e.code, t: e.timeStamp, rt: e.timeStamp - o.since, input: 'keyboard' });
      }
      function onPointer(e) {
        e.preventDefault();
        done({ key: 'pointer', t: e.timeStamp, rt: e.timeStamp - o.since, input: e.pointerType || 'pointer' });
      }
      function onAbort() {
        done({ aborted: true });
      }
      root.addEventListener('keydown', onKey, true);
      if (o.pointerTarget) o.pointerTarget.addEventListener('pointerdown', onPointer);
      if (o.signal) {
        if (o.signal.aborted) return done({ aborted: true });
        o.signal.addEventListener('abort', onAbort);
      }
      if (o.timeoutMs != null) timer = setTimeout(() => done({ timeout: true }), o.timeoutMs);
    });
  }

  /**
   * Wait for one of several choices, by key or by tapping a button.
   * opts.keyMap: { KeyboardEvent.code: value }
   * opts.buttons: [{ el, value }]
   * opts.timeoutMs, opts.since, opts.signal: as in awaitResponse.
   * Resolves { value, key, t, rt, input } | { timeout: true } | { aborted: true }.
   */
  function awaitChoice(opts) {
    const o = Object.assign({ keyMap: {}, buttons: [], timeoutMs: null, since: now(), signal: null }, opts || {});
    return new Promise((resolve) => {
      let timer = null;
      const handlers = [];
      const done = (result) => {
        root.removeEventListener('keydown', onKey, true);
        for (const [el, fn] of handlers) el.removeEventListener('pointerdown', fn);
        if (o.signal) o.signal.removeEventListener('abort', onAbort);
        if (timer) clearTimeout(timer);
        resolve(result);
      };
      function onKey(e) {
        if (e.repeat || !Object.prototype.hasOwnProperty.call(o.keyMap, e.code)) return;
        e.preventDefault();
        done({ value: o.keyMap[e.code], key: e.code, t: e.timeStamp, rt: e.timeStamp - o.since, input: 'keyboard' });
      }
      function onAbort() {
        done({ aborted: true });
      }
      root.addEventListener('keydown', onKey, true);
      for (const b of o.buttons) {
        const fn = (e) => {
          e.preventDefault();
          done({ value: b.value, key: 'pointer', t: e.timeStamp, rt: e.timeStamp - o.since, input: e.pointerType || 'pointer' });
        };
        b.el.addEventListener('pointerdown', fn);
        handlers.push([b.el, fn]);
      }
      if (o.signal) {
        if (o.signal.aborted) return done({ aborted: true });
        o.signal.addEventListener('abort', onAbort);
      }
      if (o.timeoutMs != null) timer = setTimeout(() => done({ timeout: true }), o.timeoutMs);
    });
  }

  /** Run fn inside the next animation frame; resolves with that frame's timestamp (stimulus onset). */
  function onNextFrame(fn) {
    return new Promise((resolve) =>
      root.requestAnimationFrame((t) => {
        fn && fn();
        resolve(t);
      })
    );
  }

  WW.timing = { now, median, estimateRefresh, measureRefresh, msToFrames, present, nextFrame, onNextFrame, sleep, awaitResponse, awaitChoice };
})(globalThis);
