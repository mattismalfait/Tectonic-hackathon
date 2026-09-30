# master

Approved master SOPs, one per process. The [matcher](../matcher/) checks the sources in [input/](../input/) against them.

## Path

```
master/<what>/<date>_<who>.json
```

| Part | Rule | Example |
|---|---|---|
| `what` | The process. Same name as its folder in `input/` and `output/`. | `bank-account-change` |
| `date` | `YYYY-MM-DD`, the approval date. If there are several, the latest is the current SOP. | `2026-02-16` |
| `who` | The owner: a role, never a real name. | `sd-worx-payroll` |

## Content

```json
{ "id": "proc-bank-account-change", "name": "Change of salary bank account (IBAN)",
  "steps": [ { "id": "step-3", "name": "Verify the employee's identity",
               "description": "Make sure the request really comes from the employee …" } ] }
```

`id`, `name` and each step's `id`, `name` and `description` are required. Other fields are allowed and are kept in the output.
