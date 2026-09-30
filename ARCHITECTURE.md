# TruthMap: product architecture

**Principle:** the AI extracts, code judges, humans decide. Only step 3 below uses an LLM; every score is deterministic and reproducible.

```
 1 CONNECT            2 NORMALISE             3 EXTRACT (LLM)          4 SCORE (code)          5 TRUTH STORE           6 USE
 SharePoint/Confl. ┐  source store:          per source:              5 objective signals     .md brain in Git:       • QM dashboard
 SAP SuccessFactors├► text + metadata    ──► step · value · quote ──► → weight → agreement ──► client/country/      ──► • actions → owners
 Slack/Teams/Mail  │  (owner, approval,      quote must appear         × strength → step       process.md                (Teams/ServiceNow)
 StarGaze (people) ┘  dates, ACL, origin)    verbatim (checked)        → process               every change = commit   • frontline AI agent
        ▲                                     values clustered per     recompute on change                               (answers only from
        │                                     step (same meaning?)                                                        green steps)
        └──────────── 7 LEARN: every QM decision = labelled example → regression re-fits the 5 weights (QM approves) ◄──────┘
```

## Layers

| # | Layer | What it does | Production choice | In the PoC |
|---|---|---|---|---|
| 1 | **Connect** | Incremental sync of docs, app config, chats, mail and people capture, **including permissions (ACLs)** | Graph API (SharePoint, Teams, Outlook), Confluence REST, SAP SuccessFactors OData (workflows, business rules, audit log), Slack Events API, StarGaze (consented) | Exported files in `data/*/raw/` |
| 2 | **Normalise** | One source record: text + the metadata the signals need (owner, owner status via HR, approval status, modified/review dates, country, client). **Copies are detected automatically** (near-duplicate hashing / embeddings), not tagged by hand | Postgres + object storage; HR directory lookup for owner status | `sources.json` |
| 3 | **Extract** | Match source chunks to process steps (embedding search), LLM returns `{step, value, statement, quote}` as structured output, reject any claim whose quote is not a verbatim substring, cluster equivalent values per step | Gemini on Vertex AI (EU region) or Claude; no training on customer data | Pre-computed `claims.json`; tests enforce the verbatim-quote rule |
| 4 | **Score** | The engine in `app/src/engine.ts`: signals → weight → agreement × strength → caps → process score → actions. Event-driven: recompute when a source or decision changes | Same TypeScript module as a service | Runs live in the browser |
| 5 | **Truth store** | One Markdown file per client × country × process: optimal process, score per step, reasons, source links. Git history = audit trail of how the truth changed | Git repo per tenant | Planned (`brain/`) |
| 6 | **Use** | QM dashboard; actions routed to the role that can fix them; a frontline AI agent that answers only from green steps and shows the score (API / MCP) | Web app + API | Dashboard with live decisions |
| 7 | **Learn** | Resolved conflicts are labelled examples ("this source was right"); a logistic regression on the 5 signals proposes new weights; the QM approves | Scheduled job | Weights adjustable by hand (sliders) |

## Process model
- **Standard + deviations:** `_standard/BE/offboarding.md` is the SD Worx default; `lumina-retail/BE/offboarding.md` inherits it and records only the client's deviations. A legal change updates the standard once and shows which clients are affected.
- Steps carry **criticality (1–3)** and a **RACI owner**, the basis for the "designated source" signal and for routing actions.

## Security & privacy (by design)
- **SSO + role-based access** (consultant, knowledge owner, QM). **ACLs propagate:** nobody sees a claim from a source they cannot open. **Tenant isolation per client.**
- **People:** score claims, never people. Capture only with consent and after a DPIA and works-council agreement; people see and can correct their own statements; purpose limitation and retention limits.
- **EU data residency** for storage and the LLM; audit log of every decision; no secrets in code.

## Scale
Scoring is linear in the number of claims and costs nothing. The cost is extraction, so it runs **incrementally** (only changed sources, in batches, cached). The same pipeline serves 100,000+ clients with a shared SD Worx standard process library.
