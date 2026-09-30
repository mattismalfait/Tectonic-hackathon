// All data shapes used by the scoring engine. No logic in this file.

export type SourceType = 'doc' | 'business_app' | 'chat' | 'email' | 'person' | 'decision'

/** The four views the UI shows per step. */
export type Category = 'docs' | 'messages' | 'sap' | 'people'

export interface Step {
  id: string
  order: number
  name: string
  description: string
  criticality: number
  step_owner_role: string
}

export interface Process {
  id: string
  name: string
  client: { id: string; name: string; country: string; joint_committee?: string }
  case?: Record<string, string | number>
  steps: Step[]
}

export interface Source {
  id: string
  title: string
  type: SourceType
  system: string
  author_role: string
  owner_status: 'active' | 'moved' | 'left' | 'none'
  approval_status: 'approved' | 'draft' | 'unreviewed' | 'n/a'
  date: string
  last_reviewed?: string | null
  country: string
  client_specific: boolean
  origin: string | null
  text: string
}

/** What one source says about one step (one row of a source SOP). */
export interface Claim {
  id: string
  step_id: string
  source_id: string
  value: string
  statement: string
  quote: string
  /** Optional: set by the SOP engine when it already judged the step against the master. */
  matches_master?: boolean
}

/** The gold reference: one value per step. */
export interface MasterSOP {
  process_id: string
  title: string
  owner_role: string
  version: string
  date: string
  steps: { step_id: string; value: string; statement: string }[]
}

export interface Dataset {
  process: Process
  sources: Source[]
  claims: Claim[]
  master?: MasterSOP
}

export interface Weights {
  designated: number
  approved: number
  recent: number
  reviewed: number
  ownerActive: number
}

export type Signals = Weights

export type Band = 'green' | 'amber' | 'red' | 'gap'

export interface ScoredEvidence {
  claim: Claim
  source: Source
  signals: Signals
  weight: number
  /** supports = agrees with the master (or the leading value without a master); contradicts = differs. */
  status: 'supports' | 'contradicts' | 'excluded' | 'overruled'
  excludedReason?: string
  echoOf?: string
}

export interface ValueGroup {
  value: string
  weight: number
  evidence: ScoredEvidence[]
}

export interface Resolution {
  stepId: string
  value: string
  rationale: string
  decidedBy: string
  date: string
}

// ---------- Explanation (master comparison): everything the UI needs to show WHY ----------

export interface SourceComparison {
  sourceId: string
  title: string
  type: SourceType
  system: string
  authorRole: string
  date: string
  ageMonths: number
  /** 'new' when younger than RECENT_MONTHS, otherwise 'old'. */
  age: 'new' | 'old'
  weight: number
  signals: Signals
  verdict: 'confirms' | 'differs' | 'excluded'
  says: string
  statement: string
  quote: string
  masterSays: string
  /** e.g. "repeats 'LUM-PAY-007 v1.2'" or "different country (NL)" */
  note?: string
}

export interface CategoryView {
  category: Category
  label: string
  /** confirms = all counted sources match the master; differs = none do; mixed = some do; silent = no source. */
  status: 'confirms' | 'differs' | 'mixed' | 'silent'
  sources: SourceComparison[]
  weightConfirming: number
  weightDiffering: number
  /** One sentence, e.g. "Differs: the new doc (2026-02-16) says 'active as soon as saved'." */
  summary: string
}

export interface StepExplanation {
  master: { value: string; statement: string }
  /** One sentence for the step header, e.g. "56%: the new doc and the old doc differ from the master; SAP, 1 message and 1 person confirm it." */
  headline: string
  /** Always all four categories, in the order docs, messages, sap, people. */
  categories: Record<Category, CategoryView>
  /** Docs split by age, as requested: what new and old docs say compared to the master. */
  docs: { new: SourceComparison[]; old: SourceComparison[] }
  /** Pairwise checks between categories on recent sources, e.g. "Recent docs and recent people don't match." */
  crossChecks: { a: Category; b: Category; match: boolean; sentence: string }[]
  calculation: {
    weightConfirming: number
    weightDiffering: number
    weightTotal: number
    conformance: number
    cap?: { value: number; reason: string }
    formula: string
  }
}

export interface StepResult {
  step: Step
  score: number
  band: Band
  leading?: ValueGroup
  groups: ValueGroup[]
  evidence: ScoredEvidence[]
  agreement: number
  strength: number
  reasons: string[]
  contested: boolean
  undocumented: boolean
  resolution?: Resolution
  /** Present when the dataset has a master SOP. */
  explanation?: StepExplanation
}

export interface Action {
  kind: 'decide' | 'review' | 'reassign' | 'document' | 'capture' | 'retire' | 'align'
  stepId?: string
  text: string
  who: string
}

export interface ProcessResult {
  mode: 'master' | 'consensus'
  score: number
  status: 'Trusted' | 'Needs attention' | 'Not release-ready'
  steps: StepResult[]
  actions: Action[]
}
