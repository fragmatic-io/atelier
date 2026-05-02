// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `atelier add <component>` — copy a baseline component from `@atelier/components`
 * source into the host project's `components/` directory.
 *
 * Discovery walks the resolved `@atelier/components` package's
 * `src/components/` directory (every file is `<Name>.tsx`). We avoid
 * importing the binding registry directly because each component's source
 * uses JSX, which would require a JSX runtime in the CLI process — far
 * heavier than a glob-based read.
 */

/* eslint-disable no-console */

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

import { ADD_USAGE } from '../usage.js';

/**
 * Resolve the path to `@atelier/components`'s `src/components/` directory.
 *
 * Uses `createRequire` so the CLI works under both `node --import=tsx/esm`
 * (production invocation) and Vitest's SSR worker (which does not implement
 * `import.meta.resolve`). The `@atelier/components/registry` subpath export is
 * defined in that package's `exports` map, so the resolution is stable.
 *
 * Exported for tests.
 */
export function resolveComponentsSourceDir(): string {
  const req = createRequire(import.meta.url);
  // package.json -> "exports": { "./registry": "./src/registry.ts" }.
  // The components live in ./src/components/ alongside the registry.
  const registryPath = req.resolve('@atelier/components/registry');
  return resolve(dirname(registryPath), 'components');
}

/**
 * List every component name discoverable under `@atelier/components`. Names
 * are derived from `*.tsx` file names (one component per file).
 */
export async function listAvailableComponents(): Promise<string[]> {
  const dir = resolveComponentsSourceDir();
  const entries = await readdir(dir);
  return entries
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => f.slice(0, -'.tsx'.length))
    .sort();
}

export interface AddOptions {
  /** Working directory used to resolve the host's `components/` dir. */
  cwd?: string;
  /** Override the source dir (used by tests). */
  sourceDir?: string;
  /** When true, refuse to overwrite an existing component file. */
  noOverwrite?: boolean;
}

export interface AddResult {
  componentName: string;
  sourcePath: string;
  destPath: string;
}

/**
 * Programmatic entry point. Throws on unknown name; returns the destination
 * path on success.
 */
export async function runAdd(name: string, options: AddOptions = {}): Promise<AddResult> {
  const cwd = options.cwd ?? process.cwd();
  const sourceDir = options.sourceDir ?? resolveComponentsSourceDir();
  const sourcePath = resolve(sourceDir, `${name}.tsx`);
  if (!existsSync(sourcePath)) {
    const available = (await readdir(sourceDir))
      .filter((f) => f.endsWith('.tsx'))
      .map((f) => f.slice(0, -'.tsx'.length))
      .sort();
    throw new Error(`unknown component '${name}'. Available: ${available.join(', ')}`);
  }
  const destDir = resolve(cwd, 'components');
  await mkdir(destDir, { recursive: true });
  const destPath = resolve(destDir, `${name}.tsx`);
  if (options.noOverwrite && existsSync(destPath)) {
    throw new Error(`refusing to overwrite ${destPath}`);
  }
  const contents = await readFile(sourcePath, 'utf8');
  await writeFile(destPath, contents, 'utf8');
  return { componentName: name, sourcePath, destPath };
}

/**
 * CLI front-end.
 */
export async function addCommand(
  positionals: readonly string[],
  flags: Readonly<Record<string, string>>,
  cwd: string = process.cwd(),
): Promise<number> {
  if (flags['help'] === 'true') {
    console.log(ADD_USAGE);
    return 0;
  }
  if (flags['list'] === 'true') {
    try {
      const names = await listAvailableComponents();
      for (const n of names) console.log(n);
      return 0;
    } catch (err: unknown) {
      console.error(
        `atelier add --list failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return 1;
    }
  }
  const name = positionals[0];
  if (name === undefined || name === '') {
    console.error(ADD_USAGE);
    return 1;
  }
  try {
    const result = await runAdd(name, { cwd });
    console.log(`copied ${result.componentName}.tsx -> ${result.destPath}`);
    return 0;
  } catch (err: unknown) {
    console.error(`atelier add failed: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}
