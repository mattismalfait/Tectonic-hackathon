# Expected outcomes per step (synthetic, illustrative)

Bands: GREEN >= 75, AMBER 50-75, RED < 50. "Today" = 2026-09-30. Scores are rough targets, not exact.

| Step | Crit | Sources (claims) | Pattern the engine must detect | Expected |
|---|---|---|---|---|
| step-1 Register resignation & exit date | 2 | src-01 doc (approved, 2025, SD Worx BE standard) + src-02 SAP workflow (2026) | Two strong, recent, independent sources agree on the same value | GREEN, ~85-95 |
| step-2 Determine notice period | 3 | src-03 doc (approved 2025): 13 weeks; src-04 StarGaze Client CEO (2026): 6 months; src-05 doc (2013, owner left): 4.5 months; src-06 NL doc: 1 month | Two strong recent sources contradict (documented rule vs. what the CEO believes/practises). src-05 is outdated (pre-2014 rules) and must get low weight. src-06 is country NL and must be EXCLUDED by scope (BE process) | RED, ~20-40, "needs human decision"; show src-06 as excluded, src-05 as stale |
| step-3 Non-compete: waive or pay | 3 | src-07 doc (approved 2025): 15 days after exit; src-08 Slack (2022, author moved): 30 days | Recent approved doc vs. old informal chat. Doc dominates; minor conflict lowers score slightly | ~75-85, GREEN/AMBER boundary; flag the stale chat |
| step-4 Final pay: vertrekvakantiegeld + pro-rata YEB | 3 | src-09 client CLA (approved 2024): pro-rata YEB paid; src-10 SAP config (2026): `YEB_PRORATA_ON_RESIGNATION = false` -> not paid; src-11 Teams chat (2026, small weight): supports CLA | Documented vs. practised contradiction, both strong. High criticality and financial impact -> costly error for Karel's final pay | RED, ~25-45, "config does not match CLA" |
| step-5 Company car & stop BIK | 2 | src-12 Slack (2026, office manager) + src-13 StarGaze fleet manager (2026) | Consistent but undocumented (no doc, no business_app). Agreement without a formal source | AMBER, ~55-70; recommend documenting |
| step-6 Notify group insurance provider | 2 | src-14 doc only (2019, owner left, unreviewed) | Single weak, stale source; no corroboration | RED / low AMBER, ~25-50, "stale" |
| step-7 Dimona OUT + C4 + holiday certificate | 3 | src-15 doc (approved 2025) + src-16 SAP automation (2026) + src-17 StarGaze payroll consultant (2026) + src-18 Teams paste (origin = src-15) | Three independent strong sources agree. src-18 only copies src-15 and must be counted ONCE (dedupe via `origin`), not as a 4th confirmation | GREEN, ~90+ (same score with or without src-18) |
| step-8 Capture tacit knowledge / handover | 2 | none | No sources, no claims -> knowledge gap | 0, RED/GAP; recommend a StarGaze capture of Karel before 2026-12-31 |

Notes
- src-19 (Outlook email, 2026-09-29) is the process trigger (resignation notification). It has no claims and is context only; it should not change any step score. It hints at the step-2 conflict ("CEO would prefer him to stay longer").
- Owner status and approval: `left`/`moved` owners and `unreviewed`/`draft` approval should lower weight; `n/a` applies to chats, apps and StarGaze captures.
- Value normalization: claims on the same step with identical `value` strings agree; different values conflict (step-2: 13 weeks vs 6 months vs 4.5 months vs 1 month; step-3: 15 vs 30 days; step-4: paid vs not paid).
