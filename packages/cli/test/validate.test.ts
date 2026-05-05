// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for `atelier validate`. Sprint 1.2.
 *
 * The runner is exercised against on-disk fixtures (`validate-passing/`,
 * `validate-failing/`) plus a few synthesised tmp dirs for stack-detection
 * combinatorics. We mock nothing — `runValidate` is meant to work cold
 * against a real layout, and the tests assert that contract.
 *
 * The TS / ESLint / Vitest runners spawn the consumer's binaries. None
 * of the fixtures install dependencies, so those checks resolve to `skip`
 * in test runs (no `node_modules/.bin/tsc` etc.). That's intentional —
 * the fixtures cover detection + skip-reason wording; the per-runner
 * spawn behaviour is covered by hand-written stack inputs that elide
 * tooling.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { detectStack } from '../src/lib/detect-stack.js';
import { renderValidateText, runValidate, validateCommand } from '../src/commands/validate.js';

const FIXTURE_PASS = resolve(__dirname, 'fixtures', 'validate-passing');
const FIXTURE_FAIL = resolve(__dirname, 'fixtures', 'validate-failing');

describe('detectStack', () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'atelier-detect-'));
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('reports no package.json when the directory is empty', () => {
    const stack = detectStack(tmp);
    expect(stack.hasPackageJson).toBe(false);
    expect(stack.packageJson).toBeNull();
  });

  it('parses package.json + scripts when present', async () => {
    await writeFile(
      join(tmp, 'package.json'),
      JSON.stringify({ name: 'x', scripts: { test: 'vitest run' } }),
      'utf8',
    );
    const stack = detectStack(tmp);
    expect(stack.hasPackageJson).toBe(true);
    expect(stack.packageJson?.name).toBe('x');
    expect(stack.hasTestScript).toBe(true);
    expect(stack.hasVitest).toBe(true);
  });

  it('detects pnpm + monorepo when pnpm-workspace.yaml is present', async () => {
    await writeFile(join(tmp, 'package.json'), '{}', 'utf8');
    await writeFile(join(tmp, 'pnpm-workspace.yaml'), 'packages:\n  - "*"\n', 'utf8');
    await writeFile(join(tmp, 'pnpm-lock.yaml'), '', 'utf8');
    const stack = detectStack(tmp);
    expect(stack.packageManager).toBe('pnpm');
    expect(stack.isMonorepo).toBe(true);
    expect(stack.monorepoFlavour).toBe('pnpm');
  });

  it('detects npm-workspaces via package.json + package-lock.json', async () => {
    await writeFile(
      join(tmp, 'package.json'),
      JSON.stringify({ name: 'r', workspaces: ['packages/*'] }),
      'utf8',
    );
    await writeFile(join(tmp, 'package-lock.json'), '{}', 'utf8');
    const stack = detectStack(tmp);
    expect(stack.packageManager).toBe('npm');
    expect(stack.isMonorepo).toBe(true);
    expect(stack.monorepoFlavour).toBe('npm');
  });

  it('detects yarn-workspaces via package.json + yarn.lock', async () => {
    await writeFile(
      join(tmp, 'package.json'),
      JSON.stringify({ name: 'r', workspaces: ['packages/*'] }),
      'utf8',
    );
    await writeFile(join(tmp, 'yarn.lock'), '', 'utf8');
    const stack = detectStack(tmp);
    expect(stack.packageManager).toBe('yarn');
    expect(stack.isMonorepo).toBe(true);
    expect(stack.monorepoFlavour).toBe('yarn');
  });

  it('detects TypeScript via tsconfig.json', async () => {
    await writeFile(join(tmp, 'package.json'), '{}', 'utf8');
    await writeFile(join(tmp, 'tsconfig.json'), '{}', 'utf8');
    const stack = detectStack(tmp);
    expect(stack.hasTypeScript).toBe(true);
  });

  it('detects ESLint via flat config (eslint.config.js)', async () => {
    await writeFile(join(tmp, 'package.json'), '{}', 'utf8');
    await writeFile(join(tmp, 'eslint.config.js'), '', 'utf8');
    const stack = detectStack(tmp);
    expect(stack.hasEslint).toBe(true);
  });

  it('detects ESLint via legacy .eslintrc.json', async () => {
    await writeFile(join(tmp, 'package.json'), '{}', 'utf8');
    await writeFile(join(tmp, '.eslintrc.json'), '{}', 'utf8');
    const stack = detectStack(tmp);
    expect(stack.hasEslint).toBe(true);
  });

  it('detects vitest via config file when no test script is present', async () => {
    await writeFile(join(tmp, 'package.json'), '{}', 'utf8');
    await writeFile(join(tmp, 'vitest.config.ts'), '', 'utf8');
    const stack = detectStack(tmp);
    expect(stack.hasVitest).toBe(true);
    expect(stack.hasTestScript).toBe(false);
  });

  it('treats placeholder echo test scripts as missing', async () => {
    await writeFile(
      join(tmp, 'package.json'),
      JSON.stringify({ name: 'x', scripts: { test: 'echo "no tests"' } }),
      'utf8',
    );
    const stack = detectStack(tmp);
    expect(stack.hasTestScript).toBe(false);
  });

  it('detects atelier directories', async () => {
    await writeFile(join(tmp, 'package.json'), '{}', 'utf8');
    await mkdir(join(tmp, 'capabilities'));
    await mkdir(join(tmp, 'skills'));
    await mkdir(join(tmp, 'policies'));
    await mkdir(join(tmp, 'recipes'));
    await writeFile(join(tmp, 'brand-kit.json'), '{}', 'utf8');
    await mkdir(join(tmp, 'components'));
    await writeFile(join(tmp, 'components/registry.json'), '{}', 'utf8');
    const stack = detectStack(tmp);
    expect(stack.hasCapabilities).toBe(true);
    expect(stack.hasSkills).toBe(true);
    expect(stack.hasPolicies).toBe(true);
    expect(stack.hasRecipes).toBe(true);
    expect(stack.hasBrandKit).toBe(true);
    expect(stack.hasComponentRegistry).toBe(true);
  });
});

