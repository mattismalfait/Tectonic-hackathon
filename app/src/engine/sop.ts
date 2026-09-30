// Adapter for the SOP engine (Gilles): turns "one SOP per source" into the claims the scorer reads.
//
// Expected input, one object per source:
// {
//   "source": { ...Source metadata: id, title, type, system, author_role, owner_status,
//               approval_status, date, last_reviewed?, country, client_specific, origin, text },
//   "steps": [ { "step_id": "step-4", "value": "short normalised value", "statement": "...",
//                "quote": "verbatim text from the source", "matches_master": true|false (optional) } ]
// }
// Step ids must be the master SOP's step ids. Only steps the source actually mentions are listed.

import type { Claim, Dataset, MasterSOP, Process, Source } from './types'

export interface SourceSOP {
  source: Source
  steps: { step_id: string; value: string; statement: string; quote?: string; matches_master?: boolean }[]
}

export function sopsToDataset(process: Process, master: MasterSOP, sops: SourceSOP[]): Dataset {
  const claims: Claim[] = sops.flatMap((sop) =>
    sop.steps.map((s, i) => ({
      id: `${sop.source.id}-${s.step_id}-${i}`,
      step_id: s.step_id,
      source_id: sop.source.id,
      value: s.value,
      statement: s.statement,
      quote: s.quote ?? s.statement,
      matches_master: s.matches_master,
    })),
  )
  return { process, master, sources: sops.map((s) => s.source), claims }
}
