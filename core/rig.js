/* Wetware core: rig customisation logic — creds, gifts, Vex's stall (PLAN §6.1).
 *
 * Pure functions, no DOM. Creds are never stored: they are derived from the
 * session history every time, so export / import and deleted sessions stay
 * consistent. The only stored state (store key 'rig') is
 *   { purchases: [{ id, day, price, at }], contractDays: ['YYYY-MM-DD'], callsign }
 * where purchase `day` is days on the job at the moment of purchase.
 *
 * Creds pay for showing up, never for scores (Lumsden et al. 2016).
 */
(function (root) {
  'use strict';
  const WW = (root.WW = root.WW || {});
  const DAY = 864e5;

  const GIFT_DAYS = [3, 7, 14, 21, 30];
  const EARN = { session: 15, gauntlet: 60, drop: 10, contract: 50, cap: 150 };

  // Gift order = table order. `comms` is Rook's line when the crew hands it over.
  const SKINS = [
    { id: 'stock', name: 'Stock deck', price: 0 },
    {
      id: 'phosphor',
      name: 'Phosphor',
      price: 300,
      comms: 'Found this terminal in a salvage lot. Thing’s older than both of us and it still boots. It’s on your bench.',
    },
    {
      id: 'junk',
      name: 'Chop Shop',
      price: 500,
      comms: 'Vex built you a deck out of junk. Says it’s a favour. Check it for bugs, the electronic kind and the other kind.',
    },
    {
      id: 'glass',
      name: 'Street Glass',
      price: 700,
      comms: 'Runner I knew got out of the business. Left her glass behind. It’s good kit. Don’t let it make you feel invisible.',
    },
    {
      id: 'spire',
      name: 'Spire',
      price: 900,
      comms: 'Spire exec terminal, wiped and re-flashed. Vex says it fell off a truck. Learn how they think before we go in.',
    },
    {
      id: 'lace',
      name: 'Neural Lace',
      price: 1200,
      comms: 'Sealed graft, no maker’s mark. Vex won’t say where it came from, which means Vex doesn’t know. It’s in your deck now and it’s growing. Keep training.',
    },
  ];

  // Fixed stock: `day` is when it turns up on the stall; nothing ever leaves.
  const STALL = [
    { id: 'plate', name: 'Callsign plate', sub: 'Your callsign on the masthead', price: 100, day: 1 },
    { id: 'keys', name: 'Mechanical keys', sub: 'Sound pack for menu clicks; answer feedback sounds stay locked', price: 300, day: 1 },
    { id: 'cat', name: 'Desk cat', sub: 'Sleeps on the masthead; wakes when you log a session', price: 400, day: 1 },
    { id: 'amber', name: 'Amber tube', sub: 'The amber version of Phosphor', price: 150, day: 3 },
    { id: 'sticker1', name: 'Sticker sheet #1', sub: 'Fills the Chop Shop sticker slots', price: 60, day: 7 },
    { id: 'sticker2', name: 'Sticker sheet #2', sub: 'Fills the Chop Shop sticker slots', price: 60, day: 7 },
    { id: 'rain', name: 'Rain for any skin', sub: 'Street Glass has it built in', price: 250, day: 14 },
    { id: 'neon', name: 'Neon callsign', sub: 'Your callsign as a sign in the Street Glass skyline', price: 350, day: 14 },
    { id: 'sticker3', name: 'Sticker sheet #3', sub: 'Fills the Chop Shop sticker slots', price: 60, day: 14 },
    { id: 'sticker4', name: 'Sticker sheet #4', sub: 'Fills the Chop Shop sticker slots', price: 60, day: 21 },
  ];

  // Given instead of a skin when a gift day comes and you own every skin. Never sold.
  const ROOK = [
    {
      id: 'rook-plate',
      name: 'Rook’s old callsign plate',
      sub: 'Scratched; from before Lowlight',
      comms: 'You’ve got everything Vex sells. Here’s something Vex doesn’t: my old callsign plate. Don’t ask what it says under the paint.',
    },
    { id: 'rook-lighter', name: 'Desk lighter', sub: 'Flickers on the masthead', comms: 'Desk lighter. Hasn’t lit anything in years. Still flickers, though.' },
    { id: 'rook-photo', name: 'Photo of the old crew', sub: 'Pinned in the Stash', comms: 'Old crew photo. Most of them got out. Keep it somewhere I can’t see it.' },
    { id: 'rook-tape', name: 'Tape: Rook’s ambient hum', sub: 'A quiet drone, any skin', comms: 'Tape I used to run on long jobs. Just hum. Helps you think, or helps you stop.' },
    {
      id: 'rook-palette',
      name: 'A palette Vex can’t get',
      sub: 'Works with any skin',
      comms: 'Colours off a Spire test rig that never shipped. Vex has wanted these for years. Don’t tell Vex.',
    },
  ];

  const pad = (n) => String(n).padStart(2, '0');
  const dateKey = (ts) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const priceOf = (id) => {
    const x = SKINS.find((s) => s.id === id) || STALL.find((s) => s.id === id);
    return x ? x.price : 0;
  };

  /**
   * Per-day creds from logged sessions.
   * sessions: [{ id, game, startedAt, summary }]; isTraining(gameId) -> bool; nameOf(gameId) -> label.
   * Returns { total, days: { 'YYYY-MM-DD': { raw, paid, items: [{ label, amount }] } } }.
   */
  function earnings(sessions, contractDays, isTraining, nameOf) {
    const byId = new Map(sessions.map((s) => [s.id, s]));
    const days = {};
    const add = (key, label, amount) => {
      const d = (days[key] = days[key] || { raw: 0, paid: 0, items: [] });
      d.items.push({ label, amount });
      d.raw += amount;
    };
    const ordered = sessions.slice().sort((a, b) => a.startedAt - b.startedAt);
    for (const s of ordered) {
      const key = dateKey(s.startedAt);
      if (s.game === 'gauntlet') add(key, 'Weekly Gauntlet run', EARN.gauntlet);
      else if (isTraining(s.game)) add(key, `${nameOf ? nameOf(s.game) : s.game} logged`, EARN.session);
      else continue;
      // Dead drops pay for turning up on the day they were due, however much you remember.
      for (const d of (s.summary && s.summary.dropRecalls) || []) {
        const made = byId.get(d.id);
        const onTime = !made || !Number.isFinite(d.days) || dateKey(made.startedAt + d.days * DAY) === key;
        if (onTime) add(key, `Dead drop (day ${d.days}) recalled`, EARN.drop);
      }
    }
    for (const key of new Set(contractDays || [])) add(key, 'Daily contract finished', EARN.contract);
    let total = 0;
    for (const d of Object.values(days)) {
      d.paid = Math.min(EARN.cap, d.raw);
      total += d.paid;
    }
    return { total, days };
  }

  /**
   * Who handed over what. days: days on the job now; purchases: [{ id, day }].
   * A purchase made on day d counts before a gift on day g only if d < g
   * (on a gift day the gift arrives with the first session).
   */
  function gifts(days, purchases) {
    const made = (purchases || []).filter((p) => p.day <= days);
    const bought = new Map();
    for (const p of made) if (!bought.has(p.id)) bought.set(p.id, p.day);
    const gifted = new Map();
    const rook = [];
    const giftable = SKINS.filter((s) => s.id !== 'stock');
    for (const g of GIFT_DAYS) {
      if (g > days) break;
      const next = giftable.find((s) => !gifted.has(s.id) && !(bought.has(s.id) && bought.get(s.id) < g));
      if (next) gifted.set(next.id, g);
      else if (rook.length < ROOK.length) rook.push({ id: ROOK[rook.length].id, day: g });
    }
    const owns = (id) => id === 'stock' || gifted.has(id) || bought.has(id);
    // Project the remaining gift days onto the skins still unowned, in order.
    const future = new Map();
    const futureRook = [];
    const unowned = giftable.filter((s) => !owns(s.id));
    let i = 0;
    for (const g of GIFT_DAYS.filter((x) => x > days)) {
      if (i < unowned.length) future.set(unowned[i++].id, g);
      else futureRook.push(g);
    }
    return { bought, gifted, rook, future, futureRook, owns };
  }

  /** Everything the Stash needs. rig: stored state; days: days on the job. */
  function status({ sessions, rig, days, isTraining, nameOf, unlockAll }) {
    const r = rig || {};
    const purchases = (r.purchases || []).filter((p) => p.day <= days);
    const g = gifts(days, purchases);
    const earned = earnings(sessions, r.contractDays, isTraining, nameOf);
    const spent = purchases.reduce((t, p) => t + (Number.isFinite(p.price) ? p.price : priceOf(p.id)), 0);
    const ownsItem = (id) => unlockAll || purchases.some((p) => p.id === id) || g.rook.some((x) => x.id === id);
    return {
      ...g,
      owns: (id) => unlockAll || g.owns(id),
      ownsItem,
      earned,
      spent,
      // Deleted sessions can push this below zero; show 0 and block buying, never take items back.
      balance: Math.max(0, earned.total - spent),
      // Day-1 stock is there from the start, before the first training day.
      inStock: (item) => unlockAll || item.day <= Math.max(1, days),
    };
  }

  /** Latest handover on or before `days`, for Rook's comms: { day, kind, item }. */
  function latestGift(st) {
    let best = null;
    for (const [id, day] of st.gifted) if (!best || day > best.day) best = { day, kind: 'skin', item: SKINS.find((s) => s.id === id) };
    for (const x of st.rook) if (!best || x.day > best.day) best = { day: x.day, kind: 'rook', item: ROOK.find((r) => r.id === x.id) };
    return best;
  }

  /**
   * Merge an imported 'rig' state into the local one (moving between devices).
   * Purchases: one per item, keeping the earliest. Contract days: union.
   * Callsign: the imported one, unless it is empty.
   */
  function mergeState(local, incoming) {
    const a = local || {};
    const b = incoming || {};
    const byId = new Map();
    for (const p of [...(a.purchases || []), ...(b.purchases || [])]) {
      const have = byId.get(p.id);
      if (!have || p.day < have.day || (p.day === have.day && (p.at || 0) < (have.at || 0))) byId.set(p.id, p);
    }
    return Object.assign({}, a, b, {
      purchases: [...byId.values()].sort((x, y) => x.day - y.day || (x.at || 0) - (y.at || 0)),
      contractDays: [...new Set([...(a.contractDays || []), ...(b.contractDays || [])])].sort(),
      callsign: b.callsign || a.callsign || '',
    });
  }

  WW.rig = { GIFT_DAYS, EARN, SKINS, STALL, ROOK, earnings, gifts, status, latestGift, priceOf, dateKey, mergeState };
})(globalThis);
