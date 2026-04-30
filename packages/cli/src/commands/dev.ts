// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * `cir dev` — thin wrapper around `next dev`.
 *
 * Wave 2: assumes the host project has Next.js installed (the `init`
 * template provisions Next 15). A Vite alternative will land in Wave 3+.
 */

/* eslint-disable no-console */

import { spawn } from 'node:child_process';

import { DEV_USAGE } from '../usage.js';

export interface DevOptions {
  cwd?: string;
  /** Extra args forwarded to `next dev`. */
  forward?: readonly string[];
}

export function devCommand(
  _positionals: readonly string[],
  flags: Readonly<Record<string, string>>,
  cwd: string = process.cwd(),
  forward: readonly string[] = [],
): Promise<number> {
  if (flags['help'] === 'true') {
    console.log(DEV_USAGE);
    return Promise.resolve(0);
  }
  return new Promise((resolveOuter) => {
    const child = spawn('next', ['dev', ...forward], {
      cwd,
      stdio: 'inherit',
      shell: false,
    });
    child.on('error', (err) => {
      console.error(`cir dev: failed to spawn 'next' — ${err.message}`);
      resolveOuter(1);
    });
    child.on('close', (code) => {
      resolveOuter(code ?? 0);
    });
  });
}
