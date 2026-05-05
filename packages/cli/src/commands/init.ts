// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `atelier init [dir]` — scaffold a new Atelier app.
 *
 * Sprint 1.1 — two modes:
 *
 *   - **monorepo mode**: when invoked from inside the Atelier monorepo
 *     (heuristic: an ancestor `package.json` declares a `pnpm.workspaces`
 *     stanza OR the cwd lives under `packages/` / `apps/`). Preserves
 *     the legacy single-file Next.js scaffold the demo grew up on. The
 *     `INIT_FILES` constant captures every relative path that mode writes.
 *
 *   - **standalone mode**: the default elsewhere (and what
 *     `npx -y @atelier/cli init my-app` exercises). Copies a host
 *     template (`next15` | `vite`) plus the `_shared` starter kit
 *     (recipes / policies / capabilities / skills / brand-kit /
 *     `.env.local.example`) into the target directory. `@atelier/*`
 *     deps point at npm versions, NOT `workspace:*`.
 *
 * Mode is auto-detected and overrideable with `--mode=monorepo|standalone`.
 * Host is `--host=next15` (default) or `--host=vite`. Package manager is
 * `--package-manager=pnpm|npm|yarn` (default pnpm). `--no-install` skips
 * the dep install step (handy for tests + CI smoke).
 */

/* eslint-disable no-console */

import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, dirname, resolve } from 'node:path';

import {
  gitignoreTemplate,
  layoutTemplate,
  nextConfigTemplate,
  packageJsonTemplate,
  pageTemplate,
  placeholderTemplate,
  readmeTemplate,
  tailwindConfigTemplate,
  tsconfigTemplate,
} from '../templates/index.js';
import { copyTemplateTree, type TemplateContext } from '../template-engine.js';
import { INIT_USAGE } from '../usage.js';

export type InitMode = 'monorepo' | 'standalone';
export type InitHost = 'next15' | 'vite';
export type PackageManager = 'pnpm' | 'npm' | 'yarn';

export interface InitOptions {
  /** Target directory (resolved against `cwd` if relative). Defaults to '.'. */
  dir?: string;
  /** Working directory used to resolve `dir`. Defaults to `process.cwd()`. */
  cwd?: string;
  /** When true, fails if the target dir is non-empty. Defaults to false. */
  strict?: boolean;
  /**
   * Force a mode. When omitted, the mode is auto-detected from `cwd`.
   * Tests pin this to keep behaviour deterministic regardless of where
   * vitest runs from.
   */
  mode?: InitMode;
  /**
   * Host template to use. Only meaningful in standalone mode. Defaults to
   * `next15`. Ignored in monorepo mode.
   */
  host?: InitHost;
  /**
   * Human-readable description that lands in `package.json` + README.
   * Defaults to `'A new Atelier app'`.
   */
  description?: string;
  /** Skip the auto-install step. Default false. */
  skipInstall?: boolean;
  /**
   * Package manager to use for the post-scaffold install. Default `pnpm`.
   * Ignored when `skipInstall` is true.
   */
  packageManager?: PackageManager;
}

export interface InitResult {
  /** Absolute path of the directory that was scaffolded. */
  targetDir: string;
  /** Relative paths (from `targetDir`) of every file written. */
  filesWritten: string[];
  /** The mode the scaffold ran in. Reported to callers + tests. */
  mode: InitMode;
  /** The host template applied. `null` in monorepo mode. */
  host: InitHost | null;
  /** Whether `pnpm install` (or equivalent) ran. */
  installed: boolean;
}

/**
 * Files written by the legacy monorepo-mode `atelier init`. Exposed for the
 * existing tests that assert against the single-file scaffold.
 */
export const INIT_FILES = Object.freeze([
  'package.json',
  'tsconfig.json',
  'next.config.mjs',
  'tailwind.config.mjs',
  'README.md',
  '.gitignore',
  'app/page.tsx',
  'app/layout.tsx',
  'capabilities/.gitkeep.md',
  'skills/.gitkeep.md',
  'components/.gitkeep.md',
] as const);

/**
 * Auto-detect the init mode. Walks ancestor directories of `cwd` looking
 * for the Atelier monorepo root — identified by EITHER:
 *
 *   - `pnpm-workspace.yaml` next to a `package.json` whose `name` is
 *     `atelier` (the canonical signal — the repo's root package.json
 *     uses pnpm workspaces, not the npm-style `workspaces` field), OR
 *   - a `package.json` with a `workspaces` array that includes
 *     `packages/*` (covers npm/yarn-style monorepos for forks).
 *
 * Falls back to `standalone` so external consumers — running
 * `npx @atelier/cli init my-app` from a fresh shell — get the
 * standalone path by default.
 */
