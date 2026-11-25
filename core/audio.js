/* Wetware core: synthesized audio (WebAudio, no files).
 *
 * sfx(name)   UI and feedback sounds.
 * voice(i)    the 8 n-back auditory stimuli: distinct in pitch, timbre and
 *             envelope so each is nameable ("chirp", "buzz"...). Each lasts
 *             ~350 ms and starts at full level for a crisp onset.
 *
 * The AudioContext is created lazily on the first call after a user
 * gesture (browser autoplay rules). Volume/mute persist via WW.prefs.
 */
(function (root) {
  'use strict';
  const WW = (root.WW = root.WW || {});

  let ctx = null;
  let master = null;
  let noiseBuf = null;

  function getPrefs() {
    return WW.prefs || { get: (k, d) => d, set() {} };
  }

  function ensure() {
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) {
      ctx = new AC();
      master = ctx.createGain();
      master.connect(ctx.destination);
      applyVolume();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function applyVolume() {
    if (!master) return;
    const p = getPrefs();
    master.gain.value = p.get('muted', false) ? 0 : p.get('volume', 0.6);
  }

  function noise() {
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      // Deterministic noise so the "hiss" stimulus is identical every time.
      const r = WW.rng ? WW.rng.create('noise') : { next: Math.random };
      for (let i = 0; i < d.length; i++) d[i] = r.next() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    return src;
  }

  /**
   * One synthesized note.
   * freq, freqEnd (exponential sweep), type, dur (s), gain, attack, release,
   * when (s from now), filter {type, freq, q}, vibrato {rate, depth}, source 'osc'|'noise'
   */
  function tone(o) {
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime + (o.when || 0);
    const dur = o.dur || 0.12;
    const attack = o.attack != null ? o.attack : 0.004;
    const release = o.release != null ? o.release : Math.min(0.08, dur / 2);
    const peak = o.gain != null ? o.gain : 0.3;

    let src;
    if (o.source === 'noise') {
      src = noise();
    } else {
      src = c.createOscillator();
      src.type = o.type || 'sine';
      src.frequency.setValueAtTime(o.freq || 440, t0);
      if (o.freqEnd) src.frequency.exponentialRampToValueAtTime(o.freqEnd, t0 + dur);
      if (o.vibrato) {
        const lfo = c.createOscillator();
        const depth = c.createGain();
        lfo.frequency.value = o.vibrato.rate;
        depth.gain.value = o.vibrato.depth;
        lfo.connect(depth).connect(src.frequency);
        lfo.start(t0);
        lfo.stop(t0 + dur + 0.05);
      }
    }

    const env = c.createGain();
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(peak, t0 + attack);
    env.gain.setValueAtTime(peak, t0 + Math.max(attack, dur - release));
    env.gain.linearRampToValueAtTime(0, t0 + dur);

    let node = src;
    if (o.filter) {
      const f = c.createBiquadFilter();
      f.type = o.filter.type || 'lowpass';
      f.frequency.value = o.filter.freq;
      f.Q.value = o.filter.q || 1;
      node.connect(f);
      node = f;
    }
    node.connect(env).connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  const running = () => root.document && root.document.documentElement.classList.contains('ww-running');
  const lookOn = (id) => {
    const l = getPrefs().get('rigLook', null);
    return !!(l && l.active && l.active.includes(id)) && getPrefs().get('rigCustom', true) !== false;
  };

  const SFX = {
    // Mechanical keys (Vex's stall) replace this click in the hub only; inside a game every sound stays stock.
    ui: () =>
      lookOn('keys') && !running()
        ? (tone({ source: 'noise', dur: 0.018, gain: 0.22, filter: { type: 'bandpass', freq: 3200, q: 1.5 } }),
          tone({ type: 'sine', freq: 150, freqEnd: 90, dur: 0.05, gain: 0.18, when: 0.012 }))
        : tone({ type: 'square', freq: 880, dur: 0.04, gain: 0.08 }),
    tick: () => tone({ type: 'sine', freq: 1600, dur: 0.02, gain: 0.06 }),
    correct: () => {
      tone({ type: 'sine', freq: 660, dur: 0.08, gain: 0.18 });
      tone({ type: 'sine', freq: 990, dur: 0.1, gain: 0.18, when: 0.07 });
    },
    error: () => tone({ type: 'sawtooth', freq: 180, freqEnd: 90, dur: 0.22, gain: 0.16, filter: { type: 'lowpass', freq: 900 } }),
    klaxon: () => {
      for (let i = 0; i < 2; i++) {
        tone({ type: 'square', freq: 740, dur: 0.11, gain: 0.14, when: i * 0.22 });
        tone({ type: 'square', freq: 520, dur: 0.11, gain: 0.14, when: i * 0.22 + 0.11 });
      }
    },
    unlock: () => {
      [440, 554, 659, 880].forEach((f, i) => tone({ type: 'triangle', freq: f, dur: 0.09, gain: 0.12, when: i * 0.06 }));
    },
  };

  // The 8 n-back stimuli. Keep names short; they are shown in tutorials.
  const VOICES = [
    { name: 'chirp', play: () => tone({ type: 'sine', freq: 600, freqEnd: 1500, dur: 0.3, gain: 0.3 }) },
    { name: 'buzz', play: () => tone({ type: 'sawtooth', freq: 110, dur: 0.35, gain: 0.25, filter: { type: 'lowpass', freq: 1200 } }) },
    {
      name: 'chime',
      play: () => {
        tone({ type: 'sine', freq: 1320, dur: 0.4, gain: 0.22, release: 0.3 });
        tone({ type: 'sine', freq: 2640, dur: 0.3, gain: 0.08, release: 0.25 });
      },
    },
    { name: 'thud', play: () => tone({ type: 'sine', freq: 140, freqEnd: 45, dur: 0.3, gain: 0.5, release: 0.2 }) },
    { name: 'hiss', play: () => tone({ source: 'noise', dur: 0.3, gain: 0.25, filter: { type: 'bandpass', freq: 5000, q: 2 } }) },
    { name: 'beep', play: () => tone({ type: 'square', freq: 660, dur: 0.3, gain: 0.12 }) },
    { name: 'wobble', play: () => tone({ type: 'triangle', freq: 330, dur: 0.35, gain: 0.3, vibrato: { rate: 14, depth: 40 } }) },
    { name: 'zap', play: () => tone({ type: 'sawtooth', freq: 2400, freqEnd: 180, dur: 0.25, gain: 0.16 }) },
  ];

  // Rook's tape: a quiet generative hum in the hub. Silenced whenever a game runs.
  let hum = null;
  function setHum(on) {
    const want = on && !running();
    if (!want) {
      if (hum) {
        const h = hum;
        hum = null;
        h.out.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
        setTimeout(() => h.nodes.forEach((n) => n.stop && n.stop()), 1500);
      }
      return;
    }
    if (hum || !ctx || ctx.state !== 'running') return; // waits for a user gesture
    const out = ctx.createGain();
    out.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = 90;
    lfo.connect(lfoGain).connect(lp.frequency);
    const nodes = [lfo];
    for (const [f, type] of [[55, 'triangle'], [82.4, 'sine'], [110.3, 'triangle']]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.connect(lp);
      nodes.push(o);
    }
    lp.connect(out).connect(master);
    nodes.forEach((n) => n.start());
    out.gain.setTargetAtTime(0.05, ctx.currentTime, 1.5);
    hum = { out, nodes };
  }
  let humWanted = false;
  if (root.addEventListener) root.addEventListener('pointerdown', () => humWanted && ensure() && setHum(true), true);

  WW.audio = {
    unlock: ensure,
    hum(on) {
      humWanted = !!on;
      if (ctx) setHum(humWanted);
    },
    sfx(name) {
      const f = SFX[name];
      if (f && ensure()) f();
    },
    voice(i) {
      const v = VOICES[i];
      if (v && ensure()) v.play();
    },
    voiceNames: VOICES.map((v) => v.name),
    tone,
    get volume() {
      return getPrefs().get('volume', 0.6);
    },
    setVolume(v) {
      getPrefs().set('volume', Math.min(1, Math.max(0, v)));
      applyVolume();
    },
    get muted() {
      return getPrefs().get('muted', false);
    },
    setMuted(m) {
      getPrefs().set('muted', !!m);
      applyVolume();
    },
  };
})(globalThis);
