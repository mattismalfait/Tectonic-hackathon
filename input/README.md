# input

Raw sources to check against the approved SOP in [master/](../master/) with the [matcher](../matcher/). One JSON file per source.

## Path

```
input/<what>/<date>_<who>.json
```

| Part | Rule | Examples |
|---|---|---|
| `what` | The process it is about. Same name as the SOP's folder in `master/`. | `bank-account-change` |
| `date` | `YYYY-MM-DD`, when the source was created: the recording, the email, the doc's version date. | `2026-09-30` |
| `who` | Who did it or where it comes from: a role or a system, never a real name. A second source for the same `who` on the same day gets `-2`, then `-3`. | `senior-officer`, `lumina-hr`, `sap` |

Lowercase, words joined with `-`, no spaces.

## Content

- **UI recording** (recorder or portal): the array of events, as returned by `Recorder.stop()`. A recorder `.jsonl` download becomes one array.
- **Everything else** (transcript, doc, email, chat, system export, notes): `{ "text": "…" }`, with the source's text as-is (email headers, speaker names and timestamps included).

## Example

```
input/bank-account-change/2026-09-30_senior-officer.json     recording
input/bank-account-change/2026-09-10_payroll-consultant.json  transcript
input/bank-account-change/2026-08-21_lumina-hr.json           email
```

## Notes

- **The source path is the `source` in the matcher's output.**
- **Convert first.** `.docx` and `.pdf` become `{ "text": "…" }` with their text; keep the original out of this folder.
- **Synthetic or consented data only.** No real names, IBANs or phone numbers.
