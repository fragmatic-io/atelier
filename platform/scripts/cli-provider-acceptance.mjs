#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { CliProvider } from '../packages/providers/src/cli.mjs';

const kind = process.env.ATELIER_LIVE_CLI_KIND ?? 'claude-cli';
if (!['claude-cli', 'codex-cli'].includes(kind))
  throw new Error('LIVE_CLI_KIND: use claude-cli or codex-cli');
const provider = new CliProvider({
  kind,
  executable: process.env.ATELIER_LIVE_CLI_EXECUTABLE,
  home: process.env.ATELIER_LIVE_CLI_HOME,
  model: process.env.ATELIER_LIVE_CLI_MODEL,
  effort: process.env.ATELIER_LIVE_CLI_EFFORT,
  authMode: process.env.ATELIER_LIVE_CLI_AUTH_MODE ?? 'account',
});
const doctor = await provider.doctor();
const schema = {
  type: 'object',
  additionalProperties: false,
  properties: { answer: { type: 'string', const: 'atelier-live-ok' } },
  required: ['answer'],
};
const result = await provider.generate({
  system: 'Return the exact requested acceptance marker.',
  input: { answer: 'atelier-live-ok' },
  schema,
  maxOutputTokens: 80,
});
const report = {
  generatedAt: new Date().toISOString(),
  passed: result.value.answer === 'atelier-live-ok',
  kind,
  model: result.model,
  effort: provider.effort ?? null,
  usage: result.usage,
  durationMs: result.durationMs,
  doctor,
};
const output = resolve(process.env.ATELIER_LIVE_CLI_OUT ?? `evidence/current/${kind}.json`);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
process.stdout.write(`${JSON.stringify(report)}\n`);
if (!report.passed) process.exitCode = 1;
