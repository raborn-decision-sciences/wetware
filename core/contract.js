/* Wetware core: Rook's daily contract (the training protocol).
 *
 * Picks 3 training modules per day, frozen once drawn:
 *  - anything flagged as priority (e.g. Safehouse dead drops due) first
 *  - then modules ranked by days since last played (spacing), plus a bonus
 *    for weak subsystems (low tune), plus a little day-seeded noise
 *  - skipping a module whose primary subsystems are all already covered,
 *    so a contract spreads across domains (interleaving)
 * PLAN §6; spacing (Cepeda et al. 2006), interleaving (Kornell & Bjork 2008).
 */
(function (root) {
  'use strict';
  const WW = (root.WW = root.WW || {});
  const DAY = 864e5;

  const pad = (n) => String(n).padStart(2, '0');
  /** Local calendar day, YYYY-MM-DD. */
  function dateKey(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  /**
   * modules: [{ id, primary: [subsystem], minutes }]
   * sessions: newest first; tunes: { id: 0..1 | null }; priority: [id]
   */
  function build({ day, modules, sessions, tunes, priority = [], size = 3, now }) {
    const rng = WW.rng.create('contract:' + day);
    const last = (id) => {
      const s = sessions.find((x) => x.game === id);
      return s ? s.startedAt : 0;
    };
    const scored = modules.map((m) => {
      const days = Math.min(14, (now - last(m.id)) / DAY);
      const tune = tunes[m.id];
      return { m, score: days + (1 - (Number.isFinite(tune) ? tune : 0.5)) * 2 + rng.next() * 0.5 };
    });
    const picks = [];
    const covered = new Set();
    const take = (m) => {
      picks.push(m.id);
      m.primary.forEach((s) => covered.add(s));
    };
    for (const id of priority) {
      const m = modules.find((x) => x.id === id);
      if (m && picks.length < size) take(m);
    }
    const ranked = scored.sort((a, b) => b.score - a.score).map((x) => x.m);
    for (const m of ranked) {
      if (picks.length >= size) break;
      if (picks.includes(m.id)) continue;
      if (m.primary.every((s) => covered.has(s))) continue;
      take(m);
    }
    // Fewer domains than slots: fill with the best remaining.
    for (const m of ranked) {
      if (picks.length >= size) break;
      if (!picks.includes(m.id)) take(m);
    }
    return picks;
  }

  WW.contract = { build, dateKey, DAY };
})(globalThis);
