#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runGate } from './acceptance/process.mjs';
import { validateRequirements } from './acceptance/requirements.mjs';
import { collectSourceBinding, collectToolchain, sameBinding } from './acceptance/binding.mjs';
import { verifyReleaseEvidence } from './acceptance/evidence.mjs';
import { resolveBrowserPython } from './run-browser-integration.mjs';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const evidenceDir = resolve(
  process.env.ATELIER_ACCEPTANCE_OUT ?? join(root, 'evidence/current/acceptance'),
);
const profileArg = process.argv.find((item) => item.startsWith('--profile='));
const profile = profileArg?.slice('--profile='.length) ?? 'core';
if (!['core', 'release'].includes(profile))
  throw new Error('ACCEPTANCE_PROFILE: use core or release');
await mkdir(evidenceDir, { recursive: true });

async function tests(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await tests(path)));
    else if (entry.isFile() && entry.name.endsWith('.test.mjs')) found.push(relative(root, path));
  }
  return found;
}

const requirementSummary = await validateRequirements(root, profile);
const testFiles = (await tests(join(root, 'tests'))).sort();
if (!testFiles.length) throw new Error('ACCEPTANCE_TESTS: no Node test files found');
const python = await resolveBrowserPython({ root });
const binding = await collectSourceBinding(root, { toolchain: collectToolchain(root, { python }) });
const gates = [];
gates.push(
  await runGate(
    root,
    evidenceDir,
    'node-tests',
    [process.execPath, '--test', '--test-reporter=tap', '--test-concurrency=4', ...testFiles],
    { timeoutMs: 600_000, requireTests: true },
  ),
);
gates.push(
  await runGate(
    root,
    evidenceDir,
    'dependency-audit',
    ['npm', 'audit', '--omit=dev', '--audit-level=high'],
    { timeoutMs: 120_000 },
  ),
);
gates.push(
  await runGate(
    root,
    evidenceDir,
    'package-smoke',
    [process.execPath, 'scripts/smoke-package.mjs'],
    { timeoutMs: 300_000 },
  ),
);
gates.push(
  await runGate(
    root,
    evidenceDir,
    'reference-component-browser-matrix',
    [process.execPath, 'scripts/certify-examples.mjs'],
    {
      timeoutMs: 900_000,
      env: {
        ATELIER_PYTHON: python,
        ATELIER_EVIDENCE_DIR: join(evidenceDir, 'reference-components'),
      },
    },
  ),
);
gates.push(
  await runGate(
    root,
    evidenceDir,
    'integrated-browser-journey',
    [python, 'scripts/browser-integration.py'],
    {
      timeoutMs: 600_000,
      env: {
        ATELIER_PYTHON: python,
        ATELIER_BROWSER_OUT: join(evidenceDir, 'integration'),
      },
    },
  ),
);

const finalBinding = await collectSourceBinding(root, { toolchain: collectToolchain(root, { python }) });
const stableSource = sameBinding(binding, finalBinding);
gates.push({
  name: 'source-stability',
  status: stableSource ? 'passed' : 'failed',
  code: stableSource ? null : 'SOURCE_CHANGED',
  reason: stableSource ? 'Source and toolchain did not change during acceptance' : 'Source or toolchain changed while required gates were running',
});
const external = await verifyReleaseEvidence({
  binding,
  policyPath: process.env.ATELIER_RELEASE_POLICY,
  manifestPath: process.env.ATELIER_RELEASE_EVIDENCE,
});
const corePassed = gates.every((gate) => gate.status === 'passed');
const releaseReady = corePassed && binding.clean && external.passed;
const report = {
  name: 'Atelier V2.3 canonical acceptance',
  release: '2.3.0-rc.1',
  generatedAt: new Date().toISOString(),
  profile,
  node: process.version,
  python,
  gitCommit: binding.gitCommit,
  packageLockSha256: binding.packageLockSha256,
  binding,
  sourceStable: stableSource,
  requirements: requirementSummary,
  gates,
  external,
  corePassed,
  passed: profile === 'release' ? releaseReady : corePassed,
  releaseReady,
};
await writeFile(join(evidenceDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(
  join(evidenceDir, 'report.md'),
  `# Atelier V2.3 acceptance\n\nProfile: **${profile}**  \nCommit: \`${binding.gitCommit}\`  \nSource SHA-256: \`${binding.sourceTreeSha256}\`  \nPackage lock SHA-256: \`${binding.packageLockSha256}\`  \nClean committed source: **${binding.clean ? 'yes' : 'no'}**\n\n## Local gates\n\n${gates.map((gate) => `- **${gate.name}: ${gate.status}**${gate.log ? ` — ${gate.durationMs} ms — ${gate.log}` : ` — ${gate.reason}`}`).join('\n')}\n\n## External release gates\n\n${external.gates.map((gate) => `- **${gate.name}: ${gate.status}** — ${gate.reason ?? `signed by ${gate.signerIdentity}`}`).join('\n')}\n\nRelease ready: **${report.releaseReady ? 'yes' : 'no'}**. Readiness is derived from fresh execution and exact signed evidence; ledger labels cannot authorize promotion.\n`,
);
if (!report.passed) process.exitCode = 1;
process.stdout.write(
  `${JSON.stringify({ passed: report.passed, releaseReady: report.releaseReady, report: relative(root, join(evidenceDir, 'report.json')) })}\n`,
);
