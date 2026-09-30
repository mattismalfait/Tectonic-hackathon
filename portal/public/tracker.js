// Captures every click, input and paste in the page and ships them to /api/events.
// Event format: EVENTS.md. The app adds semantic events (view, dialog_open, submit, ...) via Tracker.track().
window.Tracker = (() => {
  const INPUT_DEBOUNCE_MS = 600;
  const FLUSH_INTERVAL_MS = 2000;
  const MAX_BATCH = 100;

  const sessionId = crypto.randomUUID();
  let actorId = null;
  let caseId = null;
  let employeeId = null;
  let queue = [];
  const pendingInputs = new Map(); // element → debounce timer

  // Stable name for an element: data-track first, then id / name.
  function describe(el) {
    if (!(el instanceof Element)) return null;
    const node = el.closest('[data-track]') || el.closest('a, button, input, select, textarea, label, summary') || el;
    const labelText = node.labels && node.labels[0] ? node.labels[0].textContent : null;
    const label = node.getAttribute('aria-label') || labelText || node.textContent || node.getAttribute('placeholder') || '';
    return {
      key: node.dataset.track || node.id || node.getAttribute('name') || null,
      tag: node.tagName.toLowerCase(),
      type: node.getAttribute('type'),
      label: label.replace(/\s+/g, ' ').trim().slice(0, 120),
    };
  }

  function fieldValue(el) {
    if (el.type === 'checkbox' || el.type === 'radio') return el.checked;
    return el.value;
  }

  function commitInputs() {
    for (const [el, timer] of pendingInputs) {
      clearTimeout(timer);
      pendingInputs.delete(el);
      push('input', { target: describe(el), value: fieldValue(el) });
    }
  }

  function push(activity, { target = null, value = null } = {}) {
    if (!actorId) return; // Nothing is attributed before the app knows who is signed in.
    queue.push({
      event_id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      actor_id: actorId,
      case_id: caseId,
      activity,
      page: location.hash || '#/',
      target,
      value,
      context: { employee_id: employeeId },
    });
  }

  // Semantic events. Pending typing is committed first so the log stays in the order things happened.
  function track(activity, details) {
    commitInputs();
    push(activity, details);
  }

  function takeBatch() {
    const batch = queue.slice(0, MAX_BATCH);
    queue = queue.slice(MAX_BATCH);
    return batch;
  }

  async function flush() {
    commitInputs();
    while (queue.length) {
      const events = takeBatch();
      try {
        const res = await fetch('/api/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, events }),
          keepalive: true,
        });
        if (!res.ok) console.warn('Tracker: events refused', await res.text());
      } catch {
        queue = events.concat(queue); // Server unreachable: keep them for the next flush.
        return;
      }
    }
  }

  function flushOnExit() {
    commitInputs();
    while (queue.length) {
      const body = JSON.stringify({ sessionId, events: takeBatch() });
      navigator.sendBeacon('/api/events', new Blob([body], { type: 'application/json' }));
    }
  }

  document.addEventListener('click', (e) => {
    const target = describe(e.target);
    const tracked = e.target instanceof Element ? e.target.closest('[data-track-value]') : null;
    track('click', { target, value: tracked ? tracked.dataset.trackValue : null });
  }, true);

  document.addEventListener('input', (e) => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) return;
    if (el.type === 'file') return; // Logged as file_select on change.
    clearTimeout(pendingInputs.get(el));
    pendingInputs.set(el, setTimeout(() => {
      pendingInputs.delete(el);
      push('input', { target: describe(el), value: fieldValue(el) });
    }, INPUT_DEBOUNCE_MS));
  }, true);

  document.addEventListener('change', (e) => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement) || el.type !== 'file') return;
    const file = el.files && el.files[0];
    track('file_select', { target: describe(el), value: file ? { name: file.name, size: file.size, type: file.type } : null });
  }, true);

  document.addEventListener('paste', (e) => {
    const text = e.clipboardData ? e.clipboardData.getData('text') : '';
    track('paste', { target: describe(e.target), value: text.slice(0, 200) });
  }, true);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushOnExit();
  });
  window.addEventListener('pagehide', flushOnExit);
  setInterval(flush, FLUSH_INTERVAL_MS);

  return {
    sessionId,
    get caseId() { return caseId; },
    track,
    flush,
    setActor(id) {
      const previous = actorId;
      actorId = id;
      track(previous ? 'actor_change' : 'session_start', { value: id });
    },
    // A case is one job: it starts when the officer opens an employee and ends on submit or leaving.
    startCase(id) {
      commitInputs();
      caseId = crypto.randomUUID();
      employeeId = id;
    },
    endCase() {
      commitInputs();
      caseId = null;
    },
    leaveEmployee() {
      commitInputs();
      caseId = null;
      employeeId = null;
    },
  };
})();
