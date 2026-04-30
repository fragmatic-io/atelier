// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * `cir dev` — thin wrapper around `next dev`.
 *
 * Wave 2: assumes the host project has Next.js installed (the `init`
 * template provisions Next 15). A Vite alternative will land in Wave 3+.
 *
 * Wave 4 (P-CLI-2): adds `--tail` and `--tail-only` for terminal-side audit
 * stream observability. The SSE consumer lives in `dev-tail.ts` so the
 * parser/reconnect logic is unit-testable; this module only owns the
 * spawn-and-coordinate path.
 */

/* eslint-disable no-console */

import { spawn } from 'node:child_process';

import { DEV_USAGE } from '../usage.js';
import { runDevTail } from './dev-tail.js';

export interface DevOptions {
  cwd?: string;
  /** Extra args forwarded to `next dev`. */
  forward?: readonly string[];
}

/**
 * CLI entry point for `cir dev`. Spawns `next dev` (unless `--tail-only`),
 * optionally tails the SSE audit stream in parallel, and returns the
 * combined exit code.
 *
 *   --tail              Spawn next dev AND tail audit events.
 *   --tail-only         Don't spawn next; just tail.
 *   --audit-url <url>   Override the audit stream URL.
 *   --no-color          Suppress color escapes in tailed output.
 */
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

  const wantTail = flags['tail'] === 'true';
  const tailOnly = flags['tail-only'] === 'true';
  const auditUrl = flags['audit-url'];
  const noColor =
    flags['no-color'] === 'true' ||
    !(typeof process !== 'undefined' && process.stderr && process.stderr.isTTY);

  // --tail-only: skip the spawn, just run the tail loop.
  if (tailOnly) {
    const tailOpts: Parameters<typeof runDevTail>[0] = { noColor };
    if (auditUrl !== undefined) tailOpts.auditUrl = auditUrl;
    return runDevTail(tailOpts);
  }

  return new Promise((resolveOuter) => {
    const child = spawn('next', ['dev', ...forward], {
      cwd,
      stdio: 'inherit',
      shell: false,
    });

    // When --tail is set (and we're spawning next), kick off the tail in
    // parallel. Errors in the tail must not affect the dev server's exit code.
    if (wantTail) {
      const tailOpts: Parameters<typeof runDevTail>[0] = { noColor };
      if (auditUrl !== undefined) tailOpts.auditUrl = auditUrl;
      // Fire-and-forget. Surface unhandled errors to stderr.
      runDevTail(tailOpts).catch((err: unknown) => {
        console.error(`cir dev --tail: ${(err as Error).message}`);
      });
    }

    child.on('error', (err) => {
      console.error(`cir dev: failed to spawn 'next' — ${err.message}`);
      resolveOuter(1);
    });
    child.on('close', (code) => {
      resolveOuter(code ?? 0);
    });
  });
}
