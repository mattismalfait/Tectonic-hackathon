#!/usr/bin/env node
// Usage: matcher --sop <sop.json> --source <raw file> [--out <result.json> | --out -] [--model <model>]
// A source under input/ is written to the same path under output/ unless --out is given; --out - prints.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { match } from './matcher.js';

const USAGE = 'Usage: matcher --sop <sop.json> --source <raw file> [--out <result.json> | --out -] [--model <model>]';

const { values } = parseArgs({
  options: {
    sop: { type: 'string' },
    source: { type: 'string' },
    out: { type: 'string' },
    model: { type: 'string' },
  },
});

if (!values.sop || !values.source) {
  console.error(USAGE);
  process.exit(1);
}

const out = values.out ?? outputPath(values.source);
if (!out) {
  console.error(`${values.source} is not under input/, so pass --out <file> or --out -\n${USAGE}`);
  process.exit(1);
}

const sop = JSON.parse(await readFile(values.sop, 'utf8'));
const raw = await readFile(values.source, 'utf8');
const result = await match(sop, raw, values.source, { model: values.model });
const json = JSON.stringify(result, null, 2) + '\n';

if (out === '-') {
  process.stdout.write(json);
} else {
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, json);
  for (const step of result.steps) console.log(`${step.match ? '✓' : '✗'} ${step.id}  ${step.name}`);
  console.log(`\nWritten to ${out}`);
}

// input/bank-account-change/2026-09-30_senior-officer.json → output/bank-account-change/2026-09-30_senior-officer.json
function outputPath(source) {
  const i = source.lastIndexOf('input/');
  if (i === -1 || (i > 0 && source[i - 1] !== '/')) return null;
  return `${source.slice(0, i)}output/${source.slice(i + 'input/'.length)}`;
}
