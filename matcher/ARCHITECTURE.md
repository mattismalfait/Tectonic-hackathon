# Matcher: architecture

**Question it answers:** given an approved master SOP and a raw source (a recording, a transcript, a note), *did each step happen?* Output: the same SOP, with the `source` it was checked against and `match: true | false` added to each step.

```
 master SOP (JSON) ─┐
                    ├──► Claude (one call) ──► SOP + source + match per step
 raw source (file) ─┘
```

## Flow

1. Read the SOP and the raw source. The raw file is passed as-is (`.md`, `.txt`, recorder `.jsonl`, …).
2. Send both to Claude in one call with the matching instructions. Structured output returns `{ "steps": [ { "id": "step-3", "match": true } ] }`.
3. Add `source` (the raw file's path) and each step's `match` to the SOP, and return it.

## Input: master SOP

```json
{ "id": "proc-bank-account-change", "name": "…",
  "steps": [ { "id": "step-3", "name": "Verify the employee's identity",
               "description": "Make sure the request really comes from the employee …" } ] }
```

The existing `data/*/process.json` files fit as-is.

## Output

The input SOP with `source` (the path of the raw file it was checked against) and `match` on each step. Other fields are kept.

```json
{ "id": "proc-bank-account-change", "name": "…", "source": "recordings/2026-09-30_marie.jsonl",
  "steps": [ { "id": "step-3", "name": "Verify the employee's identity",
               "description": "Make sure the request really comes from the employee …", "match": true } ] }
```

## Instructions to the model

- A step matches only if the source shows it was *performed*. Being mentioned or planned is not enough.
- In a UI recording, actions count: a click on `call-employee` before `submit` means the identity check by call-back happened.
- Judge each step on its own.
- When in doubt, `false`.

## Model

Runs on the local Claude subscription through Claude Code, not the API: `claude -p --json-schema … --output-format json --tools "" --no-session-persistence`. The prompt goes in on stdin; the answer is read from `structured_output`, which always follows the schema. No API key, no dependencies.

## Interfaces

| Interface | Shape |
|---|---|
| CLI | `matcher --sop data/bank-account-change/process.json --source recording.jsonl [--out result.json]` |
| Library | `match(sop, raw, source) → Promise<Sop>` |

## Layout

```
matcher/
  ARCHITECTURE.md
  README.md
  package.json
  src/
    cli.js       arguments, reads the files, writes the result
    matcher.js   the Claude call and adding source + match to the SOP
```
