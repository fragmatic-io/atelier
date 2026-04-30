// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * `cir validate` — spawn the host project's `pnpm validate` script.
 *
 * The CLI does not re-implement the validate chain; it shells out to pnpm.
 * Hosts inside the CIR monorepo will hit the root-level `validate` script;
 * standalone hosts can override their own `validate` script in
 * `package.json`. Wave 3+ will likely teach this command to fall back to a
 * built-in chain when no script is defined.
 */

/* eslint-disable no-console */

import { spawn } from 'node:child_process';

import { VALIDATE_USAGE } from '../usage.js';

export interface ValidateOptions {
  cwd?: string;
}

export function validateCommand(
  _positionals: readonly string[],
  flags: Readonly<Record<string, string>>,
  cwd: string = process.cwd(),
): Promise<number> {
  if (flags['help'] === 'true') {
    console.log(VALIDATE_USAGE);
    return Promise.resolve(0);
  }
  return new Promise((resolveOuter) => {
    const child = spawn('pnpm', ['validate'], {
      cwd,
      stdio: 'inherit',
      shell: false,
    });
    child.on('error', (err) => {
      console.error(`cir validate: failed to spawn 'pnpm' — ${err.message}`);
      resolveOuter(1);
    });
    child.on('close', (code) => {
      resolveOuter(code ?? 0);
    });
  });
}
