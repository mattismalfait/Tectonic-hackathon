import type { Band } from './types'

export const THRESHOLDS = { green: 0.75, amber: 0.5 }

export const pct = (x: number) => `${Math.round(x * 100)}%`

/** Band on the displayed (rounded) percentage, so "75%" is never shown as amber. */
export function bandOf(score: number, hasEvidence: boolean): Band {
  if (!hasEvidence) return 'gap'
  const shown = Math.round(score * 100)
  if (shown >= THRESHOLDS.green * 100) return 'green'
  if (shown >= THRESHOLDS.amber * 100) return 'amber'
  return 'red'
}
