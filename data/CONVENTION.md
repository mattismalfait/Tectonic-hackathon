# Data convention

How matcher results are stored in `data/`, so the scoring app picks them up without any extra wiring. The matcher writes, the app reads. Both follow this file.

## Layout

```
data/
  CONVENTION.md            this file
  <process>/               e.g. bank-account-change, offboarding
    process.json           the master SOP the matcher checks against (steps: id, name, description)
    master.json            the quality manager's gold value per step (used by the app, not by the matcher)
    sources.json           metadata per source (type, date, owner, approval, …)
    claims.json            hand-made claims (used for every source that has no matcher result yet)
    raw/                   the raw files, one folder per kind
      docs/  apps/  chat/  email/  people/  recordings/
    sops/                  ← MATCHER OUTPUT GOES HERE
      <raw file name>.json one result per checked raw file
```

- **One result per raw file.** File name = the raw file's name + `.json`, e.g.
  `raw/people/stargaze_payroll-consultant_screen-recording_2026-09-10.txt` → `sops/stargaze_payroll-consultant_screen-recording_2026-09-10.txt.json`.
- Re-running the matcher on the same raw file **overwrites** its result.
- New recordings go in `raw/recordings/` with a date in the name: `YYYY-MM-DD_<who>.jsonl`.

## Result format

The input SOP (`process.json`) with `source` added at the top and `match` added to each step. Other fields may stay.

```json
{
  "id": "proc-bank-account-change",
  "name": "Change of salary bank account (IBAN)",
  "source": "data/bank-account-change/raw/people/stargaze_payroll-consultant_screen-recording_2026-09-10.txt",
  "steps": [
    {
      "id": "step-3",
      "name": "Verify the employee's identity",
      "description": "…",
      "match": true,
      "quote": "For each person I first call them back on the phone number in their file"
    }
  ]
}
```

| Field | Required | Rule |
|---|---|---|
| `id` | yes | The process id from `process.json`. |
| `source` | yes | Path of the raw file, relative to the repo root, forward slashes. |
| `steps[].id` | yes | The step id from `process.json` (`step-1` …). Do not renumber. |
| `steps[].match` | yes | `true` only if the source shows the step was **performed** the master's way. Mentioned or planned is `false`. In doubt, `false`. |
| `steps[].quote` | optional | Verbatim text from the source that supports the verdict. Shown in the app as evidence. |
| `steps[].says` | optional | One short phrase: what the source says or does for this step (e.g. `"call back on the number on file"`). Shown next to the master's value. |
| `source_id` | optional | The `src-NN` id from `sources.json`, if the matcher knows it. |

Steps the source says nothing about can be left out; leaving a step out is not the same as `match: false`.

## How the app reads it

- Every `data/<process>/sops/*.json` is loaded automatically (`app/src/data.ts`).
- `source` → `src-NN` through the table `SOURCE_FILES` in `app/src/engine/sop.ts`. A raw file not in that table (e.g. a new recording) gets a source built from its path: date from the file name, marked unreviewed.
- For a source with a matcher result, its hand-made claims in `claims.json` are ignored; the matcher's result counts instead.
- The gold values still come from `master.json`.
