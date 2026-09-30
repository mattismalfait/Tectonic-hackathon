// Scoring engine: objective signals per source -> step confidence -> process confidence.
// Every number that influences a score is also emitted as a human-readable reason.

export type SourceType = 'doc' | 'business_app' | 'chat' | 'email' | 'person' | 'decision'

export interface Step {
  id: string
  order: number
  name: string
  description: string
  criticality: number
  step_owner_role: string
}

export interface Process {
  id: string
  name: string
  client: { id: string; name: string; country: string; joint_committee?: string }
  case?: Record<string, string | number>
  steps: Step[]
}

export interface Source {
  id: string
  title: string
  type: SourceType
  system: string
  author_role: string
  owner_status: 'active' | 'moved' | 'left' | 'none'
  approval_status: 'approved' | 'draft' | 'unreviewed' | 'n/a'
  date: string
  last_reviewed?: string | null
  country: string
  client_specific: boolean
  origin: string | null
  text: string
}

export interface Claim {
  id: string
  step_id: string
  source_id: string
  value: string
  statement: string
  quote: string
}

export interface Dataset {
  process: Process
  sources: Source[]
  claims: Claim[]
}

export interface Weights {
  designated: number
  approved: number
  recent: number
  reviewed: number
  ownerActive: number
}

export const DEFAULT_WEIGHTS: Weights = {
  designated: 1,
  approved: 1,
  recent: 1,
  reviewed: 1,
  ownerActive: 1,
}

export const SIGNAL_LABELS: Record<keyof Weights, string> = {
  designated: 'Designated source for this step',
  approved: 'Formally approved',
  recent: 'Recent (36-month decay)',
  reviewed: 'Reviewed / verified in last 12 months',
  ownerActive: 'Owner still active in role',
}

export const THRESHOLDS = { green: 0.75, amber: 0.5 }
const RECENCY_MONTHS = 36
const REVIEW_MONTHS = 12
const CONTESTED_RATIO = 0.5
const CONTESTED_CAP = 0.45
const UNDOCUMENTED_CAP = 0.7
const CONFIRMATION_BONUS = 0.1
// A source that repeats another source still raises confidence (the knowledge is in use),
// but less than an independent confirmation, so one outdated doc copied five times cannot outvote reality.
const ECHO_BONUS = 0.05

export type Band = 'green' | 'amber' | 'red' | 'gap'

export interface Signals {
  designated: number
  approved: number
  recent: number
  reviewed: number
  ownerActive: number
}

export interface ScoredEvidence {
  claim: Claim
  source: Source
  signals: Signals
  weight: number
  status: 'supports' | 'contradicts' | 'excluded' | 'overruled'
  excludedReason?: string
  echoOf?: string
}

export interface ValueGroup {
  value: string
  weight: number
  evidence: ScoredEvidence[]
}

export interface StepResult {
  step: Step
  score: number
  band: Band
  leading?: ValueGroup
  groups: ValueGroup[]
  evidence: ScoredEvidence[]
  agreement: number
  strength: number
  reasons: string[]
  contested: boolean
  undocumented: boolean
  resolution?: Resolution
}

export interface Resolution {
  stepId: string
  value: string
  rationale: string
  decidedBy: string
  date: string
}

export interface Action {
  kind: 'decide' | 'review' | 'reassign' | 'document' | 'capture' | 'retire'
  stepId?: string
  text: string
  who: string
}

export interface ProcessResult {
  score: number
  status: 'Trusted' | 'Needs attention' | 'Not release-ready'
  steps: StepResult[]
  actions: Action[]
}

