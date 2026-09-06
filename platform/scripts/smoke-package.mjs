#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/** Pack the actual source package and install it into an empty consumer OFFLINE. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '..');
const scratch = await mkdtemp(join(tmpdir(), 'atelier-package-consumer-'));
const directory = process.argv[2] ? resolve(process.argv[2]) : join(root, '.atelier-verification');
await mkdir(directory, { recursive: true });
const report = {
  name: 'Real offline npm package installation',
  version: '2.3.0-rc.1',
  generatedAt: new Date().toISOString(),
  node: process.version,
  passed: false,
  checks: [],
  dependencyBoundary:
    'The locked compiler/runtime dependencies are installed from the local npm cache; no provider account is used.',
};
try {
  const packed = await exec(
    'npm',
    ['pack', '--ignore-scripts', '--json', '--pack-destination', scratch],
    { cwd: root, timeout: 60000, maxBuffer: 4 * 1024 * 1024 },
  );
  const spec = JSON.parse(packed.stdout)[0];
  assert(
    !spec.files.some((entry) => entry.path.startsWith('evidence/current/')),
    'Generated local evidence must not enter the source package',
  );
  report.checks.push({
    name: 'npm pack of actual distribution',
    passed: true,
    entries: spec.entryCount,
    bytes: spec.size,
  });
  const consumer = join(scratch, 'consumer');
  await mkdir(consumer);
  await writeFile(
    join(consumer, 'package.json'),
    JSON.stringify({ name: 'atelier-external-consumer', private: true, type: 'module' }),
  );
  await exec(
    'npm',
    [
      'install',
      '--offline',
      '--ignore-scripts',
      '--omit=optional',
      '--legacy-peer-deps',
      '--no-audit',
      '--no-fund',
      join(scratch, spec.filename),
    ],
    { cwd: consumer, timeout: 60000, maxBuffer: 4 * 1024 * 1024 },
  );
  report.checks.push({
    name: 'Offline install into empty consumer with no lifecycle scripts',
    passed: true,
  });
  const code = `
import assert from 'node:assert/strict';
import { HostBridge, SqliteActionLedger } from '@atelier/platform';
import { mountSurface, readField } from '@atelier/platform/surface';
import { createHostClient } from '@atelier/platform/host-client';
import { ApiProvider, CliProvider, validateOutput } from '@atelier/platform/providers';
import { createAtelierMcpServer } from '@atelier/platform/mcp';
assert.equal(typeof HostBridge, 'function');assert.equal(typeof mountSurface, 'function');
assert.equal(readField({a:{b:2}}, 'a.b'),2);assert.equal(typeof createHostClient, 'function');
const ledger = new SqliteActionLedger(':memory:');
let count=0;
const result = await ledger.run('tenant/project/user','delivery_1234567890abcdef','payload',async()=>({count:++count}));
const replay = await ledger.run('tenant/project/user','delivery_1234567890abcdef','payload',async()=>({count:++count}));
assert.equal(count,1);assert.equal(replay.replayed,true);ledger.close();
validateOutput({ok:true},{type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false});
assert.equal(typeof ApiProvider,'function');assert.equal(typeof CliProvider,'function');
assert.equal(typeof createAtelierMcpServer,'function');
assert(import.meta.resolve('@atelier/platform/surface.css').endsWith('/surface.css'));
console.log('external consumer passed');`;
  await writeFile(join(consumer, 'smoke.mjs'), code);
  const result = await exec(process.execPath, ['smoke.mjs'], { cwd: consumer, timeout: 15000 });
  assert(result.stdout.includes('external consumer passed'));
  report.checks.push({
    name: 'Real installed public imports and durable duplicate-action contract',
    passed: true,
  });
  const cli = await exec(join(consumer, 'node_modules/.bin/atelier'), ['--help'], {
    cwd: consumer,
    timeout: 15000,
  });
  assert(cli.stdout.includes('Atelier Platform 2.3'));
  report.checks.push({
    name: 'Installed npm bin entrypoint runs outside source tree',
    passed: true,
  });
  report.passed = true;
} catch (error) {
  report.error = String(error.message).slice(0, 1500);
  process.exitCode = 1;
} finally {
  await rm(scratch, { recursive: true, force: true });
  await writeFile(join(directory, 'package-smoke.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify(report, null, 2));
