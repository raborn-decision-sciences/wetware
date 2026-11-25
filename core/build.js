/* Wetware build settings: the one file that differs between builds.
 *
 * Every build (the hosted site, a desktop or phone wrapper) runs the same app code; only these
 * values change. tools/publish.sh stamps `version` and `commit` into the hosted copy; a wrapper
 * sets `target` by defining globalThis.WW_BUILD before this file loads.
 *   target   'web' | 'electron' | 'android' | 'ios'
 *   paid     reserved for paid phone builds (what it unlocks is not decided); no effect yet
 * No ads, in any build (decided 2026-11-24).
 *
 * WW.platform() gives the group each session is logged under (env.platform): the build target,
 * plus the browser engine for the web build, since engines time and draw differently.
 */
(function (root) {
  'use strict';
  const WW = (root.WW = root.WW || {});
  WW.build = Object.freeze(Object.assign({ target: 'web', version: '0.1.0', commit: '3f296da', paid: false }, root.WW_BUILD || {}));

  /** 'chromium' | 'webkit' | 'gecko' | 'node' | 'other', from a user-agent string. */
  function engineOf(ua) {
    if (!ua || ua === 'node' || /^Node\.js\//.test(ua)) return 'node';
    if (/\b(iPhone|iPad|iPod)\b/.test(ua)) return 'webkit'; // every iOS browser is WebKit
    if (/\bFirefox\//.test(ua)) return 'gecko';
    if (/\b(Chrome|Chromium|CriOS|Edg|Electron)\//.test(ua)) return 'chromium';
    if (/\bVersion\/[\d.]+.*\bSafari\//.test(ua) || /AppleWebKit\//.test(ua)) return 'webkit';
    return 'other';
  }
  const groupOf = (target, engine) => (target === 'web' ? 'web-' + engine : target);

  function platform() {
    const nav = root.navigator;
    const ua = nav ? nav.userAgent : 'node';
    const engine = engineOf(ua);
    let installed = false;
    try {
      installed = !!((root.matchMedia && root.matchMedia('(display-mode: standalone)').matches) || (nav && nav.standalone));
    } catch (_) {
      /* no matchMedia */
    }
    const b = WW.build;
    return { group: groupOf(b.target, engine), target: b.target, engine, version: b.version, commit: b.commit, installed };
  }

  WW.platform = platform;
  WW.platform.engineOf = engineOf;
  WW.platform.groupOf = groupOf;
})(globalThis);
