SYNTHETIC hackathon PoC dataset: all people, companies, texts and figures are fictional and illustrative; no real persons.
Scenario: an employee of fictional client Lumina Retail NV (BE, PC 311) changes the bank account the salary is paid into. Main demo process.
`process.json` = the process and its 7 steps (criticality 1-3, owner role); `sources.json` = 20 knowledge sources (doc, business_app, chat, email, person/StarGaze) with owner, approval, date, country, client scope, `origin` (copy-of) and full text.
`claims.json` = 43 normalized claims linking a step to a source, each with a `value` for comparison and a `quote` that is a verbatim substring of the source text (validated).
`expected.md` = scenario, engine result per step, and the demo storyline.
`raw/` = the same sources as original files for the "feed the tool" part of the demo: two Word procedures (v1.2 outdated, v2.0 recent, differing in steps 1, 3 and 5), a Slack export (json + txt, with fictional names), an email thread, two SAP config exports, three StarGaze transcripts and the client intranet FAQ. `sources.json` uses roles instead of names.
