# Expected outcomes per step (synthetic, illustrative)

Bands: GREEN >= 75, AMBER 50-75, RED < 50. "Today" = 2026-09-30. Scores below are what `app/src/engine.ts` (default weights) computes for this dataset.

**Process: 71% · Not release-ready.** After the QM resolves step 1 (portal only) and step 4 (four-eyes): **90% · Needs attention** (step 3 stays amber).

## The two procedure documents differ in exactly 3 of 7 steps

| Step | v1.2 (src-02, 2022, owner left) | v2.0 (src-01, 2026, owner active) |
|---|---|---|
| 1 Receive the request | employee emails HR, HR forwards | MyPayslip portal only |
| 3 Verify identity | check the sender's email address | call back on the number already on file |
| 5 Cut-off | 20th | 15th |

Steps 2, 4, 6, 7 are word-for-word identical. Step 4 is identical but **wrong in both**: SAP enforces a four-eyes approval that neither version mentions.

## Per step

| Step | Crit | Sources (claims) | Pattern the engine must detect | Engine result |
|---|---|---|---|---|
| step-1 Receive the request | 2 | Portal: src-01 doc 2026, src-07 + src-09 Slack. Email: src-02 doc 2022, src-03 intranet (copy of src-02), src-06/08/15 Slack, src-17 email, src-18/19/20 StarGaze | **Reality drifted from the approved doc.** The newest approved doc says portal only, but the client's HR, the email thread, recent Slack and even our own consultant's screen recording show the email route is alive. The model doesn't choose. src-03 is a copy of src-02 and counts once. | **RED 45%, contested** → human decides |
| step-2 Check the IBAN | 2 | src-01, src-02, src-04 SAP validation | Two docs and the system of record agree | GREEN 100% |
| step-3 Verify identity | 3 | Call-back: src-01, src-09, src-11 Slack, src-18 StarGaze. Sender check: src-02, src-06, src-08 Slack, src-19 StarGaze (moved) | New control mostly followed, the old habit lingers with the former consultant | AMBER 68%, minor contradiction |
| step-4 Enter and release in SAP | 3 | "Active once saved": src-01, src-02 docs. Four-eyes: src-04 SAP workflow, src-12 Slack, src-18 StarGaze | **Doc vs SAP.** Even the newest approved doc misses a control the system enforces | **RED 45%, contested** → update the procedure |
| step-5 Payroll cut-off | 2 | 15th: src-01, src-05 SAP lock, src-09/10 Slack, src-18. 20th: src-02, src-06/08 Slack. Excluded: src-03 (copy), src-13 (NL), src-16 (repeats src-10) | **Recent doc + system beat old chat.** Scope filter (NL) and independence filter (copy, repeat) | GREEN 80% |
| step-6 Confirm to the employee | 1 | src-01, src-02 | Plain agreement | GREEN 100% |
| step-7 File the request | 1 | src-01, src-02 | Plain agreement | GREEN 100% |

## Sources (20)

| Id | Type | What | Date | Notes |
|---|---|---|---|---|
| src-01 | doc | LUM-PAY-007 v2.0 | 2026-02-16 | approved, owner active |
| src-02 | doc | LUM-PAY-007 v1.2 | 2022-03-14 | approved, owner **left**, still not retired |
| src-03 | doc | Lumina intranet HR FAQ | 2023-01-10 | `origin: src-02`, explains **why** employees still email HR |
| src-04 | business_app | SAP workflow PAYINFO_CHG_LUM | 2026-03-01 | IBAN validation + four-eyes release |
| src-05 | business_app | SAP control record ZPAYLOCK_BE | 2026-04-01 | lock on day 15 (was day 20) |
| src-06–16 | chat | 11 Slack messages | 2022–2026 | src-13 is NL (scope), src-14 is noise (no claims), src-16 `origin: src-10` |
| src-17 | email | Lumina HR sends monthly IBAN list | 2026-08-21 | client wants to keep emailing |
| src-18 | person | StarGaze screen recording, payroll consultant | 2026-09-10 | what really happens: emailed list, call-back, four-eyes, 15th |
| src-19 | person | StarGaze interview, former Lumina consultant | 2026-09-12 | `moved`; still believes the old process |
| src-20 | person | StarGaze interview, Lumina HR manager | 2026-08-28 | collects changes and emails a list |

## Demo storyline (live moment)

1. The QM opens Lumina's bank-account process: 71%, not release-ready. Two red steps.
2. Step 4: *"Your newest approved procedure says the change is live once saved. SAP won't release it without a second approver."* QM picks four-eyes → step turns green, action: update LUM-PAY-007.
3. Step 1: *"The doc says portal only; in reality the client emails a list every month, because their intranet still has the 2022 instructions."* QM picks portal only → green, actions: retire v1.2 and fix the client intranet.
4. The process climbs to 90%. Step 3 stays amber: the former consultant still works the old way, so a reminder is due.

## Notes for the engine

- While a step is contested, the engine already emits "Update or retire" for the doc on the losing side (for step 1 that is v2.0, the doc that is probably right). Consider holding back `retire` actions on contested steps until a human has decided.
- The `review` action for src-02 is routed to its author role, whose owner has left. It could go to the knowledge manager instead.
