/* Wetware core: the full-screen stage that hosts a running module.
 * Used by the hub and by each game's standalone page.
 */
(function (root) {
  'use strict';
  const WW = (root.WW = root.WW || {});
  const { h } = WW.ui;

  /**
   * Launch a module on a full-screen stage.
   * opts: { store, title, backHref, onDone(result) }
   * Without backHref the bar offers "Abort"; with it, the standalone page
   * offers a link back to the hub instead.
   */
  async function launch(id, opts) {
    const o = opts || {};
    const meta = (WW.catalog && WW.catalog.module(id)) || { name: id };
    const def = WW.games && WW.games.get(id);
    // Untimed games that opt in take the skin's flavour; every other game body stays stock.
    const gameEl = h(def && def.flavour ? 'div.game.ww-flavour' : 'div.game');
    let handle = null;
    const abortBtn = h('button.btn', { type: 'button', on: { click: () => handle && handle.abort() } }, 'Abort');
    const bar = h(
      'div.bar',
      h('h2', o.title || meta.name),
      h('div.row', o.backHref ? h('a.btn', { href: o.backHref }, 'Hub') : null, abortBtn)
    );
    const stage = h('div.ww-stage', { role: 'dialog', 'aria-modal': 'true', 'aria-label': meta.name, tabindex: '-1' }, bar, gameEl);
    // Everything behind the stage goes inert, so keys (Enter, Space) can't
    // re-activate the hub button that launched this run.
    const behind = [...root.document.body.children].filter((el) => !el.inert && el.tagName !== 'SCRIPT');
    behind.forEach((el) => (el.inert = true));
    if (root.document.activeElement && root.document.activeElement.blur) root.document.activeElement.blur();
    root.document.body.appendChild(stage);
    root.document.body.style.overflow = 'hidden';
    // Skin decor is removed (not just dimmed) while a game runs, so it can't cost frames.
    root.document.documentElement.classList.add('ww-running');
    if (WW.audio && WW.audio.hum) WW.audio.hum(false);
    stage.focus({ preventScroll: true });
    handle = await WW.mountGame(id, gameEl, {
      store: o.store,
      onExit(result) {
        stage.remove();
        root.document.documentElement.classList.remove('ww-running');
        behind.forEach((el) => (el.inert = false));
        root.document.body.style.overflow = '';
        o.onDone && o.onDone(result);
      },
    });
    return handle;
  }

  /** Boot a game's standalone page (games/<id>/index.html). */
  async function standalone(id) {
    WW.ui.applyDisplayPrefs();
    const store = await WW.store.open();
    const body = root.document.body;
    const start = () =>
      launch(id, {
        store,
        backHref: '../../index.html',
        onDone(result) {
          WW.ui.clear(body);
          const msg = result.aborted ? 'Run aborted. Nothing was logged.' : result.saved ? 'Session logged.' : 'Session finished but could not be saved.';
          body.appendChild(
            h(
              'div.center',
              h('p', msg),
              h('div.row', h('button.btn.primary', { type: 'button', on: { click: () => (WW.ui.clear(body), start()) } }, 'Run again'), h('a.btn', { href: '../../index.html' }, 'Back to hub'))
            )
          );
        },
      });
    start();
  }

  WW.host = { launch, standalone };
})(globalThis);
