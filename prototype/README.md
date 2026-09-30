# ourSDbrain · clickable prototype

The full demo flow in plain HTML, CSS and JavaScript, in the SD Worx brand style. No build step, no server, no dependencies: open `index.html` in a browser.

**Flow:** Home → incoming alert → procedure (dropdown, steps × source types) → step details → *Decide* → *Why this score?* → *Score model* (live weight sliders).

All data is **synthetic** (fictional client, people and figures).

## Files

| File | What it is | Edit it when |
|---|---|---|
| `index.html` | Page structure of all screens and the alert pop-up | You change the layout or the alert text |
| `styles.css` | SD Worx brand styles | You change the look |
| `data/<process>.js` | The process, sources and claims, generated from `data/<process>/*.json` | Never by hand: run `build-data.mjs` |
| `content.js` | Which process is shown, which source is "the official procedure", the *What to do* texts per step, and the other procedures on the home screen | You change texts or switch process |
| `engine.js` | JavaScript port of `app/src/engine.ts` (same signals, weights, rules, thresholds) | The engine in `app/src` changes |
| `app.js` | Screens, navigation (`#/home`, `#/procedure/step-4`, `#/why/step-4`, `#/model`) and interactions | You change behaviour |

## Update or add data

1. Change the JSON in `data/<process>/` (`process.json`, `sources.json`, `claims.json`).
2. From the repo root, regenerate the data file:
   ```bash
   node prototype/build-data.mjs bank-account-change
   ```
3. To show another process: generate its data file, add a `<script src="data/<process>.js">` line in `index.html`, and set `PROCESS_ID` and `OFFICIAL_SOURCE_ID` in `content.js`.

## Good to know

- **Scores** are computed live in the browser by `engine.js`, with "today" fixed at **2026-09-30** (`TODAY` in `engine.js`) so the demo is reproducible. With the current engine the bank-account procedure scores **70%**; after deciding step 1 (*portal only*) and step 4 (*four-eyes*) it scores **90% · needs attention**. (`data/bank-account-change/expected.md` still lists 71% and 80% for step 5: those numbers come from the older rule for repeated sources.)
- **Deciding** a contested step adds the decision as an approved, recent source, exactly like `scoreStep(..., resolution)` in the engine.
- **The alert** on the home screen is written for step 4 of the bank-account procedure (text in `index.html`).
- The offboarding procedure appears on the home screen and in the dropdown with its engine score, but is not worked out as a clickable flow.
