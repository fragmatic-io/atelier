#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { ApiProvider } from '../packages/providers/src/api.mjs';
import { CliProvider } from '../packages/providers/src/cli.mjs';

const matrixPath = process.env.ATELIER_LIVE_PROVIDER_MATRIX;
if (!matrixPath)
  throw new Error(
    'LIVE_PROVIDER_BLOCKED: set ATELIER_LIVE_PROVIDER_MATRIX to a private mode-0600 JSON matrix',
  );
const matrix = JSON.parse(await readFile(resolve(matrixPath), 'utf8'));
if (
  !Array.isArray(matrix) ||
  !matrix.some((item) => item.kind?.endsWith('-cli')) ||
  !matrix.some((item) => !item.kind?.endsWith('-cli'))
) {
  throw new Error(
    'LIVE_PROVIDER_MATRIX: include at least one scoped API provider and one isolated CLI provider',
  );
}
const schema = {
  type: 'object',
  additionalProperties: false,
  properties: { answer: { type: 'string', const: 'atelier-live-ok' } },
  required: ['answer'],
};
const results = [];
for (const item of matrix) {
  let provider;
  if (item.kind.endsWith('-cli')) {
    provider = new CliProvider({
      kind: item.kind,
      model: item.model,
      executable: item.executable,
      home: item.home,
      authMode: item.authMode ?? 'account',
    });
    await provider.doctor();
  } else {
    const key = process.env[item.apiKeyEnv];
    if (!key)
      throw new Error(
        `LIVE_PROVIDER_SECRET: environment variable ${item.apiKeyEnv ?? '(missing apiKeyEnv)'} is unavailable`,
      );
    const baseUrl = item.baseUrl;
    const host = baseUrl ? new URL(baseUrl).hostname : undefined;
    provider = new ApiProvider({
      kind: item.kind,
      key,
      model: item.model,
      baseUrl,
      allowedHosts: host ? [host] : undefined,
    });
  }
  const result = await provider.generate({
    system: 'Return the exact requested acceptance marker.',
    input: { answer: 'atelier-live-ok' },
    schema,
    maxOutputTokens: 80,
  });
  results.push({
    kind: item.kind,
    model: item.model ?? 'account-default',
    provider: result.provider,
    usage: result.usage,
    durationMs: result.durationMs,
    passed: result.value.answer === 'atelier-live-ok',
  });
}
const output = resolve(
  process.env.ATELIER_LIVE_PROVIDER_OUT ?? 'evidence/current/live-providers.json',
);
await mkdir(dirname(output), { recursive: true });
await writeFile(
  output,
  `${JSON.stringify({ generatedAt: new Date().toISOString(), passed: results.every((item) => item.passed), results }, null, 2)}\n`,
);
if (results.some((item) => !item.passed)) process.exitCode = 1;
