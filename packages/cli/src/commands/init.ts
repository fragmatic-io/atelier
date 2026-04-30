// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * `cir init [dir]` — scaffold a new CIR app.
 *
 * Wave 2 limitation: the template hardcodes Next.js 15 (matching the demo
 * app). A Vite variant will land in Wave 3+. The scaffold also assumes the
 * user is operating inside the CIR monorepo so workspace deps resolve;
 * standalone publish hardening lands in Wave 3+.
 */

/* eslint-disable no-console */

import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';

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
import { INIT_USAGE } from '../usage.js';

export interface InitOptions {
  /** Target directory (resolved against `cwd` if relative). Defaults to '.'. */
  dir?: string;
  /** Working directory used to resolve `dir`. Defaults to `process.cwd()`. */
  cwd?: string;
  /** When true, fails if the target dir is non-empty. Defaults to false. */
  strict?: boolean;
}

export interface InitResult {
  /** Absolute path of the directory that was scaffolded. */
  targetDir: string;
  /** Relative paths (from `targetDir`) of every file written. */
  filesWritten: string[];
}

/**
 * Files written by `cir init`. Exposed so tests can assert against the same
 * list the implementation uses.
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
 * Programmatic entry point for `cir init`. Returns the list of files written
 * so callers (and tests) can assert without rescanning the disk.
 */
export async function runInit(options: InitOptions = {}): Promise<InitResult> {
  const cwd = options.cwd ?? process.cwd();
  const dir = options.dir ?? '.';
  const targetDir = resolve(cwd, dir);
  const appName = basename(targetDir);

  await mkdir(targetDir, { recursive: true });
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

  return { targetDir, filesWritten };
}

/**
 * CLI front-end. Parses positionals, calls `runInit`, prints a summary.
 * Returns the process exit code.
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
  try {
    const result = await runInit({ dir, cwd });
    console.log(`scaffolded ${result.filesWritten.length} file(s) in ${result.targetDir}`);
    for (const f of result.filesWritten) {
      console.log(`  ${f}`);
    }
    console.log(`\nNext: cd ${dir} && pnpm install && pnpm dev`);
    return 0;
  } catch (err: unknown) {
    console.error(`cir init failed: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}
