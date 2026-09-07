#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/** Repeatable release checks. No cached test count is ever treated as execution. */
import { spawn } from 'node:child_process';
import { readFile, readdir, mkdir, writeFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join, relative } from 'node:path';
import { createHash } from 'node:crypto';
const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const reportDir = resolve(process.env.ATELIER_VERIFY_OUT ?? join(root, 'evidence/current'));
await mkdir(reportDir, { recursive: true });
const results = [];
async function walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries) {
    if (
      ['node_modules', 'vendor', '.git', 'evidence', '.atelier-data', 'coverage', 'dist'].includes(
        e.name,
      )
    )
      continue;
    const p = join(dir, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (e.isFile()) out.push(p);
  }
  return out;
}
async function run(name, args, { timeout = 180000, cwd = root, allowedCodes = [0] } = {}) {
  const started = Date.now(),
    logFile = join(reportDir, name + '.log');
  const result = await new Promise((resolveRun) => {
    const child = spawn(args[0], args.slice(1), {
      cwd,
      env: { ...process.env, ATELIER_VERIFY_CHILD: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });
    let text = '',
      timedOut = false,
      bytes = 0;
    const record = (chunk) => {
      bytes += chunk.length;
      if (bytes <= 12 * 1024 * 1024) text += chunk.toString();
    };
    child.stdout.on('data', record);
    child.stderr.on('data', record);
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    }, timeout);
    child.on('error', (e) => {
      clearTimeout(timer);
      resolveRun({ status: 'failed', exitCode: null, error: e.message, output: text });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolveRun({
        status: timedOut ? 'timed-out' : allowedCodes.includes(code) ? 'passed' : 'failed',
        exitCode: code,
        signal,
        output: text,
      });
    });
  });
  await writeFile(logFile, result.output ?? '');
  const item = {
    name,
    command: args.join(' '),
    status: result.status,
    exitCode: result.exitCode,
    signal: result.signal ?? null,
    durationMs: Date.now() - started,
    log: relative(root, logFile),
    error: result.error ?? null,
  };
  const match = (key) => {
    const m = result.output?.match(new RegExp('^# ' + key + ' (\\d+)', 'm'));
    return m ? Number(m[1]) : null;
  };
  if (result.output?.includes('TAP version'))
    item.tests = {
      tests: match('tests'),
      pass: match('pass'),
      fail: match('fail'),
      skipped: match('skipped'),
      cancelled: match('cancelled'),
    };
  results.push(item);
  console.log(JSON.stringify(item));
  return item;
}
const files = await walk(root);
const expected = [
  'package.json',
  'packages/source-forge/src/compiler.mjs',
  'packages/source-forge/src/registry.mjs',
  'packages/conversation/src/service.mjs',
  'packages/conversation/src/host.mjs',
  'packages/conversation/src/chat.mjs',
  'apps/studio/web/lab.mjs',
  'apps/agent-demo/server.mjs',
  'migrations/003-experience-agents.sql',
  'migrations/004-discovery-onboarding.sql',
  'migrations/005-surface-installs.sql',
  'migrations/006-design-contracts.sql',
  'packages/discovery/src/service.mjs',
  'packages/discovery/src/design-contract.mjs',
  'packages/surface-install/src/service.mjs',
  'packages/surface-install/src/template-shared.mjs',
  'packages/conversation/src/specialists.mjs',
  'apps/studio/web/agent-setup.mjs',
  'apps/studio/web/design-setup.mjs',
];
const missing = [];
for (const p of expected)
  try {
    await stat(join(root, p));
  } catch {
    missing.push(p);
  }
results.push({
  name: 'required-source-inventory',
  status: missing.length ? 'failed' : 'passed',
  missing,
});
let syntaxFailed = [];
for (const f of files.filter((f) => f.endsWith('.mjs'))) {
  const check = await new Promise((ok) => {
    const p = spawn(process.execPath, ['--check', f], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let err = '';
    p.stderr.on('data', (x) => (err += x));
    p.on('close', (code) => ok({ code, err }));
    p.on('error', (e) => ok({ code: 1, err: e.message }));
  });
  if (check.code) syntaxFailed.push({ file: relative(root, f), error: check.err });
}
await writeFile(join(reportDir, 'syntax.json'), JSON.stringify(syntaxFailed, null, 2));
results.push({
  name: 'javascript-syntax',
  status: syntaxFailed.length ? 'failed' : 'passed',
  checked: files.filter((f) => f.endsWith('.mjs')).length,
  failures: syntaxFailed.length,
  log: 'evidence/current/syntax.json',
});
const tests = files
  .filter((f) => f.startsWith(join(root, 'tests') + '/') && f.endsWith('.test.mjs'))
  .map((f) => relative(root, f))
  .sort();
if (tests.length)
  await run('executed-tests', [process.execPath, '--test', '--test-concurrency=1', ...tests], {
    timeout: 300000,
  });
else results.push({ name: 'executed-tests', status: 'failed', error: 'No test files found' });
if (process.argv.includes('--package'))
  await run('external-package-smoke', [process.execPath, 'scripts/smoke-package.mjs'], {
    timeout: 180000,
  });
if (process.argv.includes('--browser'))
  await run('react-browser-acceptance', [process.execPath, 'scripts/certify-examples.mjs'], {
    timeout: 480000,
  });
const sourceHash = createHash('sha256');
for (const f of files.sort()) {
  sourceHash.update(relative(root, f));
  sourceHash.update(await readFile(f));
}
const report = {
  name: 'Atelier reconstruction verification',
  version: '2.3.0-rc.1',
  generatedAt: new Date().toISOString(),
  node: process.version,
  sourceTreeHash: sourceHash.digest('hex'),
  results,
  executedChecksPassed: results.every((r) => r.status === 'passed'),
  liveProviderAccountsTested: false,
  universalProductionCertification: false,
  scope:
    'Single-host release candidate. Exact executed commands and failures are recorded. Browser and external package checks run only when requested.',
};
await writeFile(join(reportDir, 'verification.json'), JSON.stringify(report, null, 2));
await writeFile(
  join(reportDir, 'verification.md'),
  `# Reconstruction verification\n\nGenerated: ${report.generatedAt}\n\nSource tree hash: \`${report.sourceTreeHash}\`\n\n${results.map((r) => `- **${r.name}: ${r.status}**${r.tests ? ` — ${JSON.stringify(r.tests)}` : ''}${r.log ? ` — ${r.log}` : ''}`).join('\n')}\n\nLive provider accounts tested: **no**. Universal production certification: **no**.\n`,
);
if (!report.executedChecksPassed) process.exitCode = 1;
