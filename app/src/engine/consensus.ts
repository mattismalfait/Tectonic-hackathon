// Layer 3 (consensus mode, used only when a process has no master SOP):
// the value with the most evidence weight leads; step score = agreement × strength.

import { collectEvidence } from './evidence'
import type { Dataset, Resolution, Step, StepResult, ValueGroup, Weights } from './types'
import { bandOf, pct } from './util'

const CONTESTED_RATIO = 0.5
const CONTESTED_CAP = 0.45
const UNDOCUMENTED_CAP = 0.7
const CONFIRMATION_BONUS = 0.1
const ECHO_BONUS = 0.05

export function scoreStepConsensus(step: Step, data: Dataset, weights: Weights, today: Date, resolution?: Resolution): StepResult {
  const { evidence, reasons } = collectEvidence(step, data, weights, today, resolution)

  if (resolution) {
    for (const e of evidence) {
      if (e.status !== 'excluded' && e.claim.value !== resolution.value) {
        e.status = 'overruled'
        e.excludedReason = `Overruled by QM decision on ${resolution.date}`
      }
    }
  }

  const counted = evidence.filter((e) => e.status === 'supports')
  if (counted.length === 0) {
    reasons.push('No source describes this step: knowledge gap.')
    return { step, score: 0, band: 'gap', groups: [], evidence, agreement: 0, strength: 0, reasons, contested: false, undocumented: true, resolution }
  }

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

  return { step, score, band: bandOf(score, true), leading, groups, evidence, agreement, strength, reasons, contested, undocumented, resolution }
}
