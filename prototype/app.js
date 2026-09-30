// All HTML goes through safeHTML: parsed in an inert document, stripped of scripts, event-handler
// attributes and javascript: URLs, then inserted as nodes. Never assign innerHTML directly.
const BLOCKED_TAGS = 'script,iframe,object,embed,link,meta,base,frame,frameset'
Object.defineProperty(Element.prototype, 'safeHTML', {
  set(html) {
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
    doc.body.querySelectorAll(BLOCKED_TAGS).forEach(n => n.remove())
    doc.body.querySelectorAll('*').forEach(el => {
      for (const a of [...el.attributes]) {
        const v = a.value.trim().toLowerCase()
        if (a.name.startsWith('on') || ((a.name === 'href' || a.name === 'src' || a.name === 'xlink:href') && v.startsWith('javascript:'))) el.removeAttribute(a.name)
      }
    })
    this.replaceChildren(...doc.body.childNodes)
  },
})
/* ourSDbrain prototype: screens, navigation and interactions. Needs content.js, data/*.js and engine.js first. */

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const pct = x => Math.round(x * 100) + '%';
const COL = { green: '#1F9D55', amber: '#FFBE00', red: '#F1002F', gap: '#F1002F' };
const TXT = { green: '#1F9D55', amber: '#8A5A00', red: '#B3001F', gap: '#B3001F' };
const TYPES = [['doc', 'Docs'], ['business_app', 'SAP'], ['chat', 'Chat'], ['email', 'Email'], ['person', 'People']];
const TYPE_LABEL = { doc: 'Doc', business_app: 'SAP', chat: 'Chat', email: 'Email', person: 'People', decision: 'Decision' };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmt = d => { const x = new Date(d); return MON[x.getUTCMonth()] + ' ' + x.getUTCFullYear(); };
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function ring(p, band, size = 26, stroke = 4) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  if (band === 'gap') return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#F1002F" stroke-width="1.5" stroke-dasharray="3 2"/></svg>`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform:rotate(-90deg);flex:none"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#E6E7E9" stroke-width="${stroke}"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${COL[band]}" stroke-width="${stroke}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}" style="transition:stroke-dashoffset .9s var(--ease),stroke .5s"/></svg>`;
}
const bandLabel = r => r.res ? 'Decided' : r.band === 'gap' ? 'Knowledge gap' : r.contested ? 'Needs a human' : r.band === 'green' ? 'Trusted' : r.band === 'amber' ? 'Check' : 'Needs a human';
const srcName = s => s.type === 'chat' ? s.title.replace(/\s*\(\d{4}-\d\d-\d\d\)/, '') : s.title.replace(/:.*$/, '').replace('StarGaze screen recording', 'StarGaze recording');
const srcMeta = s => [s.system, fmt(s.date), s.approval_status === 'approved' ? 'approved' : null, s.owner_status === 'left' ? 'owner left' : s.owner_status === 'moved' ? 'owner moved' : null].filter(Boolean).join(' Â· ');
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 2800); }

/* reference per step = the master SOP's value, or the QM decision */
const officialValue = step => resolutions[step.id] || ((MASTER && MASTER.steps.find(m => m.step_id === step.id)) || {}).value;
/* sources that count for a step (not excluded, not overruled, not the decision itself) */
const countedEv = r => r.ev.filter(e => (e.status === 'supports' || e.status === 'contradicts') && e.s.type !== 'decision');

/* ---------- router ---------- */
let current = null, alertShown = false;
function go(h) { if (location.hash === h) render(); else location.hash = h; }
document.addEventListener('click', e => {
  const g = e.target.closest('[data-go]'); if (g) { e.preventDefault(); go(g.dataset.go); }
  const b = e.target.closest('[data-back]'); if (b) { e.preventDefault(); history.length > 1 ? history.back() : go('#/procedure'); }
});
window.addEventListener('hashchange', render);
function render() {
  const [, view = 'home', arg] = (location.hash || '#/home').split('/');
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('on', v.id === 'v-' + view));
  document.querySelectorAll('nav a').forEach(a => a.classList.toggle('active', a.dataset.nav === (view === 'why' ? 'procedure' : view)));
  if (view !== 'home') closeAlert();
  if (view === 'home') renderHome();
  if (view === 'procedure') renderProcedure(arg);
  if (view === 'why') renderWhy(arg);
  if (view === 'model') renderModel();
  if (view !== 'procedure' || !arg) window.scrollTo({ top: 0, behavior: 'instant' });
  current = view;
}

