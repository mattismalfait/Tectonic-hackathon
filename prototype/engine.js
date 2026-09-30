/* ourSDbrain prototype: scoring engine.
   JavaScript port of app/src/engine.ts (same signals, weights, rules and thresholds).
   If the engine in app/src changes, update this file too. */

const DATA = window.OURSDBRAIN_DATA[PROCESS_ID];
if (!DATA) throw new Error(`No data for "${PROCESS_ID}". Run: node prototype/build-data.mjs ${PROCESS_ID}`);

const TODAY = new Date('2026-09-30');
const DEFAULT_W = { designated: 1, approved: 1, recent: 1, reviewed: 1, ownerActive: 1 };
let W = { ...DEFAULT_W };
const resolutions = {};
const SRC = Object.fromEntries(DATA.sources.map(s => [s.id, s]));
const COUNTRY = DATA.process.client.country;
const months = d => (TODAY - new Date(d)) / (864e5 * 30.44);

function signals(s, step) {
  const age = Math.max(0, months(s.date));
  const rd = s.last_reviewed || (['doc', 'business_app', 'decision'].includes(s.type) ? s.date : null);
  const designated = ['doc', 'business_app', 'decision'].includes(s.type) ? 1
    : s.type === 'person' && s.author_role.trim().toLowerCase() === step.step_owner_role.trim().toLowerCase() ? 1 : 0;
  return {
    designated,
    approved: s.approval_status === 'approved' ? 1 : 0,
    recent: Math.max(0, 1 - age / 36),
    reviewed: rd && months(rd) <= 12 ? 1 : 0,
    ownerActive: s.owner_status === 'active' ? 1 : s.owner_status === 'moved' ? .5 : 0,
  };
}
function weightOf(sig, w) { const k = Object.keys(w), t = k.reduce((a, x) => a + w[x], 0); return t ? k.reduce((a, x) => a + w[x] * sig[x], 0) / t : 0; }
const bandOf = s => { const r = Math.round(s * 100); return r >= 75 ? 'green' : r >= 50 ? 'amber' : 'red'; };

function scoreStep(step, w = W, res = resolutions[step.id]) {
  const ev = DATA.claims.filter(c => c.step_id === step.id).map(c => { const s = SRC[c.source_id]; const g = signals(s, step); return { c, s, g, w: weightOf(g, w), status: 'supports' }; });
  for (const e of ev) {
    if (e.s.country !== COUNTRY) { e.status = 'excluded'; e.reason = `About another country (${e.s.country})`; }
    else if (e.s.origin && SRC[e.s.origin]) e.echo = SRC[e.s.origin];
  }
  if (res) {
    const s = { id: 'decision', title: 'Decision by the quality manager', type: 'decision', system: 'ourSDbrain', author_role: 'Quality manager', owner_status: 'active', approval_status: 'approved', date: '2026-09-30', country: COUNTRY, origin: null };
    const g = signals(s, step);
    ev.push({ c: { value: res, quote: 'Decided by the quality manager.' }, s, g, w: weightOf(g, w), status: 'supports' });
    for (const e of ev) if (e.status !== 'excluded' && e.c.value !== res) { e.status = 'overruled'; e.reason = 'Overruled by the decision'; }
  }
  const counted = ev.filter(e => e.status === 'supports');
  if (!counted.length) return { step, score: 0, band: 'gap', groups: [], ev, agreement: 0, strength: 0, contested: false, undocumented: true };
  const gm = new Map();
  for (const e of counted) { const g = gm.get(e.c.value) || { value: e.c.value, weight: 0, ev: [] }; g.weight += e.w; g.ev.push(e); gm.set(e.c.value, g); }
  const groups = [...gm.values()].sort((a, b) => b.weight - a.weight);
  const lead = groups[0], total = groups.reduce((a, g) => a + g.weight, 0);
  for (const e of counted) e.status = e.c.value === lead.value ? 'supports' : 'contradicts';
  const agreement = total ? lead.weight / total : 0;
  const sup = [...lead.ev].sort((a, b) => b.w - a.w), others = sup.slice(1);
  const ind = others.filter(e => !e.echo).length, ech = others.length - ind;
  const strength = Math.min(1, sup[0].w + .1 * ind + .05 * ech);
  const raw = agreement * strength; let score = raw;
  const runner = groups[1];
  const contested = !!runner && runner.weight >= .5 * lead.weight;
  if (contested) score = Math.min(score, .45);
  const undocumented = !lead.ev.some(e => (e.s.type === 'doc' && e.s.approval_status === 'approved') || e.s.type === 'business_app' || e.s.type === 'decision');
  if (undocumented) score = Math.min(score, .7);
  return { step, score, raw, band: bandOf(score), groups, lead, runner, total, ev, agreement, strength, top: sup[0], ind, ech, contested, undocumented, res };
}
function scoreProcess(w = W) {
  const steps = [...DATA.process.steps].sort((a, b) => a.order - b.order).map(s => scoreStep(s, w));
  const tc = steps.reduce((a, r) => a + r.step.criticality, 0);
  const score = steps.reduce((a, r) => a + r.score * r.step.criticality, 0) / tc;
  const critRed = steps.some(r => r.step.criticality >= 3 && (r.band === 'red' || r.band === 'gap'));
  const status = critRed ? 'Not release-ready' : steps.some(r => r.band !== 'green') ? 'Needs attention' : 'Trusted';
  return { score, status, steps };
}

