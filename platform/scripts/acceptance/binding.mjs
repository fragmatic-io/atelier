// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstat, readFile, readlink } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, relative, resolve } from 'node:path';

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function command(executable, args, cwd, { trim = true } = {}) {
  const output = execFileSync(executable, args, {
    cwd,
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return trim ? output.trim() : output;
}

export function collectToolchain(root, { python } = {}) {
  const require = createRequire(join(resolve(root), 'package.json'));
  const packages = {};
  for (const name of ['typescript', 'esbuild', 'react', 'ajv', 'axe-core']) {
    packages[name] = require(`${name}/package.json`).version;
  }
  let browser = { python: null, playwright: null };
  if (python) {
    browser = JSON.parse(command(python, ['-c',
      'import json,platform,importlib.metadata; print(json.dumps({"python":platform.python_version(),"playwright":importlib.metadata.version("playwright")}))',
    ], root));
  }
  return {
    node: process.version,
    npm: command('npm', ['--version'], root),
    platform: process.platform,
    arch: process.arch,
    ...browser,
    packages,
  };
}

/** Hash the actual checkout, including non-ignored untracked files. HEAD alone is
 * not evidence of the code that ran. Ignored dependencies/evidence are bound by
 * the lockfile/toolchain and explicit artifact digests instead. */
export async function collectSourceBinding(root, { toolchain } = {}) {
  root = resolve(root);
  const repositoryRoot = command('git', ['rev-parse', '--show-toplevel'], root);
  const gitCommit = command('git', ['rev-parse', 'HEAD'], root);
  const gitTree = command('git', ['rev-parse', 'HEAD^{tree}'], root);
  const status = command('git', ['status', '--porcelain=v1', '--untracked-files=all'], repositoryRoot);
  // Git status can hide edits under assume-unchanged or skip-worktree flags.
  // A release checkout must contain ordinary tracked entries, even when the
  // actual bytes currently match HEAD. Clearing a flag restores normal checks.
  const indexEntries = command('git', ['ls-files', '-v', '-z', '--cached'], repositoryRoot, { trim: false })
    .split('\0').filter(Boolean);
  const hasHiddenIndexEntries = indexEntries.some((entry) => !entry.startsWith('H '));
  const names = [...new Set(command('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], repositoryRoot, { trim: false })
    .split('\0').filter(Boolean))].sort();
  const source = createHash('sha256');
  let total = 0;
  for (const name of names) {
    const path = resolve(repositoryRoot, name);
    if (relative(repositoryRoot, path).startsWith('..')) throw new Error('SOURCE_PATH: invalid tracked path');
    let stat;
    try { stat = await lstat(path); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      source.update(stableJson({ path: name, kind: 'missing' }) + '\n');
      continue;
    }
    if (!stat.isFile() && !stat.isSymbolicLink()) throw new Error(`SOURCE_TYPE: unsupported source entry ${name}`);
    if (stat.size > 32 * 1024 * 1024) throw new Error('SOURCE_SIZE: individual source file exceeds 32 MiB');
    const bytes = stat.isSymbolicLink() ? Buffer.from(await readlink(path)) : await readFile(path);
    total += bytes.length;
    if (total > 256 * 1024 * 1024) throw new Error('SOURCE_SIZE: checkout exceeds 256 MiB');
    source.update(stableJson({
      path: name,
      kind: stat.isSymbolicLink() ? 'symlink' : 'file',
      executable: Boolean(stat.mode & 0o111),
      sha256: sha256(bytes),
    }) + '\n');
  }
  return {
    schemaVersion: 1,
    gitCommit,
    gitTree,
    sourceTreeSha256: source.digest('hex'),
    packageLockSha256: sha256(await readFile(join(root, 'package-lock.json'))),
    clean: status.length === 0 && !hasHiddenIndexEntries,
    toolchain: toolchain ?? collectToolchain(root),
  };
}

export function sameBinding(left, right) {
  return stableJson(left) === stableJson(right);
}
