import { sopsToDataset, type Claim, type Dataset, type MasterSOP, type Process, type SOP, type Source } from './engine'
import bankProcess from '../../data/bank-account-change/process.json'
import bankSources from '../../data/bank-account-change/sources.json'
import bankClaims from '../../data/bank-account-change/claims.json'
import bankMaster from '../../data/bank-account-change/master.json'
import offProcess from '../../data/offboarding/process.json'
import offSources from '../../data/offboarding/sources.json'
import offClaims from '../../data/offboarding/claims.json'
import offMaster from '../../data/offboarding/master.json'

// Matcher results (see data/CONVENTION.md): data/<process>/sops/*.json, loaded at build time.
const SOP_FILES = import.meta.glob<SOP>('../../data/*/sops/*.json', { eager: true, import: 'default' })

function sopsFor(folder: string): SOP[] {
  return Object.entries(SOP_FILES)
    .filter(([path]) => path.includes(`/data/${folder}/sops/`))
    .map(([, sop]) => sop)
}

/** Hand-made claims, with the matcher's results replacing the claims of every source it checked. */
function build(folder: string, process: Process, sources: Source[], claims: Claim[], master: MasterSOP): Dataset {
  const sops = sopsFor(folder)
  if (sops.length === 0) return { process, sources, claims, master }
  const asSop: SOP = { id: process.id, name: process.name, steps: process.steps }
  const matched = sopsToDataset(process, asSop, sops, sources)
  const checked = new Set(matched.claims.map((c) => c.source_id))
  return {
    process,
    sources: matched.sources,
    claims: [...claims.filter((c) => !checked.has(c.source_id)), ...matched.claims],
    master,
  }
}

export const DATASETS: Dataset[] = [
  build('bank-account-change', bankProcess as Process, bankSources as Source[], bankClaims as Claim[], bankMaster as MasterSOP),
  build('offboarding', offProcess as Process, offSources as Source[], offClaims as Claim[], offMaster as MasterSOP),
]
