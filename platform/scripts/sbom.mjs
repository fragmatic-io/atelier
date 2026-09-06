#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '..');
const { stdout } = await exec('npm', ['sbom', '--sbom-format', 'cyclonedx', '--omit=dev'], {
  cwd: root,
  timeout: 120_000,
  maxBuffer: 16 * 1024 * 1024,
});
const sbom = JSON.parse(stdout);
sbom.metadata.properties = [
  ...(sbom.metadata.properties ?? []),
  {
    name: 'atelier:scope',
    value:
      'Production dependency graph generated from package-lock.json; development-only MCP client excluded.',
  },
];
await writeFile(resolve(root, 'SBOM.cdx.json'), `${JSON.stringify(sbom, null, 2)}\n`);
process.stdout.write(
  `${JSON.stringify({ components: sbom.components?.length ?? 0, serialNumber: sbom.serialNumber })}\n`,
);
