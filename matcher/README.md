# matcher

Checks raw evidence against an approved master SOP. Returns the same SOP with `match: true | false` on each step: did it happen in the evidence?

```
matcher --sop data/bank-account-change/process.json --source recording.jsonl
```

Inputs: an SOP (`process.json`: steps with `id`, `name`, `description`) and one source: a recorder JSONL file (`tectonic.recorder/v1`, `tectonic.ui-event/v1`) or a Markdown / text file.

Status: design only. See [ARCHITECTURE.md](ARCHITECTURE.md).
