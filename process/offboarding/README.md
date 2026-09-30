SYNTHETIC hackathon PoC dataset: all people, companies, texts and figures are fictional and illustrative (not legal or payroll advice); no real persons.
Scenario: SD Worx (BE) offboards senior employee "Karel Maes" (fictional, 18y seniority, resignation, last working day 2026-12-31) at fictional client Lumina Retail NV (PC 311).
`process.json` = the process and its 8 steps (criticality 1-3, owner role); `sources.json` = 19 knowledge sources (doc, business_app, chat, email, person/StarGaze) with owner, approval, date, country, client scope, `origin` (copy-of) and full text.
`claims.json` = 18 normalized claims linking a step to a source, each with a `value` for comparison and a `quote` that is a verbatim substring of the source text (validated).
`expected.md` = intended scenario and expected green/amber/red outcome per step, for sanity-checking the scoring engine.
