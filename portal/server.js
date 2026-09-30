// Payroll workspace for the dummy client Lumina Retail NV (see EXAMPLE.md).
// Every click and input in the UI is posted to /api/events and stored in /events (schema: EVENTS.md).
// Zero dependencies: node portal/server.js → http://127.0.0.1:3000
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const SUBMISSIONS_DIR = path.join(ROOT, 'submissions');
const EVENTS_DIR = path.join(ROOT, 'events');
const INPUT_DIR = path.join(ROOT, 'input'); // matcher input: input/<what>/<date>_<who>.json
const PORT = Number(process.env.PORT) || 3000;
const HOST = '127.0.0.1';
const MAX_BODY_BYTES = 64 * 1024;
const MAX_EVENTS_PER_BATCH = 100;
const MAX_RECORDING_BYTES = 10 * 1024 * 1024;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const EVENT_SCHEMA = 'tectonic.ui-event/v1';

const { company, employees } = require('./data/employees.json');
const EMPLOYEES = new Map(employees.map((e) => [e.id, e]));

// Seniority comes from the profile, never from what the officer does in the UI.
const USERS = {
  marie: { name: 'Marie', role: 'senior' },
  karim: { name: 'Karim', role: 'senior' },
  lotte: { name: 'Lotte', role: 'senior' },
  sam: { name: 'Sam', role: 'junior' },
};

const ACTIVITIES = new Set([
  'session_start', 'actor_change', 'view', 'click', 'input', 'paste', 'file_select',
  'dialog_open', 'dialog_close', 'submit', 'submit_succeeded', 'submit_failed',
]);

const STATIC_FILES = {
  '/': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/app.js': { file: 'app.js', type: 'text/javascript; charset=utf-8' },
  '/tracker.js': { file: 'tracker.js', type: 'text/javascript; charset=utf-8' },
  '/styles.css': { file: 'styles.css', type: 'text/css; charset=utf-8' },
  '/recorder.js': { file: '../../recorder/recorder.js', type: 'text/javascript; charset=utf-8' },
  '/recorder-ui.js': { file: '../../recorder/recorder-ui.js', type: 'text/javascript; charset=utf-8' },
};

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

class ValidationError extends Error {}

// ---------- storage ----------

