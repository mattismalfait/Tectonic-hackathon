// Layer 3 (master mode): compare every source's SOP to the master SOP, step by step.
// The master is the gold. A step scores high when the weighted evidence confirms the master,
// low when heavy (new, approved, designated) sources differ from it. Every number comes with a sentence.

import { collectEvidence } from './evidence'
import { RECENT_MONTHS, monthsBetween } from './signals'
import type {
  Category,
  CategoryView,
  Dataset,
  MasterSOP,
  Resolution,
  ScoredEvidence,
  SourceComparison,
  Step,
  StepExplanation,
  StepResult,
  ValueGroup,
  Weights,
} from './types'
import { bandOf, pct } from './util'

/** A repeat of another source counts, but with half its weight. */
export const ECHO_FACTOR = 0.5
/** If the strongest confirming source weighs less than this, the step is thinly evidenced. */
export const THIN_EVIDENCE_WEIGHT = 0.5
export const THIN_EVIDENCE_CAP = 0.7

export const CATEGORY_LABELS: Record<Category, string> = { docs: 'Docs', messages: 'Messages', sap: 'SAP', people: 'People' }
const CATEGORY_ORDER: Category[] = ['docs', 'messages', 'sap', 'people']
const NOUN: Record<Category, string> = { docs: 'docs', messages: 'messages', sap: 'SAP', people: 'people' }
const VERB: Record<Category, string> = { docs: 'say', messages: 'say', sap: 'says', people: 'say' }
const SILENT: Record<Category, string> = {
  docs: 'no doc mentions this step',
  messages: 'no message mentions this step',
  sap: 'SAP does not cover this step',
  people: 'nobody mentions this step',
}
/** A step that no doc and no system of record mentions lives only in chats and heads. */
export const UNDOCUMENTED_CAP = 0.7

export function categoryOf(type: ScoredEvidence['source']['type']): Category | null {
  if (type === 'doc') return 'docs'
  if (type === 'chat' || type === 'email') return 'messages'
  if (type === 'business_app') return 'sap'
  if (type === 'person') return 'people'
  return null // QM decisions are not one of the four views
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
const effective = (e: ScoredEvidence) => (e.echoOf ? e.weight * ECHO_FACTOR : e.weight)

function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

function count(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`
}

function describe(c: SourceComparison): string {
  switch (c.type) {
    case 'doc':
      return `the ${c.age} doc "${c.title}" (${c.date})`
    case 'business_app':
      return `SAP "${c.title}" (${c.date})`
    case 'person':
      return `${c.authorRole} (StarGaze, ${c.date})`
    case 'chat':
    case 'email':
      return `${c.age === 'old' ? 'an old' : 'a new'} ${c.system} message by ${c.authorRole} (${c.date})`
    default:
      return `"${c.title}" (${c.date})`
  }
}

function toComparison(e: ScoredEvidence, masterValue: string, today: Date): SourceComparison {
  const ageMonths = Math.max(0, monthsBetween(e.source.date, today))
  return {
    sourceId: e.source.id,
    title: e.source.title,
    type: e.source.type,
    system: e.source.system,
    authorRole: e.source.author_role,
    date: e.source.date,
    ageMonths: Math.round(ageMonths),
    age: ageMonths <= RECENT_MONTHS ? 'new' : 'old',
    weight: effective(e),
    signals: e.signals,
    verdict: e.status === 'excluded' || e.status === 'overruled' ? 'excluded' : e.status === 'supports' ? 'confirms' : 'differs',
    says: e.claim.value,
    statement: e.claim.statement,
    quote: e.claim.quote,
    masterSays: masterValue,
    note: e.excludedReason ?? (e.echoOf ? `repeats "${e.echoOf}" (counts for half)` : undefined),
  }
}

function categoryView(category: Category, comps: SourceComparison[], masterValue: string): CategoryView {
  const counted = comps.filter((c) => c.verdict !== 'excluded')
  const confirming = counted.filter((c) => c.verdict === 'confirms')
  const differing = counted.filter((c) => c.verdict === 'differs')
  const label = CATEGORY_LABELS[category]
  const status: CategoryView['status'] =
    counted.length === 0 ? 'silent' : differing.length === 0 ? 'confirms' : confirming.length === 0 ? 'differs' : 'mixed'

  let summary: string
  if (status === 'silent') {
    summary = `Silent: ${SILENT[category]}` + (comps.length ? ` (${comps.length} excluded).` : '.')
  } else {
    const fragments = counted.map((c) => (c.verdict === 'confirms' ? `${describe(c)} confirms` : `${describe(c)} says "${c.says}"`))
    const head = status === 'confirms' ? 'Confirms' : status === 'differs' ? 'Differs' : 'Mixed'
    summary = `${head}: ${fragments.join('; ')}.` + (differing.length ? ` Master: "${masterValue}".` : '')
  }

  return {
    category,
    label,
    status,
    sources: comps,
    weightConfirming: confirming.reduce((s, c) => s + c.weight, 0),
    weightDiffering: differing.reduce((s, c) => s + c.weight, 0),
    summary,
  }
}

/** The value a category currently stands for, based on its NEW sources only (weighted majority). */
function recentPosition(view: CategoryView): string | null {
  const recent = view.sources.filter((c) => c.verdict !== 'excluded' && c.age === 'new')
  if (recent.length === 0) return null
  const byValue = new Map<string, number>()
  for (const c of recent) byValue.set(c.says, (byValue.get(c.says) ?? 0) + c.weight)
  return [...byValue.entries()].sort((a, b) => b[1] - a[1])[0][0]
}

function crossChecks(categories: Record<Category, CategoryView>, masterValue: string): StepExplanation['crossChecks'] {
  const out: StepExplanation['crossChecks'] = []
  for (let i = 0; i < CATEGORY_ORDER.length; i++) {
    for (let j = i + 1; j < CATEGORY_ORDER.length; j++) {
      const a = CATEGORY_ORDER[i]
      const b = CATEGORY_ORDER[j]
      const pa = recentPosition(categories[a])
      const pb = recentPosition(categories[b])
      if (pa === null || pb === null) continue
      const la = `recent ${NOUN[a]}`
      const lb = `recent ${NOUN[b]}`
      const match = norm(pa) === norm(pb)
      const sentence = match
        ? `${cap(la)} and ${lb} match` + (norm(pa) === norm(masterValue) ? ' (both follow the master).' : `, but both differ from the master ("${pa}").`)
        : `${cap(la)} and ${lb} don't match: ${NOUN[a]} ${VERB[a]} "${pa}", ${NOUN[b]} ${VERB[b]} "${pb}".`
      out.push({ a, b, match, sentence })
    }
  }
  return out
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const singular = (parts: string[]) => parts.length === 1 && (!/^\d/.test(parts[0]) || parts[0].startsWith('1 '))

