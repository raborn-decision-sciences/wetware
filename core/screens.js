/* Wetware core: standard screens shared by modules and diagnostics.
 * intro / results / pause, plus small building blocks (kv list, key legend).
 * The three screens are chrome (.ww-chrome): skins may restyle them. The
 * legend is .ww-locked and always uses stock tokens (PLAN §6.1).
 * All screens accept an AbortSignal so an aborted run never leaves
 * listeners behind.
 */
(function (root) {
  'use strict';
  const WW = (root.WW = root.WW || {});

  const ui = () => WW.ui;

  function kvList(pairs) {
    const { h } = ui();
    return h(
      'dl.kv',
      pairs.filter(Boolean).map(([k, v]) => h('div', h('dt', k), h('dd', v === null || v === undefined ? '—' : String(v))))
    );
  }

  /** Key caps: [{ key: 'D', label: 'red', color? }] */
  function legend(items) {
    const { h } = ui();
    // Key legends name stimulus colours, so they stay stock even inside a skinned screen.
    return h(
      'div.row.ww-locked',
      { style: { justifyContent: 'center' } },
      items.map((it) =>
        h(
          'span.keycap',
          h('kbd', it.key),
          it.color ? h('i.swatch', { style: { background: it.color } }) : null,
          h('span', it.label)
        )
      )
    );
  }

  /** Resolve when the button is clicked or Enter is pressed. */
  function waitForButton(btn, signal) {
    return new Promise((resolve) => {
      let finished = false;
      const done = (v) => {
        if (finished) return;
        finished = true;
        root.removeEventListener('keydown', onKey, true);
        btn.removeEventListener('click', onClick);
        if (signal) signal.removeEventListener('abort', onAbort);
        resolve(v);
      };
      const onKey = (e) => {
        if (e.code === 'Enter' && !e.repeat) {
          e.preventDefault();
          done(true);
        }
      };
      const onClick = () => done(true);
      const onAbort = () => done(false);
      root.addEventListener('keydown', onKey, true);
      btn.addEventListener('click', onClick);
      if (signal) {
        if (signal.aborted) return done(false);
        signal.addEventListener('abort', onAbort);
      }
    });
  }

  /**
   * Instructions screen.
   * o: { kicker, title, body: [string|Node], kv: [[k, v]], legend: Node, button, signal }
   * Resolves true when continued, false if aborted.
   */
  function intro(container, o) {
    const { h, clear } = ui();
    clear(container);
    const btn = h('button.btn.primary', { type: 'button' }, o.button || 'Start');
    container.appendChild(
      h(
        'div.center.ww-chrome',
        o.kicker ? h('p.label', o.kicker) : null,
        o.title ? h('p.big.title', o.title) : null,
        (o.body || []).map((p) => (typeof p === 'string' ? h('p', p) : p)),
        o.kv ? kvList(o.kv) : null,
        o.legend || null,
        btn,
        h('p.muted.small', 'Enter to continue')
      )
    );
    btn.focus({ preventScroll: true });
    return waitForButton(btn, o.signal);
  }

  /** Brief centred message for ms milliseconds. */
  async function pause(container, text, ms, signal) {
    const { h, clear } = ui();
    clear(container);
    container.appendChild(h('div.center.ww-chrome', h('p', text)));
    await WW.timing.sleep(ms);
    return !(signal && signal.aborted);
  }

  /**
   * Results screen with Log it / Discard.
   * o: { headline, tone: 'good'|'warn', kv: [[k, v]], notes: [string], signal }
   * Resolves 'save' | 'discard'.
   */
  function results(container, o) {
    const { h, clear } = ui();
    clear(container);
    const save = h('button.btn.primary', { type: 'button' }, 'Log it');
    const discard = h('button.btn', { type: 'button' }, 'Discard');
    container.appendChild(
      h(
        'div.center.ww-chrome',
        h(
          'div.ww-debrief',
          h('p.big', { style: { color: o.tone === 'warn' ? 'var(--amber)' : 'var(--good)' } }, o.headline),
          o.kv ? kvList(o.kv) : null,
          (o.notes || []).map((n) => h('p.muted', n)),
          h('div.row', save, discard)
        )
      )
    );
    return new Promise((resolve) => {
      save.addEventListener('click', () => resolve('save'));
      discard.addEventListener('click', () => resolve('discard'));
      if (o.signal) o.signal.addEventListener('abort', () => resolve('discard'));
    });
  }

  WW.screens = { intro, pause, results, kvList, legend, waitForButton };
})(globalThis);