/* ---------- home ---------- */
function renderHome() {
  const p = scoreProcess(), OTHER_PROCEDURES = otherProcedures();
  const open = p.steps.filter(r => r.contested && !r.res);
  const sum = k => OTHER_PROCEDURES.reduce((a, o) => a + o[k], 0);
  const total = OTHER_PROCEDURES.length + 1;
  $('#kDecisions').textContent = open.length + sum('decisions');
  const check = p.steps.filter(r => r.band === 'amber' && !r.contested).length;
  $('#kCheck').textContent = check + sum('checks');
  $('#kProcs').textContent = total;
  $('#kReady').textContent = (p.status === 'Not release-ready' ? 0 : 1) + OTHER_PROCEDURES.filter(o => o.status !== 'Not release-ready').length + ' of ' + total;
  const items = [
    ...open.map(r => ({ go: '#/procedure/' + r.step.id, band: 'red', t: 'Decide: ' + stepQuestion(r), m: `${DATA.process.name} Â· step ${r.step.order} Â· ${r.step.step_owner_role}`, score: r.score, isNew: r.step.id === 'step-4' })),
    ...OTHER_PROCEDURES.flatMap(o => o.attention.map(a => ({ demo: 1, band: a.score >= .75 ? 'green' : a.score >= .5 ? 'amber' : 'red', ...a }))),
    ...p.steps.filter(r => r.band === 'amber' && !r.contested).map(r => ({ go: '#/procedure/' + r.step.id, band: 'amber', t: 'Check: ' + r.step.name.toLowerCase(), m: `${DATA.process.name} Â· step ${r.step.order}`, score: r.score })),
  ].sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0));
  $('#attention').safeHTML = items.map(i => `
    <div class="item" ${i.go ? `data-go="${i.go}"` : 'data-demo="1"'} id="${i.isNew ? 'newItem' : ''}">
      <div><div class="t">${esc(i.t)}${i.isNew ? '<span class="new">NEW</span>' : ''}</div><div class="m">${esc(i.m)}</div></div>
      <span class="trust">${ring(i.score, i.band)}<b style="color:${TXT[i.band]}">${pct(i.score)}</b></span>
      <svg class="chev" viewBox="0 0 16 16" fill="none" stroke="#6B7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(-90deg)"><path d="M3 6l5 5 5-5"/></svg>
    </div>`).join('') || '<div class="note">Nothing needs you right now.</div>';
  const band = p.status === 'Trusted' ? 'green' : p.status === 'Needs attention' ? 'amber' : 'red';
  $('#procList').safeHTML = `
    <div class="proc" data-go="#/procedure"><div class="top"><div><div class="t">${esc(DATA.process.name)}</div><div class="m">${p.status} Â· ${open.length} decision${open.length === 1 ? '' : 's'} open</div></div><strong style="color:${TXT[band]}">${pct(p.score)}</strong></div><div class="bar"><i style="width:${p.score * 100}%;background:${COL[band]}"></i></div></div>
  ` + OTHER_PROCEDURES.map(o => { const b = o.score >= .75 ? 'green' : o.score >= .5 ? 'amber' : 'red'; return `
    <div class="proc" data-demo="1"><div class="top"><div><div class="t">${esc(o.name)}</div><div class="m">${o.status} Â· ${o.decisions} decision${o.decisions === 1 ? '' : 's'} open</div></div><strong style="color:${TXT[b]}">${pct(o.score)}</strong></div><div class="bar"><i style="width:${o.score * 100}%;background:${COL[b]}"></i></div></div>`; }).join('');
  if (!alertShown) { alertShown = true; setTimeout(() => current === 'home' && playAlert(), 1100); }
}
function stepQuestion(r) {
  if (!r.runner) return r.step.name;
  const short = v => v.replace('only via the MyPayslip self-service portal', 'portal only').replace('by email via client HR', 'email via client HR').replace('released only after a second consultant approves (four-eyes)', 'four-eyes approval').replace('active as soon as the consultant saves it', 'active once saved');
  return `${short(officialValue(r.step))} or ${short(r.runner.value)}?`;
}
document.addEventListener('click', e => { if (e.target.closest('[data-demo]')) toast('In this prototype only the bank account procedure is worked out.'); });

