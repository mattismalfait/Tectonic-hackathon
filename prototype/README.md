# ourSDbrain · clickable prototype

The full demo flow in plain HTML, CSS and JavaScript, in the SD Worx brand style. No build step, no server, no dependencies: open `index.html` in a browser.

**Flow:** Home → incoming alert → procedure (dropdown, steps × source types) → step details → *Decide* → *Why this score?* → *Score model* (live weight sliders).

All data is **synthetic** (fictional client, people and figures).

## Files

| File | What it is | Edit it when |
|---|---|---|
| `index.html` | Page structure of all screens and the alert pop-up | You change the layout or the alert text |
| `styles.css` | SD Worx brand styles | You change the look |
| `data/<process>.js` | The process, sources, claims, master SOP and matcher results, generated from `data/<process>/` | Never by hand: run `npm run build:prototype` in `app/` |
| `content.js` | Which process is shown and the *What to do* texts per step | You change texts or switch process |
| `engine.bundle.js` | The real scoring engine (`app/src/engine`), bundled for the browser as `window.SDEngine` | Never by hand: run `npm run build:prototype` in `app/` |
| `engine.js` | Thin adapter: feeds the data to the engine and reshapes the result for `app.js`. No scoring logic | The engine's result shape changes |
| `app.js` | Screens, navigation (`#/home`, `#/procedure/step-4`, `#/why/step-4`, `#/model`) and interactions | You change behaviour |

## Update or add data

1. Change the JSON in `data/<process>/` (`process.json`, `sources.json`, `claims.json`, `master.json`), or let the matcher add results in `data/<process>/sops/` (see `data/CONVENTION.md`).
2. Rebuild the engine bundle and the data files:
   ```bash
   cd app && npm run build:prototype
   ```
3. To show another process as the clickable flow: add a `<script src="data/<process>.js">` line in `index.html` and set `PROCESS_ID` in `content.js`. Every other process in `prototype/data/` appears on the home screen with its live score.

## Good to know

- **Scores** come from the same engine as the React app, in master mode: every source is compared to the master SOP (`data/<process>/master.json`), step score = weight confirming the master ÷ weight of all sources. "Today" is fixed at **2026-09-30** (`TODAY` in `engine.js`) so the demo is reproducible. The bank-account procedure scores **71%**; after confirming the master on step 1 (*portal only*) and step 4 (*four-eyes*) it scores **90% · needs attention**.
- **Deciding** a step makes the chosen value the reference for that step (confirm the master or change it). The decision counts as an approved, recent source; sources that say otherwise are listed as overruled and no longer counted.
- **Needs a human** = the step is red, or a recent doc or SAP itself differs from the master.
- **The alert** on the home screen is written for step 4 of the bank-account procedure (text in `index.html`).
- The offboarding procedure appears on the home screen and in the dropdown with its live engine score, but is not worked out as a clickable flow.
