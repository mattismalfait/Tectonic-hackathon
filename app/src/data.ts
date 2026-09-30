import type { Claim, Dataset, MasterSOP, Process, Source } from './engine'
import bankProcess from '../../process/bank-account-change/process.json'
import bankSources from '../../process/bank-account-change/sources.json'
import bankClaims from '../../process/bank-account-change/claims.json'
import bankMaster from '../../process/bank-account-change/master.json'
import offProcess from '../../process/offboarding/process.json'
import offSources from '../../process/offboarding/sources.json'
import offClaims from '../../process/offboarding/claims.json'
import offMaster from '../../process/offboarding/master.json'

export const DATASETS: Dataset[] = [
  {
    process: bankProcess as Process,
    sources: bankSources as Source[],
    claims: bankClaims as Claim[],
    master: bankMaster as MasterSOP,
  },
  {
    process: offProcess as Process,
    sources: offSources as Source[],
    claims: offClaims as Claim[],
    master: offMaster as MasterSOP,
  },
]