export function detectMode(cwd: string): InitMode {
  let dir = cwd;
  for (let i = 0; i < 12; i++) {
    const pkgPath = resolve(dir, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const raw = readFileSync(pkgPath, 'utf8');
        const pkg = JSON.parse(raw) as { name?: string; workspaces?: unknown };
        const hasWorkspacesYaml = existsSync(resolve(dir, 'pnpm-workspace.yaml'));
        const hasPackagesGlob =
          Array.isArray(pkg.workspaces) &&
          pkg.workspaces.some((w) => typeof w === 'string' && w.startsWith('packages/'));
        if ((pkg.name === 'atelier' && hasWorkspacesYaml) || hasPackagesGlob) {
          return 'monorepo';
        }
      } catch {
        // ignore parse errors — fall through to ancestor walk
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return 'standalone';
}

/**
 * Programmatic entry point for `atelier init`. Returns the list of files
 * written so callers (and tests) can assert without rescanning the disk.
 */
export async function runInit(options: InitOptions = {}): Promise<InitResult> {
  const cwd = options.cwd ?? process.cwd();
  const dir = options.dir ?? '.';
  const targetDir = resolve(cwd, dir);
  const appName = basename(targetDir);
  const mode = options.mode ?? detectMode(cwd);
  const host = options.host ?? 'next15';
  const description = options.description ?? 'A new Atelier app';

  await mkdir(targetDir, { recursive: true });

  if (mode === 'monorepo') {
    return runMonorepoInit({ targetDir, appName, options });
  }

  return runStandaloneInit({ targetDir, appName, host, description, options });
}

interface MonorepoInitArgs {
  targetDir: string;
  appName: string;
  options: InitOptions;
}

async function runMonorepoInit(args: MonorepoInitArgs): Promise<InitResult> {
  const { targetDir, appName, options } = args;

  await mkdir(resolve(targetDir, 'app'), { recursive: true });
  await mkdir(resolve(targetDir, 'capabilities'), { recursive: true });
  await mkdir(resolve(targetDir, 'skills'), { recursive: true });
  await mkdir(resolve(targetDir, 'components'), { recursive: true });

  const ctx = { appName };
  const filesWritten: string[] = [];

  async function write(relPath: string, contents: string): Promise<void> {
    const abs = resolve(targetDir, relPath);
    if (options.strict && existsSync(abs)) {
      throw new Error(`refusing to overwrite ${relPath} (strict mode)`);
    }
    await writeFile(abs, contents, 'utf8');
    filesWritten.push(relPath);
  }

  await write('package.json', packageJsonTemplate(ctx));
  await write('tsconfig.json', tsconfigTemplate());
  await write('next.config.mjs', nextConfigTemplate());
  await write('tailwind.config.mjs', tailwindConfigTemplate());
  await write('README.md', readmeTemplate(ctx));
  await write('.gitignore', gitignoreTemplate());
  await write('app/page.tsx', pageTemplate(ctx));
  await write('app/layout.tsx', layoutTemplate());
  await write('capabilities/.gitkeep.md', placeholderTemplate('capabilities'));
  await write('skills/.gitkeep.md', placeholderTemplate('skills'));
  await write('components/.gitkeep.md', placeholderTemplate('components'));

  return {
    targetDir,
    filesWritten,
    mode: 'monorepo',
    host: null,
    installed: false,
  };
}

interface StandaloneInitArgs {
  targetDir: string;
  appName: string;
  host: InitHost;
  description: string;
  options: InitOptions;
}

async function runStandaloneInit(args: StandaloneInitArgs): Promise<InitResult> {
  const { targetDir, appName, host, description, options } = args;
  const ctx: TemplateContext = { appName, description };
  const filesWritten: string[] = [];

  // Shared starter kit (recipes / policies / capabilities / skills / brand-kit /
  // .env.local.example / .gitignore). Common to every host.
  await copyTemplateTree({
    srcDir: '_shared',
    destDir: targetDir,
    ctx,
    ...(options.strict !== undefined ? { strict: options.strict } : {}),
    filesWritten,
  });

  // Host-specific tree.
  await copyTemplateTree({
    srcDir: host,
    destDir: targetDir,
    ctx,
    ...(options.strict !== undefined ? { strict: options.strict } : {}),
    filesWritten,
  });

  // Sort for deterministic output (the post-scaffold print).
  filesWritten.sort();

  let installed = false;
  if (options.skipInstall !== true) {
    installed = runInstall({
      targetDir,
      packageManager: options.packageManager ?? 'pnpm',
    });
  }

  return {
    targetDir,
    filesWritten,
    mode: 'standalone',
    host,
    installed,
  };
}

interface RunInstallArgs {
  targetDir: string;
  packageManager: PackageManager;
}

/**
 * Execute the package manager's install command in `targetDir`. Returns
 * `true` on success, `false` if the binary is missing or the install
 * fails — the scaffold itself is still considered successful, the caller
 * just prints a hint and the user runs `pnpm install` manually.
 *
 * Synchronous under the hood (`spawnSync`) but exposed as `Promise<boolean>`
 * so the caller (`runStandaloneInit`) stays uniformly async; tests and
 * future async flows compose more naturally that way.
 */
function runInstall(args: RunInstallArgs): boolean {
  const { targetDir, packageManager } = args;
  const argv = installArgv(packageManager);
  console.log(`\n  ${packageManager} ${argv.join(' ')}  (in ${targetDir})\n`);
  const result = spawnSync(packageManager, argv, {
    cwd: targetDir,
    stdio: 'inherit',
  });
  if (result.error) {
    console.warn(
      `\natelier init: '${packageManager}' was not found on PATH. Skipping install — run it manually:`,
    );
    console.warn(`  cd ${targetDir} && ${packageManager} ${argv.join(' ')}\n`);
    return false;
  }
  if (typeof result.status === 'number' && result.status !== 0) {
    console.warn(
      `\natelier init: '${packageManager} ${argv.join(' ')}' exited with status ${String(
        result.status,
      )}. Re-run it manually after fixing the cause.\n`,
    );
    return false;
  }
  return true;
}

function installArgv(pm: PackageManager): string[] {
  switch (pm) {
    case 'npm':
      return ['install'];
    case 'yarn':
      return ['install'];
    case 'pnpm':
    default:
      return ['install'];
  }
}

/**
 * CLI front-end. Parses positionals + flags, calls `runInit`, prints a
 * summary. Returns the process exit code.
 */
export async function initCommand(
  positionals: readonly string[],
  flags: Readonly<Record<string, string>>,
  cwd: string = process.cwd(),
): Promise<number> {
  if (flags['help'] === 'true') {
    console.log(INIT_USAGE);
    return 0;
  }
  const dir = positionals[0] ?? '.';

  // Parse flags. Hand-rolled — no external dep — mirrors the rest of the CLI.
  const host = parseHostFlag(flags['host']);
  if (host instanceof Error) {
    console.error(`atelier init: ${host.message}`);
    return 1;
  }

  const mode = parseModeFlag(flags['mode']);
  if (mode instanceof Error) {
    console.error(`atelier init: ${mode.message}`);
    return 1;
  }

  const packageManager = parsePmFlag(flags['package-manager']);
  if (packageManager instanceof Error) {
    console.error(`atelier init: ${packageManager.message}`);
    return 1;
  }

  // `--no-install` (parse-args normalises to `install=false`) or
  // explicit `--skip-install`.
  const skipInstall = flags['no-install'] === 'true' || flags['install'] === 'false';

  try {
    const result = await runInit({
      dir,
      cwd,
      ...(mode !== undefined ? { mode } : {}),
      ...(host !== undefined ? { host } : {}),
      ...(flags['description'] !== undefined ? { description: flags['description'] } : {}),
      ...(packageManager !== undefined ? { packageManager } : {}),
      skipInstall,
    });
    printSummary(result, dir);
    return 0;
  } catch (err: unknown) {
    console.error(`atelier init failed: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

function parseHostFlag(raw: string | undefined): InitHost | undefined | Error {
  if (raw === undefined || raw === 'true') return undefined;
  if (raw === 'next15' || raw === 'vite') return raw;
  return new Error(`unknown --host '${raw}'. Expected 'next15' or 'vite'.`);
}

function parseModeFlag(raw: string | undefined): InitMode | undefined | Error {
  if (raw === undefined || raw === 'true') return undefined;
  if (raw === 'monorepo' || raw === 'standalone') return raw;
  return new Error(`unknown --mode '${raw}'. Expected 'monorepo' or 'standalone'.`);
}

function parsePmFlag(raw: string | undefined): PackageManager | undefined | Error {
  if (raw === undefined || raw === 'true') return undefined;
  if (raw === 'pnpm' || raw === 'npm' || raw === 'yarn') return raw;
  return new Error(`unknown --package-manager '${raw}'. Expected 'pnpm', 'npm', or 'yarn'.`);
}

function printSummary(result: InitResult, dirArg: string): void {
  if (result.mode === 'monorepo') {
    console.log(`scaffolded ${result.filesWritten.length} file(s) in ${result.targetDir}`);
    for (const f of result.filesWritten) {
      console.log(`  ${f}`);
    }
    console.log(`\nNext: cd ${dirArg} && pnpm install && pnpm dev`);
    return;
  }

  console.log(`\n  ✓ Created ${result.targetDir}`);
  console.log(`  ${result.filesWritten.length} file(s) written`);
  if (result.installed) {
    console.log(`  Dependencies installed.`);
  }
  console.log('');
  console.log(`    cd ${dirArg}`);
  if (!result.installed) {
    console.log(`    pnpm install`);
  }
  console.log(`    pnpm dev          # boots vault + ${hostLabel(result.host)}`);
  console.log(`    # open http://localhost:3000`);
  console.log('');
}

function hostLabel(host: InitHost | null): string {
  if (host === 'next15') return 'Next.js';
  if (host === 'vite') return 'Vite';
  return 'host';
}

// Re-export so external consumers can read the manifest of files the
// monorepo path writes. The standalone mode files are listed by the
// returned `InitResult.filesWritten` because they live on disk under
// `templates/`.
export { copyTemplateTree, type TemplateContext } from '../template-engine.js';
