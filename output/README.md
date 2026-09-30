# output

Results of the [matcher](../matcher/): one file per raw source in [input/](../input/), at the same path.

```
input/bank-account-change/2026-09-30_senior-officer.json
output/bank-account-change/2026-09-30_senior-officer.json
```

## Content

The approved SOP from `master/<what>/`, unchanged, plus:

- `source`: the path of the raw source it was checked against.
- `match` on each step: `true` if the source shows the step was performed, otherwise `false`.

```json
{
  "id": "proc-bank-account-change",
  "name": "Change of salary bank account (IBAN)",
  "source": "input/bank-account-change/2026-09-30_senior-officer.json",
  "steps": [
    { "id": "step-3", "name": "Verify the employee's identity",
      "description": "Make sure the request really comes from the employee …", "match": true }
  ]
}
```

## Producing it

```
node matcher/src/cli.js --sop master/bank-account-change/2026-02-16_sd-worx-payroll.json \
                        --source input/bank-account-change/2026-09-30_senior-officer.json
```

Running the matcher again on the same source overwrites its result.
