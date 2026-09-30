# matcher

Checks raw evidence against an approved master SOP. Returns the same SOP with `match: true | false` on each step: did it happen in the evidence?

```
matcher --sop data/bank-account-change/process.json --source recording.jsonl
```

Inputs: an SOP (`process.json`: steps with `id`, `name`, `description`) and one source: a recorder JSONL file (`tectonic.recorder/v1`, `tectonic.ui-event/v1`) or a Markdown / text file.

Runs on the local Claude subscription through the Claude Code CLI (`claude` must be installed and logged in). No API key.

```
node matcher/src/cli.js --sop <process.json> --source <raw file> [--out result.json] [--model sonnet]
npm run demo -w matcher
```

Without `--out` the result is printed as JSON. See [ARCHITECTURE.md](ARCHITECTURE.md).
