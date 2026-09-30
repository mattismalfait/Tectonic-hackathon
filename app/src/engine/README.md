# Scoring engine

All calculations live here. No UI code. The UI calls one function:

```ts
import { scoreProcess } from './engine'
const result = scoreProcess(dataset)            // dataset = { process, sources, claims, master }
```

| File | What it does |
|---|---|
| `signals.ts` | 5 objective signals per source (designated · approved · recent · reviewed · owner active) → source weight 0..1 |
| `evidence.ts` | Collects the evidence for a step: weights, country filter, repeats, QM decisions |
| `master.ts` | **Compares every source to the master SOP, step by step, and builds the explanation** |
| `consensus.ts` | Fallback when a process has no master (most-weighted value leads) |
| `actions.ts` | Turns results into actions routed to the role that can fix them |
| `sop.ts` | Adapter for Gilles's SOP engine: one SOP per source → claims (`sopsToDataset`) |
| `types.ts` | All data shapes |

## The score per step (master mode)
`step score = weight of sources that confirm the master / weight of all sources that mention the step`
- A repeat of another source counts for half.
- **Cap 70%** if only low-weight sources (< 0.5) confirm the master, or if no doc/SAP covers the step at all.
- No source at all → `gap`.
- Process score = criticality-weighted average of the step scores. A red critical step makes it "Not release-ready".

## What the UI gets per step: `result.steps[i].explanation`

```ts
explanation.headline
// "56%: the new doc and the old doc differ from the master; 1 message, SAP and 1 person confirm it."

explanation.master            // { value, statement }: what the gold says

explanation.categories.docs      // the 4 views, always present, in this order
explanation.categories.messages  //   .status   'confirms' | 'differs' | 'mixed' | 'silent'
explanation.categories.sap       //   .summary  one sentence, e.g. 'Differs: the new doc "LUM-PAY-007 v2.0" (2026-02-16) says "active as soon as saved". Master: "four-eyes".'
explanation.categories.people    //   .sources  SourceComparison[] (below)

explanation.docs.new / .docs.old // docs split by age (new = younger than 24 months)

explanation.crossChecks       // [{ a, b, match, sentence }] on recent sources, e.g.
// "Recent docs and recent people don't match: docs say "active as soon as saved", people say "four-eyes"."
// "Recent messages and recent people match (both follow the master)."

explanation.calculation       // { weightConfirming, weightDiffering, weightTotal, conformance, cap?, formula }
// formula: "conformance = confirming weight 1.74 / total weight 3.09 = 56%"
```

Every `SourceComparison` has: `title, type, system, authorRole, date, ageMonths, age ('new'|'old'), weight, signals, verdict ('confirms'|'differs'|'excluded'), says, statement, quote, masterSays, note`.

Also per step: `score` (0..1), `band` ('green' ≥75 · 'amber' 50–75 · 'red' <50 · 'gap'), `evidence` (raw), `reasons` (all sentences above as a flat list).
Per process: `result.score`, `result.status`, `result.actions` ([{ kind, text, who, stepId }]).

## Input from the matcher (Gilles)
One result per raw file: the master SOP with the file it was checked against and `match` per step (see `matcher/ARCHITECTURE.md`):

```json
{ "id": "proc-bank-account-change", "name": "…",
  "source": "data/bank-account-change/raw/people/stargaze_payroll-consultant_screen-recording_2026-09-10.txt",
  "steps": [ { "id": "step-3", "name": "Verify the employee's identity",
               "description": "Make sure the request really comes from the employee …",
               "match": true } ] }
```

`sopsToDataset(process, masterSop, results, sources)` turns these into the engine's input.
- **`source` → source id** via the hardcoded table `SOURCE_FILES` in `sop.ts` (raw file name → `src-NN` in `sources.json`). The 5 signals come from that source's metadata.
- **A file not in the table** (a new recorder `.jsonl`, the Slack export that holds several messages) gets a source built from its path: type from the folder or extension (else `person`), date from a `YYYY-MM-DD` in the file name (else today), unreviewed. It is never dropped.
- **Per step:** `match` is the verdict. `source_id` and `matches_master` are still accepted if present; without any verdict the description is compared to the master's (word overlap ≥ 50%).
- Step ids should be the master's ids; otherwise steps are matched on their name.
