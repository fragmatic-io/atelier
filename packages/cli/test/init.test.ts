// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { detectMode, INIT_FILES, runInit } from '../src/commands/init.js';

/**
 * The legacy `runInit()` tests pin `mode: 'monorepo'` because the temp
 * directory used by the test sandbox lives outside the repo and the
 * Sprint 1.1 default is now `standalone` for that case. The standalone
 * tests follow below in their own `describe` block.
 */
describe('runInit() — monorepo mode (legacy)', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'cir-cli-init-'));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('writes every file in INIT_FILES', async () => {
    const result = await runInit({ dir: '.', cwd: tmp, mode: 'monorepo' });
    for (const rel of INIT_FILES) {
      expect(result.filesWritten).toContain(rel);
      expect(existsSync(join(tmp, rel))).toBe(true);
    }
    expect(result.mode).toBe('monorepo');
    expect(result.host).toBeNull();
  });

  it('emits the DebugPanel import in app/layout.tsx with atelier dev --tail hint', async () => {
    await runInit({ dir: '.', cwd: tmp, mode: 'monorepo' });
    const layout = await readFile(join(tmp, 'app/layout.tsx'), 'utf8');
    expect(layout).toContain("import { DebugPanel } from '@atelier/react/debug';");
    expect(layout).toContain('atelier dev --tail');
  });

  it('produces a parseable package.json with the dir name', async () => {
    const target = join(tmp, 'my-app');
    await runInit({ dir: 'my-app', cwd: tmp, mode: 'monorepo' });
    const raw = await readFile(join(target, 'package.json'), 'utf8');
    const parsed = JSON.parse(raw) as { name: string; scripts: Record<string, string> };
    expect(parsed.name).toBe('my-app');
    expect(parsed.scripts['dev']).toBe('next dev');
  });

  it('creates capabilities/, skills/, components/ stubs', async () => {
    await runInit({ dir: '.', cwd: tmp, mode: 'monorepo' });
    expect(existsSync(join(tmp, 'capabilities'))).toBe(true);
    expect(existsSync(join(tmp, 'skills'))).toBe(true);
    expect(existsSync(join(tmp, 'components'))).toBe(true);
  });

  it('respects strict mode and errors on overwrite', async () => {
    await runInit({ dir: '.', cwd: tmp, mode: 'monorepo' });
    await expect(runInit({ dir: '.', cwd: tmp, mode: 'monorepo', strict: true })).rejects.toThrow(
      /strict mode/,
    );
  });

  it('emits a Tailwind config wired for Atelier dark-mode mirroring (Vis-2)', async () => {
    await runInit({ dir: '.', cwd: tmp, mode: 'monorepo' });
    const tw = await readFile(join(tmp, 'tailwind.config.mjs'), 'utf8');
    // The selector form covers the runtime's <html data-color-mode="dark">
    // mirror (`useColorModeFromIntent`) and the legacy class="dark" toggle.
    expect(tw).toContain('darkMode');
    expect(tw).toContain('[data-color-mode="dark"]');
    expect(tw).toContain('class');
    // Tailwind needs to scan the @atelier/components dist output to pick up the
    // utility classes we ship from `_variants.ts`.
    expect(tw).toContain('@atelier/components');
  });

  it('bridges typography depth tokens to CSS variables (Vis-1)', async () => {
    await runInit({ dir: '.', cwd: tmp, mode: 'monorepo' });
    const tw = await readFile(join(tmp, 'tailwind.config.mjs'), 'utf8');
    // Letter-spacing utility map points at --cir-tracking-* variables.
    expect(tw).toContain('letterSpacing');
    expect(tw).toContain('--cir-tracking-tight');
    expect(tw).toContain('--cir-tracking-normal');
    expect(tw).toContain('--cir-tracking-wide');
    // Line-height utility map points at --cir-leading-* variables.
    expect(tw).toContain('lineHeight');
    expect(tw).toContain('--cir-leading-tight');
    expect(tw).toContain('--cir-leading-normal');
    expect(tw).toContain('--cir-leading-loose');
    // OpenType feature settings bridge.
    expect(tw).toContain('--cir-font-feature-settings');
  });
});

