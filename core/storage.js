/* Wetware core: storage, preferences and export.
 *
 * Store layout (IndexedDB "wetware", or an in-memory fallback):
 *   sessions  keyPath 'id'      one record per played session
 *   trials    autoIncrement     trial rows, each with sessionId (indexed)
 *   state     keyPath 'key'     durable per-game state (staircases, schedules)
 *
 * Preferences (volume, theme...) live in localStorage under "ww." keys.
 * Every browser-storage access is wrapped: private windows and blocked
 * site data degrade to memory instead of throwing.
 */
(function (root) {
  'use strict';
  const WW = (root.WW = root.WW || {});

  const DB_NAME = 'wetware';
  const DB_VERSION = 1;
  const EXPORT_FORMAT = 'wetware-export';
  const EXPORT_VERSION = 2; // 2: adds `prefs` (the settings that travel with a backup); 1 still imports

  const clone = (x) => JSON.parse(JSON.stringify(x));

  // ---------------------------------------------------------------- backends

  function memoryBackend() {
    const sessions = new Map();
    const trials = [];
    const state = new Map();
    let nextTrialKey = 1;
    return {
      persistent: false,
      async putSession(s) {
        sessions.set(s.id, clone(s));
      },
      async addTrials(rows) {
        for (const r of rows) trials.push(Object.assign(clone(r), { _k: nextTrialKey++ }));
      },
      async putBatch(ss, rows) {
        // Copy everything first, so a bad record leaves the store untouched (as one IDB transaction would).
        const cs = ss.map(clone);
        const cr = rows.map(clone);
        for (const x of cs) sessions.set(x.id, x);
        for (const r of cr) trials.push(Object.assign(r, { _k: nextTrialKey++ }));
      },
      async getSessions() {
        return [...sessions.values()].map(clone);
      },
      async getTrials(sessionId) {
        return trials.filter((t) => sessionId == null || t.sessionId === sessionId).map(stripKey);
      },
      async getState(key) {
        return state.has(key) ? clone(state.get(key)) : undefined;
      },
      async setState(key, value) {
        state.set(key, clone(value));
      },
      async allState() {
        return [...state.entries()].map(([key, value]) => ({ key, value: clone(value) }));
      },
      async clear() {
        sessions.clear();
        trials.length = 0;
        state.clear();
      },
    };
  }

  function stripKey(t) {
    const { _k, ...rest } = t;
    return clone(rest);
  }

  function req(r) {
    return new Promise((resolve, reject) => {
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }

  function txDone(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('transaction aborted'));
    });
  }

  async function idbBackend() {
    const open = root.indexedDB.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('trials')) {
        const t = db.createObjectStore('trials', { autoIncrement: true });
        t.createIndex('sessionId', 'sessionId', { unique: false });
      }
      if (!db.objectStoreNames.contains('state')) db.createObjectStore('state', { keyPath: 'key' });
    };
    const db = await req(open);

    const store = (name, mode) => db.transaction(name, mode).objectStore(name);

    return {
      persistent: true,
      async putSession(s) {
        const tx = db.transaction('sessions', 'readwrite');
        tx.objectStore('sessions').put(clone(s));
        await txDone(tx);
      },
      async addTrials(rows) {
        const tx = db.transaction('trials', 'readwrite');
        const os = tx.objectStore('trials');
        for (const r of rows) os.add(clone(r));
        await txDone(tx);
      },
      /** Sessions and their trials in one transaction: all of it is saved, or none. */
      async putBatch(ss, rows) {
        const cs = ss.map(clone); // copy first: a bad record fails before anything is queued
        const cr = rows.map(clone);
        const tx = db.transaction(['sessions', 'trials'], 'readwrite');
        const done = txDone(tx);
        try {
          const so = tx.objectStore('sessions');
          const to = tx.objectStore('trials');
          for (const x of cs) so.put(x);
          for (const r of cr) to.add(r);
        } catch (e) {
          tx.abort(); // a synchronous throw doesn't abort a transaction by itself
          done.catch(() => {});
          throw e;
        }
        await done;
      },
      async getSessions() {
        return req(store('sessions', 'readonly').getAll());
      },
      async getTrials(sessionId) {
        const os = store('trials', 'readonly');
        return sessionId == null ? req(os.getAll()) : req(os.index('sessionId').getAll(sessionId));
      },
      async getState(key) {
        const rec = await req(store('state', 'readonly').get(key));
        return rec ? rec.value : undefined;
      },
      async setState(key, value) {
        const tx = db.transaction('state', 'readwrite');
        tx.objectStore('state').put({ key, value: clone(value) });
        await txDone(tx);
      },
      async allState() {
        return req(store('state', 'readonly').getAll());
      },
      async clear() {
        const tx = db.transaction(['sessions', 'trials', 'state'], 'readwrite');
        for (const n of ['sessions', 'trials', 'state']) tx.objectStore(n).clear();
        await txDone(tx);
      },
    };
  }

  // ------------------------------------------------------------------- store

  function createStore(backend) {
    return {
      get persistent() {
        return backend.persistent;
      },
      /** Save a finished session and its trial rows. */
      async saveSession(session, trials) {
        const rows = (trials || []).map((t) => Object.assign({}, t, { sessionId: session.id, game: session.game }));
        await backend.putBatch([session], rows);
      },
      /** Sessions, newest first, optionally for one game. */
      async listSessions(filter) {
        const all = await backend.getSessions();
        const game = filter && filter.game;
        return all.filter((s) => !game || s.game === game).sort((a, b) => b.startedAt - a.startedAt);
      },
      trialsFor(sessionId) {
        return backend.getTrials(sessionId);
      },
      getState(key) {
        return backend.getState(key);
      },
      setState(key, value) {
        return backend.setState(key, value);
      },
      async exportAll() {
        const [sessions, trials, state] = await Promise.all([backend.getSessions(), backend.getTrials(null), backend.allState()]);
        return {
          format: EXPORT_FORMAT,
          version: EXPORT_VERSION,
          exportedAt: new Date().toISOString(),
          sessions: sessions.sort((a, b) => a.startedAt - b.startedAt),
          trials,
          state,
          prefs: portablePrefs(),
        };
      },
      /**
       * Merge an export into this store. Sessions already present (same id)
       * are skipped together with their trials, so importing twice is safe.
       * State keys present in the import overwrite local ones, except the
       * Stash ('rig') and the daily check-ins ('checkins'), which merge. Settings in the
       * export (version 2) overwrite this browser's.
       */
      async importAll(data) {
        if (!data || data.format !== EXPORT_FORMAT) throw new Error('not a Wetware export file');
        if (data.version > EXPORT_VERSION) throw new Error('export is from a newer version (' + data.version + ')');
        const have = new Set((await backend.getSessions()).map((s) => s.id));
        const fresh = (data.sessions || []).filter((s) => s && s.id && !have.has(s.id));
        const ids = new Set(fresh.map((s) => s.id));
        const rows = (data.trials || []).filter((t) => ids.has(t.sessionId));
        if (fresh.length) await backend.putBatch(fresh, rows);
        for (const rec of data.state || []) {
          // The Stash merges (purchases from both devices survive); other state keys overwrite.
          const merge = (rec.key === 'rig' && WW.rig && WW.rig.mergeState) || (rec.key === 'checkins' && WW.context && WW.context.merge);
          await backend.setState(rec.key, merge ? merge(await backend.getState(rec.key), rec.value) : rec.value);
        }
        const prefs = applyPortablePrefs(data.prefs);
        return { sessions: fresh.length, trials: rows.length, skipped: (data.sessions || []).length - fresh.length, prefs };
      },
      clear() {
        return backend.clear();
      },
    };
  }

  /** Open the persistent store, falling back to memory if IndexedDB fails. */
  async function open() {
    if (root.indexedDB) {
      try {
        return createStore(await idbBackend());
      } catch (e) {
        if (root.console) console.warn('[wetware] IndexedDB unavailable, using memory store:', e);
      }
    }
    return createStore(memoryBackend());
  }

  // ------------------------------------------------------------------- prefs

  const memPrefs = new Map();
  const PREFIX = 'ww.';
  const prefs = {
    get(key, fallback) {
      try {
        const raw = root.localStorage.getItem(PREFIX + key);
        if (raw !== null) return JSON.parse(raw);
      } catch (_) {
        /* blocked storage or corrupt value: fall through to memory */
      }
      return memPrefs.has(key) ? memPrefs.get(key) : fallback;
    },
    remove(key) {
      memPrefs.delete(key);
      try {
        root.localStorage.removeItem(PREFIX + key);
      } catch (_) {
        /* memory only */
      }
    },
    set(key, value) {
      memPrefs.set(key, value);
      try {
        root.localStorage.setItem(PREFIX + key, JSON.stringify(value));
      } catch (_) {
        /* memory only */
      }
    },
  };

  /*
   * Settings that travel with a backup: display, keys, the battery variant (it decides which
   * Stroop series the check-ups add to), sound, the Rig's look, reminders. Left out, because
   * they belong to one device or one day: hubTab, contract, checkinSkip, giftSeen, lastExport,
   * backupSnooze.
   */
  const PORTABLE = ['theme', 'scanlines', 'reduceMotion', 'cvdAid', 'leftHandKeys', 'spatialStroop', 'confidenceProbes', 'volume', 'muted', 'flavour', 'rainStyle', 'reminderTime', 'rigCustom', 'rigLook', 'skin', 'unlockAll', 'wiretapText', 'backupDays'];
  const SKIN_MOD = /^skinMod:[a-z0-9-]+$/;
  function portablePrefs() {
    const none = {};
    const keys = PORTABLE.concat(((WW.skins && WW.skins.list && WW.skins.list()) || []).map((d) => 'skinMod:' + d.id));
    const out = {};
    for (const k of keys) {
      const v = WW.prefs.get(k, none); // through WW.prefs, so ?demo and ?fresh export their own
      if (v !== none) out[k] = v;
    }
    return out;
  }
  function applyPortablePrefs(obj) {
    let n = 0;
    for (const [k, v] of Object.entries(obj && typeof obj === 'object' ? obj : {})) {
      if (!PORTABLE.includes(k) && !SKIN_MOD.test(k)) continue;
      WW.prefs.set(k, v);
      n++;
    }
    return n;
  }

  // ------------------------------------------------------------------ export

  const TRIAL_COLUMNS = ['game', 'session_id', 'ts', 'trial', 'condition', 'stimulus', 'response', 'correct', 'rt_ms', 'level', 'confidence', 'sleep_h', 'mood', 'stress', 'caffeine'];

  function csvCell(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
    if (typeof v === 'boolean') return v ? '1' : '0';
    let s = typeof v === 'string' ? v : JSON.stringify(v);
    // Spreadsheet formula injection guard for string cells.
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function toCSV(rows, columns) {
    const cols = columns || TRIAL_COLUMNS;
    const lines = [cols.join(',')];
    for (const r of rows) lines.push(cols.map((c) => csvCell(r[c])).join(','));
    return lines.join('\r\n') + '\r\n';
  }

  /** Flatten stored trials to the documented CSV columns (sessions: to join the day's check-in). */
  function trialRows(trials, sessions) {
    const ctxOf = new Map((sessions || []).map((s) => [s.id, s.context || {}]));
    return trials.map((t) => ({
      game: t.game,
      session_id: t.sessionId,
      ts: t.ts != null ? new Date(t.ts).toISOString() : null,
      trial: t.trial,
      condition: t.condition,
      stimulus: t.stimulus,
      response: t.response,
      correct: t.correct,
      rt_ms: t.rt != null ? Math.round(t.rt * 10) / 10 : null,
      level: t.level,
      confidence: t.confidence,
      sleep_h: (ctxOf.get(t.sessionId) || {}).sleep,
      mood: (ctxOf.get(t.sessionId) || {}).mood,
      stress: (ctxOf.get(t.sessionId) || {}).stress,
      caffeine: (ctxOf.get(t.sessionId) || {}).caffeine,
    }));
  }

  // ------------------------------------------------------------------ backup

  /*
   * There is no sync: the browser's copy is the only copy. Two guards:
   *  - ask the browser to keep the data permanently (navigator.storage.persist), since
   *    browsers may otherwise clear a site's storage under disk pressure or, in Safari,
   *    after weeks without a visit;
   *  - remind the player to export when sessions have gone un-backed-up for a while.
   * Only the JSON export counts as a backup (the CSV leaves out state and check-ins).
   */
  const DAY_MS = 86400e3;
  const REMIND_OPTIONS = [0, 7, 14, 30]; // days; 0 = off
  const REMIND_DEFAULT = 14;

  /**
   * Whether to show the export reminder. sessions: saved sessions; lastExport: ms or null;
   * days: the setting (0 = off); snoozeUntil: ms or null. Returns null, or the sessions not
   * in any export and how old the oldest of them is, in whole days.
   */
  function backupDue({ sessions, lastExport, days, snoozeUntil, now }) {
    if (!days || !sessions || !sessions.length) return null;
    if (snoozeUntil && now < snoozeUntil) return null;
    const since = lastExport || 0;
    const fresh = sessions.filter((s) => (s.endedAt || s.startedAt) > since);
    if (!fresh.length) return null;
    const oldest = Math.min(...fresh.map((s) => s.endedAt || s.startedAt));
    const age = Math.floor((now - oldest) / DAY_MS);
    return age >= days ? { count: fresh.length, age, never: !lastExport } : null;
  }

  /** 'persisted' | 'not-persisted' | 'unsupported'. */
  async function persistStatus(nav) {
    const s = nav && nav.storage;
    if (!s || typeof s.persisted !== 'function') return 'unsupported';
    try {
      return (await s.persisted()) ? 'persisted' : 'not-persisted';
    } catch (_) {
      return 'unsupported';
    }
  }

  /** Ask the browser to keep this site's data; resolves to the new status. */
  async function requestPersist(nav) {
    const s = nav && nav.storage;
    if (!s || typeof s.persist !== 'function') return 'unsupported';
    try {
      return (await s.persist()) ? 'persisted' : 'not-persisted';
    } catch (_) {
      return 'unsupported';
    }
  }

  // ------------------------------------------------------- auto-backup folder

  /*
   * Optional: after each saved session, write the JSON export into a folder the player chose
   * (File System Access API: Chrome, Edge and other Chromium browsers). A folder inside
   * iCloud Drive, Dropbox or OneDrive gives an off-device copy without any sync server.
   *  - One file per local day, wetware-backup-YYYY-MM-DD.json, overwritten during that day; the
   *    newest KEEP_FILES days are kept, so a wipe or a bad day never replaces every copy.
   *  - createWritable() writes to a temporary file and swaps it in on close(): an interrupted
   *    write leaves the previous file intact.
   *  - Chrome lets go of folder access after a while (tab in the background, browser restart).
   *    Nothing then blocks a session: the backup pauses and the hub offers a one-click
   *    "Allow again" (requestPermission needs a click). From the second grant Chrome offers
   *    "Allow on every visit"; an installed app keeps access without asking.
   *  - The folder handle lives in a separate database ('wetware-device'), never in exports.
   */
  const FILE_RE = /^wetware-backup-(\d{4})-(\d{2})-(\d{2})\.json$/;
  const KEEP_FILES = 14;
  const pad2 = (n) => String(n).padStart(2, '0');
  function backupFileName(now) {
    const d = new Date(now);
    return `wetware-backup-${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}.json`;
  }
  /** Which of these names to delete so that only the newest `keep` backup files remain. */
  function pruneNames(names, keep) {
    const ours = names.filter((n) => FILE_RE.test(n)).sort();
    return ours.slice(0, Math.max(0, ours.length - keep));
  }

  /** 'granted' | 'prompt' | 'denied'. ask: may show Chrome's prompt (only from a click). */
  async function folderPermission(dir, ask) {
    const o = { mode: 'readwrite' };
    try {
      if (typeof dir.queryPermission !== 'function') return 'granted';
      let p = await dir.queryPermission(o);
      if (p !== 'granted' && ask && typeof dir.requestPermission === 'function') p = await dir.requestPermission(o);
      return p;
    } catch (_) {
      return 'denied';
    }
  }

  /** Write today's file into dir, then prune old ones. Returns { name, bytes, removed }. */
  async function writeBackupFile(dir, text, now, keep) {
    const name = backupFileName(now);
    const fh = await dir.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    try {
      await w.write(text);
      await w.close();
    } catch (e) {
      try {
        await w.abort();
      } catch (_) {
        /* already closed */
      }
      throw e;
    }
    const names = [];
    for await (const k of dir.keys()) names.push(k);
    const removed = pruneNames(names, keep == null ? KEEP_FILES : keep);
    for (const n of removed) await dir.removeEntry(n);
    return { name, bytes: text.length, removed };
  }

  /** A tiny key-value store for this device only (the folder handle). Null without IndexedDB. */
  async function deviceKV() {
    if (!root.indexedDB) return null;
    try {
      const db = await new Promise((resolve, reject) => {
        const r = root.indexedDB.open('wetware-device', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      const run = (mode, f) => {
        const tx = db.transaction('kv', mode);
        const out = f(tx.objectStore('kv'));
        return txDone(tx).then(() => out && out.result);
      };
      return {
        get: (k) => run('readonly', (os) => os.get(k)),
        set: (k, v) => run('readwrite', (os) => void os.put(v, k)),
        del: (k) => run('readwrite', (os) => void os.delete(k)),
      };
    } catch (_) {
      return null;
    }
  }

  WW.autoBackup = {
    supported: () => typeof root.showDirectoryPicker === 'function' && !!root.indexedDB,
    pick: () => root.showDirectoryPicker({ id: 'wetware-backup', mode: 'readwrite', startIn: 'documents' }),
    permission: folderPermission,
    write: writeBackupFile,
    fileName: backupFileName,
    pruneNames,
    deviceKV,
    KEEP_FILES,
  };
  WW.backup = { due: backupDue, persistStatus, requestPersist, REMIND_OPTIONS, REMIND_DEFAULT };
  WW.store = { open, create: createStore, memoryBackend, EXPORT_FORMAT, EXPORT_VERSION };
  WW.prefs = prefs;
  WW.prefs.PORTABLE = PORTABLE;
  WW.exportFmt = { TRIAL_COLUMNS, toCSV, csvCell, trialRows };
})(globalThis);
