const view = document.getElementById('view');
const actorSelect = document.getElementById('actor');
const dialog = document.getElementById('iban-dialog');
const ibanForm = document.getElementById('iban-form');
const dialogError = document.getElementById('dialog-error');
const toast = document.getElementById('toast');

let company = null;
let currentEmployee = null;
let dialogCloseReason = 'escape';

// ---------- helpers ----------

// Builds DOM nodes. Text is always set via text nodes, never parsed as HTML.
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

const formatIban = (iban) => iban.replace(/(.{4})/g, '$1 ').trim();
const formatDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const fullName = (e) => `${e.firstName} ${e.lastName}`;

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error((await res.json()).error || 'Request failed');
  return res.json();
}

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.hidden = true; }, 3500);
}

// ---------- list ----------

async function renderList() {
  const employees = await getJson('/api/employees');
  const rows = employees.map((e) =>
    h('tr', { dataset: { track: 'employee-row', trackValue: e.id, search: `${fullName(e)} ${e.id} ${e.jobTitle} ${e.department} ${e.location}`.toLowerCase() }, onclick: () => { location.hash = `#/employees/${e.id}`; } },
      h('td', {}, h('a', { href: `#/employees/${e.id}` }, fullName(e))),
      h('td', { class: 'mono' }, e.id),
      h('td', {}, e.jobTitle),
      h('td', {}, e.department),
      h('td', {}, e.location),
      h('td', { class: 'mono' }, formatIban(e.iban), e.scheduledChange ? h('span', { class: 'badge' }, 'change scheduled') : null),
    ),
  );
  const tbody = h('tbody', {}, rows);
  const count = h('span', { class: 'muted' }, `${employees.length} employees`);

  const search = h('input', {
    type: 'search', placeholder: 'Search by name, number, role or location', 'data-track': 'employee-search', 'aria-label': 'Search employees',
    oninput: (event) => {
      const q = event.target.value.trim().toLowerCase();
      let shown = 0;
      for (const row of rows) {
        row.hidden = q !== '' && !row.dataset.search.includes(q);
        if (!row.hidden) shown += 1;
      }
      count.textContent = `${shown} of ${employees.length} employees`;
    },
  });

  view.replaceChildren(
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Employees'), count), search),
    h('div', { class: 'table-wrap' },
      h('table', {},
        h('thead', {}, h('tr', {}, ['Name', 'Employee no.', 'Job title', 'Department', 'Location', 'IBAN'].map((c) => h('th', { scope: 'col' }, c)))),
        tbody,
      ),
    ),
  );
}

// ---------- detail ----------

function facts(title, pairs) {
  return h('section', { class: 'card' },
    h('h2', {}, title),
    h('dl', { class: 'facts' }, pairs.map(([dt, dd, cls]) => h('div', {}, h('dt', {}, dt), h('dd', { class: cls }, dd)))),
  );
}

async function renderDetail(id) {
  const e = await getJson(`/api/employees/${encodeURIComponent(id)}`);
  currentEmployee = e;

  const call = (who, name, phone) => h('button', {
    type: 'button', class: 'ghost', 'data-track': `call-${who}`, dataset: { trackValue: phone },
    onclick: () => showToast(`Calling ${name} on ${phone}…`),
  }, who === 'employee' ? 'Call employee' : 'Call manager');

  const payment = h('section', { class: 'card' },
    h('div', { class: 'card-head' },
      h('h2', {}, 'Payment details'),
      h('button', { type: 'button', 'data-track': 'edit-iban', onclick: openDialog }, 'Edit IBAN'),
    ),
    h('dl', { class: 'facts' },
      h('div', {}, h('dt', {}, 'Current IBAN'), h('dd', { class: 'mono' }, formatIban(e.iban))),
      e.scheduledChange
        ? h('div', {}, h('dt', {}, 'Scheduled change'), h('dd', {},
            h('span', { class: 'mono' }, formatIban(e.scheduledChange.iban)),
            ` from ${formatDate(e.scheduledChange.firstPayDate)} · submitted by ${e.scheduledChange.submittedBy}`))
        : null,
    ),
  );

  view.replaceChildren(
    h('a', { href: '#/', class: 'back', 'data-track': 'back-to-list' }, '← All employees'),
    h('div', { class: 'page-head' },
      h('div', {}, h('h1', {}, fullName(e)), h('span', { class: 'muted' }, `${e.jobTitle} · ${e.id}`)),
      h('div', { class: 'actions' },
        call('employee', fullName(e), e.phone),
        e.manager ? call('manager', e.manager.name, e.manager.phone) : null,
      ),
    ),
    h('div', { class: 'grid' },
      payment,
      facts('Personal details', [
        ['Birth date', formatDate(e.birthDate)],
        ['Address', e.address],
        ['Email', e.email],
        ['Phone', e.phone],
      ]),
      facts('Employment', [
        ['Employee number', e.id, 'mono'],
        ['Department', e.department],
        ['Location', e.location],
        ['Start date', formatDate(e.startDate)],
        ['Manager', e.manager ? e.manager.name : '—'],
      ]),
    ),
  );
}

