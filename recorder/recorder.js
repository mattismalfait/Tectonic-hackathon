// Universal recorder. Works on any page, no dependencies.
//   const caseId = Recorder.start({ actor: { id: 'marie', role: 'senior' } });
//   ...the job happens...
//   const events = Recorder.stop();
// Options: actor, captureValues (default false: typed values are masked), onEvent(event) to stream events.
(() => {
  const SCHEMA = 'tectonic.recorder/v1';
  const FIELDS = 'input, select, textarea';
  const DIALOGS = 'dialog, [role="dialog"], [role="alertdialog"]';
  const KEYS = new Set(['Enter', 'Escape', 'Tab']);
  const NOT_DATA = new Set(['submit', 'button', 'reset', 'image', 'hidden']);

  let rec = null;

  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  // Query strings are dropped: they often carry tokens or personal data.
  const cleanUrl = (url) => { const u = new URL(url, location.href); return u.origin === 'null' ? u.protocol : u.origin + u.pathname + u.hash; };
  const since = (t) => Math.round(performance.now() - t);

  function describe(el) {
    if (!(el instanceof Element)) return null;
    const node = el.closest('[data-track], a, button, input, select, textarea, label, summary, [role="button"]') || el;
    const path = [];
    for (let n = node; n && n !== document.body && path.length < 4; n = n.parentElement) {
      path.unshift(n.tagName.toLowerCase() + (n.id ? `#${n.id}` : ''));
    }
    const text = node.getAttribute('aria-label') || node.labels?.[0]?.textContent || node.textContent || node.getAttribute('placeholder') || '';
    return {
      key: node.dataset.track || node.id || node.getAttribute('name') || null,
      tag: node.tagName.toLowerCase(),
      type: node.getAttribute('type'),
      text: text.replace(/\s+/g, ' ').trim().slice(0, 80),
      path: path.join(' > '),
    };
  }

  // Values are masked unless captureValues is on or the field sits inside [data-track-capture]. Passwords and cards never.
  const sensitive = (el) => el.type === 'password' || /^cc-|password/.test(el.autocomplete || '');
  const captures = (el) => !sensitive(el) && (rec.captureValues || !!el.closest?.('[data-track-capture]'));
  const masked = (el, text) => (captures(el) ? { value: text } : { filled: text !== '', length: text.length });

  function valueOf(el) {
    if (el.type === 'checkbox' || el.type === 'radio') return { checked: el.checked };
    if (el.type === 'file') return { files: [...el.files].map((f) => (captures(el) ? { name: f.name, size: f.size, type: f.type } : { size: f.size, type: f.type })) };
    return masked(el, el.value);
  }

  function emit(type, target = null, data = {}) {
    const event = { schema: SCHEMA, case_id: rec.caseId, seq: rec.events.length, time: new Date().toISOString(), actor: rec.actor, type, url: cleanUrl(location.href), target: describe(target), data };
    rec.events.push(event);
    rec.onEvent?.(event);
  }

  function request(method, url, status, t) {
    if (rec) emit('request', null, { method: String(method).toUpperCase(), url: cleanUrl(url), status, ms: since(t) });
  }

  function checkUrl() {
    if (location.href === rec.url) return;
    emit('page_view', null, { title: document.title, from: cleanUrl(rec.url) });
    rec.url = location.href;
    rec.depth = 0;
  }

  const openDialogs = (n) => (n instanceof Element ? [n, ...n.querySelectorAll(DIALOGS)] : []).filter((d) => d.matches(DIALOGS) && (d.tagName !== 'DIALOG' || d.open));

  function start({ actor = null, captureValues = false, onEvent } = {}) {
    if (rec) stop();
    const t0 = performance.now();
    rec = { caseId: uid(), actor, captureValues, onEvent, events: [], t0, url: location.href, shownAt: t0, focusAt: t0, depth: 0, abort: new AbortController() };
    emit('start', null, { title: document.title, referrer: document.referrer, language: navigator.language, viewport: `${innerWidth}x${innerHeight}`, userAgent: navigator.userAgent });

    const on = (target, type, fn, capture = true) => target.addEventListener(type, fn, { capture, passive: true, signal: rec.abort.signal });
    const field = (fn) => (e) => e.target instanceof Element && e.target.matches(FIELDS) && fn(e.target, e);

    on(document, 'click', (e) => emit('click', e.target));
    on(document, 'change', field((el) => emit('change', el, valueOf(el))));
    on(document, 'focusin', field((el) => { rec.focusAt = performance.now(); emit('focus', el); }));
    on(document, 'focusout', field((el) => emit('blur', el, { ms: since(rec.focusAt) })));
    on(document, 'paste', (e) => emit('paste', e.target, masked(e.target, e.clipboardData?.getData('text') || '')));
    on(document, 'copy', (e) => emit('copy', e.target, masked(e.target, String(getSelection()))));
    on(document, 'invalid', field((el) => emit('invalid', el, { message: el.validationMessage })));
    on(document, 'keydown', (e) => KEYS.has(e.key) && emit('key', e.target, { key: e.key }));
    on(document, 'submit', (e) => emit('submit', e.target, {
      fields: [...e.target.elements].filter((f) => f.matches(FIELDS) && !NOT_DATA.has(f.type))
        .map((f) => ({ key: describe(f).key, filled: f.type === 'checkbox' || f.type === 'radio' ? f.checked : f.value !== '' })),
    }));
    on(document, 'visibilitychange', () => {
      if (document.hidden) emit('page_hide', null, { ms: since(rec.shownAt) });
      else { rec.shownAt = performance.now(); emit('page_show'); }
    });
    on(window, 'scroll', () => {
      const depth = Math.floor(Math.min(1, (scrollY + innerHeight) / document.documentElement.scrollHeight) * 4) * 25;
      if (depth > rec.depth) { rec.depth = depth; emit('scroll', null, { depth }); }
    }, false);
    on(window, 'error', (e) => emit('error', null, { message: e.message, source: e.filename, line: e.lineno }), false);
    on(window, 'unhandledrejection', (e) => emit('error', null, { message: String(e.reason?.message ?? e.reason) }), false);
    on(window, 'popstate', checkUrl);
    on(window, 'hashchange', checkUrl);

    rec.observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes') {
          if (m.target.tagName === 'DIALOG') emit(m.target.open ? 'dialog_open' : 'dialog_close', m.target);
          continue;
        }
        for (const n of m.addedNodes) openDialogs(n).forEach((d) => emit('dialog_open', d));
        for (const n of m.removedNodes) openDialogs(n).forEach((d) => emit('dialog_close', d));
      }
    });
    rec.observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] });

    // Patched while recording, restored on stop(): route changes and network requests.
    const xhr = XMLHttpRequest.prototype;
    const original = { fetch: window.fetch, open: xhr.open, send: xhr.send, pushState: history.pushState, replaceState: history.replaceState };
    const xhrInfo = new WeakMap();
    rec.restore = () => {
      Object.assign(window, { fetch: original.fetch });
      Object.assign(xhr, { open: original.open, send: original.send });
      Object.assign(history, { pushState: original.pushState, replaceState: original.replaceState });
    };
    window.fetch = async (input, init) => {
      const t = performance.now();
      const method = init?.method || input?.method || 'GET';
      const url = input?.url || String(input);
      try {
        const res = await original.fetch.call(window, input, init);
        request(method, url, res.status, t);
        return res;
      } catch (err) {
        request(method, url, 0, t);
        throw err;
      }
    };
    xhr.open = function (method, url) {
      xhrInfo.set(this, { method, url });
      return original.open.apply(this, arguments);
    };
    xhr.send = function () {
      const t = performance.now();
      const info = xhrInfo.get(this);
      if (info) this.addEventListener('loadend', () => request(info.method, info.url, this.status, t), { once: true });
      return original.send.apply(this, arguments);
    };
    history.pushState = function () { original.pushState.apply(this, arguments); if (rec) checkUrl(); };
    history.replaceState = function () { original.replaceState.apply(this, arguments); if (rec) checkUrl(); };

    return rec.caseId;
  }

  function stop() {
    if (!rec) return [];
    emit('stop', null, { ms: since(rec.t0) });
    rec.abort.abort();
    rec.observer.disconnect();
    rec.restore();
    const { events } = rec;
    rec = null;
    return events;
  }

  globalThis.Recorder = { start, stop };
})();
