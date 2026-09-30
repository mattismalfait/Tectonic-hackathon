// Floating record button for recorder.js. Recordings are kept in localStorage.
//   <script src="recorder.js"></script>
//   <script src="recorder-ui.js"></script>
(() => {
  const STORAGE_KEY = 'tectonic.recordings';
  const HOST_KEY = 'tectonic-recorder-ui'; // Clicks on the widget itself carry this key and are left out of recordings.

  const load = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; } };
  const save = (list) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch (err) { console.warn('Recorder: could not save', err); } };

  const pad = (n) => String(n).padStart(2, '0');
  const clock = (ms) => `${Math.floor(ms / 60000)}:${pad(Math.floor(ms / 1000) % 60)}`;
  const when = (iso) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const path = (url) => { try { const u = new URL(url); return u.pathname + u.hash; } catch { return url; } };

  // ---------- one event -> one chat line ----------

  const KIND = {
    start: 'meta', stop: 'meta', page_view: 'meta', page_hide: 'meta', page_show: 'meta',
    request: 'app', dialog_open: 'app', dialog_close: 'app', invalid: 'app', error: 'app',
  }; // Everything else is something the user did.

  function valueText(d) {
    if ('value' in d) return `\u201c${d.value}\u201d`;
    if ('checked' in d) return d.checked ? 'checked' : 'unchecked';
    if (d.files) return `${d.files.length} file(s)`;
    return d.filled ? `${d.length} characters (hidden)` : 'empty';
  }

  function say(e) {
    const d = e.data || {};
    const name = e.target ? `\u201c${e.target.text || e.target.key || e.target.tag}\u201d` : '';
    switch (e.type) {
      case 'start': return `Recording started on ${d.title || path(e.url)}`;
      case 'stop': return `Recording stopped after ${clock(d.ms)}`;
      case 'page_view': return `Went to ${path(e.url)}`;
      case 'page_hide': return `Left the tab after ${clock(d.ms)}`;
      case 'page_show': return 'Came back to the tab';
      case 'click': return `Clicked ${name}`;
      case 'change': return `Set ${name} to ${valueText(d)}`;
      case 'focus': return `Entered ${name}`;
      case 'blur': return `Left ${name} after ${(d.ms / 1000).toFixed(1)} s`;
      case 'paste': return `Pasted ${valueText(d)} into ${name}`;
      case 'copy': return `Copied ${valueText(d)}`;
      case 'key': return `Pressed ${d.key} in ${name}`;
      case 'scroll': return `Scrolled to ${d.depth}%`;
      case 'submit': {
        const empty = (d.fields || []).filter((f) => !f.filled).map((f) => f.key);
        const form = e.target?.key ? `\u201c${e.target.key}\u201d` : 'a form'; // A form's text is all of its labels.
        return `Submitted ${form}${empty.length ? ` with empty: ${empty.join(', ')}` : ', all fields filled'}`;
      }
      case 'invalid': return `${name} was refused: ${d.message}`;
      case 'dialog_open': return `Pop-up opened: ${name}`;
      case 'dialog_close': return `Pop-up closed: ${name}`;
      case 'request': return `${d.method} ${path(d.url)} \u2192 ${d.status || 'failed'} \u00b7 ${d.ms} ms`;
      case 'error': return `Error: ${d.message}`;
      default: return e.type;
    }
  }

  const failed = (e) => e.type === 'error' || e.type === 'invalid' || (e.type === 'request' && (e.data.status === 0 || e.data.status >= 400));

  // ---------- widget ----------

  function init() {
    const host = document.createElement('div');
    host.dataset.track = HOST_KEY;
    const root = host.attachShadow({ mode: 'open' });
    // A constructed stylesheet, not a <style> tag, so pages with a strict Content-Security-Policy don't block it.
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(`
        :host { all: initial; --bg: #fff; --fg: #1b1d22; --muted: #646a75; --line: #dde0e6; --soft: #f1f3f7; --me: #1f4fd1; --me-fg: #fff; --bad: #b3261e; --bad-soft: #fdecea;
                font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
        @media (prefers-color-scheme: dark) {
          :host { --bg: #1c1e22; --fg: #e9eaee; --muted: #9ca2ad; --line: #34373e; --soft: #26292f; --me: #7ea2ff; --me-fg: #0d1530; --bad: #f4b4ab; --bad-soft: #3d1a16; }
        }
        * { box-sizing: border-box; }
        [hidden] { display: none !important; }
        .dock { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
        .row { display: flex; gap: 8px; align-items: center; }
        button { font: inherit; color: inherit; cursor: pointer; }
        .rec { width: 60px; height: 60px; border-radius: 50%; border: 3px solid #fff; background: radial-gradient(circle at 35% 30%, #ff6b5e, #e5372b 60%, #b8231a);
               display: grid; place-items: center; box-shadow: 0 6px 20px rgb(229 55 43 / .45); transition: transform .15s ease, box-shadow .15s ease; }
        .rec:hover { transform: scale(1.07); box-shadow: 0 8px 26px rgb(229 55 43 / .6); }
        .rec:active { transform: scale(.94); }
        .rec:focus-visible { outline: 3px solid #e5372b; outline-offset: 3px; }
        .rec::before { content: ""; width: 20px; height: 20px; border-radius: 50%; background: #fff; transition: border-radius .25s ease, width .25s ease, height .25s ease; }
        .rec.on::before { width: 18px; height: 18px; border-radius: 4px; }
        .rec.on { animation: pulse 1.6s ease-out infinite; }
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgb(229 55 43 / .55), 0 6px 20px rgb(229 55 43 / .45); }
          70% { box-shadow: 0 0 0 18px rgb(229 55 43 / 0), 0 6px 20px rgb(229 55 43 / .45); }
          100% { box-shadow: 0 0 0 0 rgb(229 55 43 / 0), 0 6px 20px rgb(229 55 43 / .45); }
        }
        .timer:not([hidden]), .panel:not([hidden]) { animation: pop .2s ease-out; }
        @keyframes pop { from { opacity: 0; transform: translateY(6px) scale(.97); } }
        @media (prefers-reduced-motion: reduce) { .rec, .rec::before, .timer, .panel { animation: none !important; transition: none !important; } }
        .list-btn { height: 36px; padding: 0 12px; border-radius: 18px; border: 1px solid var(--line); background: var(--bg); box-shadow: 0 2px 8px rgb(0 0 0 / .12); }
        .timer { padding: 4px 10px; border-radius: 12px; background: #e5372b; color: #fff; font-weight: 600; font-variant-numeric: tabular-nums; }
        .timer::before { content: "\u25cf "; animation: blink 1s steps(2) infinite; }
        @keyframes blink { 50% { opacity: 0; } }
        .panel { width: min(400px, calc(100vw - 32px)); height: min(560px, calc(100vh - 110px)); display: flex; flex-direction: column;
                 background: var(--bg); color: var(--fg); border: 1px solid var(--line); border-radius: 14px; box-shadow: 0 12px 40px rgb(0 0 0 / .25); overflow: hidden; }
        header { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--line); }
        header .title { flex: 1; min-width: 0; }
        header strong, header span { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        header span { color: var(--muted); font-size: 12px; }
        .icon { border: 0; background: none; padding: 4px 8px; border-radius: 6px; font-size: 16px; }
        .icon:hover, .list-btn:hover { background: var(--soft); }
        .small { border: 1px solid var(--line); background: none; padding: 3px 10px; border-radius: 6px; font-size: 12px; }
        .body { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 6px; }
        .msg { max-width: 85%; padding: 6px 10px; border-radius: 12px; overflow-wrap: anywhere; }
        .msg small { display: block; font-size: 11px; opacity: .7; }
        .user { align-self: flex-end; background: var(--me); color: var(--me-fg); border-bottom-right-radius: 4px; }
        .app { align-self: flex-start; background: var(--soft); border-bottom-left-radius: 4px; }
        .meta { align-self: center; color: var(--muted); font-size: 12px; text-align: center; padding: 4px 0; }
        .bad { background: var(--bad-soft); color: var(--bad); }
        .item { text-align: left; border: 1px solid var(--line); background: none; border-radius: 10px; padding: 10px 12px; }
        .item:hover { background: var(--soft); }
        .item span { display: block; color: var(--muted); font-size: 12px; }
        .empty { color: var(--muted); text-align: center; margin: auto; padding: 0 24px; }
        .foot { padding: 8px 12px; border-top: 1px solid var(--line); text-align: right; }`);
    root.adoptedStyleSheets = [sheet];
    root.innerHTML = `
      <div class="dock">
        <section class="panel" hidden aria-label="Recordings">
          <header>
            <button class="icon back" aria-label="All recordings" title="All recordings">\u2190</button>
            <div class="title"><strong></strong><span></span></div>
            <button class="small download">JSONL</button>
            <button class="icon close" aria-label="Close" title="Close">\u2715</button>
          </header>
          <div class="body"></div>
          <div class="foot"><button class="small clear">Delete all</button></div>
        </section>
        <div class="timer" hidden>0:00</div>
        <div class="row">
          <button class="list-btn" title="All recordings">Recordings</button>
          <button class="rec" aria-label="Start recording" title="Start recording"></button>
        </div>
      </div>`;

    const $ = (s) => root.querySelector(s);
    const panel = $('.panel'), body = $('.body'), timer = $('.timer'), recBtn = $('.rec'), listBtn = $('.list-btn');
    let tick = null;
    let current = null; // recording shown in the panel

    const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };

    function header(title, subtitle, { back, download, clear }) {
      $('header strong').textContent = title;
      $('header span').textContent = subtitle;
      $('.back').hidden = !back;
      $('.download').hidden = !download;
      $('.foot').hidden = !clear;
    }

    function showRecording(r) {
      current = r;
      header(r.title || path(r.url), `${when(r.startedAt)} \u00b7 ${clock(r.ms)} \u00b7 ${r.events.length} events`, { back: true, download: true });
      const t0 = Date.parse(r.startedAt);
      body.replaceChildren(...r.events.map((e) => {
        const kind = KIND[e.type] || 'user';
        const msg = el('div', `msg ${kind}${failed(e) ? ' bad' : ''}`, say(e));
        if (kind !== 'meta') msg.append(el('small', '', `+${clock(Date.parse(e.time) - t0)} \u00b7 ${e.type}`));
        return msg;
      }));
      panel.hidden = false;
      body.scrollTop = 0;
    }

    function showList() {
      current = null;
      const list = load().reverse();
      header('Recordings', `${list.length} saved in this browser`, { clear: list.length > 0 });
      body.replaceChildren(...(list.length ? list.map((r) => {
        const item = el('button', 'item', r.title || path(r.url));
        item.append(el('span', '', `${when(r.startedAt)} \u00b7 ${clock(r.ms)} \u00b7 ${r.events.length} events`));
        item.addEventListener('click', () => showRecording(r));
        return item;
      }) : [el('p', 'empty', 'No recordings yet. Press the red button to record a job.')]));
      panel.hidden = false;
    }

    function startRecording() {
      panel.hidden = true;
      Recorder.start();
      const t0 = Date.now();
      timer.textContent = '0:00';
      tick = setInterval(() => { timer.textContent = clock(Date.now() - t0); }, 1000);
      timer.hidden = false;
      listBtn.hidden = true;
      recBtn.classList.add('on');
      recBtn.setAttribute('aria-label', 'Stop recording');
      recBtn.title = 'Stop recording';
    }

    function stopRecording() {
      const events = Recorder.stop().filter((e) => e.target?.key !== HOST_KEY);
      clearInterval(tick);
      timer.hidden = true;
      listBtn.hidden = false;
      recBtn.classList.remove('on');
      recBtn.setAttribute('aria-label', 'Start recording');
      recBtn.title = 'Start recording';
      const first = events[0], last = events[events.length - 1];
      const recording = { id: first.case_id, startedAt: first.time, ms: last.data.ms, title: first.data.title, url: first.url, events };
      save([...load(), recording]);
      showRecording(recording);
    }

    recBtn.addEventListener('click', () => (recBtn.classList.contains('on') ? stopRecording() : startRecording()));
    listBtn.addEventListener('click', () => (panel.hidden ? showList() : (panel.hidden = true)));
    $('.back').addEventListener('click', showList);
    $('.close').addEventListener('click', () => { panel.hidden = true; });
    $('.clear').addEventListener('click', () => { if (confirm('Delete all recordings in this browser?')) { save([]); showList(); } });
    $('.download').addEventListener('click', () => {
      const blob = new Blob([current.events.map((e) => JSON.stringify(e)).join('\n') + '\n'], { type: 'application/x-ndjson' });
      const a = el('a');
      a.href = URL.createObjectURL(blob);
      a.download = `recording-${current.startedAt.replace(/[:.]/g, '-')}.jsonl`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });

    document.body.append(host);
  }

  if (document.body) init();
  else document.addEventListener('DOMContentLoaded', init);
})();
