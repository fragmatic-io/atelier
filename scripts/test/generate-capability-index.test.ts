// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for `scripts/generate-capability-index.ts`.
 *
 * Strategy:
 *  - Build helpers (`readAllCapabilityFiles`, `buildAllIndices`,
 *    `buildSubdirectoryIndex`) are exercised against a temp directory tree
 *    with hierarchical capability paths (verifies S-5's nested-paths claim).
 *  - The shape of every produced index is validated against
 *    `CapabilityIndexSchema` so the snapshot itself is type-checked.
 *  - The check-mode round-trip (write → re-check → ok; mutate → re-check
 *    → drift) pins the contract `pnpm capabilities:index --check` is wired
 *    against in CI.
 *  - One test verifies the actual repo's `capabilities/_index.json` is in
 *    sync (mirrors `pnpm components:check`).
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname as pathDirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  buildAllIndices,
  buildRootIndex,
  buildSubdirectoryIndex,
  CapabilityIndexSchema,
  generate,
  indexedDirectories,
  INDEX_VERSION,
  readAllCapabilityFiles,
} from '../generate-capability-index.js';

const REPO = resolve(import.meta.dirname, '..', '..');
const TMP_BASE = resolve(REPO, 'scripts/test/.tmp-cap-index');

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

function writeCap(root: string, relPath: string, id: string, version?: string): void {
  const abs = join(root, relPath);
  mkdirSync(pathDirname(abs), { recursive: true });
  writeFileSync(abs, `${JSON.stringify(makeCapability(id, version), null, 2)}\n`, 'utf8');
}

let tmpDir: string;