describe('runValidate — fixtures', () => {
  it('passes the Atelier-specific checks against the passing fixture', async () => {
    const result = await runValidate({ cwd: FIXTURE_PASS, only: new Set(['schemas']) });
    expect(result.ok).toBe(true);
    const byId = Object.fromEntries(result.results.map((r) => [r.id, r]));
    expect(byId['capabilities']?.status).toBe('pass');
    expect(byId['skills']?.status).toBe('pass');
    expect(byId['policies']?.status).toBe('pass');
    // brand-kit / recipes / components/registry not in the fixture → skip
    expect(byId['brandKit']?.status).toBe('skip');
    expect(byId['recipes']?.status).toBe('skip');
    expect(byId['componentsRegistry']?.status).toBe('skip');
  });

  it('fails on the failing fixture (broken capability + policy + skill)', async () => {
    const result = await runValidate({ cwd: FIXTURE_FAIL, only: new Set(['schemas']) });
    expect(result.ok).toBe(false);
    const byId = Object.fromEntries(result.results.map((r) => [r.id, r]));
    expect(byId['capabilities']?.status).toBe('fail');
    expect(byId['policies']?.status).toBe('fail');
    expect(byId['skills']?.status).toBe('fail');
  });

  it('--only=schemas runs only the schema checks (no typecheck/lint/test)', async () => {
    const result = await runValidate({ cwd: FIXTURE_PASS, only: new Set(['schemas']) });
    const ids = result.results.map((r) => r.id);
    expect(ids).not.toContain('typecheck');
    expect(ids).not.toContain('lint');
    expect(ids).not.toContain('test');
  });

  it('--only=capabilities runs only that one check', async () => {
    const result = await runValidate({ cwd: FIXTURE_PASS, only: new Set(['capabilities']) });
    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.id).toBe('capabilities');
  });

  it('strict mode flips skipped checks into a non-zero overall ok', async () => {
    const result = await runValidate({
      cwd: FIXTURE_PASS,
      only: new Set(['schemas']),
      strict: true,
    });
    // brandKit + recipes + componentsRegistry are skipped — strict fails.
    expect(result.ok).toBe(false);
  });

  it('non-strict skipped runs are still ok overall', async () => {
    const result = await runValidate({ cwd: FIXTURE_PASS, only: new Set(['schemas']) });
    const skipped = result.results.filter((r) => r.status === 'skip');
    expect(skipped.length).toBeGreaterThan(0);
    expect(result.ok).toBe(true);
  });
});

