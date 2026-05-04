// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for `LocalRecipeStore`. We write a small fixture directory in
 * `os.tmpdir()` per test (via `mkdtemp`) so each run is isolated.
 *
 * Coverage:
 *
 *   - lists wrapped-shape recipes
 *   - lists manifest-shape recipes (with sidecar metadata)
 *   - falls back to defaults when no sidecar
 *   - get() returns the right recipe / null for unknown
 *   - rejects when directory missing / not a directory
 *   - reload() forces a re-read
 *   - eager: true prefetches without blocking the constructor
 */

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LocalRecipeStore } from '../src/local-recipe-store.js';

let TMP: string | null = null;

async function makeTmp(): Promise<string> {
  TMP = await mkdtemp(join(tmpdir(), 'recipe-store-'));
  return TMP;
}

afterEach(async () => {
  if (TMP) {
    await rm(TMP, { recursive: true, force: true });
    TMP = null;
  }
});

describe('LocalRecipeStore', () => {
  it('lists wrapped-shape recipes', async () => {
    const dir = await makeTmp();
    await writeFile(
      join(dir, 'github-reviewer.json'),
      JSON.stringify({
        id: 'github-reviewer',
        description: 'Review GH issues + PRs.',
        domain: 'issue-tracker',
        brand_kit_id: 'github-default',
        intent_surfaces: ['issues', 'pull requests'],
      }),
    );
    const store = new LocalRecipeStore({ directory: dir });
    const list = await store.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe('github-reviewer');
    expect(list[0]?.description).toBe('Review GH issues + PRs.');
    expect(list[0]?.domain).toBe('issue-tracker');
    expect(list[0]?.brand_kit_id).toBe('github-default');
    expect(list[0]?.intent_surfaces).toEqual(['issues', 'pull requests']);
  });

  it('lists manifest-shape recipes with sidecar metadata', async () => {
    const dir = await makeTmp();
    const manifest = { manifest_id: 'm_xyz', user_id: 'u', app_id: 'a', routes: [] };
    await writeFile(join(dir, 'shopper.json'), JSON.stringify(manifest));
    await writeFile(
      join(dir, 'shopper.meta.json'),
      JSON.stringify({
        description: 'Shopping persona.',
        domain: 'commerce',
        intent_surfaces: ['cart'],
      }),
    );
    const store = new LocalRecipeStore({ directory: dir });
    const list = await store.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe('shopper');
    expect(list[0]?.description).toBe('Shopping persona.');
    expect(list[0]?.domain).toBe('commerce');
    // The manifest is preserved as the recipe body.
    expect(list[0]?.manifest).toEqual(manifest);
  });

  it('manifest-shape recipes fall back to defaults without a sidecar', async () => {
    const dir = await makeTmp();
    await writeFile(
      join(dir, 'plain.json'),
      JSON.stringify({ manifest_id: 'm', user_id: 'u', app_id: 'a', routes: [] }),
    );
    const store = new LocalRecipeStore({
      directory: dir,
      defaultDescription: (id) => `Default: ${id}`,
    });
    const list = await store.list();
    expect(list[0]?.description).toBe('Default: plain');
  });

  it('get() returns the recipe by id, or null', async () => {
    const dir = await makeTmp();
    await writeFile(join(dir, 'a.json'), JSON.stringify({ id: 'a', description: 'A.' }));
    const store = new LocalRecipeStore({ directory: dir });
    expect((await store.get('a'))?.id).toBe('a');
    expect(await store.get('nope')).toBeNull();
  });

  it('rejects when directory does not exist', async () => {
    const store = new LocalRecipeStore({ directory: '/does/not/exist/please' });
    await expect(store.list()).rejects.toThrow(/failed to read/);
  });

  it('rejects when directory is a file', async () => {
    const dir = await makeTmp();
    const file = join(dir, 'file');
    await writeFile(file, 'oops');
    const store = new LocalRecipeStore({ directory: file });
    await expect(store.list()).rejects.toThrow(/not a directory/);
  });

  it('reload() re-reads the directory', async () => {
    const dir = await makeTmp();
    await writeFile(join(dir, 'a.json'), JSON.stringify({ id: 'a', description: 'A.' }));
    const store = new LocalRecipeStore({ directory: dir });
    expect((await store.list()).length).toBe(1);
    await writeFile(join(dir, 'b.json'), JSON.stringify({ id: 'b', description: 'B.' }));
    // Cached list still has 1.
    expect((await store.list()).length).toBe(1);
    await store.reload();
    expect((await store.list()).length).toBe(2);
  });

  it('eager: true prefetches', async () => {
    const dir = await makeTmp();
    await writeFile(join(dir, 'a.json'), JSON.stringify({ id: 'a', description: 'A.' }));
    const store = new LocalRecipeStore({ directory: dir, eager: true });
    // The eager flag fires-and-forgets the load; list() awaits it.
    const list = await store.list();
    expect(list).toHaveLength(1);
  });

  it('skips non-json files and recursively-nested dirs', async () => {
    const dir = await makeTmp();
    await writeFile(join(dir, 'README.md'), '# not a recipe');
    await writeFile(join(dir, 'a.json'), JSON.stringify({ id: 'a', description: 'A.' }));
    await mkdir(join(dir, 'subdir'));
    await writeFile(
      join(dir, 'subdir', 'nested.json'),
      JSON.stringify({ id: 'nested', description: 'nested' }),
    );
    const store = new LocalRecipeStore({ directory: dir });
    const list = await store.list();
    expect(list.map((r) => r.id)).toEqual(['a']);
  });

  it('rejects malformed JSON files', async () => {
    const dir = await makeTmp();
    await writeFile(join(dir, 'bad.json'), '{ not json');
    const store = new LocalRecipeStore({ directory: dir });
    await expect(store.list()).rejects.toThrow(/failed to parse/);
  });
});
