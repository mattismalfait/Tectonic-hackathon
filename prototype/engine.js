/* ourSDbrain prototype: scoring.
   Thin adapter around the real engine (app/src/engine, bundled as engine.bundle.js -> window.SDEngine).
   No scoring logic lives here: it only feeds the data in and reshapes the result for app.js.
   Rebuild the bundle and the data after engine or data changes: cd app && npm run build:prototype */

if (!window.SDEngine) throw new Error('engine.bundle.js is missing. Run: cd app && npm run build:prototype');
const E = window.SDEngine;

const TODAY = new Date('2026-09-30');
const DEFAULT_W = { ...E.DEFAULT_WEIGHTS };
let W = { ...DEFAULT_W };
/** QM decisions per step of the shown process: stepId -> chosen value. */
const resolutions = {};

/** Engine dataset per process: master SOP + hand-made claims, with the matcher's results folded in. */
function datasetOf(id) {
  const raw = window.OURSDBRAIN_DATA[id];
  if (!raw) throw new Error(`No data for "${id}". Run: node prototype/build-data.mjs ${id}`);
  const data = { process: raw.process, sources: raw.sources, claims: raw.claims, master: raw.master || undefined };
  return E.withMatcherResults(data, raw.sops || []);
}

const DATA = datasetOf(PROCESS_ID);
const SRC = Object.fromEntries(DATA.sources.map(s => [s.id, s]));
const MASTER = DATA.master;

const toResolution = (stepId, value) => ({ stepId, value, rationale: 'Decided by the quality manager.', decidedBy: 'Quality manager', date: TODAY.toISOString().slice(0, 10) });

/* Engine evidence -> the shape app.js reads: c = claim, s = source, g = signals, w = weight, eff = counted weight. */
function toEv(e) {
  return {
    c: e.claim, s: e.source, g: e.signals, w: e.weight,
    eff: e.echoOf ? e.weight * 0.5 : e.weight,
    status: e.status, reason: e.excludedReason,
    echo: e.echoOf ? SRC[e.source.origin] : null,
  };
}
function toStep(r) {
  const ev = r.evidence.map(toEv);
  const byEv = new Map(r.evidence.map((e, i) => [e, ev[i]]));
  const groups = r.groups.map(g => ({ value: g.value, weight: g.weight, ev: g.evidence.map(e => byEv.get(e)) }));
  return {
    step: r.step, score: r.score, band: r.band, ev, groups,
    lead: groups[0], runner: groups[1],
    contested: r.contested, undocumented: r.undocumented,
    res: r.resolution ? r.resolution.value : undefined,
    x: r.explanation, // master comparison: headline, categories, crossChecks, calculation
  };
}

function resolutionsOf(res) { return Object.fromEntries(Object.entries(res).map(([k, v]) => [k, toResolution(k, v)])); }

function scoreProcess(w = W) {
  const p = E.scoreProcess(DATA, w, TODAY, resolutionsOf(resolutions));
  return { score: p.score, status: p.status, steps: p.steps.map(toStep), actions: p.actions };
}
function scoreStep(step, w = W) { return scoreProcess(w).steps.find(r => r.step.id === step.id); }

/** Live summary of every other process in /data, for the home screen and the dropdown. */
function otherProcedures(w = W) {
  return Object.keys(window.OURSDBRAIN_DATA).filter(id => id !== PROCESS_ID).map(id => {
    const d = datasetOf(id);
    const p = E.scoreProcess(d, w, TODAY);
    const decide = p.steps.filter(r => r.contested);
    return {
      name: d.process.name, steps: d.process.steps.length, sources: d.sources.length,
      score: p.score, status: p.status, decisions: decide.length,
      checks: p.steps.filter(r => r.band === 'amber' && !r.contested).length,
      attention: decide.map(r => ({
        t: `Decide: ${r.groups[0].value} or ${r.groups[1].value}?`,
        m: `${d.process.name} · step ${r.step.order} · ${r.step.step_owner_role}`,
        score: r.score,
      })),
    };
  });
}
