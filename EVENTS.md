# Event log format (`tectonic.ui-event/v1`)

The portal records every click, input and paste, plus semantic events such as page views, pop-ups and submits.

- **Where:** `events/<session_id>.jsonl`, one JSON object per line, appended in order.
- **Session:** one page load of the portal.
- **Case:** one job. It starts when the officer opens an employee and ends on a successful submit or on leaving the employee. Events on the list page have `case_id: null`.

The fields map directly onto process-mining event logs (XES / OCEL): `case_id` → case, `activity` + `target.key` → activity, `timestamp` → time, `actor` → resource.

## Fields

| Field         | Type                  | Notes |
| ------------- | --------------------- | ----- |
| `schema`      | string                | Always `tectonic.ui-event/v1`. |
| `event_id`    | uuid                  | Unique per event. |
| `timestamp`   | ISO 8601              | When it happened in the browser. |
| `received_at` | ISO 8601              | When the server stored it. |
| `session_id`  | uuid                  | Same as the file name. |
| `case_id`     | uuid \| null          | The job this event belongs to. The same id is on the submission record. |
| `actor`       | `{ id, name, role }`  | `role` is `senior` or `junior`. The server sets it from the profile. |
| `activity`    | string                | See the list of activities below. |
| `page`        | string                | Route, e.g. `#/employees/E-10432`. |
| `target`      | `{ key, tag, type, label }` \| null | The element. `key` is the stable name (`data-track`), e.g. `edit-iban`. |
| `value`       | string \| boolean \| `{ name, size, type }` \| null | Depends on the activity (see below). |
| `context`     | `{ employee_id }`     | The employee being worked on, if any. |

## Activities

| `activity`         | When                                                            | `value` |
| ------------------ | --------------------------------------------------------------- | ------- |
| `session_start`    | Page loaded and the officer is known.                           | actor id |
| `actor_change`     | "Signed in as" switched.                                        | new actor id |
| `view`             | Route shown.                                                    | `employee_list` \| `employee_detail` |
| `click`            | Any click anywhere.                                             | `data-track-value` of the element, e.g. the employee id of a row or the dialled phone number |
| `input`            | Typing in a field. Logged after 600 ms of no typing, or right before the next event. | field value |
| `paste`            | Paste into a field.                                             | pasted text |
| `file_select`      | File picked in the proof field. Only metadata; nothing is uploaded. | `{ name, size, type }` |
| `dialog_open`      | IBAN pop-up opened.                                             | null |
| `dialog_close`     | IBAN pop-up closed.                                             | `submitted` \| `cancel` \| `escape` |
| `submit`           | Submit pressed.                                                 | null |
| `submit_succeeded` | Server accepted the change.                                     | `job_id` of the submission |
| `submit_failed`    | Server refused it.                                              | error message |

## Tracked elements (`target.key`)

`employee-search`, `employee-row`, `back-to-list`, `call-employee`, `call-manager`, `edit-iban`, `new-iban`, `first-pay-date`, `proof-file`, `dialog-cancel`, `dialog-submit`, `payroll-calendar`, `signed-in-as`.

Senior behaviour from EXAMPLE.md shows up as:

| What seniors do             | In the log |
| --------------------------- | ---------- |
| Confirm the IBAN by phone   | `click` on `call-employee` / `call-manager` in the same case, before `submit` |
| Check the payroll cutoff    | `click` on `payroll-calendar` in the same case |
| Attach a bank statement     | `file_select` on `proof-file`, and `proof_attached` on the submission |

## Example

```json
{"schema":"tectonic.ui-event/v1","event_id":"9b1c…","timestamp":"2026-09-30T19:02:11.412Z","received_at":"2026-09-30T19:02:12.020Z","session_id":"4f0e…","case_id":"a7d2…","actor":{"id":"marie","name":"Marie","role":"senior"},"activity":"click","page":"#/employees/E-10432","target":{"key":"call-employee","tag":"button","type":"button","label":"Call employee"},"value":"+32 470 11 22 01","context":{"employee_id":"E-10432"}}
```

## Submissions

Each accepted change is also written to `submissions/<time>-<job_id>.json`, with the same `session_id` and `case_id`, so you can join a submission to the clicks that led to it.

All data is synthetic. Field values, including IBANs, are logged as typed. A production version would hash or mask them.
