import { withMatcherResults, type Claim, type Dataset, type MasterSOP, type Process, type SOP, type Source } from './engine'
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

const sopsFor = (folder: string): SOP[] =>
  Object.entries(SOP_FILES)
    .filter(([path]) => path.includes(`/data/${folder}/sops/`))
    .map(([, sop]) => sop)

export const DATASETS: Dataset[] = [
  withMatcherResults(
    { process: bankProcess as Process, sources: bankSources as Source[], claims: bankClaims as Claim[], master: bankMaster as MasterSOP },
    sopsFor('bank-account-change'),
  ),
  withMatcherResults(
    { process: offProcess as Process, sources: offSources as Source[], claims: offClaims as Claim[], master: offMaster as MasterSOP },
    sopsFor('offboarding'),
  ),
]
