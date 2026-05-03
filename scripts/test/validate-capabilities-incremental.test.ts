// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for `scripts/validate-capabilities-incremental.ts`.
 *
 * The CLI flow (parse argv → run git diff → filter → validate) is tested
 * end-to-end via the `--files` override (skipping the spawned `git`),
 * plus a focused test of the `git diff` path against a tiny tmp git repo
 * to lock in that the diff plumbing actually works.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname as pathDirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  filterCapabilityFiles,
  parseArgs,
  runGitDiff,
  runIncremental,
  validateFiles,
} from '../validate-capabilities-incremental.js';

const REPO = resolve(import.meta.dirname, '..', '..');
const TMP_BASE = resolve(REPO, 'scripts/test/.tmp-cap-incremental');

function makeCapability(id: string, version = '0.1.0'): Record<string, unknown> {
  return {
    id,
    kind: 'data',
    version,
    input: {},
    output: { value: 'string' },
    side_effects: [`reads:${id.split('.').join('_')}`],
    permissions: [`${id.split('.')[0]}:read`],
    confirmation: 'none',
    rate_limit: '60/min/user',
    reversible: true,
  };
}

function writeCap(root: string, relPath: string, body: Record<string, unknown>): void {
  const abs = join(root, relPath);
  mkdirSync(pathDirname(abs), { recursive: true });
  writeFileSync(abs, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = `${TMP_BASE}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
});

describe('parseArgs', () => {
  it('defaults to origin/main, non-cached, no override', () => {
    const args = parseArgs([]);
    expect(args.cached).toBe(false);
    expect(args.files).toBe(null);
    expect(args.strict).toBe(false);
    // env var defaults are honored elsewhere; the test relies on the env not
    // being set in the harness — vitest does not propagate CIR_DIFF_BASE.
    expect(typeof args.base).toBe('string');
  });

  it('parses --base, --cached, --strict, and --files (consumes rest)', () => {
    const args = parseArgs([
      '--base',
      'main',
      '--cached',
      '--strict',
      '--files',
      'capabilities/a.json',
      'capabilities/b/c.json',
    ]);
    expect(args.base).toBe('main');
    expect(args.cached).toBe(true);
    expect(args.strict).toBe(true);
    expect(args.files).toEqual(['capabilities/a.json', 'capabilities/b/c.json']);
  });

  it('throws on --base with no value', () => {
    expect(() => parseArgs(['--base'])).toThrow(/--base requires a value/);
  });
});

describe('filterCapabilityFiles', () => {
  it('keeps only capabilities/**.json and drops _index.json + non-capability paths', () => {
    const filtered = filterCapabilityFiles([
      'capabilities/github/issue.create.json',
      'capabilities/github/issue/list.json', // hierarchical path
      'capabilities/_index.json',
      'capabilities/github/_index.json',
      'capabilities/README.md',
      'recipes/whatever.json',
      'packages/schemas/src/capability.ts',
    ]);
    expect(filtered).toEqual([
      'capabilities/github/issue.create.json',
      'capabilities/github/issue/list.json',
    ]);
  });
});

describe('validateFiles', () => {
  it('passes valid capabilities and reports parse / schema failures', async () => {
    writeCap(tmpDir, 'capabilities/good.json', makeCapability('good.cap'));
    writeFileSync(join(tmpDir, 'capabilities', 'broken.json'), '{ not json', 'utf8');
    writeCap(tmpDir, 'capabilities/badshape.json', { id: 'oops', kind: 'banana' });

    const report = await validateFiles(
      ['capabilities/good.json', 'capabilities/broken.json', 'capabilities/badshape.json'],
      { cwd: tmpDir, strict: false },
    );
    expect(report.files).toEqual(['capabilities/good.json']);
    expect(report.failures).toHaveLength(2);
    expect(report.failures[0]?.message).toMatch(/invalid JSON/);
    expect(report.failures[1]?.message).toMatch(/invalid capability/);
  });

  it('skips paths that no longer exist (deleted between diff and validate)', async () => {
    const report = await validateFiles(['capabilities/missing.json'], {
      cwd: tmpDir,
      strict: false,
    });
    expect(report.files).toEqual([]);
    expect(report.failures).toEqual([]);
  });

  it('strict mode rejects capabilities with outstanding _review.needs', async () => {
    const reviewed = {
      ...makeCapability('foo.bar'),
      _review: {
        needs: ['side_effects', 'permissions'],
        imported_from: 'openapi:./tmp.json',
        imported_at: '2026-05-01T00:00:00.000Z',
        importer_version: '0.0.1',
      },
    };
    writeCap(tmpDir, 'capabilities/draft.json', reviewed);
    const lenient = await validateFiles(['capabilities/draft.json'], {
      cwd: tmpDir,
      strict: false,
    });
    expect(lenient.failures).toEqual([]);
    const strict = await validateFiles(['capabilities/draft.json'], {
      cwd: tmpDir,
      strict: true,
    });
    expect(strict.failures).toHaveLength(1);
    expect(strict.failures[0]?.message).toMatch(/2 review item\(s\) outstanding/);
  });
});

describe('runIncremental', () => {
  it('only validates capabilities returned by the diff (--files override)', async () => {
    writeCap(tmpDir, 'capabilities/touched.json', makeCapability('touched.cap'));
    writeCap(tmpDir, 'capabilities/untouched.json', makeCapability('untouched.cap'));
    // Mark `untouched` deliberately broken — it must NOT be picked up.
    writeFileSync(
      join(tmpDir, 'capabilities/untouched.json'),
      JSON.stringify({ id: 'untouched.cap', kind: 'banana' }),
      'utf8',
    );

    const report = await runIncremental(
      {
        base: 'origin/main',
        cached: false,
        files: ['capabilities/touched.json'],
        strict: false,
      },
      tmpDir,
    );
    expect(report.failures).toEqual([]);
    expect(report.files).toEqual(['capabilities/touched.json']);
  });

  it('drops non-capability paths from the incoming diff', async () => {
    writeCap(tmpDir, 'capabilities/a.json', makeCapability('a.cap'));
    const report = await runIncremental(
      {
        base: 'origin/main',
        cached: false,
        files: ['capabilities/a.json', 'capabilities/_index.json', 'README.md', 'recipes/x.json'],
        strict: false,
      },
      tmpDir,
    );
    expect(report.files).toEqual(['capabilities/a.json']);
    expect(report.failures).toEqual([]);
  });
});

describe('git diff integration', () => {
  it('enumerates added/modified files between two commits', () => {
    // Stand up a tiny throwaway git repo so we don't depend on the surrounding
    // worktree's state.
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: tmpDir });
    execFileSync('git', ['config', 'user.email', 'test@test'], { cwd: tmpDir });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: tmpDir });
    writeCap(tmpDir, 'capabilities/a.json', makeCapability('a.cap'));
    execFileSync('git', ['add', 'capabilities/a.json'], { cwd: tmpDir });
    execFileSync('git', ['commit', '-q', '-m', 'init', '--no-verify'], { cwd: tmpDir });
    const baseCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: tmpDir,
      encoding: 'utf8',
    }).trim();

    // Add one new file + modify the original, then commit.
    writeCap(tmpDir, 'capabilities/b/c.json', makeCapability('b.c'));
    writeCap(tmpDir, 'capabilities/a.json', makeCapability('a.cap', '0.2.0'));
    execFileSync('git', ['add', '-A'], { cwd: tmpDir });
    execFileSync('git', ['commit', '-q', '-m', 'change', '--no-verify'], { cwd: tmpDir });

    const diff = runGitDiff({ base: baseCommit, cached: false, cwd: tmpDir });
    // Order is git's; sort for stability.
    expect([...diff].sort()).toEqual(['capabilities/a.json', 'capabilities/b/c.json']);
  });

  it('--cached enumerates the staged set', () => {
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: tmpDir });
    execFileSync('git', ['config', 'user.email', 'test@test'], { cwd: tmpDir });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: tmpDir });
    writeCap(tmpDir, 'capabilities/a.json', makeCapability('a.cap'));
    execFileSync('git', ['add', 'capabilities/a.json'], { cwd: tmpDir });
    execFileSync('git', ['commit', '-q', '-m', 'init', '--no-verify'], { cwd: tmpDir });

    // Stage a NEW capability — git diff --cached should see it.
    writeCap(tmpDir, 'capabilities/staged.json', makeCapability('staged.cap'));
    execFileSync('git', ['add', 'capabilities/staged.json'], { cwd: tmpDir });

    const diff = runGitDiff({ base: 'HEAD', cached: true, cwd: tmpDir });
    expect(diff).toEqual(['capabilities/staged.json']);
  });
});
