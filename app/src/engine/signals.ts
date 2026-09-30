// Layer 1: the five objective signals per source, and the source weight.
// Every signal is a fact a system can check; the weights between them are policy.

import type { Signals, Source, Step, Weights } from './types'

export const DEFAULT_WEIGHTS: Weights = { designated: 1, approved: 1, recent: 1, reviewed: 1, ownerActive: 1 }

export const SIGNAL_LABELS: Record<keyof Weights, string> = {
  designated: 'Designated source for this step',
  approved: 'Formally approved',
  recent: 'Recent (36-month decay)',
  reviewed: 'Reviewed / verified in last 12 months',
  ownerActive: 'Owner still active in role',
}

export const RECENCY_MONTHS = 36
export const REVIEW_MONTHS = 12
/** Sources younger than this are labelled "new" in explanations. */
export const RECENT_MONTHS = 24

export function monthsBetween(from: string, to: Date): number {
  return (to.getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24 * 30.44)
}

/** Docs and systems of record are registered sources; a person only when RACI-responsible for the step. */
export function isDesignated(source: Source, step: Step): boolean {
  if (source.type === 'decision' || source.type === 'doc' || source.type === 'business_app') return true
  if (source.type === 'person') return source.author_role.trim().toLowerCase() === step.step_owner_role.trim().toLowerCase()
  return false
}

export function computeSignals(source: Source, step: Step, today: Date): Signals {
  const age = Math.max(0, monthsBetween(source.date, today))
  const reviewDate =
    source.last_reviewed ?? (source.type === 'doc' || source.type === 'business_app' || source.type === 'decision' ? source.date : null)
  return {
    designated: isDesignated(source, step) ? 1 : 0,
    approved: source.approval_status === 'approved' ? 1 : 0,
    recent: Math.max(0, 1 - age / RECENCY_MONTHS),
    reviewed: reviewDate !== null && monthsBetween(reviewDate, today) <= REVIEW_MONTHS ? 1 : 0,
    ownerActive: source.owner_status === 'active' ? 1 : source.owner_status === 'moved' ? 0.5 : 0,
  }
}

/** Source weight = weighted average of the five signals (0..1). */
export function weightOf(signals: Signals, weights: Weights): number {
  const keys = Object.keys(weights) as (keyof Weights)[]
  const total = keys.reduce((s, k) => s + weights[k], 0)
  return total === 0 ? 0 : keys.reduce((s, k) => s + weights[k] * signals[k], 0) / total
}