/* ---------- procedure ---------- */
let openStep = 'step-4';
function renderPicker(p, band) {
  const OTHER_PROCEDURES = otherProcedures();
  $('#picker .pn').textContent = DATA.process.name;
  $('#ctxline').safeHTML = `<span>Client: ${esc(DATA.process.client.name)}</span><span>${esc({ BE: 'Belgium', NL: 'Netherlands' }[DATA.process.client.country] || DATA.process.client.country)}${DATA.process.client.joint_committee ? ' Â· PC ' + esc(DATA.process.client.joint_committee) : ''}</span>` + (MASTER ? `<span>Master SOP v${esc(MASTER.version)} Â· ${esc(MASTER.owner_role)} Â· ${fmt(MASTER.date)}</span>` : '');
  const opts = [{ name: DATA.process.name, steps: DATA.process.steps.length, sources: DATA.sources.length, score: p.score, band, cur: true }]
    .concat(OTHER_PROCEDURES.map(o => ({ ...o, band: o.score >= .75 ? 'green' : o.score >= .5 ? 'amber' : 'red' })));
  $('#options').safeHTML = opts.map(o => `<div class="opt ${o.cur ? 'cur' : ''}" data-name="${esc(o.name.toLowerCase())}" ${o.cur ? '' : 'data-demo="1"'}><div><div class="on">${esc(o.name)}</div><div class="om">${o.steps} steps Â· ${o.sources} sources</div></div><span class="pill ${o.band}">${pct(o.score)}</span></div>`).join('');
}
function renderProcedure(arg) {
  if (arg) openStep = arg;
  const p = scoreProcess();
  const band = p.status === 'Trusted' ? 'green' : p.status === 'Needs attention' ? 'amber' : 'red';
  $('#pRing').safeHTML = ring(p.score, band, 72, 9);
  $('#pScore').textContent = pct(p.score); $('#pScore').style.color = TXT[band];
  $('#pStatus').textContent = 'Procedure trust score Â· ' + p.status.toLowerCase();
  $('#pickerPill').className = 'pill ' + band; $('#pickerPill').textContent = pct(p.score) + ' Â· ' + p.status.toLowerCase();
  renderPicker(p, band);
  $('#sDecide').textContent = p.steps.filter(r => r.contested && !r.res).length;
  $('#sCheck').textContent = p.steps.filter(r => r.band === 'amber' && !r.contested).length;
  $('#sOk').textContent = p.steps.filter(r => r.band === 'green').length;

  const only = $('#onlyDev').getAttribute('aria-pressed') === 'true';
  let html = `<div class="gh first">Step</div>${TYPES.map(([t, l]) => `<div class="gh c">${l}${t === 'person' ? '<small>StarGaze</small>' : ''}</div>`).join('')}<div class="gh">Trust</div><div class="gh"></div>`;
  for (const r of p.steps) {
    const ref = officialValue(r.step);
    const counted = countedEv(r);
    const cells = TYPES.map(([t]) => {
      const es = counted.filter(e => e.s.type === t);
      if (!es.length) return '<span class="dot none" title="No source">â€“</span>';
      const same = es.filter(e => e.status === 'supports').length;
      const k = same === es.length ? 'same' : same === 0 ? 'diff' : 'mixed';
      return `<span class="dot ${k}" title="${same} confirm the master, ${es.length - same} differ">${k === 'same' ? 'âœ“' : k === 'diff' ? 'âœ•' : ''}</span>`;
    });
    const b = r.res ? 'green' : r.band;
    const dev = !r.res && (r.band !== 'green');
    if (only && !dev) continue;
    const isOpen = openStep === r.step.id;
    html += `<div class="srow ${b === 'green' ? '' : b} ${isOpen ? 'open' : ''}" data-step="${r.step.id}" style="display:contents">
      <div class="cell first"><div class="sn"><span class="num">${r.step.order}</span><div><div class="t">${esc(r.step.name)}</div><div class="d">Criticality ${r.step.criticality} of 3</div></div></div></div>
      ${cells.map(c => `<div class="cell c">${c}</div>`).join('')}
      <div class="cell"><span class="trust">${ring(r.score, b)}<b style="color:${TXT[b]}">${pct(r.score)}</b><span class="pill ${b}">${bandLabel(r)}</span></span></div>
      <div class="cell c"><svg class="chev" viewBox="0 0 16 16" fill="none" stroke="#6B7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6l5 5 5-5"/></svg></div>
    </div>${detailHTML(r, ref)}`;
  }
  $('#grid').safeHTML = html;
  $('#grid').querySelectorAll('.srow').forEach(row => {
    row.querySelectorAll('.cell').forEach(c => c.addEventListener('click', () => {
      openStep = openStep === row.dataset.step ? null : row.dataset.step;
      $('#grid').querySelectorAll('.srow').forEach(x => x.classList.toggle('open', x.dataset.step === openStep));
    }));
  });
  $('#grid').querySelectorAll('.decide').forEach(b => b.addEventListener('click', () => b.closest('.detail').querySelector('.choice').classList.add('on')));
  $('#grid').querySelectorAll('.pick').forEach(b => b.addEventListener('click', () => decide(b.dataset.step, b.dataset.v)));
  $('#grid').querySelectorAll('.ask').forEach(b => b.addEventListener('click', () => toast('Question sent to the step owner.')));
  $('#grid').querySelectorAll('.remind').forEach(b => b.addEventListener('click', () => toast('Reminder sent to the payroll team.')));
  $('#grid').querySelectorAll('.opensrc').forEach(b => b.addEventListener('click', e => { e.preventDefault(); toast('Opens the original sources (simulated in this prototype).'); }));
  if (arg) setTimeout(() => { const el = $(`#grid .srow[data-step="${arg}"] .cell`); if (el) window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - 90, behavior: 'smooth' }); }, 60);
}