describe('runValidate — TS-only / ESLint-only / monorepo synth', () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'atelier-validate-'));
    await writeFile(join(tmp, 'package.json'), '{}', 'utf8');
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('TS-only project: only the typecheck row is non-skip', async () => {
    await writeFile(join(tmp, 'tsconfig.json'), '{}', 'utf8');
    const result = await runValidate({ cwd: tmp, only: new Set(['typecheck', 'lint', 'test']) });
    const byId = Object.fromEntries(result.results.map((r) => [r.id, r]));
    // tsc is not in PATH for the test env, so it falls back to skip.
    // Either way, lint + test should be skip.
    expect(byId['lint']?.status).toBe('skip');
    expect(byId['lint']?.reason).toBe('no eslint config');
    expect(byId['test']?.status).toBe('skip');
    expect(byId['test']?.reason).toBe('no test script');
  });

  it('ESLint-only project: only the lint row is detected', async () => {
    await writeFile(join(tmp, 'eslint.config.js'), '', 'utf8');
    const result = await runValidate({ cwd: tmp, only: new Set(['typecheck', 'lint', 'test']) });
    const byId = Object.fromEntries(result.results.map((r) => [r.id, r]));
    expect(byId['typecheck']?.status).toBe('skip');
    expect(byId['test']?.status).toBe('skip');
  });

  it('missing package.json yields a configuration failure', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'atelier-noconfig-'));
    try {
      const result = await runValidate({ cwd: empty });
      expect(result.ok).toBe(false);
      expect(result.results[0]?.reason).toBe('no package.json found');
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });
});

describe('renderValidateText', () => {
  it('renders the table header + summary', async () => {
    const result = await runValidate({ cwd: FIXTURE_PASS, only: new Set(['schemas']) });
    const text = renderValidateText(result);
    expect(text).toContain('atelier validate');
    expect(text).toContain('────');
    expect(text).toContain('Capabilities');
    expect(text).toContain('Skills');
    expect(text).toContain('Policies');
    expect(text).toMatch(/PASS\s+All checks passed \(\d+\/\d+\)/u);
  });

  it('renders skip rows with a reason', async () => {
    const result = await runValidate({ cwd: FIXTURE_PASS, only: new Set(['schemas']) });
    const text = renderValidateText(result);
    expect(text).toMatch(
      /SKIP\s+Brand kit\s+\.\/brand-kit\.json\s+skipped \(no brand-kit\.json\)/u,
    );
  });

  it('renders fail rows + detail block on failure', async () => {
    const result = await runValidate({ cwd: FIXTURE_FAIL, only: new Set(['schemas']) });
    const text = renderValidateText(result);
    expect(text).toMatch(/FAIL/u);
    expect(text).toContain('Capabilities failures:');
  });
});

describe('validateCommand (CLI front-end)', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('--help prints usage and exits 0', async () => {
    const code = await validateCommand([], { help: 'true' });
    expect(code).toBe(0);
    const printed = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(printed).toContain('usage: atelier validate');
    expect(printed).toContain('--strict');
    expect(printed).toContain('--json');
    expect(printed).toContain('--only=');
  });

  it('exit 0 on a passing fixture', async () => {
    const code = await validateCommand([], { only: 'schemas' }, FIXTURE_PASS);
    expect(code).toBe(0);
  });

  it('exit 1 on a failing fixture', async () => {
    const code = await validateCommand([], { only: 'schemas' }, FIXTURE_FAIL);
    expect(code).toBe(1);
  });

  it('exit 2 on a configuration error (no package.json)', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'atelier-noconfig-cli-'));
    try {
      const code = await validateCommand([], {}, empty);
      expect(code).toBe(2);
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });

  it('--json emits a JSON payload', async () => {
    const code = await validateCommand([], { only: 'schemas', json: 'true' }, FIXTURE_PASS);
    expect(code).toBe(0);
    const printed = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    const parsed = JSON.parse(printed) as {
      ok: boolean;
      strict: boolean;
      results: Array<{ id: string; status: string }>;
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.strict).toBe(false);
    expect(parsed.results.length).toBeGreaterThan(0);
  });

  it('--strict --json fails when checks are skipped', async () => {
    const code = await validateCommand(
      [],
      { only: 'schemas', strict: 'true', json: 'true' },
      FIXTURE_PASS,
    );
    expect(code).toBe(1);
  });

  it('routes failures to stderr (text mode)', async () => {
    const code = await validateCommand([], { only: 'schemas' }, FIXTURE_FAIL);
    expect(code).toBe(1);
    const errOut = errSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(errOut).toContain('FAIL');
  });
});