describe('runInit() — standalone mode (Sprint 1.1)', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'cir-cli-init-standalone-'));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('next15 host: writes the canonical scaffold layout', async () => {
    const result = await runInit({
      dir: 'my-app',
      cwd: tmp,
      mode: 'standalone',
      host: 'next15',
      skipInstall: true,
    });
    expect(result.mode).toBe('standalone');
    expect(result.host).toBe('next15');
    expect(result.installed).toBe(false);

    const target = join(tmp, 'my-app');
    // Host files
    expect(existsSync(join(target, 'package.json'))).toBe(true);
    expect(existsSync(join(target, 'tsconfig.json'))).toBe(true);
    expect(existsSync(join(target, 'next.config.mjs'))).toBe(true);
    expect(existsSync(join(target, 'README.md'))).toBe(true);
    expect(existsSync(join(target, 'app', 'page.tsx'))).toBe(true);
    expect(existsSync(join(target, 'app', 'layout.tsx'))).toBe(true);
    expect(existsSync(join(target, 'app', 'api', 'cir', 'manifest', '[...slug]', 'route.ts'))).toBe(
      true,
    );
    expect(existsSync(join(target, 'app', 'api', 'triggers', 'publish', 'route.ts'))).toBe(true);
    expect(existsSync(join(target, 'lib', 'atelier-server.ts'))).toBe(true);
    // Shared starter kit
    expect(existsSync(join(target, '.env.local.example'))).toBe(true);
    expect(existsSync(join(target, '.gitignore'))).toBe(true);
    expect(existsSync(join(target, 'brand-kit.json'))).toBe(true);
    expect(existsSync(join(target, 'recipes', 'starter.json'))).toBe(true);
    expect(existsSync(join(target, 'policies', 'destructive-confirmation.json'))).toBe(true);
    expect(existsSync(join(target, 'capabilities', 'items.list.json'))).toBe(true);
    expect(existsSync(join(target, 'capabilities', 'items.create.json'))).toBe(true);
    expect(existsSync(join(target, 'skills', 'starter-empty-state.skill.md'))).toBe(true);
  });

  it('next15 host: package.json declares @atelier/* deps from npm (no workspace:*)', async () => {
    await runInit({
      dir: 'my-app',
      cwd: tmp,
      mode: 'standalone',
      host: 'next15',
      skipInstall: true,
    });
    const raw = await readFile(join(tmp, 'my-app', 'package.json'), 'utf8');
    const parsed = JSON.parse(raw) as {
      name: string;
      dependencies: Record<string, string>;
    };
    expect(parsed.name).toBe('my-app');
    // Spec-required deps from npm. None should be `workspace:*`.
    for (const dep of [
      '@atelier/runtime',
      '@atelier/react',
      '@atelier/components',
      '@atelier/compiler',
      '@atelier/schemas',
      '@atelier/policies',
      '@atelier/vault-client',
      '@atelier/vault-server',
    ]) {
      expect(parsed.dependencies[dep]).toBeDefined();
      expect(parsed.dependencies[dep]).not.toMatch(/workspace:/);
      expect(parsed.dependencies[dep]).toMatch(/^[\^~]?\d/);
    }
    // next/react come along for the host
    expect(parsed.dependencies['next']).toBeDefined();
    expect(parsed.dependencies['react']).toBeDefined();
  });

  it('next15 host: substitutes {{appName}} into templates', async () => {
    await runInit({
      dir: 'pumpkin-pie',
      cwd: tmp,
      mode: 'standalone',
      host: 'next15',
      skipInstall: true,
    });
    const target = join(tmp, 'pumpkin-pie');
    const layout = await readFile(join(target, 'app', 'layout.tsx'), 'utf8');
    expect(layout).toContain('pumpkin-pie');
    const readme = await readFile(join(target, 'README.md'), 'utf8');
    expect(readme).toContain('pumpkin-pie');
    const brand = JSON.parse(await readFile(join(target, 'brand-kit.json'), 'utf8')) as {
      id: string;
    };
    expect(brand.id).toBe('pumpkin-pie.brand');
  });

  it('vite host: writes the canonical scaffold layout', async () => {
    const result = await runInit({
      dir: 'my-vite',
      cwd: tmp,
      mode: 'standalone',
      host: 'vite',
      skipInstall: true,
    });
    expect(result.host).toBe('vite');

    const target = join(tmp, 'my-vite');
    expect(existsSync(join(target, 'package.json'))).toBe(true);
    expect(existsSync(join(target, 'tsconfig.json'))).toBe(true);
    expect(existsSync(join(target, 'vite.config.ts'))).toBe(true);
    expect(existsSync(join(target, 'index.html'))).toBe(true);
    expect(existsSync(join(target, 'src', 'main.tsx'))).toBe(true);
    expect(existsSync(join(target, 'src', 'app.tsx'))).toBe(true);
    expect(existsSync(join(target, 'src', 'atelier-server.ts'))).toBe(true);
    // Shared starter kit comes along
    expect(existsSync(join(target, 'brand-kit.json'))).toBe(true);
    expect(existsSync(join(target, 'recipes', 'starter.json'))).toBe(true);
  });

  it('vite host: package.json declares the published @atelier/* deps + vite + react', async () => {
    await runInit({
      dir: 'my-vite',
      cwd: tmp,
      mode: 'standalone',
      host: 'vite',
      skipInstall: true,
    });
    const raw = await readFile(join(tmp, 'my-vite', 'package.json'), 'utf8');
    const parsed = JSON.parse(raw) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(parsed.dependencies['@atelier/runtime']).toBeDefined();
    expect(parsed.dependencies['@atelier/runtime']).not.toMatch(/workspace:/);
    expect(parsed.dependencies['react']).toBeDefined();
    expect(parsed.devDependencies['vite']).toBeDefined();
    expect(parsed.devDependencies['@vitejs/plugin-react']).toBeDefined();
  });

  it('description flag substitutes {{description}} in templates', async () => {
    await runInit({
      dir: 'desc-app',
      cwd: tmp,
      mode: 'standalone',
      host: 'next15',
      skipInstall: true,
      description: 'Tells the user about cats.',
    });
    const readme = await readFile(join(tmp, 'desc-app', 'README.md'), 'utf8');
    expect(readme).toContain('Tells the user about cats.');
    const pkg = JSON.parse(await readFile(join(tmp, 'desc-app', 'package.json'), 'utf8')) as {
      description: string;
    };
    expect(pkg.description).toBe('Tells the user about cats.');
  });

  it('strict mode rejects an existing destination file', async () => {
    await runInit({
      dir: 'twice',
      cwd: tmp,
      mode: 'standalone',
      host: 'next15',
      skipInstall: true,
    });
    await expect(
      runInit({
        dir: 'twice',
        cwd: tmp,
        mode: 'standalone',
        host: 'next15',
        skipInstall: true,
        strict: true,
      }),
    ).rejects.toThrow(/strict mode/);
  });
});

describe('detectMode()', () => {
  it('returns monorepo when invoked from the Atelier repo root', () => {
    // The vitest process cwd is the cli package itself, but detection
    // walks ancestors. The repo root has pnpm-workspace.yaml + package.json
    // name "atelier".
    const fromCli = detectMode(__dirname);
    expect(fromCli).toBe('monorepo');
  });

  it('returns standalone for a fresh tmp directory', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'cir-cli-detect-'));
    try {
      expect(detectMode(tmp)).toBe('standalone');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
