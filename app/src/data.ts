import type { Claim, Dataset, Process, Source } from './engine'
import offProcess from '../../process/offboarding/process.json'
import offSources from '../../process/offboarding/sources.json'
import offClaims from '../../process/offboarding/claims.json'

export const DATASETS: Dataset[] = [
  {
    process: offProcess as Process,
    sources: offSources as Source[],
    claims: offClaims as Claim[],
  },
]
