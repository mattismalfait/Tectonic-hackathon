// Public entry point of the scoring engine. The UI only needs scoreProcess().
//
// With a master SOP (dataset.master): every source is compared to the master, step by step,
// and each step gets a full explanation (result.steps[i].explanation). Without a master,
// the engine falls back to consensus scoring (the value with the most evidence weight leads).

import { deriveActions } from './actions'
import { scoreStepConsensus } from './consensus'
import { scoreStepMaster } from './master'
import { DEFAULT_WEIGHTS } from './signals'
import type { Dataset, ProcessResult, Resolution, Weights } from './types'

export function scoreProcess(
  data: Dataset,
  weights: Weights = DEFAULT_WEIGHTS,
  today: Date = new Date(),
  resolutions: Record<string, Resolution> = {},
): ProcessResult {
  const mode = data.master ? 'master' : 'consensus'
  const steps = [...data.process.steps]
    .sort((a, b) => a.order - b.order)
    .map((s) =>
      data.master
        ? scoreStepMaster(s, data, data.master, weights, today, resolutions[s.id])
        : scoreStepConsensus(s, data, weights, today, resolutions[s.id]),
    )

  const totalCrit = steps.reduce((s, r) => s + r.step.criticality, 0)
  const score = totalCrit > 0 ? steps.reduce((s, r) => s + r.score * r.step.criticality, 0) / totalCrit : 0

  const criticalRed = steps.some((r) => r.step.criticality >= 3 && (r.band === 'red' || r.band === 'gap'))
  const anyNotGreen = steps.some((r) => r.band !== 'green')
  const status: ProcessResult['status'] = criticalRed ? 'Not release-ready' : anyNotGreen ? 'Needs attention' : 'Trusted'

  return { mode, score, status, steps, actions: deriveActions(steps, mode) }
}

export * from './types'
export { DEFAULT_WEIGHTS, SIGNAL_LABELS, computeSignals, weightOf, RECENT_MONTHS } from './signals'
export { THRESHOLDS, bandOf, pct } from './util'
export { CATEGORY_LABELS, categoryOf } from './master'
export { sopsToDataset, masterFromSop, processFromSop, similarity, type SOP, type SopStep } from './sop'
