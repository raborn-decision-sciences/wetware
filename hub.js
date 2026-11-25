/* Wetware hub: the Rig view, comms, diagnostics, system and data panels. */
(async function (root) {
  'use strict';
  const WW = root.WW;
  const { h, clear, toast, fmtDate, fmtMs } = WW.ui;
  const C = WW.catalog;

  WW.ui.applyDisplayPrefs();
  // ?demo: a throwaway in-memory store with sample data (trends, check-ins, a flagged
  // session), for exploring the hub. Nothing is read from or written to real storage.
  // ?profile=<id>: the same, loaded with a frozen test profile (tools/profiles, docs/PROFILES.md).
  const profileId = (/(?:^|[?&])profile=([a-z0-9-]+)/.exec(root.location.search) || [])[1] || null;
  const demo = !!profileId || /(?:^|[?&])demo(?:=|&|$)/.test(root.location.search);
  // ?fresh: a brand-new player: empty in-memory store and preferences that ignore this
  // browser's real ones, plus a movable clock (WW.debug.advance(days)) for walking through the
  // first weeks. Nothing is read from or written to real storage.
  const fresh = !demo && /(?:^|[?&])fresh(?:=|&|$)/.test(root.location.search);
  const store = demo || fresh ? WW.store.create(WW.store.memoryBackend()) : await WW.store.open();
  if (fresh) {
    const mem = new Map();
    WW.prefs.get = (k, d) => (mem.has(k) ? mem.get(k) : d);
    WW.prefs.set = (k, v) => mem.set(k, v);
    WW.ui.applyDisplayPrefs();
    const realNow = Date.now.bind(Date);
    let shift = 0;
    Date.now = () => realNow() + shift;
    WW.debug = {
      store,
      prefs: mem,
      async advance(days) {
        shift += days * 864e5;
        await refresh();
        return new Date(Date.now()).toISOString();
      },
      refresh: () => refresh(),
      // Auto-backup is off in this mode (it would share the real folder); this exposes its
      // state only so the panels can be rendered in each state.
      get ab() {
        return ab;
      },
      render: () => render(),
    };
  }
  if (demo) {
    // Preferences changed in demo mode (tab, contract, check-in skips) stay in memory too.
    const mem = new Map();
    const realGet = WW.prefs.get.bind(WW.prefs);
    WW.prefs.get = (k, d) => (mem.has(k) ? mem.get(k) : realGet(k, d));
    WW.prefs.set = (k, v) => mem.set(k, v);
    mem.set('contract', null);
    if (profileId) await seedProfile(store, profileId);
    else await seedDemo(store);
  }

  // A test profile, shifted by whole days so that its as-of date is today. Served pages only.
  async function seedProfile(st, id) {
    let data;
    try {
      data = await (await fetch(`tools/profiles/data/${id}.json`, { cache: 'no-store' })).json();
    } catch (e) {
      toast(`Couldn't load test profile ${id} (open the hub over http).`);
      return;
    }
    const DAY = 864e5;
    const shift = Math.round((Date.now() - data.asOf) / DAY) * DAY;
    for (const s of data.sessions) {
      const x = Object.assign({}, s, { startedAt: s.startedAt + shift, endedAt: s.endedAt + shift });
      if (x.context) x.context = Object.assign({}, x.context, { at: x.context.at + shift });
      await st.saveSession(x, []);
    }
    const checkins = {};
    for (const c of data.context.checkins) checkins[WW.contract.dateKey(c.at + shift)] = Object.assign({}, c, { at: c.at + shift });
    await st.setState('checkins', checkins);
    if (data.study) {
      const y = Object.assign({}, data.study, { startAt: data.study.startAt + shift, createdAt: data.study.createdAt + shift });
      if (y.endedAt) y.endedAt += shift;
      await st.setState('study', y);
    }
    toast(`Test profile: ${data.title}`);
  }

  async function seedDemo(st) {
    const r = WW.rng.create('demo');
    const DAY = 864e5;
    const t0 = Date.now() - 24 * DAY;
    const checkins = {};
    for (let d = 0; d < 24; d++) {
      const day = t0 + d * DAY;
      const sleep = d % 4 === 1 ? 5 : r.int(7, 8);
      checkins[WW.contract.dateKey(day)] = { sleep, mood: r.int(2, 5), stress: r.int(1, 4), caffeine: r.int(0, 2), at: day };
      const short = sleep <= 6 ? 1 : 0;
      const ctx = checkins[WW.contract.dateKey(day)];
      const mk = (game, summary, extra) =>
        st.saveSession(Object.assign({ id: `demo-${game}-${d}`, game, seed: d, startedAt: day + 3600e3, endedAt: day + 3900e3, trialCount: 40, summary, env: {}, context: ctx, quality: { flagged: false, reasons: [] } }, extra || {}), []);
      await mk('firewall', { ssrt: 300 - d * 2.5 + short * 25 + r.int(-12, 12) });
      if (d % 2 === 0) await mk('packet-echo', { meanN: Math.round((2 + d * 0.06 - short * 0.4 + r.next() * 0.3) * 100) / 100 });
      if (d % 3 === 0) await mk('safehouse', { recalled: 8 + r.int(0, 3) - short * 2, listLength: 12 });
      if (d % 3 === 1) {
        const facts = Math.min(24, 6 + Math.floor(d / 3));
        await mk('wiretap', { facts, recalled: Math.max(2, facts - 2 - r.int(0, 2) - short * 2), mode: 'speech', palace: 'stock', palaceSize: 48, dropRecalls: [] });
      }
    }
    // Diagnostics and a study in progress: a run-in, then an ABCABC study (3-week periods, weekly
    // probes) started 50 days ago, now in period 3. Planted: arm A's probes gain 1.5 SEMs per own
    // period, arm B's 1 SEM, arm C's nothing; the first run is a little worse (practice).
    const S0 = new Date(Date.now() - 50 * DAY);
    const sStart = new Date(S0.getFullYear(), S0.getMonth(), S0.getDate()).getTime();
    const demoStudy = { v: 1, startAt: sStart, preset: '3w', order: ['A', 'B', 'C', 'B', 'A', 'C'], followContract: true, createdAt: sStart };
    const dr = WW.rng.create('demo-dx');
    const P = 21 * DAY;
    const own = (arm, t) => {
      let e = 0;
      for (let k = 0; k < 6; k++) if (demoStudy.order[k] === arm) e += Math.min(Math.max((t - sStart - k * P) / P, 0), 1);
      return e;
    };
    const effect = { A: 1.5, B: 1, C: 0 };
    const dxTimes = [-3, -2, -1].map((x) => sStart + x * DAY + 10 * 3600e3).concat([1, 2, 3, 4, 5, 6, 7].map((k) => sStart + (7 * k - 1) * DAY + 10 * 3600e3));
    const val = (t, i, base, sem, dir, arm) => base + dir * effect[arm] * sem * own(arm, t) - (i === 0 ? dir * sem : 0) + dr.normal() * sem * 0.7;
    const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, Math.round(x)));
    const dxGen = {
      'dx-choice-rt': (t, i) => ({ medianRt: Math.round(val(t, i, 470, 37, -1, 'A')), accuracy: 0.97 }),
      'dx-stroop': (t, i) => ({ interference: Math.round(val(t, i, 105, 55, -1, 'A')), accuracy: 0.97 }),
      // The colour-free variant (normally instead of the colour Stroop; both here so the demo shows its card).
      'dx-stroop-spatial': (t, i) => ({ interference: Math.round(val(t, i, 45, 30, -1, 'A')), accuracy: 0.97 }),
      'dx-sart': (t, i) => ({ commissions: clamp(val(t, i, 7, 1.85, -1, 'A'), 0, 15), nogoTrials: 15 }),
      'dx-corsi': (t, i) => ({ fwdSpan: clamp(val(t, i, 6, 0.75, 1, 'B'), 2, 9), bwdSpan: clamp(val(t, i, 5, 0.75, 1, 'B'), 2, 9) }),
      'dx-digit-span': (t, i) => ({ fwdSpan: clamp(val(t, i, 6, 0.69, 1, 'B'), 3, 9), bwdSpan: clamp(val(t, i, 5, 0.82, 1, 'B'), 2, 9) }),
      'dx-paper-folding': (t, i) => {
        const c = clamp(val(t, i, 9, 1.9, 1, 'B'), 0, 16);
        return { correct: c, items: 16, score: 1.25 * c - 4 };
      },
      'dx-trails': (t, i) => {
        const a = Math.round(17500 + dr.normal() * 900);
        const diff = Math.round(val(t, i, 20000, 5340, -1, 'C'));
        return { diffMs: diff, timeAMs: a, timeBMs: a + diff };
      },
      'dx-matrix': (t, i) => ({ correct: clamp(val(t, i, 6, 1.5, 1, 'C'), 0, 10), items: 10 }),
    };
    for (const [game, gen] of Object.entries(dxGen))
      for (const [i, at] of dxTimes.entries())
        await st.saveSession({ id: `demo-${game}-${i}`, game, seed: i, startedAt: at, endedAt: at + 300e3, trialCount: 40, summary: gen(at, i), env: {}, quality: { flagged: false, reasons: [] } }, []);
    await st.setState('study', demoStudy);
    await st.saveSession({ id: 'demo-mash', game: 'firewall', seed: 1, startedAt: t0 + 10.5 * DAY, endedAt: t0 + 10.6 * DAY, trialCount: 40, summary: { ssrt: 120 }, env: {}, quality: { flagged: true, reasons: ['31% of responses under 150 ms'] } }, []);
    await st.setState('checkins', checkins);
  }
  const app = root.document.getElementById('app');

  let sessions = [];
  let env = null;
  // Rig customisation state (PLAN §6.1): purchases, finished-contract days, callsign. Creds are derived.
  let rigState = { purchases: [], contractDays: [], callsign: '' };
  // Daily check-ins (core/context.js): { 'YYYY-MM-DD': { sleep, mood, stress, caffeine, at } }.
  let checkins = {};
  let checkinOpen = false;
  // Modules can report pending work (e.g. Safehouse dead drops) via dueCount(store).
  let dueCounts = {};
  // The ABCABC study (core/study.js), or null. Stored as state 'study' (travels with exports).
  let study = null;
  let studyDraft = { preset: WW.study.PRESETS[0].id, followContract: true };

  // ---- offline install (sw.js). Only over http(s): service workers don't run on file://.
  const offline = { supported: 'serviceWorker' in root.navigator && /^https?:$/.test(root.location.protocol), ready: false, prompt: null };
  if (offline.supported) {
    root.navigator.serviceWorker
      .register('sw.js')
      .then(() => root.navigator.serviceWorker.ready)
      .then(() => {
        offline.ready = true;
        if (tab === 'system') render();
      })
      .catch(() => {});
  }
  root.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    offline.prompt = e;
    if (tab === 'system') render();
  });
  root.addEventListener('appinstalled', () => {
    offline.prompt = null;
    toast('Wetware installed.');
    if (tab === 'system') render();
  });

  WW.environment().then((e) => {
    env = e;
    render();
  });

  // ---- backup guards (core/storage.js WW.backup): persistent storage + export reminder.
  // persist: 'unknown' | 'persisted' | 'not-persisted' | 'unsupported'. Asked for once there is
  // something to keep (the first saved session), not on first visit.
  let persist = demo || fresh || !store.persistent ? 'unsupported' : 'unknown';
  async function checkPersist(ask) {
    if (persist === 'unsupported' || persist === 'persisted') return;
    persist = ask ? await WW.backup.requestPersist(root.navigator) : await WW.backup.persistStatus(root.navigator);
    if (tab === 'system') render();
  }
  const backupDays = () => WW.prefs.get('backupDays', WW.backup.REMIND_DEFAULT);
  // Not in ?demo: sample data in a throwaway store has nothing to back up.
  const backupDue = () => !demo && WW.backup.due({ sessions, lastExport: WW.prefs.get('lastExport', null), days: backupDays(), snoozeUntil: WW.prefs.get('backupSnooze', null), now: Date.now() });
  // ---- auto-backup folder (WW.autoBackup). state: 'unsupported' | 'off' | 'ok' | 'paused' | 'error'.
  // Never blocks a session: if Chrome has let go of the folder, the backup pauses and Ops shows a
  // one-click "Allow again" (asking needs a click; the manual export and its reminder still apply).
  const ab = { state: WW.autoBackup.supported() && !demo && !fresh && store.persistent ? 'off' : 'unsupported', dir: null, last: null, error: '', kv: null, busy: false };
  async function abInit() {
    if (ab.state === 'unsupported') return;
    ab.kv = await WW.autoBackup.deviceKV();
    if (!ab.kv) return void (ab.state = 'unsupported');
    ab.dir = (await ab.kv.get('backupDir')) || null;
    ab.last = (await ab.kv.get('backupLast')) || null;
    if (ab.dir) ab.state = (await WW.autoBackup.permission(ab.dir, false)) === 'granted' ? 'ok' : 'paused';
    render();
  }
  /** ask: true only from a click (it may show Chrome's permission prompt). */
  async function abRun(ask) {
    if (!ab.dir || ab.busy) return;
    ab.busy = true;
    try {
      const perm = await WW.autoBackup.permission(ab.dir, ask);
      if (perm !== 'granted') {
        ab.state = 'paused';
        return;
      }
      const data = await store.exportAll();
      if (!data.sessions.length) {
        ab.state = 'ok';
        return; // nothing worth a file yet (or just wiped: keep the old files as they are)
      }
      const now = Date.now();
      const res = await WW.autoBackup.write(ab.dir, JSON.stringify(data), now);
      ab.last = { at: now, name: res.name, bytes: res.bytes, sessions: data.sessions.length };
      await ab.kv.set('backupLast', ab.last);
      WW.prefs.set('lastExport', now);
      WW.prefs.set('backupSnooze', null);
      ab.state = 'ok';
      ab.error = '';
    } catch (e) {
      ab.state = e && e.name === 'NotAllowedError' ? 'paused' : 'error';
      ab.error = e && e.name === 'NotFoundError' ? 'The folder is gone (moved or deleted). Choose it again.' : (e && e.message) || String(e);
    } finally {
      ab.busy = false;
      render();
    }
  }
  async function abChoose() {
    let dir;
    try {
      dir = await WW.autoBackup.pick(); // first, while the click still counts as a gesture
    } catch (e) {
      if (e && e.name !== 'AbortError') toast('Could not open the folder: ' + e.message, 'bad');
      return;
    }
    ab.dir = dir;
    await ab.kv.set('backupDir', dir);
    await abRun(true);
    if (ab.state === 'ok') toast(`Auto-backup on: ${dir.name}. A file per day, the newest ${WW.autoBackup.KEEP_FILES} kept.`);
  }
  async function abOff() {
    ab.dir = null;
    ab.state = 'off';
    await ab.kv.del('backupDir');
    render();
  }

  async function exportJSON() {
    const stamp = new Date().toISOString().slice(0, 10);
    WW.ui.download(`wetware-export-${stamp}.json`, JSON.stringify(await store.exportAll(), null, 1), 'application/json');
    WW.prefs.set('lastExport', Date.now());
    WW.prefs.set('backupSnooze', null);
    render();
  }

  async function refresh() {
    sessions = await store.listSessions();
    const counts = {};
    for (const def of WW.games.list()) {
      if (typeof def.dueCount === 'function') {
        try {
          counts[def.id] = await def.dueCount(store);
        } catch (_) {
          counts[def.id] = 0;
        }
      }
    }
    dueCounts = counts;
    rigState = Object.assign({ purchases: [], contractDays: [], callsign: '' }, (await store.getState('rig')) || {});
    checkins = (await store.getState('checkins')) || {};
    study = (await store.getState('study')) || null;
    await noteContract();
    announceGift();
    render();
  }

  // ------------------------------------------------------------------ rig

  const rigOn = () => WW.prefs.get('rigCustom', true) !== false;
  const unlockAll = () => WW.prefs.get('unlockAll', false) === true;
  const isTraining = (id) => C.MODULES.some((m) => m.id === id);
  const fmtCr = (n) => n.toLocaleString('en-US') + '¢';

  function rigStatus() {
    return WW.rig.status({ sessions, rig: rigState, days: trainingDays(), isTraining, nameOf: (id) => (C.module(id) || { name: id }).name, unlockAll: unlockAll() });
  }

  async function saveRig() {
    try {
      await store.setState('rig', rigState);
    } catch (_) {
      toast('Could not save the Stash.', 'bad');
    }
  }

  /** Contract completion can't be rebuilt later, so it is recorded the day it happens. */
  async function noteContract() {
    const c = todaysContract();
    if (!c.ids.length || rigState.contractDays.includes(c.day)) return;
    const done = new Set(sessions.filter((s) => WW.contract.dateKey(s.startedAt) === c.day).map((s) => s.game));
    if (c.ids.every((id) => done.has(id))) {
      rigState.contractDays = rigState.contractDays.concat(c.day);
      await saveRig();
    }
  }

  /** A toast the first time a crew gift (or Rook's own item) is seen. */
  function announceGift() {
    if (!rigOn() || unlockAll()) return;
    const g = WW.rig.latestGift(rigStatus());
    const seen = WW.prefs.get('giftSeen', 0);
    if (!g || g.day <= seen) return;
    WW.prefs.set('giftSeen', g.day);
    toast(`Rook left something in the Stash: ${g.item.name}.`);
  }

  async function buy(item) {
    const st = rigStatus();
    if (st.balance < item.price) return;
    const ok = await WW.ui.confirmDialog(`Buy ${item.name}?`, `${fmtCr(item.price)} to Vex. You’d have ${fmtCr(st.balance - item.price)} left.`, 'Buy');
    if (!ok) return;
    rigState.purchases = rigState.purchases.concat({ id: item.id, day: trainingDays(), price: item.price, at: Date.now() });
    await saveRig();
    WW.audio.sfx('ui');
    render();
  }

  function equip(id) {
    WW.prefs.set('skin', id);
    WW.ui.applyDisplayPrefs();
    render();
  }

  // ---- trinkets (step 6d). The hub mirrors what is owned and switched on into
  // prefs ('rigLook'), so game pages and core/skins.js can read it without the store.
  const TOGGLES = ['plate', 'keys', 'cat', 'rain', 'neon', 'rook-plate', 'rook-lighter', 'rook-tape', 'rook-palette'];
  const SHEETS = {
    '': [['NO', 'CHROME', 'ZONE'], 'R'],
    sticker1: [['VOID', 'WHERE', 'PROHIBITED'], '✶'],
    sticker2: [['HANDS', 'OFF', 'MY DECK'], '⚡'],
    sticker3: [['LOWLIGHT', 'LOCAL', 'NO. 7'], '◉'],
    sticker4: [['VEX', 'APPROVED'], '¢'],
  };
  const look = () => Object.assign({ active: [], off: [], sheet: '', callsign: '' }, WW.prefs.get('rigLook', {}));
  const lookOn = (id) => look().active.includes(id);
  let catAwakeUntil = 0;

  /** Recompute the active trinket list from ownership; apply if it changed. */
  function syncLook() {
    const l = look();
    const on = rigOn();
    const st = on ? rigStatus() : null;
    const active = on ? TOGGLES.filter((id) => st.ownsItem(id) && !l.off.includes(id)) : [];
    const sheet = on && l.sheet && st.ownsItem(l.sheet) ? l.sheet : '';
    const callsign = (rigState.callsign || '').toUpperCase();
    const next = { active, off: l.off, sheet, callsign };
    if (JSON.stringify(next) !== JSON.stringify(WW.prefs.get('rigLook', null))) WW.prefs.set('rigLook', next);
    WW.ui.applyDisplayPrefs(); // cheap; decor only rebuilds when its inputs change
    WW.audio.hum && WW.audio.hum(active.includes('rook-tape'));
  }

  function setOff(id, off) {
    const l = look();
    l.off = off ? [...new Set(l.off.concat(id))] : l.off.filter((x) => x !== id);
    WW.prefs.set('rigLook', l);
    render();
  }

  function setSheet(id) {
    const l = look();
    l.sheet = id;
    WW.prefs.set('rigLook', l);
    render();
  }

  function catSvg(awake) {
    const eyes = awake
      ? '<circle cx="15" cy="13" r="1.4" fill="currentColor"/><circle cx="20" cy="13" r="1.4" fill="currentColor"/>'
      : '<path d="M13.5 13.5 q1.5 1 3 0 M18.5 13.5 q1.5 1 3 0" stroke="currentColor" stroke-width="1" fill="none"/>';
    const span = h('span.desk-cat', { title: awake ? 'Desk cat (awake)' : 'Desk cat (asleep)', 'aria-hidden': 'true' });
    span.innerHTML = `<svg viewBox="0 0 48 26" width="48" height="26"><path d="M30 22 q12 1 14 -8" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round"/><ellipse cx="30" cy="18" rx="13" ry="7" fill="currentColor" opacity=".85"/><circle cx="17.5" cy="15" r="7" fill="currentColor"/><path d="M11.5 11 l1 -6 4 4 Z M23.5 11 l-1 -6 -4 4 Z" fill="currentColor"/><g style="color: var(--bg)">${eyes}</g>${awake ? '' : '<text x="27" y="7" font-size="7" fill="currentColor" opacity=".7">z</text>'}</svg>`;
    return span;
  }

  function lighterSvg() {
    const span = h('span.desk-lighter', { title: 'Rook’s desk lighter', 'aria-hidden': 'true' });
    span.innerHTML = '<svg viewBox="0 0 16 30" width="16" height="30"><path class="flame" d="M8 2 C12 7 11 11 8 13 C5 11 4 7 8 2 Z" fill="#ffb347"/><rect x="3" y="13" width="10" height="16" rx="1.5" fill="currentColor"/><rect x="3" y="13" width="10" height="4" fill="currentColor" opacity=".6"/></svg>';
    return span;
  }

  function trinkets() {
    if (!rigOn()) return null;
    const l = look();
    const items = [];
    if (lookOn('plate')) items.push(h('span.plate', { title: 'Callsign plate' }, l.callsign || 'NO CALLSIGN'));
    if (lookOn('rook-plate')) items.push(h('span.plate.rook', { title: 'Rook’s old callsign plate' }, 'R·0̶7'));
    if (lookOn('rook-lighter')) items.push(lighterSvg());
    if (lookOn('cat')) items.push(catSvg(Date.now() < catAwakeUntil));
    return items.length ? h('div.trinkets', items) : null;
  }

  /** Launch one module, or a queue of them (stops on abort or discard). */
  async function launch(id, queue) {
    WW.audio.unlock();
    // Training before the baseline is finished muddies the transfer comparison: say so once per launch.
    const isTraining = C.MODULES.some((m) => m.id === id);
    const left = dxStatus().filter((x) => !x.count).length;
    if (isTraining && left) {
      const ok = await WW.ui.confirmDialog(
        'Baseline not finished',
        `${left} diagnostic probe(s) still untaken. Training first makes it harder to tell later what the training changed. Train anyway?`,
        'Train anyway'
      );
      if (!ok) return;
    }
    // During a study, training another arm's module blurs the comparison: ask, and count it.
    const sn = studyNow();
    if (isTraining && sn && sn.state === 'running' && WW.study.offArm(study, id, Date.now())) {
      const arm = (a) => WW.study.ARMS.find((x) => x.id === a);
      const its = arm(WW.study.armOfModule(C.module(id)));
      const ok = await WW.ui.confirmDialog(
        'Off the study plan',
        `${C.module(id).name} trains arm ${its.id} (${its.name}), but this period is arm ${sn.arm} (${arm(sn.arm).name}). Sessions like this blur the comparison; the study panel counts them. Play anyway?`,
        'Play anyway'
      );
      if (!ok) return;
    }
    WW.host.launch(id, {
      store,
      async onDone(result) {
        if (result.aborted) toast(queue && queue.length ? 'Stopped. Nothing logged for that one.' : 'Run aborted. Nothing logged.');
        else if (result.saved) {
          toast('Session logged.');
          catAwakeUntil = Date.now() + 12000;
          root.setTimeout(render, 12100);
        }
        else toast('Session could not be saved.', 'bad');
        await refresh();
        if (result.saved && persist === 'not-persisted') checkPersist(true);
        if (result.saved) abRun(false);
        if (result.saved && queue && queue.length) launch(queue[0], queue.slice(1));
      },
    });
  }

  const DAY = 864e5;
  /** When a probe is next due: during the run-in (first C.RUNIN runs), the next calendar day; then monthly. */
  function nextDue(last, count) {
    if (count < C.RUNIN) {
      const d = new Date(last.startedAt);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
    }
    return last.startedAt + C.RETEST_DAYS * DAY;
  }
  /** The study's schedule applies from its start until a few days after its end. */
  const studySchedule = (now) => study && now >= study.startAt && now < WW.study.endAt(study) + 3 * DAY;
  /** Per-probe status: last/first session, count, and whether a (re)test is due. */
  function dxStatus() {
    const now = Date.now();
    return C.battery().map((d) => {
      const ss = sessions.filter((s) => s.game === d.id); // newest first
      const last = ss[0] || null;
      let due = !last || now >= nextDue(last, ss.length);
      if (last && ss.length >= C.RUNIN && studySchedule(now)) due = WW.study.probeDue(study, last.startedAt, now).due;
      return { d, last, first: ss[ss.length - 1] || null, count: ss.length, due };
    });
  }
  /** The study's status now, or null when there is no study. */
  const studyNow = () => (study ? WW.study.status(study, Date.now()) : null);

  function headline(id, summary) {
    const def = WW.games.get(id);
    try {
      return def && def.headline ? def.headline(summary || {}) : '';
    } catch (_) {
      return '';
    }
  }

  // ------------------------------------------------------------- masthead

  function mast() {
    const totalTrials = sessions.reduce((a, s) => a + (s.trialCount || 0), 0);
    return h(
      'header.mast',
      h('div.brand', h('h1', 'WET', h('em', 'WARE')), h('div.sub', 'Lowlight · wetware tuning suite')),
      trinkets(),
      h('span.sticker.s1', { 'aria-hidden': 'true' }, SHEETS[look().sheet || ''][0].flatMap((w, i) => (i ? [h('br'), w] : [w]))),
      h(
        'div.status',
        h('span', { class: store.persistent ? '' : 'warn' }, 'store ', h('b', store.persistent ? 'persistent' : 'memory only')),
        h('span', 'display ', h('b', env && env.refreshHz ? env.refreshHz + ' Hz' : '…')),
        rigOn() && !unlockAll() ? h('span', 'creds ', h('b.creds', fmtCr(rigStatus().balance))) : null,
        h('span', 'sessions ', h('b', String(sessions.length))),
        h('span', 'trials ', h('b', String(totalTrials)))
      )
    );
  }

  // ------------------------------------------------------------ top panels

  /** Optional daily check-in. Copied onto every session logged today. */
  function checkinPanel() {
    const day = WW.contract.dateKey(Date.now());
    const entry = checkins[day] || {};
    const F = WW.context.FIELDS;
    const filled = F.filter((f) => entry[f.id] !== undefined).length;
    const skipped = WW.prefs.get('checkinSkip', '') === day && !filled;
    const set = async (id, v) => {
      const cur = checkins[day] || {}; // read at click time, not at render time
      const next = Object.assign({}, cur, { [id]: cur[id] === v ? undefined : v, at: Date.now() });
      if (next[id] === undefined) delete next[id];
      checkins = Object.assign({}, checkins, { [day]: next });
      await store.setState('checkins', checkins);
      render();
    };
    const label = (f, v) => (f.options.find(([x]) => x === v) || [v, String(v)])[1] || String(v);
    if ((filled === F.length && !checkinOpen) || skipped) {
      return h(
        'section.panel.checkin',
        h('h2', 'Check-in', h('small', day)),
        h(
          'p.small',
          skipped ? 'Skipped today. ' : F.map((f) => `${f.label.split(' ')[0].toLowerCase()} ${label(f, entry[f.id]) || entry[f.id]}`).join(' · ') + ' ',
          h('button.equip', { type: 'button', on: { click: () => ((checkinOpen = true), WW.prefs.set('checkinSkip', ''), render()) } }, skipped ? 'check in' : 'edit')
        )
      );
    }
    return h(
      'section.panel.checkin',
      h('h2', 'Check-in', h('small', 'optional · 10 seconds')),
      h('p.muted.small', 'How you slept and how you feel move scores more than practice does. Logged with today’s sessions, so trends can account for it.'),
      F.map((f) =>
        h(
          'div.ci-row',
          h('span.ci-label', f.label),
          h(
            'div.ci-opts',
            { role: 'group', 'aria-label': f.label },
            f.options.map(([v, text]) => h('button.ci-opt', { type: 'button', 'aria-pressed': String(entry[f.id] === v), title: text || String(v), on: { click: () => set(f.id, v) } }, f.id === 'mood' || f.id === 'stress' ? String(v) : text))
          )
        )
      ),
      h(
        'div.row',
        filled === F.length ? h('button.btn', { type: 'button', on: { click: () => ((checkinOpen = false), render()) } }, 'Done') : null,
        !filled ? h('button.btn', { type: 'button', on: { click: () => (WW.prefs.set('checkinSkip', day), render()) } }, 'Skip today') : null
      )
    );
  }

  function comms() {
    const last = sessions.find((s) => s.game === 'handshake');
    const st = dxStatus();
    const left = st.filter((x) => !x.count);
    const mins = left.reduce((a, x) => a + x.d.minutes, 0);
    // After the baseline: what's due, so the line doesn't repeat 'come online next' for weeks.
    const dueNow = st.filter((x) => x.due).length;
    const later = st.filter((x) => x.last && !x.due).map((x) => nextDue(x.last, x.count));
    const after = dueNow
      ? `Baseline is on file. ${dueNow} probe${dueNow === 1 ? '' : 's'} due now (Diagnostics); then the contract.`
      : later.length && !studySchedule(Date.now())
        ? `Baseline is on file. Next probe due ${fmtDate(Math.min(...later)).slice(0, 10)}. Until then, the contracts.`
        : 'Baseline is on file. Keep taking the contracts.';
    const next = !left.length
      ? trainingDays()
        ? after
        : 'Baseline is on file. Training modules come online next; retest the probes monthly so we can see whether any of it carries over.'
      : left.length === st.length
        ? `Before any training: the baseline. Eight short probes, about ${mins} minutes. One sitting or a few, your call, but finish them before you train.`
        : `Baseline: ${st.length - left.length} of ${st.length} probes done, about ${mins} minutes left.`;
    const lines = !last
      ? ['Your deck boots. Most of it is dark: modules are still being flashed.', 'Run a handshake so I know your timing is clean.', next]
      : last.summary && last.summary.clean
        ? ['Timing checks out. Good.', next]
        : ['That handshake was noisy: jumped starts, misses, or both. Run it again somewhere quiet.', next];
    const gift = rigOn() && !unlockAll() ? WW.rig.latestGift(rigStatus()) : null;
    const giftNote = gift && gift.day === trainingDays() ? h('div.comms', h('div.from', `ROOK · DAY ${gift.day}`), h('p', gift.item.comms), h('p.muted', `${gift.item.name} is in your Stash. — R.`)) : null;
    return h('section.panel', h('h2', 'Comms', h('small', 'incoming')), giftNote, h('div.comms', h('div.from', 'ROOK'), ...lines.map((l) => h('p', l)), h('p.muted', '— R.')));
  }

  /** Today's contract: drawn once per day, then frozen. */
  function todaysContract() {
    const day = WW.contract.dateKey(Date.now());
    const saved = WW.prefs.get('contract', null);
    const online = C.MODULES.filter((m) => C.isOnline(m.id));
    const sn = studyNow();
    const arm = sn && sn.state === 'running' && study.followContract ? sn.arm : null;
    if (saved && saved.day === day && (saved.arm || null) === arm && saved.ids.every((id) => C.isOnline(id))) return saved;
    if (!online.length) return { day, ids: [] };
    const tunes = {};
    for (const m of online) {
      const def = WW.games.get(m.id);
      const ss = sessions.filter((s) => s.game === m.id);
      tunes[m.id] = def.tune && ss.length ? def.tune(ss) : null;
    }
    const priority = online.filter((m) => dueCounts[m.id] > 0).map((m) => m.id);
    let ids;
    if (arm) {
      // Study period: 2 modules from the active arm, 1 from neither arm (priorities like dead drops first).
      const L = WW.study.layout();
      const pick = (list, size) => {
        const mods = online.filter((m) => list.includes(m.id));
        return WW.contract.build({ day, modules: mods, sessions, tunes, priority: priority.filter((id) => list.includes(id)), size, now: Date.now() });
      };
      const a = pick(L[arm].modules, 2);
      const n = pick(L.neutral, 1);
      ids = [...n.filter((id) => priority.includes(id)), ...a, ...n.filter((id) => !priority.includes(id))];
    } else ids = WW.contract.build({ day, modules: online, sessions, tunes, priority, now: Date.now() });
    const c = { day, ids, arm };
    WW.prefs.set('contract', c);
    return c;
  }

  function contract() {
    const c = todaysContract();
    if (!c.ids.length) return h('section.panel', h('h2', 'Daily contract', h('small', 'protocol')), h('p', 'No training modules online yet.'));
    const today = c.day;
    const doneIds = new Set(sessions.filter((s) => WW.contract.dateKey(s.startedAt) === today).map((s) => s.game));
    const left = c.ids.filter((id) => !doneIds.has(id));
    const mins = left.reduce((a, id) => a + (C.module(id).minutes || 4), 0);
    return h(
      'section.panel',
      h('h2', 'Daily contract', h('small', today)),
      h(
        'ul.mods',
        c.ids.map((id) => {
          const m = C.module(id);
          const done = doneIds.has(id);
          const due = dueCounts[id] ? ` · ${dueCounts[id]} due` : '';
          return h(
            'li',
            h('button.mod-link', { type: 'button', on: { click: () => launch(id) } }, m.name),
            h('span.row', h('span.muted.small', `${m.primary.map((s) => C.subsystem(s).name).join(' · ')}${due}`), h('span', { class: done ? 'chip online' : 'chip' }, done ? 'done' : `~${m.minutes || 4} min`))
          );
        })
      ),
      h(
        'div.row',
        { style: { marginTop: '10px' } },
        h('button.btn.primary', { type: 'button', disabled: !left.length, on: { click: () => launch(left[0], left.slice(1)) } }, left.length ? `Run contract · ~${mins} min` : 'Contract complete')
      ),
      h(
        'p.muted.small',
        `Days on the job: ${trainingDays()}. ` +
          (c.arm
            ? `Study period: two modules from arm ${c.arm} (${WW.study.ARMS.find((a) => a.id === c.arm).name}) and one from neither arm, favouring what you haven’t touched lately.`
            : 'Rook rotates domains and favours what you haven’t touched lately. Free play logs the same data.')
      )
    );
  }

  function diagnostics() {
    const st = dxStatus();
    const done = st.filter((x) => x.count).length;
    const complete = done === st.length;
    const baselineAt = complete ? Math.max(...st.map((x) => x.first.startedAt)) : null;
    const pending = st.filter((x) => x.due && C.isOnline(x.d.id));
    const mins = pending.reduce((a, x) => a + x.d.minutes, 0);
    const runBtn = h(
      'button.btn.primary',
      { type: 'button', disabled: !pending.length, on: { click: () => launch(pending[0].d.id, pending.slice(1).map((x) => x.d.id)) } },
      pending.length ? `Run ${pending.length} pending · ~${mins} min` : 'All probes up to date'
    );
    return h(
      'section.panel',
      h('h2', 'Diagnostics', h('small', complete ? 'baseline on file' : `baseline ${done} / ${st.length}`)),
      h(
        'p',
        complete && studySchedule(Date.now())
          ? `Baseline completed ${fmtDate(baselineAt).slice(0, 10)}. Study schedule: every probe is due ${WW.study.preset(study).probeEveryWeeks === 1 ? 'weekly' : `every ${WW.study.preset(study).probeEveryWeeks} weeks`} (from 2 days before each date) until the study ends, then monthly again.`
          : complete
          ? `Baseline completed ${fmtDate(baselineAt).slice(0, 10)}. Each probe's first ${C.RUNIN} runs are a run-in, one a day, which uses up the early practice gain and gives a first read on your own noise. After that, each probe is due ${C.RETEST_DAYS} days after its last run.`
          : `Untrained transfer probes. Take every one before regular training. The first ${C.RUNIN} runs of each are a run-in, one a day; after that, retest monthly.`
      ),
      h(
        'ul.mods',
        st.map((x) =>
          h(
            'li',
            h('button.mod-link', { type: 'button', disabled: !C.isOnline(x.d.id), on: { click: () => launch(x.d.id) } }, x.d.name),
            h(
              'span.row',
              h('span.muted.small', x.last ? headline(x.d.id, x.last.summary) + ' · ' + fmtDate(x.last.startedAt).slice(5, 10) : `~${x.d.minutes} min`),
              h('span', { class: x.due ? 'chip' : 'chip online' }, x.due ? (!x.last ? 'not taken' : x.count < C.RUNIN ? `run-in ${x.count + 1}/${C.RUNIN}` : 'due') : 'ok')
            )
          )
        )
      ),
      h('div.row', { style: { marginTop: '10px' } }, runBtn),
      h('p.muted.small', 'A queued run stops if you abort or discard a probe. Results are kept per probe.')
    );
  }

  // ------------------------------------------------------------------- rig

  /** All [confidence, correct] pairs from recent sessions, newest first (KERNEL). */
  function confidencePairs(limit = 300) {
    const out = [];
    for (const s of sessions) {
      const p = s.summary && s.summary.confidencePairs;
      if (Array.isArray(p)) out.push(...p);
      if (out.length >= limit) break;
    }
    return out.slice(0, limit);
  }

  function tuneFor(sub) {
    if (sub.id === 'kernel') {
      const pairs = confidencePairs();
      return { sessions: pairs.length, level: WW.confidence.tune(pairs), unit: 'ratings' };
    }
    const mods = C.modulesFor(sub.id).filter((m) => C.isOnline(m.id));
    const levels = [];
    let n = 0;
    for (const m of mods) {
      const ss = sessions.filter((s) => s.game === m.id);
      n += ss.length;
      const def = WW.games.get(m.id);
      if (ss.length && def && typeof def.tune === 'function') {
        const v = def.tune(ss);
        if (Number.isFinite(v)) levels.push(Math.min(1, Math.max(0, v)));
      }
    }
    return { sessions: n, level: levels.length ? levels.reduce((a, b) => a + b, 0) / levels.length : null };
  }

  function subCard(sub) {
    const t = tuneFor(sub);
    const signal = t.level != null ? `tune ${Math.round(t.level * 100)}%` : t.sessions ? `${t.sessions} ${t.unit || 'sessions'} · calibrating` : 'no signal';
    return h(
      'article.sub-card',
      h('header', h('h3', sub.name), h('span.signal', signal)),
      h('div.domain', sub.domain),
      h('div.meter', { role: 'img', 'aria-label': signal }, h('i', { style: { width: (t.level || 0) * 100 + '%' } })),
      h(
        'ul.mods',
        C.modulesFor(sub.id).map((m) => {
          const on = C.isOnline(m.id);
          return h(
            'li',
            h('button.mod-link', { type: 'button', disabled: !on, on: { click: () => launch(m.id) } }, m.name),
            h('span.row', h('span.chip.grade', { title: 'Evidence grade' }, m.grade), h('span', { class: on ? 'chip online' : 'chip' }, on ? 'online' : m.phase >= 5 ? 'backlog' : 'P' + m.phase))
          );
        })
      )
    );
  }

  function rig() {
    return [h('div.rig', C.SUBSYSTEMS.map(subCard)), WW.results.view({ sessions, study })];
  }

  /** The ABCABC study: set-up, progress, early end (core/study.js, docs/STUDY.md). */
  function studyPanel() {
    const S = WW.study;
    const L = S.layout();
    const now = Date.now();
    const nm = (id) => (C.module(id) || { name: id }).name;
    const armRow = (a) =>
      h('li', h('span', `${a.id} · ${a.name}`, h('small', `${a.domains.map((d) => C.subsystem(d).name).join(' · ')}. Probes: ${L[a.id].probes.map(nm).join(', ')}. Modules: ${L[a.id].modules.map(nm).join(', ')}.`)));
    const save = async (v) => {
      try {
        await store.setState('study', v);
      } catch (_) {
        toast('Could not save the study.', 'bad');
      }
      await refresh();
    };
    const head = (small) => h('h2', 'Study', h('small', small));

    if (!study) {
      const st = dxStatus();
      const short = st.filter((x) => x.count < C.RUNIN);
      const p = S.preset({ preset: studyDraft.preset });
      const weeks = S.PERIODS * p.periodWeeks;
      const presets = S.PRESETS.map((x) =>
        h(
          'label.field.study-opt',
          h('input', { type: 'radio', name: 'study-preset', value: x.id, checked: studyDraft.preset === x.id, on: { change: () => ((studyDraft.preset = x.id), render()) } }),
          h('span', `${x.label} · ${S.PERIODS * x.periodWeeks} weeks${x === S.PRESETS[0] ? ' (recommended)' : ''}`, x.note ? h('small', { style: { display: 'block' } }, x.note) : null)
        )
      );
      const start = async () => {
        const ok = await WW.ui.confirmDialog(
          'Start the study?',
          `${weeks} weeks from today: six ${p.periodWeeks}-week periods, each training one arm, in an order drawn at random now. All eight probes are due ${p.probeEveryWeeks === 1 ? 'every week' : `every ${p.probeEveryWeeks} weeks`}.`,
          'Start'
        );
        if (ok) await save(S.create({ now: Date.now(), presetId: studyDraft.preset, followContract: studyDraft.followContract }));
      };
      return h(
        'section.panel',
        head('ABCABC · optional'),
        h('p', 'Does training transfer, and only to what you trained? The probed domains split into three arms. Each period trains one arm; two cycles of three, in a random order, with the probes retested throughout. If training transfers, an arm’s probes gain during its own periods and stay flat during the others.'),
        h('ul.items', S.ARMS.map(armRow)),
        h('p.muted.small', `Modules with no probed domain (${L.neutral.map(nm).join(', ')}) belong to no arm and stay available.`),
        h('div', presets),
        h('label.field', h('input', { type: 'checkbox', checked: studyDraft.followContract, on: { change: (e) => (studyDraft.followContract = e.target.checked) } }), 'Daily contract follows the study (two modules from the current arm, one from neither)'),
        h('div.row', { style: { marginTop: '10px' } }, h('button.btn.primary', { type: 'button', disabled: !!short.length, on: { click: start } }, 'Start study')),
        short.length ? h('p.muted.small', `Finish the run-in first: ${short.map((x) => x.d.name).join(', ')} still need${short.length === 1 ? 's' : ''} ${C.RUNIN} runs.`) : null
      );
    }

    const sn = S.status(study, now);
    const pr = S.preset(study);
    const b = S.boundaries(study);
    const line = h(
      'div.study-line',
      study.order.map((a, k) => {
        const cls = sn.state === 'running' && k === sn.index ? 'chip now' : b[k + 1] <= now || sn.state !== 'running' ? 'chip' : 'chip later';
        return h('span', { class: cls, title: `${S.ARMS.find((x) => x.id === a).name}, ${fmtDate(b[k]).slice(0, 10)} to ${fmtDate(b[k + 1] - DAY).slice(0, 10)}` }, `${k + 1}·${a}`);
      })
    );
    const off = S.offArmCounts(study, sessions);
    if (sn.state === 'running') {
      const arm = S.ARMS.find((a) => a.id === sn.arm);
      const lastRuns = C.battery().map((d) => (sessions.find((s) => s.game === d.id) || {}).startedAt || null);
      const nexts = lastRuns.map((t) => S.probeDue(study, t, now));
      const anyDue = nexts.some((x) => x.due);
      const next = nexts.map((x) => x.next).filter(Boolean)[0];
      const end = async () => {
        if (await WW.ui.confirmDialog('End the study early?', 'Results keep the periods completed so far. The schedule goes back to monthly probes. This can’t be resumed.', 'End study')) await save(Object.assign({}, study, { endedAt: Date.now() }));
      };
      return h(
        'section.panel',
        head(`period ${sn.index + 1} / ${S.PERIODS} · arm ${sn.arm}`),
        h('p', `Now: arm ${arm.id}, ${arm.name} (${arm.domains.map((d) => C.subsystem(d).name).join(' · ')}). Week ${sn.week} of ${sn.weeks}; this period ends ${fmtDate(sn.periodEnd - DAY).slice(0, 10)}.`),
        line,
        h('p.small', anyDue ? 'Probes are due now (Diagnostics).' : next ? `Next probes open ${fmtDate(next - 2 * DAY).slice(0, 10)}.` : 'No more probe points.'),
        off[sn.index] ? h('p.small', { style: { color: 'var(--amber)' } }, `${off[sn.index]} session(s) this period trained another arm.`) : null,
        h('label.field', h('input', { type: 'checkbox', checked: study.followContract !== false, on: { change: (e) => save(Object.assign({}, study, { followContract: e.target.checked })) } }), 'Daily contract follows the study'),
        h('p.muted.small', `${pr.label}; ${S.PERIODS * pr.periodWeeks} weeks from ${fmtDate(study.startAt).slice(0, 10)}. Results build up under Rig → Results.`),
        h('div.row', h('button.btn', { type: 'button', on: { click: end } }, 'End study early'))
      );
    }
    const restart = async () => {
      if (!(await WW.ui.confirmDialog('Set up a new study?', 'This study and its results move to the study history (kept in exports); its sessions stay.', 'New study'))) return;
      const hist = (await store.getState('studyHistory')) || [];
      await store.setState('studyHistory', hist.concat(Object.assign({}, study, { archivedAt: Date.now() })));
      await save(null);
    };
    return h(
      'section.panel',
      head(sn.state === 'done' ? 'complete' : 'ended early'),
      h('p', sn.state === 'done' ? `Completed ${fmtDate(S.endAt(study)).slice(0, 10)}. Results are under Rig → Results.` : `Ended ${fmtDate(study.endedAt).slice(0, 10)}, in period ${sn.index + 1}. Results for the completed periods are under Rig → Results.`),
      line,
      h('div.row', { style: { marginTop: '10px' } }, h('button.btn', { type: 'button', on: { click: restart } }, 'Set up a new study'))
    );
  }

  // ---------------------------------------------------------------- system

  function handshakePanel() {
    const last = sessions.find((s) => s.game === 'handshake');
    return h(
      'section.panel',
      h('h2', 'Handshake', h('small', 'self-test')),
      h('p', 'Checks frame timing, response capture and logging on this device. Not a training module.'),
      last
        ? h('dl.kv', h('dt', 'Last run'), h('dd', fmtDate(last.startedAt)), h('dt', 'Median RT'), h('dd', fmtMs(last.summary.medianRt)), h('dt', 'Display'), h('dd', last.env.refreshHz ? last.env.refreshHz + ' Hz' : 'unknown'))
        : h('p.muted', 'Never run on this device.'),
      h('div.row', h('button.btn.primary', { type: 'button', on: { click: () => launch('handshake') } }, 'Run handshake'), h('a.btn', { href: 'games/handshake/index.html' }, 'Standalone'))
    );
  }

  function displayPanel() {
    const p = WW.prefs;
    const set = (k, v) => {
      p.set(k, v);
      WW.ui.applyDisplayPrefs();
    };
    const themeSel = h(
      'select',
      { on: { change: (e) => set('theme', e.target.value) } },
      ['auto', 'dark', 'light'].map((v) => h('option', { value: v, selected: p.get('theme', 'auto') === v }, v))
    );
    const check = (key, def, label) =>
      h('label.field', h('input', { type: 'checkbox', checked: p.get(key, def), on: { change: (e) => set(key, e.target.checked) } }), label);
    const vol = h('input', {
      type: 'range',
      min: '0',
      max: '1',
      step: '0.05',
      value: String(WW.audio.volume),
      'aria-label': 'Volume',
      on: { change: (e) => (WW.audio.setVolume(+e.target.value), WW.audio.sfx('ui')) },
    });
    return h(
      'section.panel',
      h('h2', 'Display & sound'),
      h('label.field', 'Theme', themeSel),
      check('scanlines', true, 'Scanlines'),
      check('reduceMotion', false, 'Reduce motion'),
      check('cvdAid', false, 'Colour-blind aid (letters or patterns on colour-coded pieces: Relay, Lockpick, Rule Forge)'),
      check('leftHandKeys', false, 'Left-handed keys (for a mouse in your left hand: key groups used by one hand move under the right hand; today that is Flashpoint’s direction keys, which become U I O / J L / M , .)'),
      check('spatialStroop', false, 'Colour-free Stroop (the check-up battery uses a Stroop with direction words instead of colours, logged as its own test; switching starts a new series with its own run-in)'),
      check('confidenceProbes', true, 'Confidence checks during training (KERNEL)'),
      h('label.field', 'Volume', vol),
      h('label.field', h('input', { type: 'checkbox', checked: WW.audio.muted, on: { change: (e) => WW.audio.setMuted(e.target.checked) } }), 'Mute'),
      h('p.label', 'N-back voices'),
      h(
        'div.voices',
        WW.audio.voiceNames.map((name, i) => h('button.btn', { type: 'button', on: { click: () => WW.audio.voice(i) } }, name))
      ),
      h('p.label', 'Feedback'),
      h(
        'div.row',
        ['correct', 'error', 'klaxon'].map((n) => h('button.btn', { type: 'button', on: { click: () => WW.audio.sfx(n) } }, n))
      )
    );
  }

  function dataPanel() {
    const stamp = new Date().toISOString().slice(0, 10);
    const fileIn = h('input', {
      type: 'file',
      accept: 'application/json,.json',
      hidden: true,
      on: {
        async change(e) {
          const f = e.target.files[0];
          e.target.value = '';
          if (!f) return;
          try {
            const res = await store.importAll(JSON.parse(await WW.ui.readFile(f)));
            toast(`Imported ${res.sessions} session(s), ${res.trials} trial(s); ${res.skipped} already present.` + (res.prefs ? ` ${res.prefs} setting(s) restored; reload to apply sound settings.` : ''));
            if (res.prefs) WW.ui.applyDisplayPrefs();
            refresh();
          } catch (err) {
            toast('Import failed: ' + err.message, 'bad');
          }
        },
      },
    });
    return h(
      'section.panel',
      h('h2', 'Data', h('small', store.persistent ? 'this browser' : 'memory only')),
      store.persistent ? h('p', 'Everything stays in this browser. Export to back up or to analyse.') : h('p', { style: { color: 'var(--amber)' } }, 'Browser storage is blocked here: sessions vanish when the page closes. Export before leaving.'),
      h(
        'div.row',
        h('button.btn', { type: 'button', on: { click: exportJSON } }, 'Export JSON'),
        h(
          'button.btn',
          {
            type: 'button',
            on: {
              click: async () => {
                const all = await store.exportAll();
                WW.ui.download(`wetware-trials-${stamp}.csv`, WW.exportFmt.toCSV(WW.exportFmt.trialRows(all.trials, all.sessions)), 'text/csv');
              },
            },
          },
          'Export CSV'
        ),
        h('button.btn', { type: 'button', on: { click: () => fileIn.click() } }, 'Import'),
        fileIn,
        h(
          'button.btn.danger',
          {
            type: 'button',
            on: {
              click: async () => {
                if (!sessions.length) return toast('Nothing to wipe.');
                const ok = await WW.ui.confirmDialog('Wipe all data?', `Deletes ${sessions.length} session(s) and their trials from this browser. This cannot be undone. Export first if you want a copy.`, 'Wipe');
                if (!ok) return;
                await store.clear();
                toast('All local data wiped.');
                refresh();
              },
            },
          },
          'Wipe…'
        )
      ),
      store.persistent && !demo && !fresh ? backupStatus() : null,
      autoBackupStatus(),
      h(
        'p.muted.small',
        !offline.supported
          ? 'Offline: open Wetware from a web server (python3 -m http.server) to use it offline or install it; opened as a file it still works, just not offline-installable.'
          : offline.ready
            ? 'Offline: ready. Every module, probe and skin is cached; it keeps working without a connection.'
            : 'Offline: caching for offline use…',
        offline.prompt
          ? h(
              'button.btn',
              {
                type: 'button',
                style: { marginLeft: '8px' },
                on: {
                  click: async () => {
                    const p = offline.prompt;
                    offline.prompt = null;
                    p.prompt();
                    await p.userChoice.catch(() => null);
                    render();
                  },
                },
              },
              'Install app'
            )
          : null
      )
    );
  }

  /** Data panel: whether the browser keeps the data, the last backup, and the reminder setting. */
  function backupStatus() {
    const last = WW.prefs.get('lastExport', null);
    const sel = h(
      'select',
      { 'aria-label': 'Backup reminder', on: { change: (e) => (WW.prefs.set('backupDays', +e.target.value), render()) } },
      WW.backup.REMIND_OPTIONS.map((d) => h('option', { value: String(d), selected: backupDays() === d }, d ? `after ${d} days` : 'off'))
    );
    const kept =
      persist === 'persisted'
        ? h('p.small', 'Storage: the browser has agreed to keep this data until you delete it.')
        : persist === 'not-persisted'
          ? h(
              'p.small',
              { style: { color: 'var(--amber)' } },
              'Storage: the browser may clear this data if the disk runs low or, in some browsers (Safari), after a few weeks without a visit. Installing the app or keeping regular backups protects it. ',
              h('button.btn', { type: 'button', on: { click: () => checkPersist(true) } }, 'Ask to keep it')
            )
          : null;
    return h(
      'div',
      kept,
      h('p.small', 'Last backup (JSON export or auto-backup): ', h('b', last ? fmtDate(last).slice(0, 10) : 'never'), '. Only JSON is a full backup; the CSV leaves out levels, check-ins, settings and the study.'),
      h('label.field', 'Backup reminder', sel)
    );
  }

  /** Data panel: the auto-backup folder. */
  function autoBackupStatus() {
    const btn = (label, click, primary) => h(primary ? 'button.btn.primary' : 'button.btn', { type: 'button', disabled: ab.busy, on: { click } }, label);
    const KEEP = WW.autoBackup.KEEP_FILES;
    const last = ab.last ? `Last written ${fmtDate(ab.last.at)} (${ab.last.name}, ${ab.last.sessions} sessions, ${Math.round(ab.last.bytes / 1024)} KB).` : 'Nothing written yet.';
    const body = {
      unsupported: [h('p.small.muted', demo || fresh ? 'Auto-backup to a folder: not in demo or fresh mode.' : 'Auto-backup to a folder needs Chrome, Edge or another Chromium browser. Here, use Export JSON and the reminder.')],
      off: [
        h('p.small', `Auto-backup to a folder: after each session, write the JSON export into a folder you choose, one file per day, the newest ${KEEP} kept. Pick a folder inside iCloud Drive, Dropbox or OneDrive for a copy off this computer.`),
        h('div.row', btn('Choose folder…', abChoose)),
      ],
      ok: [h('p.small', 'Auto-backup: on, to ', h('b', ab.dir ? ab.dir.name : ''), '. ', last), h('div.row', btn('Back up now', () => abRun(true)), btn('Change folder…', abChoose), btn('Turn off', abOff))],
      paused: [
        h('p.small', { style: { color: 'var(--amber)' } }, 'Auto-backup: paused. Chrome needs permission again to write to ', h('b', ab.dir ? ab.dir.name : ''), '. ', last),
        h('div.row', btn('Allow again', () => abRun(true), true), btn('Change folder…', abChoose), btn('Turn off', abOff)),
        h('p.muted.small', 'Chrome lets go of folder access after a while. When it asks, choose “Allow on every visit” if offered; installing Wetware as an app keeps access without asking.'),
      ],
      error: [h('p.small', { style: { color: 'var(--amber)' } }, 'Auto-backup failed: ', ab.error, ' ', last), h('div.row', btn('Try again', () => abRun(true), true), btn('Change folder…', abChoose), btn('Turn off', abOff))],
    }[ab.state];
    return h('div', ...body);
  }

  /** Ops: one line when the folder backup is paused or failing, with the one click that fixes it. */
  function autoBackupNotice() {
    if (ab.state !== 'paused' && ab.state !== 'error') return null;
    const n = ab.last ? sessions.filter((s) => (s.endedAt || s.startedAt) > ab.last.at).length : sessions.length;
    return h(
      'section.panel',
      h('h2', 'Auto-backup', h('small', ab.state)),
      h('p.small', ab.state === 'paused' ? `Chrome needs one click to keep writing to ${ab.dir ? ab.dir.name : 'your folder'}.` : `Writing to ${ab.dir ? ab.dir.name : 'your folder'} failed: ${ab.error}`, n ? ` ${n} session${n === 1 ? '' : 's'} since the last file.` : ''),
      h('div.row', h('button.btn.primary', { type: 'button', disabled: ab.busy, on: { click: () => abRun(true) } }, ab.state === 'paused' ? 'Allow again' : 'Try again')),
      ab.state === 'paused' ? h('p.muted.small', 'Choose “Allow on every visit” if Chrome offers it, so this stops coming back.') : null
    );
  }

  /** Ops: shown when sessions have gone un-backed-up longer than the reminder setting. */
  function backupPanel() {
    const due = backupDue();
    if (!due) return null;
    return h(
      'section.panel',
      h('h2', 'Backup', h('small', 'due')),
      h('p', `${due.count} session${due.count === 1 ? ' isn’t' : 's aren’t'} in any backup yet; the oldest is ${due.age} days old. Everything lives only in this browser, so a JSON export is your only copy.`),
      h(
        'div.row',
        h('button.btn.primary', { type: 'button', on: { click: exportJSON } }, 'Export JSON'),
        h('button.btn', { type: 'button', on: { click: () => (WW.prefs.set('backupSnooze', Date.now() + 3 * DAY), render()) } }, 'In 3 days')
      ),
      h('p.muted.small', 'Change or turn off this reminder in System → Data.')
    );
  }

  function logPanel() {
    const recent = sessions.slice(0, 12);
    return h(
      'section.panel',
      h('h2', 'Session log'),
      recent.length
        ? h(
            'ul.log',
            recent.map((s) => {
              const meta = C.module(s.game);
              const hl = headline(s.game, s.summary);
              const extra = hl ? ' · ' + hl : s.summary && s.summary.medianRt != null ? ' · ' + fmtMs(s.summary.medianRt) : '';
              const q = s.quality && s.quality.flagged ? h('span.chip.warn', { title: 'Left out of trends: ' + s.quality.reasons.join('; ') }, 'suspect') : null;
              return h('li', h('span', (meta ? meta.name : s.game) + extra, q ? ' ' : null, q), h('span', fmtDate(s.startedAt)));
            })
          )
        : h('p.muted', 'No sessions yet.')
    );
  }

  function system() {
    return h('div.grid', handshakePanel(), displayPanel(), rigPanel(), remindersPanel(), dataPanel(), logPanel());
  }

  /** Calendar file: daily contract reminder + upcoming dead drops and retests (core/reminders.js). */
  function remindersPanel() {
    const time = h('input', { type: 'time', value: WW.prefs.get('reminderTime', '19:00'), 'aria-label': 'Daily reminder time', on: { change: (e) => WW.prefs.set('reminderTime', e.target.value) } });
    const make = async () => {
      const events = [];
      const sh = await store.getState('safehouse.progress');
      for (const d of (sh && sh.drops) || []) if (Number.isFinite(d.nextDue) && d.nextDue > Date.now()) events.push({ uid: 'drop-' + d.id + '-' + d.stage, at: d.nextDue, title: 'Wetware: Safehouse dead drop due', description: 'A list you stashed is due for recall today. Run Safehouse (it comes first in the contract).' });
      const wt = await store.getState('wiretap.progress');
      for (const d of (wt && wt.drops) || []) if (Number.isFinite(d.nextDue) && d.nextDue > Date.now()) events.push({ uid: 'wt-drop-' + d.id + '-' + d.stage, at: d.nextDue, title: 'Wetware: Wiretap dead drop due', description: 'A briefing you stashed is due for recall today. Run Wiretap (it comes first in the contract).' });
      const is = await store.getState('id-spoof.progress');
      for (const d of (is && is.drops) || []) if (Number.isFinite(d.nextDue) && d.nextDue > Date.now()) events.push({ uid: 'is-drop-' + d.id + '-' + d.stage, at: d.nextDue, title: 'Wetware: ID Spoof dead drop due', description: 'Marks you met are due for recall today. Run ID Spoof (it comes first in the contract).' });
      const now = Date.now();
      if (studySchedule(now))
        for (const p of WW.study.probePoints(study)) if (p > now && p <= WW.study.endAt(study)) events.push({ uid: 'study-probes-' + p, at: p - 2 * DAY, title: 'Wetware: study probes due', description: `All eight diagnostic probes, any time from today to ${fmtDate(p).slice(0, 10)} (ABCABC study).` });
      for (const x of dxStatus()) if (x.last && !(x.count >= C.RUNIN && studySchedule(now))) {
        const at = nextDue(x.last, x.count);
        const runIn = x.count < C.RUNIN;
        if (at > Date.now()) events.push({ uid: 'retest-' + x.d.id + '-' + x.last.startedAt, at, title: `Wetware: ${x.d.name} ${runIn ? 'run-in' : 'retest'} due`, description: runIn ? `Diagnostic run-in, run ${x.count + 1} of ${C.RUNIN} (untrained transfer probe).` : 'Monthly diagnostic retest (untrained transfer probe).' });
      }
      const ics = WW.reminders.calendar({ time: time.value || null, events });
      WW.ui.download('wetware-reminders.ics', ics, 'text/calendar');
      toast(`Calendar file saved: daily reminder${events.length ? ` + ${events.length} upcoming event(s)` : ''}. Open it to add to your calendar.`);
    };
    return h(
      'section.panel',
      h('h2', 'Reminders', h('small', 'calendar file')),
      h('p.small', 'Spacing only works if you come back. Add a daily reminder, plus your upcoming dead drops and retests, to your own calendar.'),
      h('label.field', 'Daily at', time),
      h('div.row', h('button.btn', { type: 'button', on: { click: make } }, 'Download .ics')),
      h('p.muted.small', 'Re-download after new dead drops or retests to pick them up. Nothing is sent anywhere.')
    );
  }

  function trainingDays() {
    return new Set(sessions.filter((s) => C.MODULES.some((m) => m.id === s.game)).map((s) => WW.contract.dateKey(s.startedAt))).size;
  }

  function gauntletPanel() {
    const wk = WW.logic.gauntlet.weekKey(Date.now());
    const runs = sessions.filter((s) => s.game === 'gauntlet');
    const best = (xs) => (xs.length ? Math.max(...xs.map((s) => s.summary.passed)) : null);
    const thisWeek = best(runs.filter((s) => s.summary && s.summary.week === wk));
    const ever = best(runs);
    return h(
      'section.panel',
      h('h2', 'Weekly Gauntlet', h('small', wk)),
      h('p', 'Rook’s elimination run: escalating rounds from four modules, three strikes and you’re out. Just for bragging rights; it never changes your training levels.'),
      h('dl.kv', h('dt', 'Best this week'), h('dd', thisWeek == null ? 'no run yet' : `${thisWeek} rounds`), h('dt', 'Best ever'), h('dd', ever == null ? '—' : `${ever} rounds`)),
      h('button.btn.primary', { type: 'button', on: { click: () => launch('gauntlet') } }, 'Run the Gauntlet')
    );
  }

  function interceptsPanel() {
    const days = trainingDays();
    const got = WW.intercepts.unlocked(days);
    const next = WW.intercepts.next(days);
    const latest = got[got.length - 1];
    return h(
      'section.panel',
      h('h2', 'Intercepts', h('small', `${got.length} / ${WW.intercepts.length}`)),
      latest ? h('div.comms', h('div.from', latest.title.toUpperCase()), h('p', latest.text)) : h('p.muted', 'Nothing yet. Intercepts arrive with days of practice, not with scores.'),
      got.length > 1 ? h('details', h('summary.muted.small', 'Earlier intercepts'), got.slice(0, -1).reverse().map((x) => h('p.small', h('b', x.title + ': '), x.text))) : null,
      h('p.muted.small', next ? `Next intercept after ${next.days} day(s) of practice (you have ${days}).` : 'All intercepts received.')
    );
  }

  function footer() {
    return h(
      'footer.section.muted',
      { style: { fontSize: '12px' } },
      h('p', 'Evidence grades (A–X) and the research behind each module are in docs/PLAN.md. Nothing here claims to raise general intelligence.'),
      h('p', 'Made with AI assistance (Anthropic’s Claude) under human direction.')
    );
  }

  // ----------------------------------------------------------------- stash

  function stash() {
    const st = rigStatus();
    const free = unlockAll();
    const days = trainingDays();
    const cur = WW.skins.current();
    const built = new Set(WW.skins.list().map((x) => x.id));
    const buyBtn = (item, ready) =>
      !ready
        ? h('span.lock', 'not built yet')
        : h('button.buy', { type: 'button', disabled: st.balance < item.price, title: st.balance < item.price ? `Short by ${fmtCr(item.price - st.balance)}` : null, on: { click: () => buy(item) } }, fmtCr(item.price));
    const row = (name, sub, right, cls) => h('li' + (cls || ''), h('span', name, h('small', sub)), right);

    const skinRows = WW.rig.SKINS.map((x) => {
      const owned = st.owns(x.id);
      const sub =
        x.id === 'stock'
          ? 'Standard issue'
          : free
            ? 'Unlocked'
            : st.gifted.has(x.id)
              ? `From the crew, day ${st.gifted.get(x.id)}`
              : st.bought.has(x.id)
                ? `Bought from Vex, day ${st.bought.get(x.id)}`
                : `Crew gift on day ${st.future.get(x.id)}, or buy it now`;
      const right =
        x.id === cur
          ? h('span.on', 'equipped')
          : owned
            ? built.has(x.id)
              ? h('button.equip', { type: 'button', on: { click: () => equip(x.id) } }, 'equip')
              : h('span.lock', 'not built yet')
            : buyBtn(x, built.has(x.id));
      return row(x.name, sub, right);
    });

    // An item can be sold once something uses it: skin mods, trinkets, sticker sheets.
    const ready = new Set(WW.skins.list().flatMap((d) => (d.mods || []).map((m) => m[2]).filter(Boolean)).concat(TOGGLES, Object.keys(SHEETS).filter(Boolean)));
    const l = look();
    const ownedControl = (id) => {
      if (SHEETS[id])
        return l.sheet === id
          ? h('button.equip', { type: 'button', title: 'Back to the stickers the skin came with', on: { click: () => setSheet('') } }, 'in the slots')
          : h('button.equip', { type: 'button', on: { click: () => setSheet(id) } }, 'use');
      if (TOGGLES.includes(id)) {
        const off = l.off.includes(id);
        return h('button.equip', { type: 'button', 'aria-pressed': String(!off), on: { click: () => setOff(id, !off) } }, off ? 'off' : 'on');
      }
      return h('span.on', 'owned');
    };
    const stallRows = WW.rig.STALL.map((x) => {
      if (!st.inStock(x)) return row(x.name, x.sub, h('span.lock', `turns up day ${x.day}`), '.later');
      if (!st.ownsItem(x.id)) return row(x.name, x.sub, buyBtn(x, ready.has(x.id)));
      return row(x.name, x.sub, ownedControl(x.id));
    });

    const curDef = WW.skins.list().find((d) => d.id === cur);
    const curMod = WW.prefs.get('skinMod:' + cur, '');
    const modRow =
      curDef && curDef.mods
        ? h(
            'div.row.mod-pick',
            h('span.muted.small', curDef.name + ':'),
            curDef.mods.map(([v, label, need]) => {
              const locked = need && !st.ownsItem(need);
              return h(
                'button.btn',
                {
                  type: 'button',
                  'aria-pressed': String(curMod === v),
                  disabled: locked,
                  title: locked ? `Needs ${WW.rig.STALL.find((x) => x.id === need).name} from Vex` : null,
                  on: {
                    click: () => {
                      WW.prefs.set('skinMod:' + cur, v);
                      WW.ui.applyDisplayPrefs();
                      render();
                    },
                  },
                },
                label
              );
            })
          )
        : null;

    // Rain style, whenever it's raining on this skin (Street Glass's mod or Vex's trinket). Spire stays dry.
    const wet = (cur === 'glass' && curMod === 'rain') || lookOn('rain');
    const rainStyle = WW.prefs.get('rainStyle', 'depth');
    const rainRow =
      wet && cur !== 'spire' && WW.rain
        ? h(
            'div.row.mod-pick',
            h('span.muted.small', 'Rain:'),
            WW.rain.STYLES.map(([v, label]) =>
              h(
                'button.btn',
                {
                  type: 'button',
                  'aria-pressed': String(rainStyle === v),
                  title: v === 'awning' ? 'Never falls over a panel: splashes on top, drips off the bottom' : 'Falls behind everything, in depth',
                  on: {
                    click: () => {
                      WW.prefs.set('rainStyle', v);
                      WW.ui.applyDisplayPrefs();
                      render();
                    },
                  },
                },
                label
              )
            )
          )
        : null;

    const today = WW.contract.dateKey(Date.now());
    const td = st.earned.days[today] || { raw: 0, paid: 0, items: [] };
    const E = WW.rig.EARN;
    const credsPanel = free
      ? null
      : h(
          'section.panel',
          h('h2', 'Creds', h('small', 'for showing up, not for scores')),
          h(
            'ul.items',
            [
              ['A logged training session', `${E.session}¢`],
              ['Finishing today’s contract', `+${E.contract}¢`],
              ['A dead drop recalled on its due day, however much you remember', `+${E.drop}¢`],
              ['A Weekly Gauntlet run, however far you get', `${E.gauntlet}¢`],
              ['Daily cap', `${E.cap}¢`],
            ].map(([a, b]) => h('li', h('span', a), h('span.price', b)))
          ),
          h('div.today', h('span', 'Today'), h('div.meter', { role: 'img', 'aria-label': `${td.paid} of ${E.cap} creds today` }, h('i', { style: { width: (td.paid / E.cap) * 100 + '%' } })), h('b', `${td.paid} / ${E.cap}¢`)),
          td.items.length ? h('ul.ledger', td.items.map((x) => h('li', h('span', x.label), h('b', `+${x.amount}¢`)))) : h('p.muted.small', 'Nothing logged today yet.'),
          h('p.muted.small', 'Past the cap, sessions still count everywhere else; they just stop paying. Aborted or discarded sessions pay nothing. Diagnostics never pay.')
        );

    const pending = st.futureRook.slice();
    const rookRows = WW.rig.ROOK.map((x, i) => {
      const given = st.rook[i];
      if (given || free) return row(x.name, h('span', x.sub, given ? ` · given day ${given.day}` : ''), x.id === 'rook-photo' ? h('span.on', 'in the Stash') : ownedControl(x.id), '.rook-given');
      const due = pending[i - st.rook.length];
      return row(x.name, x.sub, h('span.lock', due ? `due day ${due}` : 'not yet'), '.later');
    });

    return h(
      'div.stash',
      h(
        'section.panel',
        h('h2', 'Skins', h('small', 'gifts or Vex')),
        h('ul.items', skinRows),
        modRow,
        rainRow,
        h('p.muted.small', `The crew hands over a skin on days ${WW.rig.GIFT_DAYS.join(', ')} (days on the job, never scores): always the next one you don’t own. Buy one early and the gifts move down the list. You’re on day ${days}.`)
      ),
      h(
        'section.panel',
        h('h2', 'Vex’s stall', free ? null : h('small', fmtCr(st.balance))),
        h('ul.items', stallRows),
        h('p.muted.small', 'Fixed stock: new things turn up on story days and nothing ever leaves. Cosmetic only. Vex doesn’t sell difficulty, timing, hints, skips, story, streak protection, random packs or anything for real money.')
      ),
      credsPanel,
      h('section.panel', h('h2', 'From Rook', h('small', 'never sold')), h('ul.items', rookRows), h('p.muted.small', 'Only when a gift day comes and you already own every skin. One per gift day, in this order.')),
      st.ownsItem('rook-photo') ? crewPhoto() : null
    );
  }

  function crewPhoto() {
    const fig = h('figure.crew-photo');
    // Five silhouettes, one scratched out. Seeded so it never changes.
    const r = WW.rng.create('crew-photo');
    let people = '';
    for (let i = 0; i < 5; i++) {
      const x = 22 + i * 34 + r.int(-4, 4);
      const y = 40 + r.int(-4, 6);
      people += `<circle cx="${x}" cy="${y}" r="9" fill="#2b2620"/><path d="M${x - 15} 110 Q${x - 14} ${y + 14} ${x} ${y + 12} Q${x + 14} ${y + 14} ${x + 15} 110 Z" fill="#2b2620"/>`;
    }
    people += '<path d="M118 30 l20 22 M138 30 l-20 22" stroke="#7a1f1f" stroke-width="2.5"/>';
    fig.innerHTML = `<svg viewBox="0 0 190 110" role="img" aria-label="Faded photo of five people; one face is scratched out"><rect width="190" height="110" fill="#b9a98a"/><rect width="190" height="110" fill="url(#sepia)" opacity=".4"/><defs><radialGradient id="sepia"><stop offset=".4" stop-color="#fff0" /><stop offset="1" stop-color="#3a2a12"/></radialGradient></defs>${people}</svg>`;
    fig.append(h('figcaption', 'The old crew. Pinned where Rook can’t see it.'));
    return h('section.panel', h('h2', 'Pinned up', h('small', 'from Rook')), fig);
  }

  function rigPanel() {
    const p = WW.prefs;
    const check = (key, def, label, note) =>
      h(
        'label.field',
        h('input', {
          type: 'checkbox',
          checked: p.get(key, def),
          on: {
            change: (e) => {
              p.set(key, e.target.checked);
              WW.ui.applyDisplayPrefs();
              if (key === 'rigCustom' && !e.target.checked && tab === 'stash') tab = 'system';
              render();
            },
          },
        }),
        h('span', label, note ? h('span.muted', ' ' + note) : null)
      );
    const callsign = h('input', {
      type: 'text',
      maxlength: '16',
      autocomplete: 'off',
      spellcheck: false,
      value: rigState.callsign || '',
      placeholder: 'e.g. NIGHTJAR',
      'aria-label': 'Callsign',
      on: {
        change: async (e) => {
          rigState.callsign = e.target.value.trim().slice(0, 16);
          await saveRig();
          toast('Callsign saved.');
          render();
        },
      },
    });
    return h(
      'section.panel',
      h('h2', 'Rig', h('small', 'customisation')),
      check('rigCustom', true, 'Rig customisation', '(creds, the Stash and skins)'),
      rigOn() ? check('unlockAll', false, 'Unlock everything', '(skip gifts and creds)') : null,
      rigOn() ? check('flavour', false, 'Skins restyle untimed games', '(timed games never change)') : null,
      rigOn() ? h('label.field', 'Callsign', callsign) : null,
      h('p.muted.small', 'All of this is cosmetic. Nothing here changes difficulty, timing, scores or what gets logged.')
    );
  }

  // ------------------------------------------------------------------ tabs

  // Only the open tab's pane is built. ARIA tabs pattern: arrows, Home, End.
  const TABS = [
    { id: 'ops', label: 'Ops', fk: 'F1', body: () => h('div.grid', autoBackupNotice(), backupPanel(), comms(), contract(), checkinPanel(), diagnostics(), studyPanel()) },
    { id: 'rig', label: 'Rig', fk: 'F2', body: rig },
    { id: 'books', label: 'Off the books', fk: 'F3', body: () => h('div.grid', gauntletPanel(), interceptsPanel()) },
    { id: 'stash', label: 'Stash', fk: 'F4', body: stash, show: rigOn },
    { id: 'system', label: 'System', fk: 'F5', body: system },
  ];
  const visibleTabs = () => TABS.filter((t) => !t.show || t.show());
  const tabIds = () => visibleTabs().map((t) => t.id);
  const fromHash = () => {
    const id = root.location.hash.slice(1);
    return tabIds().includes(id) ? id : null;
  };
  let tab = fromHash() || (tabIds().includes(WW.prefs.get('hubTab', 'ops')) ? WW.prefs.get('hubTab', 'ops') : 'ops');

  function setTab(id, focus) {
    if (!tabIds().includes(id)) return;
    tab = id;
    WW.prefs.set('hubTab', id);
    if (root.location.hash.slice(1) !== id) root.history.replaceState(null, '', '#' + id);
    render();
    if (focus) root.document.getElementById('tab-' + id).focus();
  }
  // Phosphor: function keys switch tabs, like the old terminal it came from.
  root.addEventListener('keydown', (e) => {
    if (root.document.documentElement.getAttribute('data-skin') !== 'phosphor') return;
    if (root.document.documentElement.classList.contains('ww-running')) return;
    const t = visibleTabs().find((x) => x.fk === e.key);
    if (!t) return;
    e.preventDefault();
    setTab(t.id, true);
  });
  root.addEventListener('hashchange', () => {
    const id = fromHash();
    if (id && id !== tab) setTab(id);
  });

  function tabBar() {
    const ids = tabIds();
    const onKey = (e) => {
      const i = ids.indexOf(tab);
      const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: ids.length - 1 }[e.key];
      if (to === undefined) return;
      e.preventDefault();
      setTab(ids[(to + ids.length) % ids.length], true);
    };
    return h(
      'nav.tabs',
      { role: 'tablist', 'aria-label': 'Hub', on: { keydown: onKey } },
      visibleTabs().map((t) =>
        h(
          'button.tab',
          {
            type: 'button',
            role: 'tab',
            id: 'tab-' + t.id,
            'aria-controls': 'pane-' + t.id,
            'aria-selected': String(t.id === tab),
            tabindex: t.id === tab ? '0' : '-1',
            'data-tab': t.id,
            on: { click: () => setTab(t.id) },
          },
          h('span.fk', t.fk),
          t.label
        )
      ),
      h('span.sticker.s2', { 'aria-hidden': 'true' }, SHEETS[look().sheet || ''][1])
    );
  }

  function render() {
    // Re-renders replace the DOM; keep keyboard focus on the same control if possible.
    const active = root.document.activeElement;
    const keepTabFocus = active && active.classList && active.classList.contains('tab');
    const scroll = root.scrollY;
    syncLook();
    clear(app);
    if (!tabIds().includes(tab)) tab = 'ops';
    const t = TABS.find((x) => x.id === tab);
    app.append(mast(), tabBar(), h('div.pane', { role: 'tabpanel', id: 'pane-' + t.id, 'aria-labelledby': 'tab-' + t.id, tabindex: '0' }, t.body()), footer());
    if (keepTabFocus) root.document.getElementById('tab-' + tab).focus({ preventScroll: true });
    root.scrollTo(0, scroll);
  }

  await refresh();
  // After the first render, so their re-renders never run before the tabs exist.
  checkPersist(false);
  abInit().catch(() => {});
})(globalThis);