function headline(score: number, categories: Record<Category, CategoryView>, capReason?: string): string {
  const differ: string[] = []
  const confirm: string[] = []
  const docs = categories.docs.sources.filter((c) => c.verdict !== 'excluded')
  for (const verdict of ['differs', 'confirms'] as const) {
    const target = verdict === 'differs' ? differ : confirm
    for (const age of ['new', 'old'] as const) {
      const n = docs.filter((c) => c.verdict === verdict && c.age === age).length
      if (n) target.push(n === 1 ? `the ${age} doc` : `${n} ${age} docs`)
    }
    const msgs = categories.messages.sources.filter((c) => c.verdict === verdict).length
    if (msgs) target.push(count(msgs, 'message', 'messages'))
    const sap = categories.sap.sources.filter((c) => c.verdict === verdict).length
    if (sap) target.push('SAP')
    const ppl = categories.people.sources.filter((c) => c.verdict === verdict).length
    if (ppl) target.push(count(ppl, 'person', 'people'))
  }
  let text: string
  if (differ.length === 0) text = `${pct(score)}: every source that mentions this step confirms the master (${joinAnd(confirm)}).`
  else if (confirm.length === 0) text = `${pct(score)}: no source confirms the master; ${joinAnd(differ)} ${singular(differ) ? 'differs' : 'differ'} from it.`
  else text = `${pct(score)}: ${joinAnd(differ)} ${singular(differ) ? 'differs' : 'differ'} from the master; ${joinAnd(confirm)} ${singular(confirm) ? 'confirms' : 'confirm'} it.`
  return capReason ? `${text} ${capReason}` : text
}