beforeEach(() => {
  // Each test gets a fresh tmp tree to avoid cross-test pollution. Use a
  // process-id-tagged folder so parallel vitest workers don't collide.
  tmpDir = `${TMP_BASE}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
});

describe('readAllCapabilityFiles', () => {
  it('walks nested capability subtrees and returns parsed entries sorted by path', async () => {
    writeCap(tmpDir, 'github/issue/list.json', 'github.issue.list');
    writeCap(tmpDir, 'github/issue/create.json', 'github.issue.create');
    writeCap(tmpDir, 'github/repo.list.json', 'github.repo.list');
    writeCap(tmpDir, 'dummyjson/cart.list.json', 'dummyjson.cart.list');

    const files = await readAllCapabilityFiles(tmpDir);
    expect(files.map((f) => f.relPath)).toEqual([
      'dummyjson/cart.list.json',
      'github/issue/create.json',
      'github/issue/list.json',
      'github/repo.list.json',
    ]);
    expect(files[0]?.id).toBe('dummyjson.cart.list');
    expect(files[1]?.version).toBe('0.1.0');
  });

  it('skips generated _index.json files', async () => {
    writeCap(tmpDir, 'github/issue.create.json', 'github.issue.create');
    writeFileSync(
      join(tmpDir, '_index.json'),
      `${JSON.stringify({ version: INDEX_VERSION, generated_at: '2026-05-03T00:00:00.000Z', capabilities: [], subdirectories: [] }, null, 2)}\n`,
      'utf8',
    );
    const files = await readAllCapabilityFiles(tmpDir);
    expect(files.length).toBe(1);
    expect(files[0]?.relPath).toBe('github/issue.create.json');
  });

  it('throws a path-tagged error on invalid JSON', async () => {
    writeCap(tmpDir, 'github/issue.create.json', 'github.issue.create');
    writeFileSync(join(tmpDir, 'broken.json'), '{ "not closed', 'utf8');
    await expect(readAllCapabilityFiles(tmpDir)).rejects.toThrow(/broken\.json: invalid JSON/);
  });

  it('throws a path-tagged error on schema violation', async () => {
    writeFileSync(
      join(tmpDir, 'oops.json'),
      JSON.stringify({ id: 'oops', kind: 'banana' }),
      'utf8',
    );
    await expect(readAllCapabilityFiles(tmpDir)).rejects.toThrow(/oops\.json: invalid capability/);
  });
});

describe('builders', () => {
  const NOW = '2026-05-03T12:00:00.000Z';

  it('buildRootIndex aggregates every capability with paths relative to capabilities/', () => {
    const files = [
      {
        absPath: '/x/github/issue.create.json',
        relPath: 'github/issue.create.json',
        id: 'github.issue.create',
        version: '0.1.0',
      },
      {
        absPath: '/x/github/issue/list.json',
        relPath: 'github/issue/list.json',
        id: 'github.issue.list',
        version: '0.2.0',
      },
      {
        absPath: '/x/dummyjson/cart.list.json',
        relPath: 'dummyjson/cart.list.json',
        id: 'dummyjson.cart.list',
        version: '0.1.0',
      },
    ] as const;
    const idx = buildRootIndex(files, NOW);
    expect(() => CapabilityIndexSchema.parse(idx)).not.toThrow();
    expect(idx.version).toBe(INDEX_VERSION);
    expect(idx.generated_at).toBe(NOW);
    expect(idx.capabilities.map((c) => c.id)).toEqual([
      'dummyjson.cart.list',
      'github.issue.create',
      'github.issue.list',
    ]);
    expect(idx.capabilities[1]?.path).toBe('github/issue.create.json');
    expect(idx.subdirectories).toEqual(['dummyjson', 'github']);
  });

  it('buildSubdirectoryIndex strips the prefix and surfaces nested-only subdirs', () => {
    const files = [
      {
        absPath: '/x/github/issue.create.json',
        relPath: 'github/issue.create.json',
        id: 'github.issue.create',
        version: '0.1.0',
      },
      {
        absPath: '/x/github/issue/list.json',
        relPath: 'github/issue/list.json',
        id: 'github.issue.list',
        version: '0.2.0',
      },
      {
        absPath: '/x/github/repo/list.json',
        relPath: 'github/repo/list.json',
        id: 'github.repo.list',
        version: '0.1.0',
      },
    ] as const;
    const idx = buildSubdirectoryIndex('github', files, NOW);
    expect(() => CapabilityIndexSchema.parse(idx)).not.toThrow();
    expect(idx.capabilities.map((c) => c.path)).toEqual(['issue.create.json']);
    expect(idx.capabilities[0]?.id).toBe('github.issue.create');
    expect(idx.subdirectories).toEqual(['issue', 'repo']);

    const nested = buildSubdirectoryIndex('github/issue', files, NOW);
    expect(nested.capabilities.map((c) => c.id)).toEqual(['github.issue.list']);
    expect(nested.capabilities[0]?.path).toBe('list.json');
    expect(nested.subdirectories).toEqual([]);
  });

  it('indexedDirectories returns the root plus every directory that contains capabilities', () => {
    const files = [
      {
        absPath: '/x/github/issue.create.json',
        relPath: 'github/issue.create.json',
        id: 'github.issue.create',
        version: '0.1.0',
      },
      {
        absPath: '/x/github/issue/list.json',
        relPath: 'github/issue/list.json',
        id: 'github.issue.list',
        version: '0.2.0',
      },
      {
        absPath: '/x/dummyjson/cart.list.json',
        relPath: 'dummyjson/cart.list.json',
        id: 'dummyjson.cart.list',
        version: '0.1.0',
      },
    ] as const;
    expect(indexedDirectories(files)).toEqual(['', 'dummyjson', 'github', 'github/issue']);
  });

  it('buildAllIndices keys by absolute path and produces one index per indexed directory', () => {
    const files = [
      {
        absPath: '/x/github/issue/list.json',
        relPath: 'github/issue/list.json',
        id: 'github.issue.list',
        version: '0.2.0',
      },
    ] as const;
    const indices = buildAllIndices(files, NOW, '/x');
    expect([...indices.keys()].sort()).toEqual([
      '/x/_index.json',
      '/x/github/_index.json',
      '/x/github/issue/_index.json',
    ]);
    // Per-leaf-dir index lists the cap; intermediate index lists subdir.
    const leaf = indices.get('/x/github/issue/_index.json');
    expect(leaf?.capabilities.map((c) => c.path)).toEqual(['list.json']);
    const mid = indices.get('/x/github/_index.json');
    expect(mid?.capabilities).toEqual([]);
    expect(mid?.subdirectories).toEqual(['issue']);
  });
});

describe('hierarchical paths resolve to the right capability id', () => {
  it('a deeply-nested path keeps its canonical id', async () => {
    writeCap(tmpDir, 'github/issue/list.json', 'github.issue.list');
    writeCap(tmpDir, 'a/b/c/deep.json', 'a.b.c.deep');
    const files = await readAllCapabilityFiles(tmpDir);
    const byPath = new Map(files.map((f) => [f.relPath, f]));
    expect(byPath.get('github/issue/list.json')?.id).toBe('github.issue.list');
    expect(byPath.get('a/b/c/deep.json')?.id).toBe('a.b.c.deep');
  });
});

describe('generate() write + check round-trip', () => {
  it('writes indices to disk and a follow-up --check passes with no drift', async () => {
    writeCap(tmpDir, 'github/issue.create.json', 'github.issue.create');
    writeCap(tmpDir, 'github/issue/list.json', 'github.issue.list');
    writeCap(tmpDir, 'dummyjson/cart.list.json', 'dummyjson.cart.list');

    const wrote = await generate({
      capabilitiesRoot: tmpDir,
      now: '2026-05-03T12:00:00.000Z',
    });
    expect(wrote.wrote).toBe(4); // root + dummyjson + github + github/issue
    expect(existsSync(join(tmpDir, '_index.json'))).toBe(true);
    expect(existsSync(join(tmpDir, 'github/issue/_index.json'))).toBe(true);

    // The on-disk index validates against the schema.
    const root = JSON.parse(readFileSync(join(tmpDir, '_index.json'), 'utf8')) as unknown;
    expect(() => CapabilityIndexSchema.parse(root)).not.toThrow();

    // Re-running with `--check` (different timestamp) still passes — the
    // generated_at field is normalized away during the comparison.
    const check = await generate({
      capabilitiesRoot: tmpDir,
      now: '2026-05-04T08:00:00.000Z',
      check: true,
    });
    expect(check.drift?.ok).toBe(true);
  });

  it('--check reports drift when the on-disk index is stale', async () => {
    writeCap(tmpDir, 'github/issue.create.json', 'github.issue.create');
    await generate({ capabilitiesRoot: tmpDir, now: '2026-05-03T12:00:00.000Z' });
    // Now ADD a new capability without re-generating — the existing root +
    // github/_index.json should drift.
    writeCap(tmpDir, 'github/repo.list.json', 'github.repo.list');
    const check = await generate({
      capabilitiesRoot: tmpDir,
      now: '2026-05-03T12:00:00.000Z',
      check: true,
    });
    expect(check.drift?.ok).toBe(false);
    expect(check.drift?.drifted.some((p) => p.endsWith('_index.json'))).toBe(true);
  });

  it('--check reports stale _index.json files for empty-now subtrees', async () => {
    writeCap(tmpDir, 'github/issue.create.json', 'github.issue.create');
    await generate({ capabilitiesRoot: tmpDir, now: '2026-05-03T12:00:00.000Z' });
    // Drop the only capability under github/. The stale `github/_index.json`
    // should be flagged.
    rmSync(join(tmpDir, 'github/issue.create.json'));
    const check = await generate({
      capabilitiesRoot: tmpDir,
      now: '2026-05-03T12:00:00.000Z',
      check: true,
    });
    expect(check.drift?.ok).toBe(false);
    expect(check.drift?.drifted.some((p) => p.endsWith('github/_index.json'))).toBe(true);
  });
});

describe('repo capability index stays in sync', () => {
  it('the committed capabilities/_index.json (and friends) match the live capabilities/', async () => {
    const repoCaps = resolve(REPO, 'capabilities');
    if (!existsSync(repoCaps)) return; // worktree may not have it
    // Use a stable timestamp; the comparison strips it anyway.
    const result = await generate({
      capabilitiesRoot: repoCaps,
      now: '2026-05-03T12:00:00.000Z',
      check: true,
    });
    expect(result.drift?.missing, JSON.stringify(result.drift)).toEqual([]);
    expect(result.drift?.drifted, JSON.stringify(result.drift)).toEqual([]);
    expect(result.drift?.ok).toBe(true);
  });
});
