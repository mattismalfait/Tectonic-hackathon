import type { Claim, Dataset, MasterSOP, Process, Source } from './engine'
import bankProcess from '../../data/bank-account-change/process.json'
import bankSources from '../../data/bank-account-change/sources.json'
import bankClaims from '../../data/bank-account-change/claims.json'
import bankMaster from '../../data/bank-account-change/master.json'
import offProcess from '../../data/offboarding/process.json'
import offSources from '../../data/offboarding/sources.json'
import offClaims from '../../data/offboarding/claims.json'
import offMaster from '../../data/offboarding/master.json'

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
