/* Wetware core: tiny DOM helpers shared by the hub and every game. */
(function (root) {
  'use strict';
  const WW = (root.WW = root.WW || {});

  /** h('div.panel#id', {attrs, on: {click}}, ...children) */
  function h(spec, attrs, ...children) {
    const m = /^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i.exec(spec);
    const el = root.document.createElement((m && m[1]) || 'div');
    if (m && m[2]) {
      for (const part of m[2].match(/[.#][\w-]+/g)) {
        if (part[0] === '.') el.classList.add(part.slice(1));
        else el.id = part.slice(1);
      }
    }
    if (attrs && (typeof attrs !== 'object' || attrs instanceof root.Node || Array.isArray(attrs))) {
      children.unshift(attrs);
      attrs = null;
    }
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    append(el, children);
    return el;
  }

  function append(el, children) {
    for (const c of children.flat(Infinity)) {
      if (c === null || c === undefined || c === false) continue;
      el.appendChild(c instanceof root.Node ? c : root.document.createTextNode(String(c)));
    }
    return el;
  }

  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
    return el;
  }

  function download(filename, text, mime) {
    const blob = new root.Blob([text], { type: mime || 'text/plain' });
    const url = root.URL.createObjectURL(blob);
    const a = h('a', { href: url, download: filename });
    root.document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => root.URL.revokeObjectURL(url), 1000);
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const r = new root.FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsText(file);
    });
  }

  let toastTimer = null;
  function toast(msg, kind) {
    let el = root.document.getElementById('ww-toast');
    if (!el) {
      el = h('div#ww-toast', { role: 'status', 'aria-live': 'polite' });
      root.document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = 'show' + (kind ? ' ' + kind : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.className = ''), 2600);
  }

  /** Promise<boolean> confirmation dialog using <dialog>. */
  function confirmDialog(title, body, okLabel) {
    return new Promise((resolve) => {
      const dlg = h(
        'dialog.ww-dialog',
        h('h3', title),
        h('p', body),
        h(
          'div.row',
          h('button.btn', { type: 'button', on: { click: () => close(false) } }, 'Cancel'),
          h('button.btn.danger', { type: 'button', on: { click: () => close(true) } }, okLabel || 'Confirm')
        )
      );
      function close(v) {
        dlg.close();
        dlg.remove();
        resolve(v);
      }
      dlg.addEventListener('cancel', (e) => {
        e.preventDefault();
        close(false);
      });
      root.document.body.appendChild(dlg);
      dlg.showModal();
    });
  }

  const pad = (n) => String(n).padStart(2, '0');
  function fmtDate(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function fmtMs(ms) {
    return ms == null || !Number.isFinite(ms) ? '—' : Math.round(ms) + ' ms';
  }

  /** Apply theme / scanline / motion / skin prefs to <html>. */
  function applyDisplayPrefs() {
    const p = WW.prefs;
    const html = root.document.documentElement;
    const theme = p.get('theme', 'auto');
    if (theme === 'auto') html.removeAttribute('data-theme');
    else html.setAttribute('data-theme', theme);
    html.classList.toggle('scanlines', p.get('scanlines', true));
    html.classList.toggle('reduce-motion', p.get('reduceMotion', false));
    if (WW.skins) WW.skins.apply();
  }

  WW.ui = { h, append, clear, download, readFile, toast, confirmDialog, fmtDate, fmtMs, applyDisplayPrefs };
})(globalThis);
