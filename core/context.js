/* Wetware core: the daily check-in (sleep, mood, stress, caffeine).
 *
 * State lagged in a self-experiment matters more than a week of training:
 * a bad night moves reaction time and working memory more than practice does.
 * One optional check-in per day is stored under the 'checkins' state key
 * ({ 'YYYY-MM-DD': { sleep, mood, stress, caffeine, at } }) and copied onto
 * every session logged that day (session.context), so exports carry it.
 * Never required, never nagged: a skipped day is just missing data.
 */
(function (root) {
  'use strict';
  const WW = (root.WW = root.WW || {});

  const FIELDS = [
    { id: 'sleep', label: 'Sleep last night', options: [[4, '≤4 h'], [5, '5 h'], [6, '6 h'], [7, '7 h'], [8, '8 h'], [9, '9+ h']] },
    { id: 'mood', label: 'Mood', options: [[1, 'low'], [2, ''], [3, 'ok'], [4, ''], [5, 'good']] },
    { id: 'stress', label: 'Stress', options: [[1, 'calm'], [2, ''], [3, ''], [4, ''], [5, 'high']] },
    { id: 'caffeine', label: 'Caffeine so far', options: [[0, 'none'], [1, '1 cup'], [2, '2+']] },
  ];

  const pad = (n) => String(n).padStart(2, '0');
  function dateKey(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  /** A check-in is valid when every value is one of its field's options. */
  function clean(entry) {
    if (!entry || typeof entry !== 'object') return null;
    const out = {};
    for (const f of FIELDS) {
      const v = entry[f.id];
      if (v === undefined || v === null) continue;
      if (!f.options.some(([x]) => x === v)) return null;
      out[f.id] = v;
    }
    if (!Object.keys(out).length) return null;
    if (Number.isFinite(entry.at)) out.at = entry.at;
    return out;
  }

  /** Import merge: union by date; the imported entry wins a clash. */
  function merge(local, incoming) {
    return Object.assign({}, local || {}, incoming || {});
  }

  /** Context for a session start time, or null. */
  function forSession(checkins, startedAt) {
    return (checkins && clean(checkins[dateKey(startedAt)])) || null;
  }

  WW.context = { FIELDS, dateKey, clean, merge, forSession };
})(globalThis);
