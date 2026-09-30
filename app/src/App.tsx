import { useMemo, useState } from 'react'
import { DATASETS } from './data'
import {
  DEFAULT_WEIGHTS,
  SIGNAL_LABELS,
  scoreProcess,
  type Band,
  type Resolution,
  type ScoredEvidence,
  type SourceType,
  type StepResult,
  type Weights,
} from './engine'

const ROWS: { label: string; sub: string; types: SourceType[] }[] = [
  { label: 'Docs', sub: 'SharePoint · Confluence', types: ['doc'] },
  { label: 'Business apps', sub: 'SAP SuccessFactors', types: ['business_app'] },
  { label: 'Chat & email', sub: 'Slack · Teams · Outlook', types: ['chat', 'email'] },
  { label: 'People', sub: 'StarGaze capture', types: ['person'] },
  { label: 'QM decisions', sub: 'Human in the loop', types: ['decision'] },
]

const BAND_STYLE: Record<Band, { pill: string; text: string; label: string }> = {
  green: { pill: 'bg-emerald-500 text-white', text: 'text-emerald-600', label: 'Trusted' },
  amber: { pill: 'bg-amber-400 text-slate-900', text: 'text-amber-600', label: 'Use with caution' },
  red: { pill: 'bg-rose-500 text-white', text: 'text-rose-600', label: 'Needs a human' },
  gap: { pill: 'bg-slate-400 text-white', text: 'text-slate-500', label: 'Knowledge gap' },
}

const pct = (x: number) => `${Math.round(x * 100)}%`
const TYPE_LABEL: Record<SourceType, string> = {
  doc: 'Doc',
  business_app: 'Business app',
  chat: 'Chat',
  email: 'Email',
  person: 'Person',
  decision: 'QM decision',
}

function Dot({ e, onClick }: { e: ScoredEvidence; onClick: () => void }) {
  const cls =
    e.status === 'supports'
      ? 'bg-emerald-500 border-emerald-600'
      : e.status === 'contradicts'
        ? 'bg-rose-500 border-rose-600'
        : 'bg-white border-slate-400 border-dashed'
  const size = 10 + Math.round(e.weight * 14)
  return (
    <button
      onClick={onClick}
      title={`${e.source.title}\n"${e.claim.value}"\nweight ${e.weight.toFixed(2)} · ${e.status}${e.excludedReason ? ` (${e.excludedReason})` : ''}`}
      className={`rounded-full border-2 ${cls} shrink-0 transition hover:scale-125`}
      style={{ width: size, height: size }}
    />
  )
}

