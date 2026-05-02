// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import {
  listAvailableComponents,
  resolveComponentsSourceDir,
  runAdd,
} from '../src/commands/add.js';

describe('cir add', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'cir-cli-add-'));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('lists components from @atelier/components source', async () => {
    const names = await listAvailableComponents();
    expect(names.length).toBeGreaterThan(10);
    expect(names).toContain('Button');
    expect(names).toContain('Card');
    expect(names).toContain('Table');
  });

  it('resolveComponentsSourceDir returns an existing directory', () => {
    const dir = resolveComponentsSourceDir();
    expect(existsSync(dir)).toBe(true);
  });

  it('copies a known component into <cwd>/components/', async () => {
    const result = await runAdd('Button', { cwd: tmp });
    expect(result.componentName).toBe('Button');
    const dest = join(tmp, 'components', 'Button.tsx');
    expect(existsSync(dest)).toBe(true);
    const contents = await readFile(dest, 'utf8');
    expect(contents).toContain('export const Button');
  });

  it('errors clearly on unknown component', async () => {
    await expect(runAdd('DoesNotExist', { cwd: tmp })).rejects.toThrow(
      /unknown component 'DoesNotExist'/,
    );
  });

  it('refuses to overwrite when noOverwrite is set', async () => {
    await runAdd('Button', { cwd: tmp });
    await expect(runAdd('Button', { cwd: tmp, noOverwrite: true })).rejects.toThrow(
      /refusing to overwrite/,
    );
  });
});
