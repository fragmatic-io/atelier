#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { runGate } from './acceptance/process.mjs';
import { validateRequirements } from './acceptance/requirements.mjs';

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
const python = process.env.ATELIER_PYTHON ?? 'python3';
const gates = [];
gates.push(
  await runGate(
    root,
    evidenceDir,
    'node-tests',
    [process.execPath, '--test', '--test-concurrency=4', ...testFiles],
    { timeoutMs: 600_000 },
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
      env: { ATELIER_BROWSER_OUT: join(evidenceDir, 'integration') },
    },
  ),
);

const lockHash = createHash('sha256')
  .update(await readFile(join(root, 'package-lock.json')))
  .digest('hex');
let gitCommit = null;
try {
  gitCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
} catch {}
const report = {
  name: 'Atelier V2.3 canonical acceptance',
  release: '2.3.0-rc.1',
  generatedAt: new Date().toISOString(),
  profile,
  node: process.version,
  python,
  gitCommit,
  packageLockSha256: lockHash,
  requirements: requirementSummary,
  gates,
  passed: gates.every((gate) => gate.status === 'passed'),
  releaseReady: gates.every((gate) => gate.status === 'passed') && requirementSummary.releaseReady,
};
await writeFile(join(evidenceDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(
  join(evidenceDir, 'report.md'),
  `# Atelier V2.3 acceptance\n\nProfile: **${profile}**  \nCommit: \`${gitCommit ?? 'unavailable'}\`  \nPackage lock SHA-256: \`${lockHash}\`\n\n${gates.map((gate) => `- **${gate.name}: ${gate.status}** — ${gate.durationMs} ms — ${gate.log}`).join('\n')}\n\nRelease ready: **${report.releaseReady ? 'yes' : 'no'}**. External gates remain visible in the requirements ledger.\n`,
);
if (!report.passed) process.exitCode = 1;
process.stdout.write(
  `${JSON.stringify({ passed: report.passed, releaseReady: report.releaseReady, report: relative(root, join(evidenceDir, 'report.json')) })}\n`,
);
