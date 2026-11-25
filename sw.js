/* Wetware service worker: makes the app work offline once it has been opened
 * over http(s) (python3 -m http.server, or any static host). Not used on file://.
 *
 * Strategy: network first, cache as the fallback. Online you always get the
 * current files (no stale code while developing); offline you get the last
 * copy. Every file below is cached on install so the whole app, including
 * every game page and skin, works offline after one visit.
 *
 * Keep ASSETS in step with the pages: tests/run.js fails if a page loads a
 * file that is not listed here, or if something listed no longer exists.
 * Change VERSION whenever ASSETS changes, so old caches are dropped.
 */
'use strict';
const VERSION = 'wetware-v16';
const ASSETS = [
  './',
  './core/audio.js',
  './core/catalog.js',
  './core/confidence.js',
  './core/context.js',
  './core/contract.js',
  './core/game.js',
  './core/host.js',
  './core/intercepts.js',
  './core/rain.js',
  './core/reliable.js',
  './core/bayes.js',
  './core/build.js',
  './core/study.js',
  './core/results.js',
  './core/reminders.js',
  './core/rig.js',
  './core/rng.js',
  './core/screens.js',
  './core/sequence.js',
  './core/skin-defs.js',
  './core/skins.js',
  './core/skins/glass.css',
  './core/skins/junk.css',
  './core/skins/lace.css',
  './core/skins/phosphor.css',
  './core/skins/spire.css',
  './core/staircase.js',
  './core/stats.js',
  './core/storage.js',
  './core/theme.css',
  './core/timing.js',
  './core/trends.js',
  './core/ui.js',
  './data/enable.js',
  './diagnostics/choice-rt.js',
  './diagnostics/common.js',
  './diagnostics/corsi.js',
  './diagnostics/digit-span.js',
  './diagnostics/matrices.js',
  './diagnostics/paper-folding.js',
  './diagnostics/sart.js',
  './diagnostics/stroop.js',
  './diagnostics/stroop-spatial.js',
  './diagnostics/trails.js',
  './fonts/VT323-latin.woff2',
  './games/black-market/game.js',
  './games/black-market/index.html',
  './games/bookie/game.js',
  './games/bookie/index.html',
  './games/buffer-overflow/game.js',
  './games/buffer-overflow/index.html',
  './games/burn-in/game.js',
  './games/burn-in/index.html',
  './games/checksum/game.js',
  './games/checksum/index.html',
  './games/cipher-matrix/game.js',
  './games/cipher-matrix/index.html',
  './games/context-switch/game.js',
  './games/context-switch/index.html',
  './games/dead-switch/game.js',
  './games/dead-switch/index.html',
  './games/double-cross/game.js',
  './games/double-cross/index.html',
  './games/fence/game.js',
  './games/fence/index.html',
  './games/firewall/game.js',
  './games/firewall/index.html',
  './games/flashpoint/game.js',
  './games/flashpoint/index.html',
  './games/gauntlet/game.js',
  './games/gauntlet/index.html',
  './games/ghost-trace/game.js',
  './games/ghost-trace/index.html',
  './games/handshake/game.js',
  './games/handshake/index.html',
  './games/hardpoint/game.js',
  './games/hardpoint/index.html',
  './games/heist-ledger/game.js',
  './games/heist-ledger/index.html',
  './games/id-spoof/faces.js',
  './games/id-spoof/game.js',
  './games/id-spoof/index.html',
  './games/id-spoof/names.js',
  './games/informant/game.js',
  './games/informant/index.html',
  './games/lexicon-breach/categories.js',
  './games/lexicon-breach/game.js',
  './games/lexicon-breach/index.html',
  './games/lockpick/game.js',
  './games/lockpick/index.html',
  './games/night-watch/game.js',
  './games/night-watch/index.html',
  './games/packet-echo/game.js',
  './games/packet-echo/index.html',
  './games/pulse/game.js',
  './games/pulse/index.html',
  './games/relay/game.js',
  './games/relay/index.html',
  './games/rule-forge/game.js',
  './games/rule-forge/index.html',
  './games/safehouse/game.js',
  './games/safehouse/index.html',
  './games/safehouse/words.js',
  './games/trace/game.js',
  './games/trace/index.html',
  './games/wiretap/briefings.js',
  './games/wiretap/game.js',
  './games/wiretap/index.html',
  './hub.js',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './index.html',
  './manifest.webmanifest',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(VERSION)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('wetware-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    (async () => {
      const cache = await caches.open(VERSION);
      try {
        const res = await fetch(req);
        if (res.ok && res.type === 'basic') cache.put(req, res.clone());
        return res;
      } catch (_) {
        const hit = await cache.match(req, { ignoreSearch: true });
        if (hit) return hit;
        if (req.mode === 'navigate') return (await cache.match('./index.html')) || Response.error();
        return Response.error();
      }
    })()
  );
});