function detailHTML(r, ref) {
  const counted = countedEv(r);
  const refEv = counted.filter(e => e.status === 'supports');
  const others = (r.groups || []).slice(1);
  const otherVals = others.map(g => g.value);
  const li = es => es.map(e => `<li><span class="ty">${TYPE_LABEL[e.s.type]}</span><span>${esc(srcName(e.s))}</span><span class="me">${fmt(e.s.date)}${e.s.owner_status === 'left' ? ' Â· owner left' : e.s.owner_status === 'moved' ? ' Â· moved' : ''}</span></li>`).join('');
  const refLabel = r.res ? 'Decided by the quality manager' : otherVals.length ? 'Master SOP says' : 'Master SOP Â· all sources confirm';
  let html = `<div class="detail"><div class="compare ${otherVals.length ? '' : 'one'}">
    <div class="side"><div class="k">${refLabel}</div><div class="v">${esc(cap(ref || 'â€“'))}</div><ul>${li(refEv)}</ul></div>
    ${others.map(g => `<div class="side b"><div class="k">Differs from the master</div><div class="v">${esc(cap(g.value))}</div><ul>${li(g.ev)}</ul></div>`).join('')}
  </div>`;
  const ex = r.ev.filter(e => e.status === 'excluded' || e.status === 'overruled'), echoes = counted.filter(e => e.echo);
  const mismatch = r.x ? r.x.crossChecks.filter(c => !c.match) : [];
  if (ex.length || echoes.length || mismatch.length) html += `<div class="excl">${mismatch.map(c => esc(c.sentence)).join(' ')} ${ex.map(e => `Not counted: ${esc(srcName(e.s))} (${esc(e.reason || '')}).`).join(' ')} ${echoes.map(e => `${esc(srcName(e.s))} repeats ${esc(srcName(e.echo))}, so it counts for half.`).join(' ')}</div>`;
  const ctx = CONTEXT[r.step.id] || {};
  if (r.res) {
    const nx = ctx.next ? (ctx.next[r.res] || ctx.next['*']) : 'Next: update the sources that say otherwise.';
    html += `<div class="done">âœ“ Decided: â€œ${esc(cap(r.res))}â€. ${esc(nx)}</div>`;
  } else if (r.contested) {
    const opts = r.groups.slice(0, 2).map(g => g.value);
    html += `<div class="todo"><p><small>What to do</small>${esc(ctx.todo || 'Sources differ from the master SOP. Decide which value is right: confirm the master or change it.')}</p>
      <button class="btn white decide">Decide</button><button class="btn ghost ask">Ask the owner</button>
      <div class="choice"><span>Which one is right?</span>${opts.map(o => `<button class="btn pick" data-step="${r.step.id}" data-v="${esc(o)}">${esc(cap(o))}</button>`).join('')}</div></div>`;
  } else if (r.band === 'amber' || (ctx.todo && otherVals.length)) {
    html += `<div class="todo"><p><small>What to do</small>${esc(ctx.todo || (r.x && r.x.calculation.cap ? r.x.calculation.cap.reason : 'Some sources differ from the master: update or retire them.'))}</p><button class="btn white remind">Send reminder</button></div>`;
  }
  html += `<div class="links"><a data-go="#/why/${r.step.id}">Why ${pct(r.score)}? See how this score is built â†’</a><a href="#" class="opensrc">Open the sources â†—</a></div></div>`;
  return html;
}

