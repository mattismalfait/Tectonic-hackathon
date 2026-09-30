/* ourSDbrain prototype: editable content.
   Texts shown in the UI that are not in the process data. Keys are step ids from process.json. */

// Which process folder in /data the prototype shows (must match a file in prototype/data/).
const PROCESS_ID = 'bank-account-change';

// Id of the source that counts as "the official procedure" (the reference in the steps matrix).
const OFFICIAL_SOURCE_ID = 'src-01';

// Extra explanation per step: "todo" = What to do, "next" = follow-up after a decision (key = chosen value, "*" = any other).
const CONTEXT = {
  'step-1': { todo: 'The approved procedure says portal only, but the client emails a list every month because its intranet still shows the 2022 instructions.', next: { 'only via the MyPayslip self-service portal': 'Next: retire v1.2 and fix the client intranet.', '*': 'Next: update LUM-PAY-007 v2.0 so it matches practice.' } },
  'step-3': { todo: 'The new call-back control is mostly followed, but a former consultant still works the old way. Send a reminder and retire v1.2.' },
  'step-4': { todo: 'Even the newest approved procedure misses a control that SAP enforces: a second consultant must approve the change.', next: { 'released only after a second consultant approves (four-eyes)': 'Next: update LUM-PAY-007 with the four-eyes step.', '*': 'Next: ask the SAP team to remove the four-eyes workflow.' } },
  'step-5': { todo: 'The recent procedure and SAP agree on the 15th. Only old sources still say the 20th. Retire v1.2.' },
};

// Other procedures shown on the home screen and in the dropdown (not worked out in this prototype).
// Figures computed with the same engine on data/offboarding.
const OTHER_PROCEDURES = [
  {
    name: 'Offboarding of a senior employee', steps: 8, sources: 19, score: .54, status: 'Not release-ready', decisions: 2, checks: 2,
    attention: [
      { t: 'Decide: CLA or SAP config for the final pay?', m: 'Offboarding · step 4 · SD Worx payroll consultant', score: .404 },
      { t: 'Decide: 13 weeks or 6 months notice?', m: 'Offboarding · step 2 · Client HR manager', score: .322 },
    ],
  },
];
