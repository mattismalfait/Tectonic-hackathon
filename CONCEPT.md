# Team StarGaze · Tectonic Hackathon · SD Worx case

**Case:** "How might we turn fragmented organisational knowledge into a trusted shared resource?"
**Scoring:** Originality 30% · Technical ability ("does it work?") 30% · Fit to the case 30% · Security (Aikido) 10%

## 1. What we are building (one sentence)
A **quality management dashboard** that shows, **per process and per step**, how far docs, business apps, chats and people agree, gives every step a **confidence score you can explain**, and assembles an **optimal process** from the steps you can trust. The steps you can't trust go to a human.

*Working name: TruthMap (Tialys finalises the name)*

## 2. Why this is strong
- Docs say what **should** happen, apps show what **does** happen, and people know what **really** happens. The QM findings are exactly where these differ.
- The people layer (StarGaze) is our edge. Most teams only search documents.
- No black box: **the AI only extracts claims, a simple formula computes the score, a human decides on conflicts.**

## 3. Demo process
**"Offboarding of a senior employee"**, client *Lumina Retail NV* (fictional), Belgium, joint committee PC 311. Senior with 18 years of seniority resigns.
8 steps: register the exit, notice period, non-compete clause, final pay (holiday pay on departure + year-end bonus), company car, group insurance, Dimona OUT + C4, knowledge handover.
Each step triggers a different trust pattern: green agreement, an old chat vs. a new doc, a doc vs. SAP, practice that is never documented, a stale source, a gap.

## 4. Architecture

```
SOURCES (simulated exports)       CLAIMS (per step)             SCORING (code)            OUTPUT
docs      SharePoint/Confluence ┐  AI extracts per source:       filter scope (country/     • dashboard
apps      SAP config/workflow   ├─► step · value · quote  ──►    client) + independence ──► • .md brain per process
chat      Slack/Teams           │  (quote must literally         → step score + reasons     • optimal process
people    StarGaze (role-based) ┘   appear in the source)        → process score            • actions for a human
```

- **One brain, split by scope:** `brain/_standard/BE/offboarding-senior.md` (SD Worx standard) and `brain/lumina-retail/BE/offboarding-senior.md` (client = standard + deviations). One brain, so we can compare across clients: a legal change hits every client at once.
- **Tonight:** 1 client × 1 country × 1 process. Claims are **pre-extracted** (`claims.json`) so the demo never depends on a live AI call.
- **No backend, no login, no secrets:** a minimal attack surface for Aikido. Production would add SSO + roles (in the README).

## 5. The scoring model (simple, like the output of a regression)

**Step A: weight per source** (0–1)
`w = 0.5 × Authority + 0.3 × Recency + 0.2 × Reliability`
- Authority by type: doc 1.0 · business app 0.8 · person 0.8 (owner of this step) or 0.5 (other role) · email 0.4 · chat 0.3
- Recency = `1 − age in years / 3` (brand new = 1, 3+ years = 0)
- Reliability: approved 1.0 · chat/person/app 0.7 · draft 0.6 · unreviewed 0.4 · **×0.5 if the owner has left**

**Step B: filters.** A source from another country or client is excluded, with the reason shown. A source that copies another source (e.g. a Teams message pasting the doc) **counts only once**.

**Step C: score per step**
- Agreement = weight of the leading value / total weight
- Strength = highest supporting weight + 0.1 per extra independent confirmation (max 1)
- **Step score = Agreement × Strength**
- Rules (each one shown as a reason):
  - **two strong sources (w ≥ 0.7) contradict** → max 45%
  - **no official doc** → max 70% ("undocumented practice")
  - **no sources** → 0% ("knowledge gap")

**Step D: process score** = average of the step scores weighted by criticality (1–3). **If any critical step is red, the process is "not release-ready".**

Thresholds: **≥75% green** (goes into the optimal process) · **50–75% amber** (document / use with caution) · **<50% red** (needs a human, routed to the step owner).
All weights live in one config file. Every term in the formula becomes a reason line in the UI.

*Check: recent doc vs. old Slack → ≈78%. Recent doc vs. recent C-level recording → capped at 45% (heavy contradiction).*

## 6. People: score claims, never people
- A person's weight comes from their **role relative to the step** (owner or not) plus **recency**. There is no personal score and no ranking of people.
- StarGaze captures knowledge with consent. People can see and correct their own statements.
- A disagreement is a knowledge gap to align, not "person X is wrong".

## 7. UI (3 views, based on the sketch)
1. **Process overview:** rows = Docs · SAP · Slack/Teams · People, columns = steps. A dot per source per step (green = agrees, red = contradicts, grey = excluded). Score above every step, process score at the top.
2. **Step detail:** competing values, score breakdown (waterfall) with reasons, sources with literal quotes, and which sources were excluded and why.
3. **Optimal process + actions:** green steps form the recommended process. Red/amber steps show who to ask. **Live moment in the demo:** the QM resolves a conflict (picks a value + gives a reason) → the score recalculates and the process status changes.

**Framing for Fit:** the QM also has a moment of doubt: *"Can I sign off that Lumina's offboarding is correct, and where will we go wrong next?"* Pitch one line: the same truth database later powers the frontline AI agent for consultants.

## 8. Who does what (deadline 22:30, submit by 22:10)
| Who | Now → 21:45 | 21:45 → 22:10 |
|---|---|---|
| **Mattis + Claude** | scoring engine + UI, **push by 21:00** | fix Aikido findings |
| **Tialys** | product name, story, video script (QM persona), description text | record demo video (<3 min) |
| **Teammate 3** | Aikido account (hackathon link) + connect the repo **now**; **baseline scan at 21:00 + "before" screenshot** | rescan + "after" screenshot, README check, submit |

**Aikido:** https://app.aikido.dev/aipentests/discounts/hackathon-tectonic-aikido → "Continue with GitHub" → connect this repo → AI Code Audit → Code Security Audit.

## 9. Submission checklist
- [ ] Short description
- [ ] Demo video < 3 min (link works in incognito)
- [ ] Public GitHub repo + README (what it is, how to run it, what is simulated or unfinished)
- [ ] Aikido screenshots before + after
- [ ] No API keys or real data in the repo (all data is synthetic)
