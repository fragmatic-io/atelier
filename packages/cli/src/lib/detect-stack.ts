// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Stack detection for `atelier validate`. Pure-function — given a project
 * root, sniff the on-disk layout and return a structured description of
 * what tooling the consumer has wired up.
 *
 * Detection is intentionally cheap: a single pass of `existsSync` /
 * `readFile` over a small set of well-known files. We do not invoke any
 * sub-process or import the consumer's modules.
 *
 * The validate command consumes `DetectedStack` to decide which checks to
 * run. Anything we cannot detect with confidence becomes `false` /
 * `undefined`; the runner reports those as `· skipped (no <thing>)` rather
 * than erroring.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Package manager flavours we know how to drive. */
export type PackageManager = 'pnpm' | 'npm' | 'yarn';

/** Result of `detectStack(root)`. All fields are flat; consumers can branch on them. */
export interface DetectedStack {
  /** Absolute path that detection was run against. */
  root: string;
  /** True when a parseable `package.json` exists at `root`. */
  hasPackageJson: boolean;
  /** Parsed `package.json` (if present). `null` on parse failure. */
  packageJson: PackageJsonShape | null;
  /** Detected package manager. Defaults to `npm` when no lockfile exists. */
  packageManager: PackageManager;
  /** True when this project is a workspace root (pnpm/npm/yarn workspaces). */
  isMonorepo: boolean;
  /** Workspace flavour, when `isMonorepo` is true. */
  monorepoFlavour: 'pnpm' | 'npm' | 'yarn' | null;
  /** True when a `tsconfig.json` (or `tsconfig.base.json`) exists. */
  hasTypeScript: boolean;
  /** True when an ESLint config (flat or legacy) exists. */
  hasEslint: boolean;
  /** True when Vitest is configured (config file OR `test` script === `vitest...`). */
  hasVitest: boolean;
  /** True when `package.json` declares a `test` script. */
  hasTestScript: boolean;
  /** True when `capabilities/` exists at the root. */
  hasCapabilities: boolean;
  /** True when `skills/` exists at the root. */
  hasSkills: boolean;
  /** True when `policies/` exists at the root. */
  hasPolicies: boolean;
  /** True when `recipes/` exists at the root. */
  hasRecipes: boolean;
  /** True when `brand-kit.json` exists at the root. */
  hasBrandKit: boolean;
  /** True when `components/registry.json` exists at the root. */
  hasComponentRegistry: boolean;
}

export interface PackageJsonShape {
  name?: string;
  version?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  workspaces?: string[] | { packages?: string[] };
}

/** Filenames sniffed for an ESLint config (flat OR legacy). */
const ESLINT_CONFIG_FILES = [
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.json',
  '.eslintrc.yaml',
  '.eslintrc.yml',
];

/** Filenames sniffed for a Vitest config. */
const VITEST_CONFIG_FILES = [
  'vitest.config.ts',
  'vitest.config.js',
  'vitest.config.mjs',
  'vitest.config.cjs',
];

/**
 * Walk the project at `root` and produce a `DetectedStack`. Never throws —
 * any file-read or JSON-parse failure degrades a single boolean rather than
 * killing the run. The validate command treats undetected things as
 * `· skipped (no <thing>)`.
 */
