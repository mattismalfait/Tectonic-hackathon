// Matches a raw source against a master SOP with Claude (via the local Claude Code CLI,
// so it runs on the Claude subscription) and returns the SOP with `source` and `match` per step.
import { spawn } from 'node:child_process';

const SCHEMA = {
  type: 'object',
  required: ['steps'],
  additionalProperties: false,
  properties: {
    steps: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'match'],
        additionalProperties: false,
        properties: { id: { type: 'string' }, match: { type: 'boolean' } },
      },
    },
  },
};

const INSTRUCTIONS = `You check whether the steps of a master SOP (standard operating procedure) happened in a raw source.
The source can be a transcript, notes, a document, or a UI event recording (JSON lines).

Rules:
- A step matches only if the source shows it was actually performed. Being mentioned, planned or described as policy is not enough.
- In a UI recording, actions count: for example a click on "call-employee" before "submit" means the employee was called.
- Judge each step on its own. Do not assume a step happened because later steps did.
- When in doubt, match is false.
- Return every step id from the SOP exactly once.`;

export async function match(sop, raw, source, { model } = {}) {
  const prompt = `<sop>\n${JSON.stringify(sop, null, 2)}\n</sop>\n\n<source>\n${raw}\n</source>`;
  const args = [
    '-p',
    '--output-format', 'json',
    '--json-schema', JSON.stringify(SCHEMA),
    '--system-prompt', INSTRUCTIONS,
    '--tools', '',
    '--no-session-persistence',
  ];
  if (model) args.push('--model', model);

  const out = JSON.parse(await run('claude', args, prompt));
  if (out.is_error || !out.structured_output) throw new Error(`claude failed: ${out.result}`);

  const byId = new Map(out.structured_output.steps.map((s) => [s.id, s.match]));
  return { ...sop, source, steps: sop.steps.map((s) => ({ ...s, match: byId.get(s.id) ?? false })) };
}

function run(cmd, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${cmd} exited with ${code}: ${stderr || stdout}`));
    });
    child.stdin.end(input);
  });
}
