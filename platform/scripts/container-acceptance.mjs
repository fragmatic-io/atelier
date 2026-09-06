#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { spawnSync } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { compileSourceKit } from '../packages/source-forge/src/compiler.mjs';
import { certifySourceKit } from '../packages/source-forge/src/certifier.mjs';

function run(args) {
  const result = spawnSync('docker', args, { stdio: 'inherit', shell: false });
  if (result.error) throw new Error(`CONTAINER_BLOCKED: ${result.error.message}`);
  if (result.status !== 0)
    throw new Error(`CONTAINER_FAILED: docker ${args.join(' ')} exited ${result.status}`);
}

run(['info']);
run(['build', '--pull', '-f', 'ops/Dockerfile', '-t', 'atelier-platform:2.3-acceptance', '.']);
run([
  'build',
  '--pull',
  '-f',
  'ops/certifier.Dockerfile',
  '-t',
  'atelier-certifier:2.3-acceptance',
  '.',
]);
run(['run', '--rm', '--entrypoint', 'node', 'atelier-platform:2.3-acceptance', '--version']);
run([
  'run',
  '--rm',
  '--entrypoint',
  'python3',
  'atelier-certifier:2.3-acceptance',
  '-c',
  'from playwright.sync_api import sync_playwright; print("playwright-ok")',
]);
const kit = JSON.parse(
  await readFile(new URL('../examples/source-kits/delivery-board.json', import.meta.url), 'utf8'),
);
const compiled = await compileSourceKit(kit, {
  projectVersion: 'container-acceptance',
  approvedActions: kit.actions,
});
const scratchRoot = fileURLToPath(new URL('../.atelier-verification/', import.meta.url));
await mkdir(scratchRoot, { recursive: true, mode: 0o700 });
const report = await certifySourceKit(compiled, {
  mode: 'docker',
  image: 'atelier-certifier:2.3-acceptance',
  scratchRoot,
});
if (!report.passed || report.checks.length !== 17)
  throw new Error('CONTAINER_CERTIFIER_FAILED: real isolated browser matrix did not pass');
for (const image of ['atelier-platform:2.3-acceptance', 'atelier-certifier:2.3-acceptance']) {
  run(['image', 'inspect', image, '--format', '{{.Id}}']);
}
