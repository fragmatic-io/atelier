// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * `cir components-sync [--check]` — alias for the existing
 * `scripts/sync-component-registry.ts` script.
 *
 * The shell-out form keeps the original script as the single source of truth
 * and avoids duplicating tooling. Hosts running outside the CIR monorepo
 * will not have the script available; the command surfaces a clear error in
 * that case (Wave 3+ can ship a published variant).
 */

/* eslint-disable no-console */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { COMPONENTS_SYNC_USAGE } from '../usage.js';

export interface ComponentsSyncOptions {
  cwd?: string;
  /** Override the script path (used by tests). */
  scriptPath?: string;
  /** Override the components tsconfig path (used by tests). */
  tsconfigPath?: string;
}

export function componentsSyncCommand(
  _positionals: readonly string[],
  flags: Readonly<Record<string, string>>,
  cwd: string = process.cwd(),
  options: ComponentsSyncOptions = {},
): Promise<number> {
  if (flags['help'] === 'true') {
    console.log(COMPONENTS_SYNC_USAGE);
    return Promise.resolve(0);
  }
  const scriptPath = options.scriptPath ?? resolve(cwd, 'scripts/sync-component-registry.ts');
  const tsconfigPath = options.tsconfigPath ?? resolve(cwd, 'packages/components/tsconfig.json');
  if (!existsSync(scriptPath)) {
    console.error(
      `cir components-sync: cannot find ${scriptPath}. ` +
        `This command currently requires the CIR monorepo layout.`,
    );
    return Promise.resolve(1);
  }
  const args = ['--tsconfig', tsconfigPath, scriptPath];
  if (flags['check'] === 'true') args.push('--check');
  return new Promise((resolveOuter) => {
    const child = spawn('tsx', args, {
      cwd,
      stdio: 'inherit',
      shell: false,
    });
    child.on('error', (err) => {
      console.error(`cir components-sync: failed to spawn 'tsx' — ${err.message}`);
      resolveOuter(1);
    });
    child.on('close', (code) => {
      resolveOuter(code ?? 0);
    });
  });
}
