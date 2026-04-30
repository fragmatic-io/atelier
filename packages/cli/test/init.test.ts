// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { INIT_FILES, runInit } from '../src/commands/init.js';

describe('runInit()', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'cir-cli-init-'));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('writes every file in INIT_FILES', async () => {
    const result = await runInit({ dir: '.', cwd: tmp });
    for (const rel of INIT_FILES) {
      expect(result.filesWritten).toContain(rel);
      expect(existsSync(join(tmp, rel))).toBe(true);
    }
  });

  it('emits the DebugPanel import in app/layout.tsx with cir dev --tail hint', async () => {
    await runInit({ dir: '.', cwd: tmp });
    const layout = await readFile(join(tmp, 'app/layout.tsx'), 'utf8');
    expect(layout).toContain("import { DebugPanel } from '@cir/react/debug';");
    expect(layout).toContain('cir dev --tail');
  });

  it('produces a parseable package.json with the dir name', async () => {
    const target = join(tmp, 'my-app');
    await runInit({ dir: 'my-app', cwd: tmp });
    const raw = await readFile(join(target, 'package.json'), 'utf8');
    const parsed = JSON.parse(raw) as { name: string; scripts: Record<string, string> };
    expect(parsed.name).toBe('my-app');
    expect(parsed.scripts['dev']).toBe('next dev');
  });

  it('creates capabilities/, skills/, components/ stubs', async () => {
    await runInit({ dir: '.', cwd: tmp });
    expect(existsSync(join(tmp, 'capabilities'))).toBe(true);
    expect(existsSync(join(tmp, 'skills'))).toBe(true);
    expect(existsSync(join(tmp, 'components'))).toBe(true);
  });

  it('respects strict mode and errors on overwrite', async () => {
    await runInit({ dir: '.', cwd: tmp });
    await expect(runInit({ dir: '.', cwd: tmp, strict: true })).rejects.toThrow(/strict mode/);
  });

  it('emits a Tailwind config wired for CIR dark-mode mirroring (Vis-2)', async () => {
    await runInit({ dir: '.', cwd: tmp });
    const tw = await readFile(join(tmp, 'tailwind.config.mjs'), 'utf8');
    // The selector form covers the runtime's <html data-color-mode="dark">
    // mirror (`useColorModeFromIntent`) and the legacy class="dark" toggle.
    expect(tw).toContain('darkMode');
    expect(tw).toContain('[data-color-mode="dark"]');
    expect(tw).toContain('class');
    // Tailwind needs to scan the @cir/components dist output to pick up the
    // utility classes we ship from `_variants.ts`.
    expect(tw).toContain('@cir/components');
  });
});
