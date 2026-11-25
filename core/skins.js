/* Wetware core: rig skins (PLAN §6.1).
 *
 * A skin is chrome only. It sets <html data-skin="id"> and loads
 * core/skins/<id>.css, which must follow three rules:
 *   1. Tokens go on  html[data-skin='id'], html[data-skin='id'] .ww-chrome
 *      (the second selector re-skins shared intro / pause / results screens
 *      inside the stage; the game body itself keeps stock tokens).
 *   2. Component rules are scoped to the hub (.wrap ...) or the stage bar
 *      (.ww-stage > .bar ...) or .ww-chrome; never to bare .btn, .stim or
 *      anything a game body renders.
 *   3. Decor (backgrounds, animation) lives in .ww-decor, which is removed
 *      while a game runs (html.ww-running).
 * Flavour (restyling an untimed game body) is opt-in per game and comes later.
 */
(function (root) {
  'use strict';
  const WW = (root.WW = root.WW || {});

  // id -> { name, decor?(el) }. Skins register here as they are built (6c).
  const registry = new Map([['stock', { id: 'stock', name: 'Stock deck' }]]);

  function register(def) {
    registry.set(def.id, def);
  }

  /** The equipped skin, falling back to stock for unknown ids or with customisation off. */
  function current() {
    const p = WW.prefs;
    if (!p || p.get('rigCustom', true) === false) return 'stock';
    const id = p.get('skin', 'stock');
    return registry.has(id) ? id : 'stock';
  }

  /** Directory holding theme.css, so pages at any depth find core/skins/. */
  function coreBase(doc) {
    const link = doc.querySelector('link[rel="stylesheet"][href$="theme.css"]');
    return link ? link.href.slice(0, -'theme.css'.length) : 'core/';
  }

  let applied = null;
  function apply() {
    const doc = root.document;
    if (!doc) return;
    const id = current();
    const html = doc.documentElement;
    html.setAttribute('data-skin', id);
    const p = WW.prefs;
    const mod = p ? p.get('skinMod:' + id, '') : '';
    if (mod) html.setAttribute('data-mod', mod);
    else html.removeAttribute('data-mod');
    // Flavour: skins may restyle untimed game bodies that opt in (Black Market, Safehouse).
    if (id !== 'stock' && p && p.get('flavour', false) === true) html.setAttribute('data-flavour', 'on');
    else html.removeAttribute('data-flavour');
    // Trinkets the hub mirrored into prefs: rain anywhere, Rook's palette, sticker sheet, neon callsign.
    const look = (p && p.get('rigCustom', true) !== false && p.get('rigLook', null)) || { active: [] };
    const on = (x) => (look.active || []).includes(x);
    const attr = (name, v) => (v ? html.setAttribute(name, v) : html.removeAttribute(name));
    attr('data-weather', on('rain') ? 'rain' : '');
    attr('data-palette', on('rook-palette') ? 'rook' : '');
    attr('data-sheet', look.sheet || '');
    // Rain (core/rain.js, hub only): Street Glass's rain mod or Vex's trinket. Spire stays dry.
    const wet = (id === 'glass' && mod === 'rain') || on('rain');
    const rainStyle = p ? p.get('rainStyle', 'depth') : 'depth';
    const rain = wet && id !== 'spire' && WW.rain ? (WW.rain.has(rainStyle) ? rainStyle : 'depth') : '';
    const still = html.classList.contains('reduce-motion') ? 's' : '';
    const key = id + '|' + mod + '|' + (on('rain') ? 'r' : '') + '|' + (on('neon') ? look.callsign || '' : '') + '|' + rain + still;
    if (key === applied) return;
    const skinChanged = !applied || applied.split('|')[0] !== id;
    applied = key;

    const old = doc.getElementById('ww-skin-css');
    if (skinChanged && old) old.remove();
    if (skinChanged && id !== 'stock') {
      const link = doc.createElement('link');
      link.id = 'ww-skin-css';
      link.rel = 'stylesheet';
      link.href = coreBase(doc) + 'skins/' + id + '.css';
      doc.head.appendChild(link);
    }

    let decor = doc.querySelector('body > .ww-decor');
    if (!decor && doc.body) {
      decor = doc.createElement('div');
      decor.className = 'ww-decor';
      decor.setAttribute('aria-hidden', 'true');
      doc.body.insertBefore(decor, doc.body.firstChild);
    }
    if (decor) {
      decor.textContent = '';
      const def = registry.get(id);
      if (def.decor) def.decor(decor);
      if (rain) WW.rain.mount(decor, rain);
    }
  }

  WW.skins = {
    register,
    current,
    apply,
    list: () => [...registry.values()],
    /** Trinkets the hub mirrored into prefs, for decor builders (e.g. the neon callsign). */
    look: () => (WW.prefs && WW.prefs.get('rigLook', null)) || { active: [] },
  };
})(globalThis);