function decide(stepId, value) {
  const before = scoreProcess().score, y = window.scrollY;
  resolutions[stepId] = value;
  const after = scoreProcess();
  renderProcedure();
  window.scrollTo({ top: y, behavior: 'instant' });
  const el = $('#pScore'); let x = Math.round(before * 100); const to = Math.round(after.score * 100);
  const t = setInterval(() => { x += x < to ? 1 : -1; el.textContent = x + '%'; if (x === to) clearInterval(t); }, 40);
  const left = after.steps.filter(r => r.contested && !r.res).length;
  toast(left ? `Decision saved as a trusted source. ${left} more step${left === 1 ? '' : 's'} to decide.` : `Both decisions saved. The procedure is now ${pct(after.score)}: ${after.status.toLowerCase()}.`);
}

$('#onlyDev').addEventListener('click', e => { const b = e.currentTarget; b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'); renderProcedure(); });
const picker = $('#picker'), pbtn = $('#pickerBtn');
pbtn.addEventListener('click', e => { e.stopPropagation(); const o = !picker.classList.contains('open'); picker.classList.toggle('open', o); pbtn.setAttribute('aria-expanded', o); if (o) $('#pq').focus(); });
document.addEventListener('click', e => { if (!picker.contains(e.target)) { picker.classList.remove('open'); pbtn.setAttribute('aria-expanded', false); } });
$('#pq').addEventListener('input', e => { const v = e.target.value.toLowerCase(); picker.querySelectorAll('.opt').forEach(o => o.style.display = o.dataset.name.includes(v) ? '' : 'none'); });
$('#options').addEventListener('click', e => { if (e.target.closest('.opt')) { picker.classList.remove('open'); pbtn.setAttribute('aria-expanded', false); } });

/* ---------- why this score ---------- */
function renderWhy(stepId) {
  const step = DATA.process.steps.find(s => s.id === stepId) || DATA.process.steps[3];
  const r = scoreStep(step);
  const b = r.res ? 'green' : r.band;
  const f2 = x => x.toFixed(2);
  const calc = r.x.calculation, capped = calc.cap;
  const sentence = r.res
    ? `The quality manager decided â€œ${r.res}â€. That decision is now the reference for this step; sources that say otherwise are listed but no longer counted.`
    : r.x.headline;
  const rule = capped ? { v: 'â‰¤ ' + pct(capped.value), p: capped.reason } : { v: 'None', p: 'Enough strong sources, and a doc or SAP covers the step.' };
  const sigCell = (k, v) => k === 'recent' || (k === 'ownerActive' && v > 0 && v < 1) ? `<span class="part">${pct(v)}</span>` : v ? '<span class="yes">âœ“</span>' : '<span class="no">âœ•</span>';
  const off = e => e.status === 'excluded' || e.status === 'overruled';
  const evRow = e => `
    <div class="src ${off(e) ? 'dim' : ''}"><div class="n">${TYPE_LABEL[e.s.type]} Â· ${esc(srcName(e.s))}</div><div class="m">${esc(srcMeta(e.s))}${e.echo ? ' Â· repeats ' + esc(srcName(e.echo)) + ', counts for half' : ''}${e.reason ? ' Â· ' + esc(e.reason) : ''}</div><q>${esc(e.c.quote)}</q></div>
    ${['designated', 'approved', 'recent', 'reviewed', 'ownerActive'].map(k => `<div class="sg ${off(e) ? 'dim' : ''}">${sigCell(k, e.g[k])}</div>`).join('')}
    <div class="wcell ${off(e) ? 'dim' : ''}"><div class="wbar"><b>${f2(e.eff)}</b><div class="bar"><i style="width:${e.eff * 100}%;background:${e.status === 'contradicts' ? COL.red : e.status === 'supports' ? COL.green : '#B9BCC0'}"></i></div></div></div>`;
  let rows = '';
  (r.groups || []).forEach((g, i) => {
    rows += `<div class="grp ${i === 0 ? 'lead' : 'other'}">${i === 0 ? (r.res ? 'âœ“ Decided' : 'âœ“ Confirms the master') : 'âœ• Differs'}: â€œ${esc(cap(g.value))}â€ <span class="w">weight ${f2(g.weight)}</span></div>` + [...g.ev].sort((a, b) => b.eff - a.eff).map(evRow).join('');
  });
  const notCounted = r.ev.filter(off);
  if (notCounted.length) rows += `<div class="grp off">Not counted</div>` + notCounted.map(evRow).join('');
  const cats = Object.values(r.x.categories);

  $('#whyPage').safeHTML = `
    <button class="back" data-go="#/procedure/${step.id}">â†  ${esc(DATA.process.name)}</button>
    <div class="headrow">${ring(r.score, b, 84, 11)}<div><div class="muted" style="font-size:14px;font-weight:600">Step ${step.order} of ${DATA.process.steps.length} Â· why this score</div><h1 style="margin-top:4px">${esc(step.name)}: ${pct(r.score)}</h1><span class="pill ${b}">${bandLabel(r)}</span></div></div>
    <p class="lead">${esc(sentence)}</p>
    <p class="muted" style="margin:0 0 18px">Master SOP: â€œ${esc(r.x.master.value)}â€${r.x.master.statement ? ' Â· ' + esc(r.x.master.statement) : ''}</p>
    ${r.band === 'gap' ? '' : `<div class="calc">
      <div class="box"><div class="k">Confirms the master</div><div class="v">${f2(calc.weightConfirming)}</div><p>Summed weight of the sources that say what the master says.</p></div><div class="op">Ã·</div>
      <div class="box"><div class="k">All counted sources</div><div class="v">${f2(calc.weightTotal)}</div><p>Confirming ${f2(calc.weightConfirming)} + differing ${f2(calc.weightDiffering)}. A repeat counts for half.</p></div><div class="op">â†’</div>
      <div class="box"><div class="k">Rule applied</div><div class="v">${rule.v}</div><p>${esc(rule.p)} Conformance ${pct(calc.conformance)}.</p></div><div class="op">=</div>
      <div class="box final ${b}"><div class="k">Trust score</div><div class="v">${pct(r.score)}</div><p>${bandLabel(r)}. Bands: 75% trusted, 50% check.</p></div>
    </div>`}
    <section class="card" style="margin-bottom:20px">
      <div class="card-h"><h2>Per source type, compared to the master</h2></div>
      <div class="rules">
        ${cats.map(c => `<div class="rule"><b>${esc(c.label)}</b><div>${esc(c.summary)}</div></div>`).join('')}
        ${r.x.crossChecks.length ? `<div class="rule"><b>Cross-checks</b><div>${r.x.crossChecks.map(c => (c.match ? 'âœ“ ' : 'âœ• ') + esc(c.sentence)).join('<br>')}</div></div>` : ''}
      </div>
    </section>
    <section class="card evtable">
      <div class="card-h"><h2>Every source, and why it weighs what it weighs</h2><div class="muted">Five objective signals per source. Equal weights (20% each) unless the quality manager changes them in the <a data-go="#/model">score model</a>.</div></div>
      <div class="ev"><div class="h">Source Â· what it says</div><div class="h">Designated</div><div class="h">Approved</div><div class="h">Recent</div><div class="h">Reviewed</div><div class="h">Owner active</div><div class="h">Weight</div>${rows}</div>
    </section>
    <div class="links" style="margin-top:20px"><a data-go="#/procedure/${step.id}">â† Back to the step</a><a data-go="#/model">How does the scoring model work? â†’</a></div>`;
}

/* ---------- score model ---------- */
const SIGNALS = [
  ['designated', 'Designated source', 'Is it <em>the</em> registered source for this step: a controlled document, the system of record, or the person responsible for the step?'],
  ['approved', 'Formally approved', 'Does it have a formal approval status?'],
  ['recent', 'Recent', 'Loses value over 36 months: <em>1 âˆ’ months since last change Ã· 36</em>.'],
  ['reviewed', 'Reviewed', 'Reviewed or verified in the last 12 months?'],
  ['ownerActive', 'Owner active', 'Is the owner still employed and in this role? Moved counts as half.'],
];
function renderModel() {
  const tot = Object.values(W).reduce((a, b) => a + b, 0) || 1;
  $('#sigRows').safeHTML = SIGNALS.map(([k, n, d]) => `<div class="sigrow"><div><div class="n">${n}</div><div class="d">${d}</div></div><input type="range" min="0" max="3" step="1" value="${W[k]}" data-k="${k}" aria-label="Weight of ${n}"><span class="pct">${Math.round(W[k] / tot * 100)}%</span></div>`).join('');
  $('#sigRows').querySelectorAll('input').forEach(i => i.addEventListener('input', () => { W[i.dataset.k] = +i.value; renderModel(); }));
  const p = scoreProcess();
  const band = p.status === 'Trusted' ? 'green' : p.status === 'Needs attention' ? 'amber' : 'red';
  $('#live').safeHTML = `<div style="display:flex;align-items:center;gap:14px;margin-bottom:10px">${ring(p.score, band, 64, 8)}<div><div style="font-size:28px;font-weight:600;color:${TXT[band]}">${pct(p.score)}</div><div class="muted">${p.status}</div></div></div>` +
    p.steps.map(r => { const b = r.res ? 'green' : r.band; return `<div class="row"><span>${r.step.order}. ${esc(r.step.name)}</span><div class="bar"><i style="width:${r.score * 100}%;background:${COL[b]}"></i></div><b style="color:${TXT[b]};text-align:right">${pct(r.score)}</b></div>`; }).join('');
}
$('#resetW').addEventListener('click', () => { W = { ...DEFAULT_W }; renderModel(); });

/* ---------- alert ---------- */
const timers = [];
function playAlert() {
  timers.splice(0).forEach(clearTimeout);
  const a = $('#alert'); a.classList.remove('in', 'out'); void a.offsetWidth;
  const rv = $('#aRing'); rv.style.transition = 'none'; rv.style.strokeDashoffset = 188.5; $('#aNum').textContent = '0%';
  document.querySelectorAll('.asrc, .aact').forEach(el => el.classList.remove('show'));
  const bell = $('#bell'); bell.classList.remove('ringing'); void bell.offsetWidth; bell.classList.add('ringing', 'has');
  const ni = document.getElementById('newItem'); if (ni) { ni.classList.remove('flash'); void ni.offsetWidth; ni.classList.add('flash'); }
  const at = (ms, fn) => timers.push(setTimeout(fn, ms));
  at(350, () => { $('#backdrop').classList.add('on'); a.classList.add('in'); });
  const target = scoreStep(DATA.process.steps.find(s => s.id === 'step-4')).score, tp = Math.round(target * 100);
  at(1000, () => {
    rv.style.transition = 'stroke-dashoffset 1s cubic-bezier(.2,.8,.2,1)'; rv.style.strokeDashoffset = 188.5 * (1 - target);
    const start = performance.now(); (function tick(now) { const p = Math.min(1, (now - start) / 1000); $('#aNum').textContent = Math.round(tp * (1 - Math.pow(1 - p, 3))) + '%'; if (p < 1) requestAnimationFrame(tick); })(start);
  });
  document.querySelectorAll('.asrc').forEach((el, i) => at(1300 + i * 220, () => el.classList.add('show')));
  at(2100, () => $('.aact').classList.add('show'));
}
function closeAlert() {
  const a = $('#alert'); if (!a.classList.contains('in')) return;
  timers.splice(0).forEach(clearTimeout);
  a.classList.remove('in'); a.classList.add('out'); $('#backdrop').classList.remove('on');
  setTimeout(() => a.classList.remove('out'), 450);
}
$('#aClose').addEventListener('click', closeAlert); $('#aLater').addEventListener('click', closeAlert); $('#backdrop').addEventListener('click', closeAlert);
$('#aReview').addEventListener('click', () => { closeAlert(); openStep = 'step-4'; go('#/procedure/step-4'); });
$('#bell').addEventListener('click', () => { if (current !== 'home') go('#/home'); playAlert(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeAlert(); picker.classList.remove('open'); } });

render();

