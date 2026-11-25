/* Black Market (SOCKET / RAM): sealed-bid chip auction against rival fixers.
 *
 * Built on Goofspiel, a public-domain bidding game. Thirteen lots (worth
 * 1-13) come up one at a time in random order. You and each rival hold
 * chips 1-13 and bid one face-down per lot; each chip is spent once.
 * Highest bid takes the lot; a tie at the top burns it. Rivals' bids
 * flash briefly and are not kept on screen, so tracking what they have
 * left is a working-memory job (probed twice per game). Rival styles span
 * cognitive-hierarchy levels (Camerer, Ho & Chong 2004). Grade X.
 */
(function (root) {
  'use strict';
  const WW = root.WW;

  const CHIPS = [...Array(13).keys()].map((i) => i + 1);
  const REVEAL_MS = 2600;
  const PROBE_ROUNDS = [5, 10];

  const closest = (hand, v) => hand.reduce((a, c) => (Math.abs(c - v) < Math.abs(a - v) || (Math.abs(c - v) === Math.abs(a - v) && c > a) ? c : a), hand[0]);

  /** Rival strategies: (me, lot, ctx) -> chip from me.hand. */
  const STYLES = {
    greedy: { blurb: 'bids about what the lot is worth', bid: (me, lot) => closest(me.hand, lot) },
    wild: {
      blurb: 'unpredictable; goes all-in on big lots',
      bid: (me, lot, c) => (lot >= 10 && c.rng.chance(0.6) ? Math.max(...me.hand) : c.rng.pick(me.hand)),
    },
    mirror: { blurb: 'copies your last bid when it can', bid: (me, lot, c) => (c.lastHumanBid && me.hand.includes(c.lastHumanBid) ? c.lastHumanBid : closest(me.hand, lot)) },
    calculating: {
      blurb: 'models everyone else and bids just enough',
      bid: (me, lot, c) => {
        // Predict each other player's bid as "closest to value" from their hand, then outbid the max by the cheapest chip.
        const others = c.players.filter((p) => p !== me);
        const predicted = Math.max(...others.map((p) => closest(p.hand, lot)));
        const remainingLots = c.lotsLeft;
        const worth = lot >= WW.stats.median(remainingLots);
        const winning = me.hand.filter((x) => x > predicted).sort((a, b) => a - b);
        if (worth && winning.length) return winning[0];
        return Math.min(...me.hand); // dump the cheapest chip on lots not worth fighting for
      },
    },
    reader: {
      blurb: 'reads how you bid and outbids you just enough',
      bid: (me, lot, c) => {
        // Like "calculating", but models you from your own bids so far: your average bid-to-lot ratio,
        // applied to this lot and snapped to a chip you still hold.
        const hist = c.humanHistory || [];
        const ratio = hist.length ? WW.stats.mean(hist.map(([l, b]) => b / l)) : 1;
        const predict = (p) => (p.human ? closest(p.hand, Math.round(lot * ratio)) : closest(p.hand, lot));
        const predicted = Math.max(...c.players.filter((p) => p !== me && p.hand.length).map(predict));
        const worth = lot >= WW.stats.median(c.lotsLeft);
        const winning = me.hand.filter((x) => x > predicted).sort((a, b) => a - b);
        if (worth && winning.length) return winning[0];
        return Math.min(...me.hand);
      },
    },
  };

  const ROSTERS = [
    null,
    [['Kessler', 'greedy'], ['Moth', 'wild']],
    [['Kessler', 'greedy'], ['Ilse', 'mirror']],
    [['Kessler', 'greedy'], ['Moth', 'wild'], ['Ilse', 'mirror']],
    [['Vex', 'calculating'], ['Kessler', 'greedy'], ['Ilse', 'mirror']],
    [['Vex', 'calculating'], ['Sable', 'reader'], ['Ilse', 'mirror']],
    [['Vex', 'calculating'], ['Sable', 'reader'], ['Kessler', 'greedy'], ['Ilse', 'mirror']],
  ];
  const MAX_LEVEL = ROSTERS.length - 1;

  /** Resolve a round: bids [{player, chip}] -> winner or null on a top tie. */
  function resolve(bids) {
    const top = Math.max(...bids.map((b) => b.chip));
    const atTop = bids.filter((b) => b.chip === top);
    return atTop.length === 1 ? atTop[0].player : null;
  }

  WW.logic = WW.logic || {};
  WW.logic.blackMarket = { STYLES, ROSTERS, resolve, closest, CHIPS, MAX_LEVEL };

  WW.games.register({
    id: 'black-market',
    // Untimed: skins may restyle the chips and lot when flavour is on (PLAN §6.1).
    flavour: true,
    name: 'Black Market',
    headline: (s) => `${s.rank === 1 ? 'won' : 'placed ' + s.rank} · ${s.myScore} vs ${s.bestRival} · tracking ${Math.round(s.trackingAccuracy * 100)}%`,
    tune(sessions) {
      const s = sessions[0] && sessions[0].summary;
      return s ? WW.stats.clamp01((s.level - 1 + (s.rank === 1 ? 1 : 0)) / MAX_LEVEL) : null;
    },
    mount(container, ctx) {
      const { h, clear } = ctx.ui;
      const T = ctx.timing;
      const S = WW.stats;
      const ac = new AbortController();
      const signal = ac.signal;
      const rng = ctx.rng;

      (async () => {
        const saved = await ctx.loadState('progress', { level: 1, sessions: 0 });
        const roster = ROSTERS[Math.max(1, Math.min(MAX_LEVEL, saved.level))];
        if (
          !(await WW.screens.intro(container, {
            kicker: 'SOCKET · strategy',
            title: 'Black Market',
            body: [
              'Thirteen lots go under the hammer, worth 1 to 13 credits, in random order. You and every rival hold chips 1-13 and bid one face-down per lot; each chip spends once. Highest bid takes the lot; a tie at the top burns it.',
              'Rivals’ bids flash for a moment and vanish. No notes: keep track of what they have left.',
            ],
            kv: [['Rivals', roster.map(([n, st]) => `${n} (${STYLES[st].blurb})`).join('; ')], ['Takes', 'about 4 minutes']],
            button: 'Open the auction',
            signal,
          }))
        )
          return;
        const players = [{ name: 'You', human: true, hand: CHIPS.slice(), score: 0, spent: [] }, ...roster.map(([name, style]) => ({ name, style, hand: CHIPS.slice(), score: 0, spent: [] }))];
        const lots = rng.shuffle(CHIPS);
        const c = { rng, players, lastHumanBid: null, humanHistory: [], lotsLeft: lots.slice() };
        let probesRight = 0;
        let probesAsked = 0;

        for (let round = 0; round < lots.length; round++) {
          const lot = lots[round];
          c.lotsLeft = lots.slice(round);
          // Bid screen.
          clear(container);
          const me = players[0];
          const chipBtns = CHIPS.map((x) => h('button.btn.bm-chip', { type: 'button', disabled: !me.hand.includes(x), dataset: { v: String(x) } }, String(x)));
          container.appendChild(
            h(
              'div.center',
              h('p.label', `Lot ${round + 1} / 13`),
              h('div.bm-lot', h('span', String(lot)), h('small', 'credits')),
              h('div.bm-scores', players.map((p) => h('span', `${p.name}: ${p.score}`))),
              h('p', 'Your bid:'),
              h('div.bm-chips', chipBtns),
              h('p.muted.small', 'Tap a chip (or type its number and Enter).')
            )
          );
          const myBid = await new Promise((resolveBid) => {
            let typed = '';
            const done = (v) => {
              root.removeEventListener('keydown', onKey, true);
              resolveBid(v);
            };
            const onKey = (e) => {
              const m = /^(?:Digit|Numpad)([0-9])$/.exec(e.code);
              if (m) typed = (typed + m[1]).slice(-2);
              else if (e.code === 'Enter' && me.hand.includes(Number(typed))) return done(Number(typed));
              else return;
              e.preventDefault();
            };
            root.addEventListener('keydown', onKey, true);
            chipBtns.forEach((b) => b.addEventListener('click', () => !b.disabled && done(Number(b.dataset.v))));
            signal.addEventListener('abort', () => done(null));
          });
          if (myBid === null) return;
          const bids = players.map((p) => ({ player: p, chip: p.human ? myBid : STYLES[p.style].bid(p, lot, c) }));
          bids.forEach((b) => {
            b.player.hand = b.player.hand.filter((x) => x !== b.chip);
            b.player.spent.push(b.chip);
          });
          c.lastHumanBid = myBid;
          c.humanHistory.push([lot, myBid]);
          const winner = resolve(bids);
          if (winner) winner.score += lot;
          ctx.session.trial({ condition: 'round', stimulus: { lot, round: round + 1 }, response: myBid, correct: winner === me, rt: null, level: saved.level, bids: bids.map((b) => [b.player.name, b.chip]) });
          // Reveal briefly.
          clear(container);
          container.appendChild(
            h(
              'div.center',
              h('p.label', `Lot ${round + 1}: ${lot} credits`),
              h('div.bm-reveal', bids.map((b) => h('div', { class: 'bm-bid' + (b.player === winner ? ' win' : '') }, h('span', b.player.name), h('b', String(b.chip))))),
              h('p', winner ? `${winner.name} takes it.` : 'Tie at the top: the lot burns.')
            )
          );
          ctx.audio.sfx(winner === me ? 'correct' : winner ? 'tick' : 'error');
          await T.sleep(REVEAL_MS);
          if (signal.aborted) return;

          // Working-memory probe: which chip does a rival still hold?
          if (PROBE_ROUNDS.includes(round + 1)) {
            const rival = rng.pick(players.slice(1));
            const held = rng.sample(rival.hand, Math.min(1, rival.hand.length));
            const gone = rng.sample(rival.spent, Math.min(3, rival.spent.length));
            const options = rng.shuffle([...held, ...gone]);
            clear(container);
            const btns = options.map((x, i) => h('button.btn.bm-chip', { type: 'button' }, h('kbd', String(i + 1)), ` ${x}`));
            container.appendChild(h('div.center', h('p.label', 'Audit'), h('p', `Which of these chips does ${rival.name} still have?`), h('div.row', { style: { justifyContent: 'center' } }, btns)));
            const keyMap = {};
            options.forEach((_, i) => (keyMap['Digit' + (i + 1)] = i));
            const r = await T.awaitChoice({ keyMap, buttons: btns.map((el, i) => ({ el, value: i })), signal });
            if (r.aborted) return;
            const ok = held.includes(options[r.value]);
            probesAsked++;
            if (ok) probesRight++;
            ctx.session.trial({ condition: 'audit', stimulus: { rival: rival.name, options, held }, response: options[r.value], correct: ok, rt: r.rt, level: saved.level });
            ctx.audio.sfx(ok ? 'correct' : 'error');
            await T.sleep(500);
          }
        }

        const ranked = players.slice().sort((a, b) => b.score - a.score);
        const rank = ranked.findIndex((p) => p.human) + 1;
        const tied = ranked.filter((p) => p.score === players[0].score).length > 1;
        const summary = {
          level: saved.level,
          rivals: roster.map(([n]) => n),
          myScore: players[0].score,
          bestRival: Math.max(...players.slice(1).map((p) => p.score)),
          rank: tied && rank === 1 ? 2 : rank,
          trackingAccuracy: probesAsked ? S.round(probesRight / probesAsked, 3) : 0,
        };
        const nextLevel = summary.rank === 1 ? Math.min(MAX_LEVEL, saved.level + 1) : summary.rank === players.length ? Math.max(1, saved.level - 1) : saved.level;
        const choice = await WW.screens.results(container, {
          headline: summary.rank === 1 ? 'MARKET CORNERED' : `PLACED ${summary.rank}`,
          tone: summary.rank === 1 ? 'good' : 'warn',
          kv: [
            ['Final take', ranked.map((p) => `${p.name} ${p.score}`).join(' · ')],
            ['Chip tracking audits', `${probesRight} of ${probesAsked}`],
            ['Next table', ROSTERS[nextLevel].map(([n]) => n).join(', ')],
          ],
          notes: ['Win outright to face sharper rivals. Table level carries over only if you log the session.'],
          signal,
        });
        if (choice === 'save') {
          await ctx.saveState('progress', { level: nextLevel, sessions: saved.sessions + 1 });
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