export function monthsBetween(from: string, to: Date): number {
  const d = new Date(from)
  return (to.getTime() - d.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
}

export function bandOf(score: number, hasEvidence: boolean): Band {
  if (!hasEvidence) return 'gap'
  // Band on the displayed (rounded) percentage, so "75%" is never shown as amber.
  const shown = Math.round(score * 100)
  if (shown >= THRESHOLDS.green * 100) return 'green'
  if (shown >= THRESHOLDS.amber * 100) return 'amber'
  return 'red'
}

function isDesignated(source: Source, step: Step): boolean {
  if (source.type === 'decision') return true
  // Documents on the controlled doc platform and systems of record are registered sources.
  if (source.type === 'doc' || source.type === 'business_app') return true
  // A person counts as designated only when RACI-responsible for this step.
  if (source.type === 'person') {
    return source.author_role.trim().toLowerCase() === step.step_owner_role.trim().toLowerCase()
  }
  return false
}

export function computeSignals(source: Source, step: Step, today: Date): Signals {
  const age = Math.max(0, monthsBetween(source.date, today))
  const reviewDate = source.last_reviewed ?? (source.type === 'doc' || source.type === 'business_app' || source.type === 'decision' ? source.date : null)
  const reviewed = reviewDate !== null && monthsBetween(reviewDate, today) <= REVIEW_MONTHS ? 1 : 0
  const ownerActive = source.owner_status === 'active' ? 1 : source.owner_status === 'moved' ? 0.5 : 0
  return {
    designated: isDesignated(source, step) ? 1 : 0,
    approved: source.approval_status === 'approved' ? 1 : 0,
    recent: Math.max(0, 1 - age / RECENCY_MONTHS),
    reviewed,
    ownerActive,
  }
}

export function weightOf(signals: Signals, weights: Weights): number {
  const keys = Object.keys(weights) as (keyof Weights)[]
  const total = keys.reduce((s, k) => s + weights[k], 0)
  if (total === 0) return 0
  return keys.reduce((s, k) => s + weights[k] * signals[k], 0) / total
}

const pct = (x: number) => `${Math.round(x * 100)}%`

export function scoreStep(
  step: Step,
  data: Dataset,
  weights: Weights,
  today: Date,
  resolution?: Resolution,
): StepResult {
  const sourceById = new Map(data.sources.map((s) => [s.id, s]))
  const reasons: string[] = []
  const claims = data.claims.filter((c) => c.step_id === step.id)

  const evidence: ScoredEvidence[] = claims.map((claim) => {
    const source = sourceById.get(claim.source_id)!
    const signals = computeSignals(source, step, today)
    return { claim, source, signals, weight: weightOf(signals, weights), status: 'supports' as const }
  })

  // Filter 1: scope. A source for another country is not evidence for this process.
  for (const e of evidence) {
    if (e.source.country !== data.process.client.country) {
      e.status = 'excluded'
      e.excludedReason = `Different country (${e.source.country}), process is ${data.process.client.country}`
      reasons.push(`Excluded "${e.source.title}": ${e.excludedReason}.`)
    }
  }

  // Echoes: a source that repeats another source confirms it, with a smaller bonus than an independent source.
  for (const e of evidence) {
    if (e.status === 'excluded' || !e.source.origin) continue
    const original = sourceById.get(e.source.origin)
    if (original) {
      e.echoOf = original.title
      reasons.push(`"${e.source.title}" repeats "${original.title}": counts as a confirmation, with half the bonus of an independent source.`)
    }
  }

  // Human decision: the chosen value becomes an approved, designated source; other values are overruled.
  if (resolution) {
    const decisionSource: Source = {
      id: `decision-${step.id}`,
      title: `QM decision (${resolution.decidedBy})`,
      type: 'decision',
      system: 'TruthMap',
      author_role: resolution.decidedBy,
      owner_status: 'active',
      approval_status: 'approved',
      date: resolution.date,
      country: data.process.client.country,
      client_specific: true,
      origin: null,
      text: resolution.rationale,
    }
    const decisionClaim: Claim = {
      id: `decision-claim-${step.id}`,
      step_id: step.id,
      source_id: decisionSource.id,
      value: resolution.value,
      statement: resolution.rationale,
      quote: resolution.rationale,
    }
    const signals = computeSignals(decisionSource, step, today)
    evidence.push({ claim: decisionClaim, source: decisionSource, signals, weight: weightOf(signals, weights), status: 'supports' })
    for (const e of evidence) {
      if (e.status !== 'excluded' && e.claim.value !== resolution.value) {
        e.status = 'overruled'
        e.excludedReason = `Overruled by QM decision on ${resolution.date}`
      }
    }
    reasons.push(`Resolved by ${resolution.decidedBy} on ${resolution.date}: "${resolution.rationale}".`)
  }

  const counted = evidence.filter((e) => e.status === 'supports')

  if (counted.length === 0) {
    reasons.push('No source describes this step: knowledge gap.')
    return { step, score: 0, band: 'gap', groups: [], evidence, agreement: 0, strength: 0, reasons, contested: false, undocumented: true, resolution }
  }

  // Group by value; the leading value has the highest total weight.
  const groupMap = new Map<string, ValueGroup>()
  for (const e of counted) {
    const g = groupMap.get(e.claim.value) ?? { value: e.claim.value, weight: 0, evidence: [] }
    g.weight += e.weight
    g.evidence.push(e)
    groupMap.set(e.claim.value, g)
  }
  const groups = [...groupMap.values()].sort((a, b) => b.weight - a.weight)
  const leading = groups[0]
  const totalWeight = groups.reduce((s, g) => s + g.weight, 0)
  for (const e of counted) e.status = e.claim.value === leading.value ? 'supports' : 'contradicts'

  const agreement = totalWeight > 0 ? leading.weight / totalWeight : 0
  const support = [...leading.evidence].sort((a, b) => b.weight - a.weight)
  const others = support.slice(1)
  const independent = others.filter((e) => !e.echoOf).length
  const echoes = others.length - independent
  const strength = Math.min(1, support[0].weight + CONFIRMATION_BONUS * independent + ECHO_BONUS * echoes)

  reasons.push(`Agreement ${pct(agreement)}: "${leading.value}" carries ${leading.weight.toFixed(2)} of ${totalWeight.toFixed(2)} total evidence weight.`)
  reasons.push(
    `Strength ${pct(strength)}: strongest supporting source weighs ${support[0].weight.toFixed(2)}` +
      (independent > 0 ? ` + ${independent} independent confirmation(s) × ${CONFIRMATION_BONUS}` : '') +
      (echoes > 0 ? ` + ${echoes} repeat(s) × ${ECHO_BONUS}` : '') +
      '.',
  )

  let score = agreement * strength

  const runnerUp = groups[1]
  const contested = !!runnerUp && runnerUp.weight >= CONTESTED_RATIO * leading.weight
  if (contested) {
    reasons.push(
      `Contested: "${runnerUp.value}" weighs ${runnerUp.weight.toFixed(2)} (≥ ${pct(CONTESTED_RATIO)} of the leading value). The model does not choose, a human decides. Capped at ${pct(CONTESTED_CAP)}.`,
    )
    score = Math.min(score, CONTESTED_CAP)
  } else if (runnerUp) {
    reasons.push(`Minor contradiction: "${runnerUp.value}" weighs only ${runnerUp.weight.toFixed(2)}, the leading value holds.`)
  }

  const undocumented = !leading.evidence.some(
    (e) => (e.source.type === 'doc' && e.source.approval_status === 'approved') || e.source.type === 'business_app' || e.source.type === 'decision',
  )
  if (undocumented) {
    reasons.push(`Undocumented practice: no approved document or system of record supports this value. Capped at ${pct(UNDOCUMENTED_CAP)}.`)
    score = Math.min(score, UNDOCUMENTED_CAP)
  }

  for (const e of leading.evidence) {
    if (e.source.owner_status === 'left') reasons.push(`Supporting source "${e.source.title}" has an owner who left the company.`)
    if (e.signals.reviewed === 0 && (e.source.type === 'doc' || e.source.type === 'business_app'))
      reasons.push(`"${e.source.title}" was not reviewed in the last ${REVIEW_MONTHS} months.`)
  }

  return {
    step,
    score,
    band: bandOf(score, true),
    leading,
    groups,
    evidence,
    agreement,
    strength,
    reasons,
    contested,
    undocumented,
    resolution,
  }
}

export function scoreProcess(
  data: Dataset,
  weights: Weights = DEFAULT_WEIGHTS,
  today: Date = new Date(),
  resolutions: Record<string, Resolution> = {},
): ProcessResult {
  const steps = [...data.process.steps]
    .sort((a, b) => a.order - b.order)
    .map((s) => scoreStep(s, data, weights, today, resolutions[s.id]))

  const totalCrit = steps.reduce((s, r) => s + r.step.criticality, 0)
  const score = totalCrit > 0 ? steps.reduce((s, r) => s + r.score * r.step.criticality, 0) / totalCrit : 0

  const criticalRed = steps.some((r) => r.step.criticality >= 3 && (r.band === 'red' || r.band === 'gap'))
  const anyNotGreen = steps.some((r) => r.band !== 'green')
  const status: ProcessResult['status'] = criticalRed ? 'Not release-ready' : anyNotGreen ? 'Needs attention' : 'Trusted'

  return { score, status, steps, actions: deriveActions(steps) }
}

const ownerOf = (e: ScoredEvidence) => (e.source.owner_status === 'active' ? e.source.author_role : 'Knowledge manager')

function deriveActions(steps: StepResult[]): Action[] {
  const actions: Action[] = []
  const seen = new Set<string>()
  const push = (a: Action) => {
    const key = `${a.kind}:${a.text}`
    if (!seen.has(key)) {
      seen.add(key)
      actions.push(a)
    }
  }

  for (const r of steps) {
    const owner = r.step.step_owner_role
    if (r.band === 'gap') {
      push({ kind: 'capture', stepId: r.step.id, text: `Capture knowledge for "${r.step.name}" (no source exists). Run a StarGaze capture session.`, who: owner })
      continue
    }
    if (r.contested && r.groups.length > 1) {
      push({
        kind: 'decide',
        stepId: r.step.id,
        text: `Decide "${r.step.name}": "${r.groups[0].value}" vs "${r.groups[1].value}".`,
        who: owner,
      })
    }
    if (r.undocumented) {
      push({ kind: 'document', stepId: r.step.id, text: `Document "${r.step.name}": today it only lives in chats and people's heads.`, who: owner })
    }
    for (const e of r.evidence) {
      // While a step is contested we don't know which side is right yet: no retire actions until a human decides.
      const losing = e.status === 'overruled' || (e.status === 'contradicts' && !r.contested)
      if (losing && (e.source.type === 'doc' || e.source.type === 'business_app')) {
        push({ kind: 'retire', stepId: r.step.id, text: `Update or retire "${e.source.title}": it says "${e.claim.value}".`, who: ownerOf(e) })
      }
      if (e.status === 'supports' && e.source.owner_status === 'left') {
        push({ kind: 'reassign', stepId: r.step.id, text: `Assign a new owner to "${e.source.title}" (owner left).`, who: 'Knowledge manager' })
      }
      if (e.status === 'supports' && e.source.type === 'doc' && e.signals.reviewed === 0) {
        push({ kind: 'review', stepId: r.step.id, text: `Review "${e.source.title}" (not reviewed in 12 months).`, who: ownerOf(e) })
      }
    }
  }
  return actions
}