export default function App() {
  const [datasetIdx, setDatasetIdx] = useState(0)
  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS)
  const [resolutions, setResolutions] = useState<Record<string, Record<string, Resolution>>>({})
  const [selected, setSelected] = useState<string | null>(null)
  const [showModel, setShowModel] = useState(false)

  const data = DATASETS[datasetIdx]
  const procResolutions = useMemo(() => resolutions[data.process.id] ?? {}, [resolutions, data.process.id])
  const result = useMemo(() => scoreProcess(data, weights, new Date(), procResolutions), [data, weights, procResolutions])
  const selectedStep = result.steps.find((s) => s.step.id === selected) ?? null

  const resolve = (r: Resolution) =>
    setResolutions((prev) => ({ ...prev, [data.process.id]: { ...(prev[data.process.id] ?? {}), [r.stepId]: r } }))
  const unresolve = (stepId: string) =>
    setResolutions((prev) => {
      const next = { ...(prev[data.process.id] ?? {}) }
      delete next[stepId]
      return { ...prev, [data.process.id]: next }
    })

  const statusStyle =
    result.status === 'Trusted'
      ? 'bg-emerald-100 text-emerald-800'
      : result.status === 'Needs attention'
        ? 'bg-amber-100 text-amber-800'
        : 'bg-rose-100 text-rose-800'

  const counts = result.steps.reduce<Record<Band, number>>(
    (acc, s) => ({ ...acc, [s.band]: acc[s.band] + 1 }),
    { green: 0, amber: 0, red: 0, gap: 0 },
  )

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="bg-slate-900 text-white">
        <div className="mx-auto max-w-7xl px-4 py-4 flex flex-wrap items-center gap-4 justify-between">
          <div>
            <div className="text-xl font-semibold tracking-tight">
              Truth<span className="text-sky-400">Map</span>
            </div>
            <div className="text-xs text-slate-400">Knowledge quality management: where docs, apps, chats and people disagree</div>
          </div>
          <div className="flex items-center gap-3">
            <select
              className="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm"
              value={datasetIdx}
              onChange={(e) => {
                setDatasetIdx(Number(e.target.value))
                setSelected(null)
              }}
            >
              {DATASETS.map((d, i) => (
                <option key={d.process.id} value={i}>
                  {d.process.client.name} · {d.process.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => setShowModel((v) => !v)}
              className="text-sm border border-slate-600 rounded px-3 py-1.5 hover:bg-slate-800"
            >
              {showModel ? 'Hide model' : 'Scoring model'}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 space-y-6">
        {/* Summary */}
        <section className="grid gap-4 md:grid-cols-[auto_1fr]">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex items-center gap-5">
            <div className="text-5xl font-bold tabular-nums">{pct(result.score)}</div>
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Process confidence</div>
              <span className={`inline-block mt-1 rounded-full px-3 py-0.5 text-sm font-medium ${statusStyle}`}>{result.status}</span>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <div className="text-lg font-semibold">{data.process.name}</div>
            <div className="text-sm text-slate-500">
              Client {data.process.client.name} · {data.process.client.country}
              {data.process.client.joint_committee ? ` · PC ${data.process.client.joint_committee}` : ''} · {data.process.steps.length} steps ·{' '}
              {data.sources.length} sources
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              {(Object.keys(counts) as Band[]).map((b) => (
                <span key={b} className="flex items-center gap-1.5">
                  <span className={`inline-block w-3 h-3 rounded-full ${BAND_STYLE[b].pill}`} />
                  {counts[b]} {BAND_STYLE[b].label.toLowerCase()}
                </span>
              ))}
            </div>
          </div>
        </section>

        {showModel && <ModelPanel weights={weights} setWeights={setWeights} />}

        {/* Matrix */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 overflow-x-auto">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="font-semibold">Where do the sources agree? <span className="text-slate-400 font-normal text-sm">Click a step for the explanation</span></h2>
            <div className="text-xs text-slate-500 flex gap-3">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-emerald-500" /> supports</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-rose-500" /> contradicts</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full border-2 border-dashed border-slate-400" /> excluded / overruled</span>
              <span>dot size = evidence weight</span>
            </div>
          </div>
          <div className="grid min-w-[900px]" style={{ gridTemplateColumns: `170px repeat(${result.steps.length}, minmax(96px, 1fr))` }}>
            <div />
            {result.steps.map((s) => (
              <button
                key={s.step.id}
                onClick={() => setSelected(s.step.id)}
                className={`px-1.5 pb-3 text-left border-b-2 ${selected === s.step.id ? 'border-sky-500' : 'border-transparent'} hover:bg-slate-50 rounded-t`}
              >
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${BAND_STYLE[s.band].pill}`}>
                  {s.band === 'gap' ? 'gap' : pct(s.score)}
                </span>
                <div className="mt-1 text-xs font-medium leading-tight line-clamp-3">
                  {s.step.order}. {s.step.name}
                </div>
              </button>
            ))}
            {ROWS.filter((row) => row.types[0] !== 'decision' || result.steps.some((s) => s.resolution)).map((row) => (
              <Row key={row.label} row={row} steps={result.steps} selected={selected} onSelect={setSelected} />
            ))}
          </div>
        </section>

        {selectedStep && (
          <StepDetail
            key={selectedStep.step.id}
            r={selectedStep}
            onResolve={resolve}
            onUnresolve={() => unresolve(selectedStep.step.id)}
          />
        )}

        {/* Optimal process + actions */}
        <section className="grid gap-6 md:grid-cols-2">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <h2 className="font-semibold mb-1">Optimal process</h2>
            <p className="text-xs text-slate-500 mb-4">Built from the best-supported value per step. Green steps are ready to use; the rest need a human first.</p>
            <ol className="space-y-3">
              {result.steps.map((s) => (
                <li key={s.step.id} className="flex gap-3">
                  <span className={`mt-0.5 shrink-0 w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${BAND_STYLE[s.band].pill}`}>
                    {s.band === 'green' ? '✓' : s.band === 'amber' ? '!' : '?'}
                  </span>
                  <div className="text-sm">
                    <button onClick={() => setSelected(s.step.id)} className="font-medium hover:underline text-left">
                      {s.step.order}. {s.step.name}
                    </button>
                    <div className="text-slate-600">
                      {s.band === 'gap'
                        ? 'No knowledge available. Capture it before relying on this step.'
                        : s.band === 'red'
                          ? `Not settled. Candidates: ${s.groups.map((g) => `"${g.value}"`).join(' vs ')}. Ask ${s.step.step_owner_role}.`
                          : s.leading?.value}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <h2 className="font-semibold mb-1">Actions for humans <span className="text-slate-400 font-normal">({result.actions.length})</span></h2>
            <p className="text-xs text-slate-500 mb-4">Knowledge debt, routed to the role that can fix it.</p>
            <ul className="space-y-2">
              {result.actions.map((a, i) => (
                <li key={i} className="text-sm flex gap-2 items-start">
                  <span className="shrink-0 mt-0.5 text-[10px] uppercase tracking-wide font-semibold rounded bg-slate-100 text-slate-600 px-1.5 py-0.5 w-16 text-center">
                    {a.kind}
                  </span>
                  <span>
                    {a.text} <span className="text-slate-500">→ {a.who}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <footer className="text-xs text-slate-400 pb-6">
          Proof of concept on synthetic data. The AI extraction step (source → claims with verbatim quotes) is pre-computed; scoring runs live in your browser.
        </footer>
      </main>
    </div>
  )
}

function Row({
  row,
  steps,
  selected,
  onSelect,
}: {
  row: (typeof ROWS)[number]
  steps: StepResult[]
  selected: string | null
  onSelect: (id: string) => void
}) {
  return (
    <>
      <div className="py-4 pr-3 border-t border-slate-100">
        <div className="text-sm font-medium">{row.label}</div>
        <div className="text-[11px] text-slate-400">{row.sub}</div>
      </div>
      {steps.map((s) => {
        const ev = s.evidence.filter((e) => row.types.includes(e.source.type))
        return (
          <div
            key={s.step.id}
            onClick={() => onSelect(s.step.id)}
            className={`relative border-t border-slate-100 flex items-center justify-center gap-1.5 cursor-pointer ${selected === s.step.id ? 'bg-sky-50' : ''}`}
          >
            <div className="absolute left-0 right-0 top-1/2 h-px bg-slate-200" />
            <div className="relative flex gap-1.5 items-center">
              {ev.length === 0 ? (
                <span className="w-2 h-2 rounded-full bg-slate-200" />
              ) : (
                ev.map((e) => <Dot key={e.claim.id} e={e} onClick={() => onSelect(s.step.id)} />)
              )}
            </div>
          </div>
        )
      })}
    </>
  )
}

function SignalChip({ label, value }: { label: string; value: number }) {
  const on = value >= 0.5
  return (
    <span
      title={label}
      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums ${on ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}
    >
      {value === 1 || value === 0 ? (value === 1 ? '✓' : '✗') : value.toFixed(2)}
    </span>
  )
}

function StepDetail({ r, onResolve, onUnresolve }: { r: StepResult; onResolve: (res: Resolution) => void; onUnresolve: () => void }) {
  const [choice, setChoice] = useState(r.groups[0]?.value ?? '')
  const [rationale, setRationale] = useState('')
  const canResolve = r.groups.length > 0 && (r.contested || r.band === 'red' || r.band === 'amber')

  return (
    <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Step {r.step.order} · criticality {r.step.criticality}/3 · owner: {r.step.step_owner_role}
          </div>
          <h2 className="text-lg font-semibold">{r.step.name}</h2>
          <p className="text-sm text-slate-600">{r.step.description}</p>
        </div>
        <div className="text-right">
          <div className={`text-4xl font-bold tabular-nums ${BAND_STYLE[r.band].text}`}>{r.band === 'gap' ? '0%' : pct(r.score)}</div>
          <div className="text-sm text-slate-500">{BAND_STYLE[r.band].label}</div>
        </div>
      </div>

      {r.band !== 'gap' && (
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 text-sm font-mono">
          score = agreement {pct(r.agreement)} × strength {pct(r.strength)} = {pct(r.agreement * r.strength)}
          {r.contested && <span className="text-rose-600"> → contested, capped at 45%</span>}
          {r.undocumented && <span className="text-amber-600"> → undocumented, capped at 70%</span>}
        </div>
      )}

      <div>
        <h3 className="font-medium text-sm mb-2">Why this score</h3>
        <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700">
          {r.reasons.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      </div>

      {r.groups.length > 0 && (
        <div>
          <h3 className="font-medium text-sm mb-2">Competing values</h3>
          <div className="flex flex-wrap gap-3">
            {r.groups.map((g, i) => (
              <div key={g.value} className={`rounded-lg border px-3 py-2 text-sm ${i === 0 ? 'border-emerald-300 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
                <div className="font-medium">"{g.value}"</div>
                <div className="text-xs text-slate-500">
                  weight {g.weight.toFixed(2)} · {g.evidence.length} source{g.evidence.length > 1 ? 's' : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {r.evidence.length > 0 && (
        <div className="overflow-x-auto">
          <h3 className="font-medium text-sm mb-2">Evidence, scored on 5 objective signals</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b">
                <th className="py-2 pr-3">Source</th>
                <th className="py-2 pr-3">Says</th>
                {(Object.keys(SIGNAL_LABELS) as (keyof Weights)[]).map((k) => (
                  <th key={k} className="py-2 px-1 text-center" title={SIGNAL_LABELS[k]}>
                    {k === 'ownerActive' ? 'Owner' : k[0].toUpperCase() + k.slice(1)}
                  </th>
                ))}
                <th className="py-2 px-2 text-right">Weight</th>
                <th className="py-2 pl-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {r.evidence.map((e) => (
                <tr key={e.claim.id} className="border-b border-slate-100 align-top">
                  <td className="py-2 pr-3 min-w-[220px]">
                    <div className="font-medium">{e.source.title}</div>
                    <div className="text-xs text-slate-500">
                      {TYPE_LABEL[e.source.type]} · {e.source.system} · {e.source.date} · {e.source.author_role}
                      {e.source.owner_status !== 'active' ? ` (${e.source.owner_status})` : ''}
                    </div>
                    <div className="text-xs italic text-slate-500 mt-1">“{e.claim.quote}”</div>
                  </td>
                  <td className="py-2 pr-3 min-w-[140px]">{e.claim.value}</td>
                  {(Object.keys(SIGNAL_LABELS) as (keyof Weights)[]).map((k) => (
                    <td key={k} className="py-2 px-1 text-center">
                      <SignalChip label={SIGNAL_LABELS[k]} value={e.signals[k]} />
                    </td>
                  ))}
                  <td className="py-2 px-2 text-right tabular-nums font-medium">{e.weight.toFixed(2)}</td>
                  <td className="py-2 pl-2 text-xs">
                    <span
                      className={
                        e.status === 'supports'
                          ? 'text-emerald-700'
                          : e.status === 'contradicts'
                            ? 'text-rose-700'
                            : 'text-slate-500'
                      }
                    >
                      {e.status}
                    </span>
                    {e.excludedReason && <div className="text-slate-400">{e.excludedReason}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {r.resolution ? (
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm flex items-center justify-between gap-4">
          <span>
            Resolved: <b>"{r.resolution.value}"</b>, {r.resolution.rationale}
          </span>
          <button onClick={onUnresolve} className="text-sky-700 hover:underline shrink-0">
            Undo
          </button>
        </div>
      ) : (
        canResolve && (
          <form
            className="rounded-lg border border-slate-200 p-4 space-y-3"
            onSubmit={(ev) => {
              ev.preventDefault()
              const text = rationale.trim()
              if (!text || !choice) return
              onResolve({ stepId: r.step.id, value: choice, rationale: text.slice(0, 280), decidedBy: 'Quality manager', date: new Date().toISOString().slice(0, 10) })
            }}
          >
            <div className="text-sm font-medium">Resolve as quality manager</div>
            <div className="flex flex-wrap gap-3 text-sm">
              {r.groups.map((g) => (
                <label key={g.value} className="flex items-center gap-1.5">
                  <input type="radio" name={`choice-${r.step.id}`} checked={choice === g.value} onChange={() => setChoice(g.value)} />
                  {g.value}
                </label>
              ))}
            </div>
            <input
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              maxLength={280}
              placeholder="Why is this the right value? (e.g. confirmed with legal, CLA art. 7)"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
            <button type="submit" disabled={!rationale.trim()} className="rounded bg-sky-600 text-white px-4 py-2 text-sm disabled:opacity-40">
              Record decision
            </button>
          </form>
        )
      )}
    </section>
  )
}

function ModelPanel({ weights, setWeights }: { weights: Weights; setWeights: (w: Weights) => void }) {
  return (
    <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
      <h2 className="font-semibold">Scoring model</h2>
      <p className="text-sm text-slate-600 mt-1 max-w-3xl">
        Every source is scored on five objective signals that a system can check. <b>The signals are facts; the weights are policy.</b> Equal weights by
        default. Every conflict a quality manager resolves becomes a labelled example to learn these weights from.
      </p>
      <div className="grid gap-4 md:grid-cols-5 mt-4">
        {(Object.keys(SIGNAL_LABELS) as (keyof Weights)[]).map((k) => (
          <label key={k} className="text-sm">
            <div className="flex justify-between">
              <span className="font-medium">{SIGNAL_LABELS[k]}</span>
            </div>
            <input
              type="range"
              min={0}
              max={3}
              step={0.5}
              value={weights[k]}
              onChange={(e) => setWeights({ ...weights, [k]: Number(e.target.value) })}
              className="w-full"
            />
            <div className="text-xs text-slate-500 tabular-nums">weight {weights[k]}</div>
          </label>
        ))}
      </div>
      <div className="mt-3 text-xs font-mono text-slate-600">
        source weight = Σ(weight × signal) / Σ weight · step = agreement × strength (capped when contested or undocumented) · process = Σ(criticality × step) / Σ criticality
      </div>
      <button onClick={() => setWeights(DEFAULT_WEIGHTS)} className="mt-3 text-sm text-sky-700 hover:underline">
        Reset to equal weights
      </button>
    </section>
  )
}