export function detectStack(root: string): DetectedStack {
  const pkgPath = join(root, 'package.json');
  const hasPackageJson = existsSync(pkgPath) && safeIsFile(pkgPath);
  let packageJson: PackageJsonShape | null = null;
  if (hasPackageJson) {
    try {
      const raw = readFileSync(pkgPath, 'utf8');
      packageJson = JSON.parse(raw) as PackageJsonShape;
    } catch {
      packageJson = null;
    }
  }

  const packageManager = detectPackageManager(root);
  const { isMonorepo, monorepoFlavour } = detectMonorepo(root, packageJson);
  const hasTypeScript = hasAny(root, ['tsconfig.json', 'tsconfig.base.json']);
  const hasEslint = hasAny(root, ESLINT_CONFIG_FILES);
  const testScript = packageJson?.scripts?.['test']?.trim();
  const hasTestScript = !!testScript && testScript.length > 0 && !testScript.startsWith('echo');
  const hasVitestConfig = hasAny(root, VITEST_CONFIG_FILES);
  const testInvokesVitest = !!testScript && /\bvitest\b/.test(testScript);
  const hasVitest = hasVitestConfig || testInvokesVitest;

  return {
    root,
    hasPackageJson,
    packageJson,
    packageManager,
    isMonorepo,
    monorepoFlavour,
    hasTypeScript,
    hasEslint,
    hasVitest,
    hasTestScript,
    hasCapabilities: existsDir(root, 'capabilities'),
    hasSkills: existsDir(root, 'skills'),
    hasPolicies: existsDir(root, 'policies'),
    hasRecipes: existsDir(root, 'recipes'),
    hasBrandKit: existsFile(root, 'brand-kit.json'),
    hasComponentRegistry: existsFile(root, 'components/registry.json'),
  };
}

function detectPackageManager(root: string): PackageManager {
  if (existsSync(join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(root, 'yarn.lock'))) return 'yarn';
  if (existsSync(join(root, 'package-lock.json'))) return 'npm';
  // No lockfile — fall back to npm. `npm test` is universally understood.
  return 'npm';
}

function detectMonorepo(
  root: string,
  packageJson: PackageJsonShape | null,
): { isMonorepo: boolean; monorepoFlavour: 'pnpm' | 'npm' | 'yarn' | null } {
  if (existsSync(join(root, 'pnpm-workspace.yaml'))) {
    return { isMonorepo: true, monorepoFlavour: 'pnpm' };
  }
  const ws = packageJson?.workspaces;
  if (ws !== undefined) {
    // npm + yarn both honour `workspaces`; differentiate by lockfile.
    if (existsSync(join(root, 'yarn.lock'))) {
      return { isMonorepo: true, monorepoFlavour: 'yarn' };
    }
    return { isMonorepo: true, monorepoFlavour: 'npm' };
  }
  return { isMonorepo: false, monorepoFlavour: null };
}

function hasAny(root: string, candidates: readonly string[]): boolean {
  for (const c of candidates) {
    if (existsSync(join(root, c))) return true;
  }
  return false;
}

function existsDir(root: string, name: string): boolean {
  const abs = join(root, name);
  if (!existsSync(abs)) return false;
  try {
    return statSync(abs).isDirectory();
  } catch {
    return false;
  }
}

function existsFile(root: string, name: string): boolean {
  const abs = join(root, name);
  if (!existsSync(abs)) return false;
  try {
    return statSync(abs).isFile();
  } catch {
    return false;
  }
}

function safeIsFile(abs: string): boolean {
  try {
    return statSync(abs).isFile();
  } catch {
    return false;
  }
}

/**
 * Convenience helper — list `*.json` files directly inside a directory
 * (non-recursive). Used by the schema validators. Returns absolute paths.
 * Empty array on missing directory or permissions error.
 */
export function listJsonFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .map((name) => join(dir, name))
      .filter((abs) => safeIsFile(abs));
  } catch {
    return [];
  }
}

/**
 * Recursive variant — walks the directory tree and collects every file
 * matching `extension` (must include the leading dot). Used by the skills
 * walker which globs `**` /`*.skill.md`. Bounded depth at 10 to avoid
 * runaway symlink loops; consumers can re-walk a deeper subtree if they
 * really need to.
 */
export function listFilesRecursive(
  dir: string,
  predicate: (name: string) => boolean,
  depth = 0,
): string[] {
  if (depth > 10 || !existsSync(dir)) return [];
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const name of entries) {
    const abs = join(dir, name);
    let st: ReturnType<typeof statSync>;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      out.push(...listFilesRecursive(abs, predicate, depth + 1));
    } else if (st.isFile() && predicate(name)) {
      out.push(abs);
    }
  }
  return out;
}
