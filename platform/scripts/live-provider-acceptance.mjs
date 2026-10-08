#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { lstat, writeFile, mkdir } from 'node:fs/promises';
import { basename, dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApiProvider } from '../packages/providers/src/api.mjs';
import { CliProvider } from '../packages/providers/src/cli.mjs';
import { collectSourceBinding, collectToolchain, sameBinding, sha256 } from './acceptance/binding.mjs';
import { readEvidenceJson } from './acceptance/evidence.mjs';
import { ensure, validateProviderConfigurations } from './acceptance/release-policy.mjs';
import { resolveBrowserPython } from './run-browser-integration.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const matrixPath = process.env.ATELIER_LIVE_PROVIDER_MATRIX;
ensure(matrixPath, 'LIVE_PROVIDER_BLOCKED', 'Set ATELIER_LIVE_PROVIDER_MATRIX to a private mode-0600 JSON matrix');
const stat = await lstat(resolve(matrixPath));
ensure(process.platform === 'win32' || (stat.mode & 0o077) === 0,
  'LIVE_PROVIDER_MATRIX_PERMISSIONS', 'The private provider matrix cannot be group/world accessible');
const matrix = validateProviderConfigurations(await readEvidenceJson(resolve(matrixPath)));
for (const item of matrix) {
  if (item.kind.endsWith('-cli'))
    ensure(typeof item.home === 'string' && isAbsolute(item.home), 'LIVE_PROVIDER_RUNNER_HOME',
      'Every CLI acceptance boundary needs an explicit isolated account home');
}
const python = await resolveBrowserPython({ root });
const toolchain = collectToolchain(root, { python });
const binding = await collectSourceBinding(root, { toolchain });
ensure(binding.clean, 'LIVE_PROVIDER_SOURCE_DIRTY', 'Live release evidence requires a clean committed checkout');
const schema = {
  type: 'object', additionalProperties: false,
  properties: { answer: { type: 'string', const: 'atelier-live-ok' } }, required: ['answer'],
};
const results = [];
for (const item of matrix) {
  const started = Date.now();
  try {
    let provider;
    if (item.kind.endsWith('-cli')) {
      provider = new CliProvider({
        kind: item.kind, model: item.model, effort: item.effort ?? undefined,
        executable: item.executable, home: item.home, authMode: item.authMode ?? 'account',
      });
      await provider.doctor();
    } else {
      const key = process.env[item.apiKeyEnv];
      ensure(key, 'LIVE_PROVIDER_SECRET', 'The configured API credential is unavailable');
      const host = item.baseUrl ? new URL(item.baseUrl).hostname : undefined;
      provider = new ApiProvider({ kind: item.kind, key, model: item.model, baseUrl: item.baseUrl, allowedHosts: host ? [host] : undefined });
    }
    const result = await provider.generate({
      system: 'Return the exact requested acceptance marker.',
      input: { answer: 'atelier-live-ok' }, schema, maxOutputTokens: 80,
    });
    results.push({
      id: item.id, kind: item.kind, model: item.model, effort: item.effort,
      provider: result.provider, usage: result.usage, durationMs: result.durationMs,
      fixture: false,
      passed: result.value.answer === 'atelier-live-ok' && result.provider === item.kind && result.model === item.model,
    });
  } catch (error) {
    // Do not emit provider bodies, private CLI diagnostics, keys, or account paths.
    // A failed boundary stays failed; the remainder of the matrix is still measured.
    results.push({
      id: item.id, kind: item.kind, model: item.model, effort: item.effort,
      provider: item.kind, durationMs: Date.now() - started, fixture: false,
      passed: false, errorCode: error.code ?? 'LIVE_PROVIDER_FAILED',
    });
  }
}
const finalBinding = await collectSourceBinding(root, { toolchain: collectToolchain(root, { python }) });
const output = resolve(process.env.ATELIER_LIVE_PROVIDER_OUT ?? 'evidence/current/live-providers.json');
await mkdir(dirname(output), { recursive: true, mode: 0o700 });
const logName = `${basename(output)}.log`;
const log = Buffer.from(results.map((result) => JSON.stringify({ event: 'provider.acceptance', ...result })).join('\n') + '\n');
await writeFile(resolve(dirname(output), logName), log, { mode: 0o600 });
const report = {
  schemaVersion: 1, kind: 'live-provider-matrix', generatedAt: new Date().toISOString(), binding,
  provenance: { execution: 'live', fixture: false },
  passed: sameBinding(binding, finalBinding) && results.every((item) => item.passed),
  sourceStable: sameBinding(binding, finalBinding), results,
  artifacts: [{ path: logName, sha256: sha256(log) }],
};
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
process.stdout.write(`${JSON.stringify({ passed: report.passed, report: output, signed: false, workflowGate: 'separately-required' })}\n`);
if (!report.passed) process.exitCode = 1;