async function readSubmissions() {
  let names;
  try {
    names = await fs.readdir(SUBMISSIONS_DIR);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const submissions = [];
  for (const name of names.filter((n) => n.endsWith('.json'))) {
    try {
      submissions.push(JSON.parse(await fs.readFile(path.join(SUBMISSIONS_DIR, name), 'utf8')));
    } catch {
      // Skip files that are not valid submissions.
    }
  }
  return submissions;
}

async function writeSubmission(record) {
  await fs.mkdir(SUBMISSIONS_DIR, { recursive: true });
  const fileName = `${record.submitted_at.replace(/[:.]/g, '-')}-${record.job_id}.json`;
  await fs.writeFile(path.join(SUBMISSIONS_DIR, fileName), JSON.stringify(record, null, 2) + '\n');
}

async function appendEvents(sessionId, events) {
  await fs.mkdir(EVENTS_DIR, { recursive: true });
  // sessionId is a validated UUID, so it is safe as a file name.
  await fs.appendFile(path.join(EVENTS_DIR, `${sessionId}.jsonl`), events.map((e) => JSON.stringify(e)).join('\n') + '\n');
}

// A finished recorder recording, stored as matcher input. A second one for the same who and day gets -2, -3, …
async function writeRecording(body) {
  if (!isPlainObject(body)) throw new ValidationError('Invalid request body.');
  const { what, who, events } = body;
  if (typeof what !== 'string' || !SLUG.test(what) || what.length > 80) throw new ValidationError('Invalid process name.');
  if (typeof who !== 'string' || !SLUG.test(who) || who.length > 80) throw new ValidationError('Invalid who.');
  if (!Array.isArray(events) || events.length === 0 || !events.every(isPlainObject)) throw new ValidationError('Invalid events.');
  const started = Date.parse(events[0].time);
  if (Number.isNaN(started)) throw new ValidationError('Invalid recording start time.');
  const date = new Date(started).toISOString().slice(0, 10);

  const dir = path.join(INPUT_DIR, what);
  await fs.mkdir(dir, { recursive: true });
  const json = JSON.stringify(events, null, 2) + '\n';
  for (let n = 1; ; n++) {
    const name = `${date}_${who}${n > 1 ? `-${n}` : ''}.json`;
    try {
      await fs.writeFile(path.join(dir, name), json, { flag: 'wx' });
      return `input/${what}/${name}`;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
  }
}

// Latest submitted change per employee, shown as "scheduled change" in the UI.
function scheduledChanges(submissions) {
  const latest = new Map();
  for (const s of submissions) {
    const id = s.employee && s.employee.id;
    if (!id) continue;
    if (!latest.has(id) || latest.get(id).submitted_at < s.submitted_at) latest.set(id, s);
  }
  return latest;
}

function withSchedule(employee, changes) {
  const s = changes.get(employee.id);
  const scheduledChange = s
    ? { iban: s.official_fields.new_iban.value, firstPayDate: s.official_fields.first_pay_date.value, submittedBy: s.submitted_by.name, submittedAt: s.submitted_at }
    : null;
  return { ...employee, scheduledChange };
}

// ---------- validation ----------

function isValidIban(iban) {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const digits = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let remainder = 0;
  for (const d of digits) remainder = (remainder * 10 + Number(d)) % 97;
  return remainder === 1;
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

function optionalString(value, maxLength) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new ValidationError('Expected text.');
  return value.slice(0, maxLength);
}

function lookupUser(id) {
  const user = typeof id === 'string' && Object.hasOwn(USERS, id) ? USERS[id] : null;
  if (!user) throw new ValidationError('Unknown officer.');
  return { id, name: user.name, role: user.role };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cleanFileMeta(value) {
  if (value === null || value === undefined) return null;
  if (!isPlainObject(value)) throw new ValidationError('Invalid file.');
  const size = Number(value.size);
  return {
    name: optionalString(value.name, 120) || '',
    size: Number.isFinite(size) && size >= 0 ? Math.round(size) : 0,
    type: optionalString(value.type, 80) || '',
  };
}

// Normalises one event from the browser. The server sets the schema, receipt time and actor role.
function cleanEvent(raw, sessionId, receivedAt) {
  if (!isPlainObject(raw)) throw new ValidationError('Invalid event.');
  if (typeof raw.event_id !== 'string' || !UUID.test(raw.event_id)) throw new ValidationError('Invalid event_id.');
  if (raw.case_id !== null && (typeof raw.case_id !== 'string' || !UUID.test(raw.case_id))) throw new ValidationError('Invalid case_id.');
  if (!ACTIVITIES.has(raw.activity)) throw new ValidationError('Unknown activity.');
  if (typeof raw.timestamp !== 'string' || Number.isNaN(Date.parse(raw.timestamp))) throw new ValidationError('Invalid timestamp.');

  let target = null;
  if (raw.target !== null && raw.target !== undefined) {
    if (!isPlainObject(raw.target)) throw new ValidationError('Invalid target.');
    target = {
      key: optionalString(raw.target.key, 80),
      tag: optionalString(raw.target.tag, 20),
      type: optionalString(raw.target.type, 20),
      label: optionalString(raw.target.label, 120),
    };
  }

  let value = null;
  if (typeof raw.value === 'string') value = raw.value.slice(0, 200);
  else if (typeof raw.value === 'boolean') value = raw.value;
  else if (isPlainObject(raw.value)) value = cleanFileMeta(raw.value);

  const context = isPlainObject(raw.context) ? raw.context : {};
  const employeeId = optionalString(context.employee_id, 20);

  return {
    schema: EVENT_SCHEMA,
    event_id: raw.event_id,
    timestamp: new Date(raw.timestamp).toISOString(),
    received_at: receivedAt,
    session_id: sessionId,
    case_id: raw.case_id,
    actor: lookupUser(raw.actor_id),
    activity: raw.activity,
    page: optionalString(raw.page, 200),
    target,
    value,
    context: { employee_id: employeeId && EMPLOYEES.has(employeeId) ? employeeId : null },
  };
}

function buildSubmission(input, changes) {
  if (!isPlainObject(input)) throw new ValidationError('Invalid request body.');
  const user = lookupUser(input.actorId);
  const employee = typeof input.employeeId === 'string' ? EMPLOYEES.get(input.employeeId) : null;
  if (!employee) throw new ValidationError('Unknown employee.');
  if (typeof input.sessionId !== 'string' || !UUID.test(input.sessionId)) throw new ValidationError('Invalid session.');
  if (input.caseId !== null && (typeof input.caseId !== 'string' || !UUID.test(input.caseId))) throw new ValidationError('Invalid case.');

  const iban = (optionalString(input.iban, 50) || '').replace(/\s+/g, '').toUpperCase();
  const firstPayDate = (optionalString(input.firstPayDate, 10) || '').trim();
  if (!iban) throw new ValidationError('Enter the new IBAN.');
  if (!isValidIban(iban)) throw new ValidationError('The IBAN is not valid.');
  const current = withSchedule(employee, changes);
  if (iban === employee.iban || (current.scheduledChange && iban === current.scheduledChange.iban)) {
    throw new ValidationError('This IBAN is already on file for this employee.');
  }
  if (!firstPayDate) throw new ValidationError('Enter the first pay date.');
  if (!isValidDate(firstPayDate)) throw new ValidationError('The first pay date is not a valid date.');

  return {
    job_id: crypto.randomUUID(),
    submitted_at: new Date().toISOString(),
    workflow: 'bank-account-change',
    session_id: input.sessionId,
    case_id: input.caseId,
    submitted_by: { id: user.id, name: user.name },
    role: user.role,
    employee: { id: employee.id, name: `${employee.firstName} ${employee.lastName}` },
    official_fields: {
      employee_name: { status: 'filled', value: `${employee.firstName} ${employee.lastName}` },
      employee_number: { status: 'filled', value: employee.id },
      new_iban: { status: 'filled', value: iban },
      first_pay_date: { status: 'filled', value: firstPayDate },
    },
    previous_iban: current.scheduledChange ? current.scheduledChange.iban : employee.iban,
    proof_attached: cleanFileMeta(input.proof),
  };
}

// ---------- http ----------

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}

function readJsonBody(req, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new ValidationError('Request body too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new ValidationError('Request body is not valid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

// JSON-only + same-origin check blocks cross-site posts.
function refusePost(req) {
  if (!(req.headers['content-type'] || '').startsWith('application/json')) return [415, 'Expected application/json.'];
  const origin = req.headers.origin;
  if (origin && origin !== `http://${req.headers.host}`) return [403, 'Cross-origin request refused.'];
  return null;
}

async function handle(req, res) {
  const { pathname } = new URL(req.url, `http://${HOST}`);

  if (req.method === 'GET' && Object.hasOwn(STATIC_FILES, pathname)) {
    const { file, type } = STATIC_FILES[pathname];
    return send(res, 200, await fs.readFile(path.join(__dirname, 'public', file)), type);
  }

  if (req.method === 'GET' && pathname === '/api/bootstrap') {
    const users = Object.entries(USERS).map(([id, u]) => ({ id, name: u.name, role: u.role }));
    return send(res, 200, { company, users });
  }

  if (req.method === 'GET' && pathname === '/api/employees') {
    const changes = scheduledChanges(await readSubmissions());
    return send(res, 200, employees.map((e) => withSchedule(e, changes)));
  }

  const match = pathname.match(/^\/api\/employees\/([A-Z]-\d{5})$/);
  if (req.method === 'GET' && match) {
    const employee = EMPLOYEES.get(match[1]);
    if (!employee) return send(res, 404, { error: 'Unknown employee.' });
    const changes = scheduledChanges(await readSubmissions());
    const manager = employee.managerId ? EMPLOYEES.get(employee.managerId) : null;
    return send(res, 200, {
      ...withSchedule(employee, changes),
      manager: manager ? { id: manager.id, name: `${manager.firstName} ${manager.lastName}`, phone: manager.phone } : null,
    });
  }

  if (req.method === 'POST' && pathname === '/api/recordings') {
    const refused = refusePost(req);
    if (refused) return send(res, refused[0], { error: refused[1] });
    try {
      return send(res, 201, { path: await writeRecording(await readJsonBody(req, MAX_RECORDING_BYTES)) });
    } catch (err) {
      if (err instanceof ValidationError) return send(res, 400, { error: err.message });
      throw err;
    }
  }

  if (req.method === 'POST' && (pathname === '/api/events' || pathname === '/api/submissions')) {
    const refused = refusePost(req);
    if (refused) return send(res, refused[0], { error: refused[1] });
    try {
      const body = await readJsonBody(req);
      if (pathname === '/api/events') {
        if (!isPlainObject(body) || typeof body.sessionId !== 'string' || !UUID.test(body.sessionId)) throw new ValidationError('Invalid session.');
        if (!Array.isArray(body.events) || body.events.length === 0 || body.events.length > MAX_EVENTS_PER_BATCH) throw new ValidationError('Invalid events.');
        const receivedAt = new Date().toISOString();
        await appendEvents(body.sessionId, body.events.map((e) => cleanEvent(e, body.sessionId, receivedAt)));
        return send(res, 202, { stored: body.events.length });
      }
      const record = buildSubmission(body, scheduledChanges(await readSubmissions()));
      await writeSubmission(record);
      return send(res, 201, { job: record });
    } catch (err) {
      if (err instanceof ValidationError) return send(res, 400, { error: err.message });
      throw err;
    }
  }

  send(res, 404, { error: 'Not found.' });
}

http
  .createServer((req, res) => {
    handle(req, res).catch((err) => {
      console.error(err);
      if (!res.headersSent) send(res, 500, { error: 'Internal error.' });
    });
  })
  .listen(PORT, HOST, () => console.log(`Payroll workspace on http://${HOST}:${PORT}`));
