// Layer 2: collect the evidence for one step: weight every claim, apply the scope filter,
// mark repeats, and add a quality manager's decision if there is one.

import { computeSignals, weightOf } from './signals'
import type { Claim, Dataset, Resolution, ScoredEvidence, Source, Step, Weights } from './types'

export function collectEvidence(
  step: Step,
  data: Dataset,
  weights: Weights,
  today: Date,
  resolution?: Resolution,
): { evidence: ScoredEvidence[]; reasons: string[] } {
  const sourceById = new Map(data.sources.map((s) => [s.id, s]))
  const reasons: string[] = []

  const evidence: ScoredEvidence[] = data.claims
    .filter((c) => c.step_id === step.id && sourceById.has(c.source_id))
    .map((claim) => {
      const source = sourceById.get(claim.source_id)!
      const signals = computeSignals(source, step, today)
      return { claim, source, signals, weight: weightOf(signals, weights), status: 'supports' as const }
    })

  // Scope: a source for another country is not evidence for this process.
  for (const e of evidence) {
    if (e.source.country !== data.process.client.country) {
      e.status = 'excluded'
      e.excludedReason = `different country (${e.source.country}), process is ${data.process.client.country}`
      reasons.push(`Excluded "${e.source.title}": ${e.excludedReason}.`)
    }
  }

  // Repeats still count, but are marked so the explanation (and the bonus) can tell them apart.
  for (const e of evidence) {
    if (e.status === 'excluded' || !e.source.origin) continue
    const original = sourceById.get(e.source.origin)
    if (original) e.echoOf = original.title
  }

  if (resolution) {
    const source: Source = {
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
    const claim: Claim = {
      id: `decision-claim-${step.id}`,
      step_id: step.id,
      source_id: source.id,
      value: resolution.value,
      statement: resolution.rationale,
      quote: resolution.rationale,
    }
    const signals = computeSignals(source, step, today)
    evidence.push({ claim, source, signals, weight: weightOf(signals, weights), status: 'supports' })
    reasons.push(`Resolved by ${resolution.decidedBy} on ${resolution.date}: "${resolution.rationale}".`)
  }

  return { evidence, reasons }
}
