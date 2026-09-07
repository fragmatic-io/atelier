#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/** Content manifest, not a security attestation. Package only the enumerated files. */
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile, lstat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
const ROOT = resolve(import.meta.dirname, '..');
const blockedDirectories = new Set([
  '.git',
  'node_modules',
  '.atelier',
  '.atelier-data',
  '.atelier-verification',
  '.venv',
  '__pycache__',
  'coverage',
  '.pytest_cache',
]);
const blockedRelativeDirectories = new Set(['evidence/current']);
const excluded = new Set(['PACKAGE-MANIFEST.json', 'package-manifest-run.json']);
async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (blockedDirectories.has(entry.name)) continue;
    const file = join(dir, entry.name);
    if (blockedRelativeDirectories.has(relative(ROOT, file).replaceAll('\\', '/'))) continue;
    if (entry.isSymbolicLink()) throw new Error(`Refusing symlink: ${relative(ROOT, file)}`);
    if (entry.isDirectory()) out.push(...(await walk(file)));
    else if (!excluded.has(entry.name)) {
      if (
        /\.(sqlite(?:-wal|-shm)?|db|pyc|tgz|zip|ttf|otf|woff2?|p12|pfx|pem|key)$/i.test(
          entry.name,
        ) ||
        ['.env', '.env.local', 'development-keys.json', 'private-host-env.json'].includes(
          entry.name,
        )
      )
        throw new Error(`Refusing sensitive/binary build artifact: ${relative(ROOT, file)}`);
      out.push(file);
    }
  }
  return out;
}
const entries = [];
for (const file of (await walk(ROOT)).sort()) {
  const bytes = await readFile(file);
  entries.push({
    path: relative(ROOT, file).replaceAll('\\', '/'),
    size: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    executable: !!((await lstat(file)).mode & 0o111),
  });
}
const manifest = {
  schemaVersion: 2,
  package: '@atelier/platform',
  version: '2.3.0-rc.1',
  algorithm: 'SHA-256',
  generatedAt: new Date().toISOString(),
  fileCount: entries.length,
  files: entries,
};
await writeFile(join(ROOT, 'PACKAGE-MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(
  JSON.stringify({
    ok: true,
    fileCount: entries.length,
    totalBytes: entries.reduce((sum, f) => sum + f.size, 0),
  }),
);
