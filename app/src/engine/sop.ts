// Adapter for the SOP engine (Gilles). Every document or people transcription becomes one SOP:
//
// {
//   "id": "proc-bank-account-change", "name": "…",
//   "source_id": "src-01",                       // which source this SOP was built from (metadata in sources.json)
//   "steps": [ { "id": "step-3", "name": "Verify the employee's identity",
//                "description": "Make sure the request really comes from the employee …",
//                "matches_master": true | false,  // optional: the SOP engine's own verdict
//                "quote": "…" } ]                 // optional: verbatim text from the source
// }
//
// The master SOP has the same shape (without source_id). Step ids should be the master's ids;
// if they are not, steps are matched on their name. When matches_master is missing, the
// description is compared to the master's description (word overlap), so the SOP engine's
// verdict is preferred whenever it is available.

import type { Claim, Dataset, MasterSOP, Process, Source } from './types'

export interface SopStep {
  id: string
  name: string
  description: string
  matches_master?: boolean
  quote?: string
}

export interface SOP {
  id: string
  name: string
  source_id?: string
  steps: SopStep[]
}

/** Word-overlap similarity (Jaccard on words of 3+ letters), 0..1. */
export function similarity(a: string, b: string): number {
  const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9à-ÿ]{3,}/g) ?? [])
  const wa = words(a)
  const wb = words(b)
  if (wa.size === 0 || wb.size === 0) return 0
  let shared = 0
  for (const w of wa) if (wb.has(w)) shared++
  return shared / (wa.size + wb.size - shared)
}

export const SIMILARITY_THRESHOLD = 0.5

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

export function masterFromSop(master: SOP, ownerRole = 'Quality manager', version = '1.0', date = new Date().toISOString().slice(0, 10)): MasterSOP {
  return {
    process_id: master.id,
    title: master.name,
    owner_role: ownerRole,
    version,
    date,
    steps: master.steps.map((s) => ({ step_id: s.id, value: s.description, statement: s.description })),
  }
}

export function processFromSop(master: SOP, client: Process['client']): Process {
  return {
    id: master.id,
    name: master.name,
    client,
    steps: master.steps.map((s, i) => ({
      id: s.id,
      order: i + 1,
      name: s.name,
      description: s.description,
      criticality: 2,
      step_owner_role: 'Process owner',
    })),
  }
}

/**
 * Build a scoring dataset from the master SOP and the SOPs per source.
 * `sources` holds the metadata (type, date, owner, approval, …) that the five signals need.
 */
export function sopsToDataset(process: Process, master: SOP, sops: SOP[], sources: Source[]): Dataset {
  const masterSop = masterFromSop(master)
  const byId = new Map(master.steps.map((s) => [s.id, s]))
  const byName = new Map(master.steps.map((s) => [norm(s.name), s]))
  const known = new Set(sources.map((s) => s.id))

  const claims: Claim[] = []
  for (const sop of sops) {
    if (!sop.source_id || !known.has(sop.source_id)) continue // no metadata, no weight: skip rather than guess
    sop.steps.forEach((step, i) => {
      const m = byId.get(step.id) ?? byName.get(norm(step.name))
      if (!m) return // step not in the master
      claims.push({
        id: `${sop.source_id}-${m.id}-${i}`,
        step_id: m.id,
        source_id: sop.source_id!,
        value: step.description,
        statement: step.description,
        quote: step.quote ?? step.description,
        matches_master: step.matches_master ?? similarity(step.description, m.description) >= SIMILARITY_THRESHOLD,
      })
    })
  }
  return { process, master: masterSop, sources, claims }
}