// ---------- IBAN dialog ----------

function openDialog() {
  if (!Tracker.caseId) Tracker.startCase(currentEmployee.id);
  ibanForm.reset();
  dialogError.hidden = true;
  document.getElementById('dialog-employee').textContent = `${fullName(currentEmployee)} (${currentEmployee.id})`;
  document.getElementById('dialog-current-iban').textContent = formatIban(currentEmployee.iban);
  dialogCloseReason = 'escape';
  dialog.showModal();
  Tracker.track('dialog_open', { target: { key: 'iban-dialog', tag: 'dialog', type: null, label: 'Change bank account' } });
}

document.getElementById('dialog-cancel').addEventListener('click', () => {
  dialogCloseReason = 'cancel';
  dialog.close();
});

dialog.addEventListener('close', () => {
  Tracker.track('dialog_close', { target: { key: 'iban-dialog', tag: 'dialog', type: null, label: 'Change bank account' }, value: dialogCloseReason });
});

ibanForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(ibanForm);
  const file = data.get('proof');
  const body = {
    actorId: actorSelect.value,
    sessionId: Tracker.sessionId,
    caseId: Tracker.caseId,
    employeeId: currentEmployee.id,
    iban: data.get('iban'),
    firstPayDate: data.get('firstPayDate'),
    proof: file && file.name ? { name: file.name, size: file.size, type: file.type } : null,
  };

  Tracker.track('submit', { target: { key: 'iban-form', tag: 'form', type: null, label: 'Change bank account' } });
  const res = await fetch('/api/submissions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const payload = await res.json();

  if (!res.ok) {
    Tracker.track('submit_failed', { value: payload.error });
    dialogError.textContent = payload.error;
    dialogError.hidden = false;
    return;
  }

  Tracker.track('submit_succeeded', { value: payload.job.job_id });
  dialogCloseReason = 'submitted';
  dialog.close();
  Tracker.endCase();
  Tracker.flush();
  showToast(`IBAN change for ${fullName(currentEmployee)} submitted.`);
  await renderDetail(currentEmployee.id);
});

// ---------- shell ----------

const calendarToggle = document.getElementById('calendar-toggle');
calendarToggle.addEventListener('click', () => {
  const panel = document.getElementById('calendar');
  panel.hidden = !panel.hidden;
  calendarToggle.setAttribute('aria-expanded', String(!panel.hidden));
});

actorSelect.addEventListener('change', () => Tracker.setActor(actorSelect.value));

async function route() {
  const match = location.hash.match(/^#\/employees\/([A-Z]-\d{5})$/);
  if (match) {
    Tracker.startCase(match[1]);
    Tracker.track('view', { value: 'employee_detail' });
    await renderDetail(match[1]);
  } else {
    currentEmployee = null;
    Tracker.leaveEmployee();
    Tracker.track('view', { value: 'employee_list' });
    await renderList();
  }
  view.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

async function start() {
  const boot = await getJson('/api/bootstrap');
  company = boot.company;
  document.getElementById('client-name').textContent = `${company.name} · ${company.jointCommittee}`;
  document.getElementById('last-run').textContent = formatDate(company.lastPayrollRun);
  document.getElementById('next-run').textContent = formatDate(company.nextPayrollRun);
  actorSelect.replaceChildren(...boot.users.map((u) => h('option', { value: u.id }, `${u.name} (${u.role})`)));
  Tracker.setActor(actorSelect.value);
  window.addEventListener('hashchange', () => route().catch(showError));
  await route();
}

function showError(err) {
  view.replaceChildren(h('p', { class: 'error' }, err.message || 'Something went wrong.'));
}

start().catch(showError);