export function scoreStepMaster(
  step: Step,
  data: Dataset,
  master: MasterSOP,
  weights: Weights,
  today: Date,
  resolution?: Resolution,
): StepResult {
  const gold = master.steps.find((s) => s.step_id === step.id) ?? { step_id: step.id, value: '(not in master)', statement: '' }
  // A QM decision becomes the reference for this step: it confirms the master or replaces its value.
  const m = resolution ? { step_id: step.id, value: resolution.value, statement: resolution.rationale } : gold
  const confirmsGold = norm(m.value) === norm(gold.value)
  const { evidence, reasons: collectReasons } = collectEvidence(step, data, weights, today, resolution)

  for (const e of evidence) {
    if (e.status === 'excluded') continue
    const matches =
      e.source.type === 'decision' ||
      (confirmsGold && e.claim.matches_master !== undefined ? e.claim.matches_master : norm(e.claim.value) === norm(m.value))
    e.status = matches ? 'supports' : 'contradicts'
    // After a decision, sources that say otherwise are known to be wrong: listed, not counted.
    if (resolution && !matches) {
      e.status = 'overruled'
      e.excludedReason = `overruled by the decision of ${resolution.decidedBy} on ${resolution.date}`
    }
  }

  const counted = evidence.filter((e) => e.status !== 'excluded' && e.status !== 'overruled')
  const comps = evidence.filter((e) => categoryOf(e.source.type) !== null).map((e) => toComparison(e, m.value, today))
  const categories = Object.fromEntries(
    CATEGORY_ORDER.map((c) => [c, categoryView(c, comps.filter((x) => categoryOf(x.type) === c), m.value)]),
  ) as Record<Category, CategoryView>

  const wC = counted.filter((e) => e.status === 'supports').reduce((s, e) => s + effective(e), 0)
  const wD = counted.filter((e) => e.status === 'contradicts').reduce((s, e) => s + effective(e), 0)
  const wT = wC + wD
  const conformance = wT > 0 ? wC / wT : 0
  const strongestConfirming = Math.max(0, ...counted.filter((e) => e.status === 'supports').map((e) => e.weight))

  let score = conformance
  let capInfo: StepExplanation['calculation']['cap']
  if (counted.length > 0 && wC > 0 && strongestConfirming < THIN_EVIDENCE_WEIGHT) {
    capInfo = {
      value: THIN_EVIDENCE_CAP,
      reason: `Capped at ${pct(THIN_EVIDENCE_CAP)}: only low-weight sources confirm the master (strongest weighs ${strongestConfirming.toFixed(2)}).`,
    }
    score = Math.min(score, THIN_EVIDENCE_CAP)
  }
  const documented = counted.some((e) => e.source.type === 'doc' || e.source.type === 'business_app' || e.source.type === 'decision')
  if (counted.length > 0 && !documented && score > UNDOCUMENTED_CAP) {
    capInfo = { value: UNDOCUMENTED_CAP, reason: `Capped at ${pct(UNDOCUMENTED_CAP)}: no doc or SAP covers this step, it only lives in messages and people.` }
    score = UNDOCUMENTED_CAP
  }

  const docs = {
    new: categories.docs.sources.filter((c) => c.verdict !== 'excluded' && c.age === 'new'),
    old: categories.docs.sources.filter((c) => c.verdict !== 'excluded' && c.age === 'old'),
  }

  const hasEvidence = counted.length > 0
  const explanation: StepExplanation = {
    master: { value: m.value, statement: m.statement },
    headline: hasEvidence
      ? headline(score, categories, capInfo?.reason)
      : 'No source mentions this step: the master step is not reflected in any doc, system, message or person.',
    categories,
    docs,
    crossChecks: crossChecks(categories, m.value),
    calculation: {
      weightConfirming: wC,
      weightDiffering: wD,
      weightTotal: wT,
      conformance,
      cap: capInfo,
      formula: `conformance = confirming weight ${wC.toFixed(2)} / total weight ${wT.toFixed(2)} = ${pct(conformance)}` + (capInfo ? ` → capped at ${pct(capInfo.value)}` : ''),
    },
  }

  // Groups for the existing UI: master value first, then the differing values by weight.
  const groupMap = new Map<string, ValueGroup>()
  groupMap.set(norm(m.value), { value: m.value, weight: 0, evidence: [] })
  for (const e of counted) {
    const key = e.status === 'supports' ? norm(m.value) : norm(e.claim.value)
    const g = groupMap.get(key) ?? { value: e.claim.value, weight: 0, evidence: [] }
    g.weight += effective(e)
    g.evidence.push(e)
    groupMap.set(key, g)
  }
  const [masterGroup, ...rest] = [...groupMap.values()]
  const groups = [masterGroup, ...rest.sort((a, b) => b.weight - a.weight)]

  // Needs a decision: sources differ from the master and either the step is red, or a recent doc
  // or SAP itself differs (the official record contradicts the master; someone must pick one).
  const officialDiffers = counted.some(
    (e) => e.status === 'contradicts' && (e.source.type === 'doc' || e.source.type === 'business_app') && monthsBetween(e.source.date, today) < RECENT_MONTHS,
  )
  const contested = !resolution && counted.length > 0 && rest.length > 0 && (bandOf(score, true) === 'red' || officialDiffers)

  const reasons = [
    explanation.headline,
    ...CATEGORY_ORDER.map((c) => `${categories[c].label}: ${categories[c].summary}`),
    ...explanation.crossChecks.map((x) => x.sentence),
    `How: ${explanation.calculation.formula}.`,
    ...collectReasons,
  ]

  return {
    step,
    score: hasEvidence ? score : 0,
    band: bandOf(score, hasEvidence),
    leading: masterGroup,
    groups: hasEvidence ? groups : [],
    evidence,
    agreement: conformance,
    strength: conformance > 0 ? score / conformance : 0,
    reasons,
    contested,
    undocumented: !documented,
    resolution,
    explanation,
  }
}

