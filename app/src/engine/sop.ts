// Adapter for the matcher (Gilles). The matcher returns the master SOP, checked against one raw file:
//
// {
//   "id": "proc-bank-account-change", "name": "…",
//   "source": "data/bank-account-change/raw/people/stargaze_…_2026-09-10.txt",  // the raw file it checked
//   "steps": [ { "id": "step-3", "name": "Verify the employee's identity",
//                "description": "Make sure the request really comes from the employee …",
//                "match": true | false } ]      // did the step happen in that source?
// }
//
// `source` is turned into a source_id with SOURCE_FILES below (hardcoded per raw file). A file that
// is not in the table (a new recording, the Slack export) gets a source built from its path, so no
// matcher output is dropped. `source_id` and `matches_master` are still accepted when present.
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
  /** Matcher verdict: the step happened in the source. */
  match?: boolean
  matches_master?: boolean
  /** Matcher: short phrase for what the source says or does for this step. */
  says?: string
  quote?: string
}

export interface SOP {
  id: string
  name: string
  /** Matcher: path of the raw file the SOP was checked against. */
  source?: string
  source_id?: string
  steps: SopStep[]
}

/** Raw file name -> source id in sources.json, per process. Files not listed get a source from their path. */
export const SOURCE_FILES: Record<string, Record<string, string>> = {
  'proc-bank-account-change': {
    'LUM-PAY-007_v2.0_2026_bank-account-change.docx': 'src-01',
    'LUM-PAY-007_v1.2_2022_bank-account-change.docx': 'src-02',
    'lumina-intranet-hr-faq-bank-account.md': 'src-03',
    'sap_PAYINFO_CHG_LUM.txt': 'src-04',
    'sap_ZPAYLOCK_BE.txt': 'src-05',
    '2026-08-21_lumina-hr_monthly-iban-list.txt': 'src-17',
    'stargaze_payroll-consultant_screen-recording_2026-09-10.txt': 'src-18',
    'stargaze_former-lumina-consultant_interview_2026-09-12.txt': 'src-19',
    'stargaze_lumina-hr-manager_interview_2026-08-28.txt': 'src-20',
  },
}

const baseName = (path: string) => path.split(/[\\/]/).pop() ?? path

/** Source type from the raw folder or extension. Recorder output (.jsonl) and anything unknown is a person capture. */
function typeFromPath(path: string): Source['type'] {
  const p = path.replace(/\\/g, '/').toLowerCase()
  if (p.includes('/docs/') || /\.(docx?|pdf|md)$/.test(p)) return 'doc'
  if (p.includes('/apps/')) return 'business_app'
  if (p.includes('/chat/')) return 'chat'
  if (p.includes('/email/')) return 'email'
  return 'person'
}

const SYSTEM_OF: Record<Source['type'], string> = {
  doc: 'Document',
  business_app: 'SAP SuccessFactors',
  chat: 'Slack',
  email: 'Outlook',
  person: 'Recorder',
  decision: 'Quality manager',
}

/** A source for a raw file with no entry in sources.json: dated from the file name (else today), unreviewed. */
export function sourceFromPath(path: string, country: string, today = new Date()): Source {
  const name = baseName(path)
  const type = typeFromPath(path)
  const date = name.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? today.toISOString().slice(0, 10)
  return {
    id: `file:${name}`,
    title: name,
    type,
    system: SYSTEM_OF[type],
    author_role: 'Unknown',
    owner_status: 'active',
    approval_status: 'unreviewed',
    date,
    last_reviewed: null,
    country,
    client_specific: true,
    origin: null,
    text: '',
  }
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
  const all = [...sources]
  const known = new Set(sources.map((s) => s.id))
  const files = SOURCE_FILES[process.id] ?? {}

  const claims: Claim[] = []
  for (const sop of sops) {
    let sourceId = sop.source_id ?? (sop.source ? files[baseName(sop.source)] : undefined)
    if (!sourceId && sop.source) {
      const extra = sourceFromPath(sop.source, process.client.country)
      if (!known.has(extra.id)) {
        all.push(extra)
        known.add(extra.id)
      }
      sourceId = extra.id
    }
    if (!sourceId || !known.has(sourceId)) continue // no metadata, no weight: skip rather than guess
    sop.steps.forEach((step, i) => {
      const m = byId.get(step.id) ?? byName.get(norm(step.name))
      if (!m) return // step not in the master
      claims.push({
        id: `${sourceId}-${m.id}-${i}`,
        step_id: m.id,
        source_id: sourceId!,
        value: step.says ?? step.description,
        statement: step.says ?? step.description,
        quote: step.quote ?? step.description,
        matches_master: step.matches_master ?? step.match ?? similarity(step.description, m.description) >= SIMILARITY_THRESHOLD,
      })
    })
  }
  return { process, master: masterSop, sources: all, claims }
}

/**
 * A dataset with the matcher's results folded in: for every source the matcher checked, its
 * results replace that source's hand-made claims. The master (gold values) is kept as it is.
 */
export function withMatcherResults(data: Dataset, sops: SOP[]): Dataset {
  if (sops.length === 0) return data
  const asSop: SOP = { id: data.process.id, name: data.process.name, steps: data.process.steps }
  const matched = sopsToDataset(data.process, asSop, sops, data.sources)
  const checked = new Set(matched.claims.map((c) => c.source_id))
  return {
    ...data,
    sources: matched.sources,
    claims: [...data.claims.filter((c) => !checked.has(c.source_id)), ...matched.claims],
  }
}
